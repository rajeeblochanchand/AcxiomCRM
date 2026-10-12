const db = require('../data/db');
const { logAudit } = require('../middleware/audit');
const { scopedWhere, canAccessRecord, isSales } = require('../middleware/auth');
const { validateLeadInput, validateCustomerInput, LEAD_STATUSES } = require('../middleware/validator');

function usersForAssign() {
  return db.prepare('SELECT UserId, Name FROM Users WHERE IsActive = 1 ORDER BY Name').all();
}

function getLead(id) {
  return db.prepare(`
    SELECT l.*, u.Name AS OwnerName
    FROM Leads l
    LEFT JOIN Users u ON u.UserId = l.AssignedTo
    WHERE l.LeadId = ?
  `).get(id);
}

function listLeads(req) {
  const q = (req.query.q || '').trim();
  const status = (req.query.status || '').trim();
  const scope = scopedWhere(req, { assignedColumn: 'l.AssignedTo' });
  const where = ['1=1'];
  const params = [];
  if (q) {
    where.push('(l.LeadName LIKE ? OR l.Email LIKE ? OR l.Phone LIKE ? OR l.LeadCode LIKE ? OR l.CompanyName LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  if (status) {
    where.push('l.Status = ?');
    params.push(status);
  }
  return db.prepare(`
    SELECT l.*, u.Name AS OwnerName
    FROM Leads l
    LEFT JOIN Users u ON u.UserId = l.AssignedTo
    WHERE ${where.join(' AND ')} ${scope.sql}
    ORDER BY l.CreatedDate DESC
  `).all(...params, ...scope.params);
}

function listPage(req, res) {
  res.render('layout', {
    title: 'Leads',
    view: 'leads/list',
    leads: listLeads(req),
    statuses: LEAD_STATUSES,
    filters: { q: req.query.q || '', status: req.query.status || '' }
  });
}

function newPage(req, res) {
  res.render('layout', {
    title: 'New lead',
    view: 'leads/form',
    mode: 'create',
    lead: { Status: 'New', ExpectedValue: 0 },
    errors: {},
    statuses: LEAD_STATUSES,
    users: usersForAssign()
  });
}

function createRecord(req) {
  const errors = validateLeadInput(req.body);
  if (Object.keys(errors).length) return { errors };
  const assignedTo = isSales(req) ? req.session.user.userId : Number(req.body.AssignedTo || req.session.user.userId);
  const code = db.nextCode('LEAD', 'Leads', 'LeadCode');
  const info = db.prepare(`
    INSERT INTO Leads (LeadCode, LeadName, Email, Phone, CompanyName, Source, Status, ExpectedValue, AssignedTo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    code,
    req.body.LeadName.trim(),
    req.body.Email.trim().toLowerCase(),
    req.body.Phone.trim(),
    req.body.CompanyName || null,
    req.body.Source || null,
    req.body.Status || 'New',
    Number(req.body.ExpectedValue || 0),
    assignedTo
  );
  const created = getLead(info.lastInsertRowid);
  logAudit(req, 'CREATE', 'Lead', created.LeadId, null, created);
  return { lead: created };
}

function create(req, res) {
  const result = createRecord(req);
  if (result.errors) {
    return res.status(400).render('layout', {
      title: 'New lead',
      view: 'leads/form',
      mode: 'create',
      lead: req.body,
      errors: result.errors,
      statuses: LEAD_STATUSES,
      users: usersForAssign()
    });
  }
  req.session.flash = { type: 'success', message: 'Lead created.' };
  res.redirect(`/leads/${result.lead.LeadId}`);
}

function detailPage(req, res) {
  const lead = getLead(Number(req.params.id));
  if (!lead || !canAccessRecord(req, lead)) {
    req.session.flash = { type: 'error', message: 'Lead not found.' };
    return res.redirect('/leads');
  }
  res.render('layout', { title: lead.LeadName, view: 'leads/details', lead });
}

function editPage(req, res) {
  const lead = getLead(Number(req.params.id));
  if (!lead || !canAccessRecord(req, lead)) {
    req.session.flash = { type: 'error', message: 'Lead not found.' };
    return res.redirect('/leads');
  }
  res.render('layout', {
    title: 'Edit lead',
    view: 'leads/form',
    mode: 'edit',
    lead,
    errors: {},
    statuses: LEAD_STATUSES,
    users: usersForAssign()
  });
}

function updateRecord(req, id) {
  const existing = getLead(id);
  if (!existing) return { notFound: true };
  if (!canAccessRecord(req, existing)) return { forbidden: true };
  const errors = validateLeadInput(req.body);
  if (Object.keys(errors).length) return { errors, existing };
  const assignedTo = isSales(req) ? existing.AssignedTo : Number(req.body.AssignedTo || existing.AssignedTo);
  db.prepare(`
    UPDATE Leads
    SET LeadName = ?, Email = ?, Phone = ?, CompanyName = ?, Source = ?, Status = ?, ExpectedValue = ?, AssignedTo = ?
    WHERE LeadId = ?
  `).run(
    req.body.LeadName.trim(),
    req.body.Email.trim().toLowerCase(),
    req.body.Phone.trim(),
    req.body.CompanyName || null,
    req.body.Source || null,
    req.body.Status,
    Number(req.body.ExpectedValue || 0),
    assignedTo,
    id
  );
  const updated = getLead(id);
  logAudit(req, 'UPDATE', 'Lead', id, existing, updated);
  return { lead: updated };
}

function update(req, res) {
  const id = Number(req.params.id);
  const result = updateRecord(req, id);
  if (result.notFound || result.forbidden) {
    req.session.flash = { type: 'error', message: 'Lead not found.' };
    return res.redirect('/leads');
  }
  if (result.errors) {
    return res.status(400).render('layout', {
      title: 'Edit lead',
      view: 'leads/form',
      mode: 'edit',
      lead: { ...result.existing, ...req.body, LeadId: id },
      errors: result.errors,
      statuses: LEAD_STATUSES,
      users: usersForAssign()
    });
  }
  req.session.flash = { type: 'success', message: 'Lead updated.' };
  res.redirect(`/leads/${id}`);
}

function convertRecord(req, id) {
  const lead = getLead(id);
  if (!lead) return { notFound: true };
  if (!canAccessRecord(req, lead)) return { forbidden: true };
  if (lead.Status !== 'Qualified') {
    return { errors: { Status: 'Only qualified leads can be converted to customers.' } };
  }
  const payload = {
    CustomerName: lead.LeadName,
    Email: lead.Email,
    Phone: lead.Phone,
    CompanyName: lead.CompanyName,
    Address: '',
    City: '',
    State: ''
  };
  const errors = validateCustomerInput(payload);
  if (Object.keys(errors).length) return { errors, lead };
  const code = db.nextCode('CUST', 'Customers', 'CustomerCode');
  const info = db.prepare(`
    INSERT INTO Customers (CustomerCode, CustomerName, Email, Phone, CompanyName, Status, CreatedBy, OwnerId)
    VALUES (?, ?, ?, ?, ?, 'Active', ?, ?)
  `).run(
    code,
    lead.LeadName,
    lead.Email.toLowerCase(),
    lead.Phone,
    lead.CompanyName,
    req.session.user.userId,
    lead.AssignedTo || req.session.user.userId
  );
  db.prepare(`UPDATE Leads SET Status = 'Converted' WHERE LeadId = ?`).run(id);
  const customer = db.prepare('SELECT * FROM Customers WHERE CustomerId = ?').get(info.lastInsertRowid);
  const updatedLead = getLead(id);
  logAudit(req, 'CONVERT', 'Lead', lead.LeadId, lead, {
    leadId: lead.LeadId,
    customerId: customer.CustomerId,
    customerCode: customer.CustomerCode
  });
  logAudit(req, 'CREATE', 'Customer', customer.CustomerId, null, customer);
  return { lead: updatedLead, customer };
}

function convert(req, res) {
  const result = convertRecord(req, Number(req.params.id));
  if (result.notFound || result.forbidden) {
    req.session.flash = { type: 'error', message: 'Lead not found.' };
    return res.redirect('/leads');
  }
  if (result.errors) {
    req.session.flash = { type: 'error', message: Object.values(result.errors)[0] };
    return res.redirect(`/leads/${req.params.id}`);
  }
  req.session.flash = { type: 'success', message: `Lead converted to customer ${result.customer.CustomerCode}.` };
  res.redirect(`/customers/${result.customer.CustomerId}`);
}

module.exports = {
  listLeads,
  getLead,
  listPage,
  newPage,
  create,
  createRecord,
  detailPage,
  editPage,
  update,
  updateRecord,
  convert,
  convertRecord
};
