const db = require('../data/db');
const { logAudit } = require('../middleware/audit');
const { scopedWhere, canAccessRecord, isSales } = require('../middleware/auth');
const { validateCustomerInput } = require('../middleware/validator');

function usersForAssign() {
  return db.prepare(`
    SELECT UserId, Name, Email FROM Users WHERE IsActive = 1 ORDER BY Name
  `).all();
}

function getCustomer(id) {
  return db.prepare(`
    SELECT c.*, ou.Name AS OwnerName, cu.Name AS CreatedByName
    FROM Customers c
    LEFT JOIN Users ou ON ou.UserId = c.OwnerId
    LEFT JOIN Users cu ON cu.UserId = c.CreatedBy
    WHERE c.CustomerId = ?
  `).get(id);
}

function listCustomers(req) {
  const q = (req.query.q || '').trim();
  const status = (req.query.status || '').trim();
  const city = (req.query.city || '').trim();
  const scope = scopedWhere(req, { ownerColumn: 'c.OwnerId' });
  const where = ['1=1'];
  const params = [];
  if (q) {
    where.push('(c.CustomerName LIKE ? OR c.Email LIKE ? OR c.Phone LIKE ? OR c.CustomerCode LIKE ? OR c.CompanyName LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  if (status) {
    where.push('c.Status = ?');
    params.push(status);
  }
  if (city) {
    where.push('c.City LIKE ?');
    params.push(`%${city}%`);
  }
  const sql = `
    SELECT c.*, u.Name AS OwnerName
    FROM Customers c
    LEFT JOIN Users u ON u.UserId = c.OwnerId
    WHERE ${where.join(' AND ')} ${scope.sql}
    ORDER BY c.CreatedDate DESC
  `;
  return db.prepare(sql).all(...params, ...scope.params);
}

function listPage(req, res) {
  res.render('layout', {
    title: 'Customers',
    view: 'customers/list',
    customers: listCustomers(req),
    filters: {
      q: req.query.q || '',
      status: req.query.status || '',
      city: req.query.city || ''
    }
  });
}

function newPage(req, res) {
  res.render('layout', {
    title: 'New customer',
    view: 'customers/form',
    mode: 'create',
    customer: {},
    errors: {},
    users: usersForAssign()
  });
}

function createRecord(req) {
  const errors = validateCustomerInput(req.body);
  if (Object.keys(errors).length) return { errors };
  const ownerId = isSales(req) ? req.session.user.userId : Number(req.body.OwnerId || req.session.user.userId);
  const code = db.nextCode('CUST', 'Customers', 'CustomerCode');
  const info = db.prepare(`
    INSERT INTO Customers (CustomerCode, CustomerName, Email, Phone, CompanyName, Address, City, State, Status, CreatedBy, OwnerId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?)
  `).run(
    code,
    req.body.CustomerName.trim(),
    req.body.Email.trim().toLowerCase(),
    req.body.Phone.trim(),
    req.body.CompanyName || null,
    req.body.Address || null,
    req.body.City || null,
    req.body.State || null,
    req.session.user.userId,
    ownerId
  );
  const created = getCustomer(info.lastInsertRowid);
  logAudit(req, 'CREATE', 'Customer', created.CustomerId, null, created);
  return { customer: created };
}

function create(req, res) {
  const result = createRecord(req);
  if (result.errors) {
    return res.status(400).render('layout', {
      title: 'New customer',
      view: 'customers/form',
      mode: 'create',
      customer: req.body,
      errors: result.errors,
      users: usersForAssign()
    });
  }
  req.session.flash = { type: 'success', message: 'Customer created.' };
  res.redirect(`/customers/${result.customer.CustomerId}`);
}

function detailPage(req, res) {
  const customer = getCustomer(Number(req.params.id));
  if (!customer || !canAccessRecord(req, customer)) {
    req.session.flash = { type: 'error', message: 'Customer not found.' };
    return res.redirect('/customers');
  }
  const relatedOpps = db.prepare(`
    SELECT o.*, u.Name AS OwnerName, (o.Amount * o.Probability) / 100 AS WeightedValue
    FROM Opportunities o
    LEFT JOIN Users u ON u.UserId = o.AssignedTo
    WHERE o.CustomerId = ?
    ORDER BY o.CreatedDate DESC
  `).all(customer.CustomerId);
  const relatedFollowUps = db.prepare(`
    SELECT * FROM FollowUps WHERE CustomerId = ? ORDER BY FollowUpDate DESC
  `).all(customer.CustomerId);
  res.render('layout', {
    title: customer.CustomerName,
    view: 'customers/details',
    customer,
    relatedOpps,
    relatedFollowUps
  });
}

function editPage(req, res) {
  const customer = getCustomer(Number(req.params.id));
  if (!customer || !canAccessRecord(req, customer)) {
    req.session.flash = { type: 'error', message: 'Customer not found.' };
    return res.redirect('/customers');
  }
  res.render('layout', {
    title: 'Edit customer',
    view: 'customers/form',
    mode: 'edit',
    customer,
    errors: {},
    users: usersForAssign()
  });
}

function updateRecord(req, id) {
  const existing = getCustomer(id);
  if (!existing) return { notFound: true };
  if (!canAccessRecord(req, existing)) return { forbidden: true };
  const errors = validateCustomerInput(req.body, { excludeId: id });
  if (Object.keys(errors).length) return { errors, existing };
  const ownerId = isSales(req) ? existing.OwnerId : Number(req.body.OwnerId || existing.OwnerId);
  db.prepare(`
    UPDATE Customers
    SET CustomerName = ?, Email = ?, Phone = ?, CompanyName = ?, Address = ?, City = ?, State = ?, Status = ?, OwnerId = ?
    WHERE CustomerId = ?
  `).run(
    req.body.CustomerName.trim(),
    req.body.Email.trim().toLowerCase(),
    req.body.Phone.trim(),
    req.body.CompanyName || null,
    req.body.Address || null,
    req.body.City || null,
    req.body.State || null,
    req.body.Status || existing.Status,
    ownerId,
    id
  );
  const updated = getCustomer(id);
  logAudit(req, 'UPDATE', 'Customer', id, existing, updated);
  return { customer: updated };
}

function update(req, res) {
  const id = Number(req.params.id);
  const result = updateRecord(req, id);
  if (result.notFound || result.forbidden) {
    req.session.flash = { type: 'error', message: 'Customer not found.' };
    return res.redirect('/customers');
  }
  if (result.errors) {
    return res.status(400).render('layout', {
      title: 'Edit customer',
      view: 'customers/form',
      mode: 'edit',
      customer: { ...result.existing, ...req.body, CustomerId: id },
      errors: result.errors,
      users: usersForAssign()
    });
  }
  req.session.flash = { type: 'success', message: 'Customer updated.' };
  res.redirect(`/customers/${id}`);
}

function softDeleteRecord(req, id) {
  const existing = getCustomer(id);
  if (!existing) return { notFound: true };
  if (!canAccessRecord(req, existing)) return { forbidden: true };
  db.prepare(`UPDATE Customers SET Status = 'Inactive' WHERE CustomerId = ?`).run(id);
  const updated = getCustomer(id);
  logAudit(req, 'DELETE', 'Customer', id, existing, updated);
  return { customer: updated };
}

function remove(req, res) {
  const result = softDeleteRecord(req, Number(req.params.id));
  if (result.notFound || result.forbidden) {
    req.session.flash = { type: 'error', message: 'Customer not found.' };
  } else {
    req.session.flash = { type: 'success', message: 'Customer marked inactive.' };
  }
  res.redirect('/customers');
}

function toDto(row) {
  if (!row) return null;
  const { PasswordHash, ...rest } = row;
  return rest;
}

module.exports = {
  listCustomers,
  getCustomer,
  listPage,
  newPage,
  create,
  createRecord,
  detailPage,
  editPage,
  update,
  updateRecord,
  remove,
  softDeleteRecord,
  toDto,
  usersForAssign
};
