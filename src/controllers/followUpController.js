const db = require('../data/db');
const { logAudit } = require('../middleware/audit');
const { scopedWhere, canAccessRecord, isSales } = require('../middleware/auth');
const { validateFollowUpInput, FOLLOW_TYPES, FOLLOW_STATUSES, todayIso } = require('../middleware/validator');

function usersForAssign() {
  return db.prepare('SELECT UserId, Name FROM Users WHERE IsActive = 1 ORDER BY Name').all();
}

function relatedLists(req) {
  const customerScope = scopedWhere(req, { ownerColumn: 'OwnerId' });
  const leadScope = scopedWhere(req, { assignedColumn: 'AssignedTo' });
  return {
    customers: db.prepare(`SELECT CustomerId, CustomerName FROM Customers WHERE Status = 'Active' ${customerScope.sql} ORDER BY CustomerName`).all(...customerScope.params),
    leads: db.prepare(`SELECT LeadId, LeadName FROM Leads ${leadScope.sql.replace('AND', 'WHERE')} ORDER BY LeadName`).all(...leadScope.params)
  };
}

function getFollowUp(id) {
  return db.prepare(`
    SELECT f.*, c.CustomerName, l.LeadName, u.Name AS OwnerName
    FROM FollowUps f
    LEFT JOIN Customers c ON c.CustomerId = f.CustomerId
    LEFT JOIN Leads l ON l.LeadId = f.LeadId
    LEFT JOIN Users u ON u.UserId = f.AssignedTo
    WHERE f.FollowUpId = ?
  `).get(id);
}

function listFollowUps(req) {
  const tab = req.query.tab || 'all';
  const scope = scopedWhere(req, { assignedColumn: 'f.AssignedTo' });
  let extra = '';
  if (tab === 'upcoming') extra = `AND f.Status = 'Planned' AND date(f.FollowUpDate) >= date('now')`;
  if (tab === 'overdue') extra = `AND f.Status = 'Planned' AND date(f.FollowUpDate) < date('now')`;
  if (tab === 'completed') extra = `AND f.Status = 'Completed'`;
  return db.prepare(`
    SELECT f.*, c.CustomerName, l.LeadName, u.Name AS OwnerName,
      CASE
        WHEN f.Status = 'Planned' AND date(f.FollowUpDate) < date('now') THEN 'Overdue'
        ELSE f.Status
      END AS DisplayStatus
    FROM FollowUps f
    LEFT JOIN Customers c ON c.CustomerId = f.CustomerId
    LEFT JOIN Leads l ON l.LeadId = f.LeadId
    LEFT JOIN Users u ON u.UserId = f.AssignedTo
    WHERE 1=1 ${extra} ${scope.sql}
    ORDER BY f.FollowUpDate ASC
  `).all(...scope.params);
}

function listPage(req, res) {
  const tab = req.query.tab || 'all';
  res.render('layout', {
    title: 'Follow-ups',
    view: 'followups/list',
    followUps: listFollowUps(req),
    tab,
    types: FOLLOW_TYPES
  });
}

function newPage(req, res) {
  res.render('layout', {
    title: 'Schedule follow-up',
    view: 'followups/form',
    mode: 'create',
    followUp: { FollowUpType: 'Call', Status: 'Planned', FollowUpDate: todayIso() },
    errors: {},
    types: FOLLOW_TYPES,
    statuses: FOLLOW_STATUSES,
    users: usersForAssign(),
    ...relatedLists(req)
  });
}

function createRecord(req) {
  const errors = validateFollowUpInput(req.body, { isNew: true });
  if (Object.keys(errors).length) return { errors };
  const assignedTo = isSales(req) ? req.session.user.userId : Number(req.body.AssignedTo || req.session.user.userId);
  const info = db.prepare(`
    INSERT INTO FollowUps (CustomerId, LeadId, FollowUpDate, FollowUpType, Remarks, Status, AssignedTo)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.body.CustomerId || null,
    req.body.LeadId || null,
    req.body.FollowUpDate,
    req.body.FollowUpType,
    req.body.Remarks || null,
    req.body.Status || 'Planned',
    assignedTo
  );
  const created = getFollowUp(info.lastInsertRowid);
  logAudit(req, 'CREATE', 'FollowUp', created.FollowUpId, null, created);
  return { followUp: created };
}

function create(req, res) {
  const result = createRecord(req);
  if (result.errors) {
    return res.status(400).render('layout', {
      title: 'Schedule follow-up',
      view: 'followups/form',
      mode: 'create',
      followUp: req.body,
      errors: result.errors,
      types: FOLLOW_TYPES,
      statuses: FOLLOW_STATUSES,
      users: usersForAssign(),
      ...relatedLists(req)
    });
  }
  req.session.flash = { type: 'success', message: 'Follow-up scheduled.' };
  res.redirect('/followups');
}

function completeRecord(req, id) {
  const existing = getFollowUp(id);
  if (!existing) return { notFound: true };
  if (!canAccessRecord(req, existing)) return { forbidden: true };
  db.prepare(`UPDATE FollowUps SET Status = 'Completed', Remarks = ? WHERE FollowUpId = ?`).run(
    req.body.Remarks || existing.Remarks,
    id
  );
  const updated = getFollowUp(id);
  logAudit(req, 'UPDATE', 'FollowUp', id, existing, updated);
  return { followUp: updated };
}

function complete(req, res) {
  const result = completeRecord(req, Number(req.params.id));
  if (result.notFound || result.forbidden) {
    req.session.flash = { type: 'error', message: 'Follow-up not found.' };
  } else {
    req.session.flash = { type: 'success', message: 'Follow-up marked completed.' };
  }
  res.redirect('/followups');
}

function rescheduleRecord(req, id) {
  const existing = getFollowUp(id);
  if (!existing) return { notFound: true };
  if (!canAccessRecord(req, existing)) return { forbidden: true };
  const errors = validateFollowUpInput({
    FollowUpDate: req.body.FollowUpDate,
    FollowUpType: existing.FollowUpType,
    Status: 'Planned',
    CustomerId: existing.CustomerId,
    LeadId: existing.LeadId
  }, { isNew: true });
  if (Object.keys(errors).length) return { errors };
  db.prepare(`UPDATE FollowUps SET FollowUpDate = ?, Status = 'Planned', Remarks = ? WHERE FollowUpId = ?`).run(
    req.body.FollowUpDate,
    req.body.Remarks || existing.Remarks,
    id
  );
  const updated = getFollowUp(id);
  logAudit(req, 'UPDATE', 'FollowUp', id, existing, updated);
  return { followUp: updated };
}

function reschedule(req, res) {
  const result = rescheduleRecord(req, Number(req.params.id));
  if (result.errors) {
    req.session.flash = { type: 'error', message: Object.values(result.errors)[0] };
  } else if (result.notFound || result.forbidden) {
    req.session.flash = { type: 'error', message: 'Follow-up not found.' };
  } else {
    req.session.flash = { type: 'success', message: 'Follow-up rescheduled.' };
  }
  res.redirect('/followups');
}

module.exports = {
  listFollowUps,
  getFollowUp,
  listPage,
  newPage,
  create,
  createRecord,
  complete,
  completeRecord,
  reschedule,
  rescheduleRecord
};
