const db = require('../data/db');
const { logAudit } = require('../middleware/audit');
const { scopedWhere, canAccessRecord, isSales } = require('../middleware/auth');
const { validateOpportunityInput, OPP_STAGES } = require('../middleware/validator');

function usersForAssign() {
  return db.prepare('SELECT UserId, Name FROM Users WHERE IsActive = 1 ORDER BY Name').all();
}

function relatedLists(req) {
  const customerScope = scopedWhere(req, { ownerColumn: 'OwnerId' });
  const leadScope = scopedWhere(req, { assignedColumn: 'AssignedTo' });
  return {
    customers: db.prepare(`SELECT CustomerId, CustomerName, CustomerCode FROM Customers WHERE Status = 'Active' ${customerScope.sql} ORDER BY CustomerName`).all(...customerScope.params),
    leads: db.prepare(`SELECT LeadId, LeadName, LeadCode FROM Leads WHERE Status != 'Lost' ${leadScope.sql} ORDER BY LeadName`).all(...leadScope.params)
  };
}

function getOpportunity(id) {
  return db.prepare(`
    SELECT o.*, c.CustomerName, l.LeadName, u.Name AS OwnerName,
           (o.Amount * o.Probability) / 100 AS WeightedValue
    FROM Opportunities o
    LEFT JOIN Customers c ON c.CustomerId = o.CustomerId
    LEFT JOIN Leads l ON l.LeadId = o.LeadId
    LEFT JOIN Users u ON u.UserId = o.AssignedTo
    WHERE o.OpportunityId = ?
  `).get(id);
}

function listOpportunities(req) {
  const q = (req.query.q || '').trim();
  const stage = (req.query.stage || '').trim();
  const scope = scopedWhere(req, { assignedColumn: 'o.AssignedTo' });
  const where = ['1=1'];
  const params = [];
  if (q) {
    where.push('(o.OpportunityName LIKE ? OR c.CustomerName LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (stage) {
    where.push('o.Stage = ?');
    params.push(stage);
  }
  return db.prepare(`
    SELECT o.*, c.CustomerName, u.Name AS OwnerName,
           (o.Amount * o.Probability) / 100 AS WeightedValue
    FROM Opportunities o
    LEFT JOIN Customers c ON c.CustomerId = o.CustomerId
    LEFT JOIN Users u ON u.UserId = o.AssignedTo
    WHERE ${where.join(' AND ')} ${scope.sql}
    ORDER BY o.CreatedDate DESC
  `).all(...params, ...scope.params);
}

function listPage(req, res) {
  res.render('layout', {
    title: 'Opportunities',
    view: 'opportunities/list',
    opportunities: listOpportunities(req),
    stages: OPP_STAGES,
    filters: { q: req.query.q || '', stage: req.query.stage || '' }
  });
}

function newPage(req, res) {
  res.render('layout', {
    title: 'New opportunity',
    view: 'opportunities/form',
    mode: 'create',
    opportunity: { Stage: 'Qualification', Probability: 20, Status: 'Open' },
    errors: {},
    stages: OPP_STAGES,
    users: usersForAssign(),
    ...relatedLists(req)
  });
}

function deriveStatus(stage) {
  return stage === 'Won' || stage === 'Lost' ? 'Closed' : 'Open';
}

function createRecord(req) {
  const errors = validateOpportunityInput(req.body);
  if (Object.keys(errors).length) return { errors };
  const assignedTo = isSales(req) ? req.session.user.userId : Number(req.body.AssignedTo || req.session.user.userId);
  const stage = req.body.Stage;
  const info = db.prepare(`
    INSERT INTO Opportunities (OpportunityName, CustomerId, LeadId, Amount, Stage, Probability, ExpectedCloseDate, Status, AssignedTo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.body.OpportunityName.trim(),
    req.body.CustomerId || null,
    req.body.LeadId || null,
    Number(req.body.Amount),
    stage,
    Number(req.body.Probability),
    req.body.ExpectedCloseDate,
    deriveStatus(stage),
    assignedTo
  );
  const created = getOpportunity(info.lastInsertRowid);
  logAudit(req, 'CREATE', 'Opportunity', created.OpportunityId, null, created);
  return { opportunity: created };
}

function formLocals(req, extra) {
  return {
    stages: OPP_STAGES,
    users: usersForAssign(),
    ...relatedLists(req),
    ...extra
  };
}

function create(req, res) {
  const result = createRecord(req);
  if (result.errors) {
    return res.status(400).render('layout', formLocals(req, {
      title: 'New opportunity',
      view: 'opportunities/form',
      mode: 'create',
      opportunity: req.body,
      errors: result.errors
    }));
  }
  req.session.flash = { type: 'success', message: 'Opportunity created.' };
  res.redirect(`/opportunities/${result.opportunity.OpportunityId}`);
}

function detailPage(req, res) {
  const opportunity = getOpportunity(Number(req.params.id));
  if (!opportunity || !canAccessRecord(req, opportunity)) {
    req.session.flash = { type: 'error', message: 'Opportunity not found.' };
    return res.redirect('/opportunities');
  }
  res.render('layout', { title: opportunity.OpportunityName, view: 'opportunities/details', opportunity });
}

function editPage(req, res) {
  const opportunity = getOpportunity(Number(req.params.id));
  if (!opportunity || !canAccessRecord(req, opportunity)) {
    req.session.flash = { type: 'error', message: 'Opportunity not found.' };
    return res.redirect('/opportunities');
  }
  res.render('layout', formLocals(req, {
    title: 'Edit opportunity',
    view: 'opportunities/form',
    mode: 'edit',
    opportunity,
    errors: {}
  }));
}

function updateRecord(req, id) {
  const existing = getOpportunity(id);
  if (!existing) return { notFound: true };
  if (!canAccessRecord(req, existing)) return { forbidden: true };
  const isActive = !['Won', 'Lost'].includes(req.body.Stage);
  const errors = validateOpportunityInput(req.body, { isActive });
  if (Object.keys(errors).length) return { errors, existing };
  const assignedTo = isSales(req) ? existing.AssignedTo : Number(req.body.AssignedTo || existing.AssignedTo);
  const stage = req.body.Stage;
  db.prepare(`
    UPDATE Opportunities
    SET OpportunityName = ?, CustomerId = ?, LeadId = ?, Amount = ?, Stage = ?, Probability = ?, ExpectedCloseDate = ?, Status = ?, AssignedTo = ?
    WHERE OpportunityId = ?
  `).run(
    req.body.OpportunityName.trim(),
    req.body.CustomerId || null,
    req.body.LeadId || null,
    Number(req.body.Amount),
    stage,
    Number(req.body.Probability),
    req.body.ExpectedCloseDate,
    deriveStatus(stage),
    assignedTo,
    id
  );
  const updated = getOpportunity(id);
  logAudit(req, 'UPDATE', 'Opportunity', id, existing, updated);
  return { opportunity: updated };
}

function update(req, res) {
  const id = Number(req.params.id);
  const result = updateRecord(req, id);
  if (result.notFound || result.forbidden) {
    req.session.flash = { type: 'error', message: 'Opportunity not found.' };
    return res.redirect('/opportunities');
  }
  if (result.errors) {
    return res.status(400).render('layout', formLocals(req, {
      title: 'Edit opportunity',
      view: 'opportunities/form',
      mode: 'edit',
      opportunity: { ...result.existing, ...req.body, OpportunityId: id },
      errors: result.errors
    }));
  }
  req.session.flash = { type: 'success', message: 'Opportunity updated.' };
  res.redirect(`/opportunities/${id}`);
}

module.exports = {
  listOpportunities,
  getOpportunity,
  listPage,
  newPage,
  create,
  createRecord,
  detailPage,
  editPage,
  update,
  updateRecord
};
