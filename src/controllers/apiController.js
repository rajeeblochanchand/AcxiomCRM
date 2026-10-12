const customerController = require('./customerController');
const leadController = require('./leadController');
const opportunityController = require('./opportunityController');
const followUpController = require('./followUpController');
const authController = require('./authController');
const { pipelineApi } = require('./reportController');
const { isAdmin, isManager, canAccessRecord } = require('../middleware/auth');

function stripPrivate(row) {
  if (!row) return null;
  const omit = ['PasswordHash', 'FailedLoginCount', 'LockoutEnd'];
  const out = {};
  Object.keys(row).forEach((key) => {
    if (!omit.includes(key)) out[key] = row[key];
  });
  return out;
}

function login(req, res) {
  const email = (req.body.Email || req.body.email || '').trim();
  const password = req.body.Password || req.body.password || '';
  const result = authController.attemptLogin(req, email, password);
  if (result.error) return res.status(result.status).json({ error: result.error });
  return res.status(200).json({ user: result.user });
}

function logout(req, res) {
  authController.logout(req, res);
}

function listCustomers(req, res) {
  res.json(customerController.listCustomers(req).map(stripPrivate));
}

function getCustomer(req, res) {
  const customer = customerController.getCustomer(Number(req.params.id));
  if (!customer || !canAccessRecord(req, customer)) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  res.json(stripPrivate(customer));
}

function createCustomer(req, res) {
  const result = customerController.createRecord(req);
  if (result.errors) return res.status(400).json({ error: 'Validation failed', errors: result.errors });
  res.status(201).json(stripPrivate(result.customer));
}

function updateCustomer(req, res) {
  const result = customerController.updateRecord(req, Number(req.params.id));
  if (result.notFound || result.forbidden) return res.status(404).json({ error: 'Customer not found' });
  if (result.errors) return res.status(400).json({ error: 'Validation failed', errors: result.errors });
  res.status(200).json(stripPrivate(result.customer));
}

function deleteCustomer(req, res) {
  const result = customerController.softDeleteRecord(req, Number(req.params.id));
  if (result.notFound || result.forbidden) return res.status(404).json({ error: 'Customer not found' });
  res.status(200).json(stripPrivate(result.customer));
}

function listLeads(req, res) {
  res.json(leadController.listLeads(req).map(stripPrivate));
}

function createLead(req, res) {
  const result = leadController.createRecord(req);
  if (result.errors) return res.status(400).json({ error: 'Validation failed', errors: result.errors });
  res.status(201).json(stripPrivate(result.lead));
}

function listOpportunities(req, res) {
  res.json(opportunityController.listOpportunities(req).map(stripPrivate));
}

function createOpportunity(req, res) {
  const result = opportunityController.createRecord(req);
  if (result.errors) return res.status(400).json({ error: 'Validation failed', errors: result.errors });
  res.status(201).json(stripPrivate(result.opportunity));
}

function listFollowUps(req, res) {
  res.json(followUpController.listFollowUps(req).map(stripPrivate));
}

function createFollowUp(req, res) {
  const result = followUpController.createRecord(req);
  if (result.errors) return res.status(400).json({ error: 'Validation failed', errors: result.errors });
  res.status(201).json(stripPrivate(result.followUp));
}

function pipelineReport(req, res) {
  if (!isAdmin(req) && !isManager(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(pipelineApi(req));
}

module.exports = {
  login,
  logout,
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  listLeads,
  createLead,
  listOpportunities,
  createOpportunity,
  listFollowUps,
  createFollowUp,
  pipelineReport
};
