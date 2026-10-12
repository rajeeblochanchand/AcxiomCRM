const db = require('../data/db');
const { logAudit } = require('../middleware/audit');
const { scopedWhere, canAccessRecord, isSales } = require('../middleware/auth');
const { validateActivityInput, ACTIVITY_TYPES, ACTIVITY_STATUSES } = require('../middleware/validator');

function usersForAssign() {
  return db.prepare('SELECT UserId, Name FROM Users WHERE IsActive = 1 ORDER BY Name').all();
}

function relatedLists(req) {
  const customerScope = scopedWhere(req, { ownerColumn: 'OwnerId' });
  const leadScope = scopedWhere(req, { assignedColumn: 'AssignedTo' });
  const leadWhere = leadScope.sql ? leadScope.sql.replace('AND', 'WHERE') : '';
  return {
    customers: db.prepare(`SELECT CustomerId, CustomerName FROM Customers WHERE Status = 'Active' ${customerScope.sql} ORDER BY CustomerName`).all(...customerScope.params),
    leads: db.prepare(`SELECT LeadId, LeadName FROM Leads ${leadWhere} ORDER BY LeadName`).all(...leadScope.params)
  };
}

function getActivity(id) {
  return db.prepare(`
    SELECT a.*, c.CustomerName, l.LeadName, u.Name AS OwnerName
    FROM Activities a
    LEFT JOIN Customers c ON c.CustomerId = a.CustomerId
    LEFT JOIN Leads l ON l.LeadId = a.LeadId
    LEFT JOIN Users u ON u.UserId = a.AssignedTo
    WHERE a.ActivityId = ?
  `).get(id);
}

function listActivities(req) {
  const type = (req.query.type || '').trim();
  const status = (req.query.status || '').trim();
  const scope = scopedWhere(req, { assignedColumn: 'a.AssignedTo' });
  const where = ['1=1'];
  const params = [];
  if (type) {
    where.push('a.ActivityType = ?');
    params.push(type);
  }
  if (status) {
    where.push('a.Status = ?');
    params.push(status);
  }
  return db.prepare(`
    SELECT a.*, c.CustomerName, l.LeadName, u.Name AS OwnerName
    FROM Activities a
    LEFT JOIN Customers c ON c.CustomerId = a.CustomerId
    LEFT JOIN Leads l ON l.LeadId = a.LeadId
    LEFT JOIN Users u ON u.UserId = a.AssignedTo
    WHERE ${where.join(' AND ')} ${scope.sql}
    ORDER BY a.ActivityDate DESC
  `).all(...params, ...scope.params);
}

function listPage(req, res) {
  res.render('layout', {
    title: 'Activities',
    view: 'activities/list',
    activities: listActivities(req),
    types: ACTIVITY_TYPES,
    statuses: ACTIVITY_STATUSES,
    filters: { type: req.query.type || '', status: req.query.status || '' }
  });
}

function newPage(req, res) {
  res.render('layout', {
    title: 'Log activity',
    view: 'activities/form',
    mode: 'create',
    activity: { ActivityType: 'Call', Status: 'Planned' },
    errors: {},
    types: ACTIVITY_TYPES,
    statuses: ACTIVITY_STATUSES,
    users: usersForAssign(),
    ...relatedLists(req)
  });
}

function createRecord(req) {
  const errors = validateActivityInput(req.body);
  if (Object.keys(errors).length) return { errors };
  const assignedTo = isSales(req) ? req.session.user.userId : Number(req.body.AssignedTo || req.session.user.userId);
  const info = db.prepare(`
    INSERT INTO Activities (ActivityType, Subject, Description, ActivityDate, CustomerId, LeadId, AssignedTo, Status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.body.ActivityType,
    req.body.Subject.trim(),
    req.body.Description || null,
    req.body.ActivityDate,
    req.body.CustomerId || null,
    req.body.LeadId || null,
    assignedTo,
    req.body.Status || 'Planned'
  );
  const created = getActivity(info.lastInsertRowid);
  logAudit(req, 'CREATE', 'Activity', created.ActivityId, null, created);
  return { activity: created };
}

function create(req, res) {
  const result = createRecord(req);
  if (result.errors) {
    return res.status(400).render('layout', {
      title: 'Log activity',
      view: 'activities/form',
      mode: 'create',
      activity: req.body,
      errors: result.errors,
      types: ACTIVITY_TYPES,
      statuses: ACTIVITY_STATUSES,
      users: usersForAssign(),
      ...relatedLists(req)
    });
  }
  req.session.flash = { type: 'success', message: 'Activity logged.' };
  res.redirect('/activities');
}

function updateStatus(req, res) {
  const existing = getActivity(Number(req.params.id));
  if (!existing || !canAccessRecord(req, existing)) {
    req.session.flash = { type: 'error', message: 'Activity not found.' };
    return res.redirect('/activities');
  }
  const status = req.body.Status;
  if (!ACTIVITY_STATUSES.includes(status)) {
    req.session.flash = { type: 'error', message: 'Invalid status.' };
    return res.redirect('/activities');
  }
  db.prepare('UPDATE Activities SET Status = ? WHERE ActivityId = ?').run(status, existing.ActivityId);
  logAudit(req, 'UPDATE', 'Activity', existing.ActivityId, existing, { ...existing, Status: status });
  req.session.flash = { type: 'success', message: 'Activity status updated.' };
  res.redirect('/activities');
}

module.exports = {
  listActivities,
  getActivity,
  listPage,
  newPage,
  create,
  createRecord,
  updateStatus
};
