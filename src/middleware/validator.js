const db = require('../data/db');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9]{10}$/;
const SPECIAL_RE = /[!@#$%^&*(),.?":{}|<>]/;
const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Unqualified', 'Converted', 'Lost'];
const OPP_STAGES = ['Qualification', 'Proposal', 'Negotiation', 'Won', 'Lost'];
const FOLLOW_TYPES = ['Call', 'Meeting', 'Email', 'Task'];
const FOLLOW_STATUSES = ['Planned', 'Completed', 'Missed', 'Cancelled'];
const ACTIVITY_TYPES = ['Call', 'Meeting', 'Email', 'Task'];
const ACTIVITY_STATUSES = ['Planned', 'Completed', 'Cancelled'];

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function validatePassword(password) {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one digit.';
  }
  if (!SPECIAL_RE.test(password)) {
    return 'Password must contain at least one special symbol.';
  }
  return null;
}

function fieldError(errors, field, message) {
  if (!errors[field]) errors[field] = message;
}

function validateCustomerInput(body, options = {}) {
  const errors = {};
  const name = (body.CustomerName || '').trim();
  const email = (body.Email || '').trim().toLowerCase();
  const phone = (body.Phone || '').trim();
  const excludeId = options.excludeId || null;

  if (!name) fieldError(errors, 'CustomerName', 'Customer Name is required.');
  else if (name.length > 100) fieldError(errors, 'CustomerName', 'Customer Name must be at most 100 characters.');

  if (!email) fieldError(errors, 'Email', 'Email is required.');
  else if (!EMAIL_RE.test(email)) fieldError(errors, 'Email', 'Enter a valid email address.');

  if (!phone) fieldError(errors, 'Phone', 'Phone is required.');
  else if (!PHONE_RE.test(phone)) fieldError(errors, 'Phone', 'Phone must be a 10-digit numeric value.');

  if (email && EMAIL_RE.test(email)) {
    const existingEmail = db.prepare(
      `SELECT CustomerId FROM Customers WHERE lower(Email) = ? ${excludeId ? 'AND CustomerId != ?' : ''}`
    ).get(...(excludeId ? [email, excludeId] : [email]));
    if (existingEmail) fieldError(errors, 'Email', 'Email must be unique.');
  }

  if (phone && PHONE_RE.test(phone)) {
    const existingPhone = db.prepare(
      `SELECT CustomerId FROM Customers WHERE Phone = ? ${excludeId ? 'AND CustomerId != ?' : ''}`
    ).get(...(excludeId ? [phone, excludeId] : [phone]));
    if (existingPhone) fieldError(errors, 'Phone', 'Phone must be unique.');
  }

  if (name && email && EMAIL_RE.test(email) && !excludeId) {
    const duplicate = db.prepare(
      'SELECT CustomerId FROM Customers WHERE lower(CustomerName) = lower(?) AND lower(Email) = ?'
    ).get(name, email);
    if (duplicate) fieldError(errors, 'CustomerName', 'A customer with this name and email already exists.');
  }

  if (body.Status && !['Active', 'Inactive'].includes(body.Status)) {
    fieldError(errors, 'Status', 'Status must be Active or Inactive.');
  }

  return errors;
}

function validateLeadInput(body) {
  const errors = {};
  const name = (body.LeadName || '').trim();
  const email = (body.Email || '').trim();
  const phone = (body.Phone || '').trim();
  const status = body.Status || 'New';
  const expected = body.ExpectedValue;

  if (!name) fieldError(errors, 'LeadName', 'Lead Name is required.');
  if (!email) fieldError(errors, 'Email', 'Email is required.');
  else if (!EMAIL_RE.test(email)) fieldError(errors, 'Email', 'Enter a valid email address.');
  if (!phone) fieldError(errors, 'Phone', 'Phone is required.');
  else if (!PHONE_RE.test(phone)) fieldError(errors, 'Phone', 'Phone must be a 10-digit numeric value.');
  if (!LEAD_STATUSES.includes(status)) {
    fieldError(errors, 'Status', 'Status must be one of New, Contacted, Qualified, Unqualified, Converted, Lost.');
  }
  if (expected === undefined || expected === null || expected === '') {
    fieldError(errors, 'ExpectedValue', 'Expected value must be numeric and at least 0.');
  } else if (Number.isNaN(Number(expected)) || Number(expected) < 0) {
    fieldError(errors, 'ExpectedValue', 'Expected value must be numeric and at least 0.');
  }
  return errors;
}

function validateOpportunityInput(body, options = {}) {
  const errors = {};
  const name = (body.OpportunityName || '').trim();
  const amount = Number(body.Amount);
  const probability = Number(body.Probability);
  const closeDate = (body.ExpectedCloseDate || '').trim();
  const stage = body.Stage || 'Qualification';
  const isActive = options.isActive !== false && !['Won', 'Lost'].includes(stage) && body.Status !== 'Closed';

  if (!name) fieldError(errors, 'OpportunityName', 'Opportunity name is required.');
  if (body.Amount === undefined || body.Amount === '' || Number.isNaN(amount) || amount <= 0) {
    fieldError(errors, 'Amount', 'Opportunity Amount must be greater than 0.');
  }
  if (body.Probability === undefined || body.Probability === '' || Number.isNaN(probability) || !Number.isInteger(probability) || probability < 0 || probability > 100) {
    fieldError(errors, 'Probability', 'Probability must be between 0 and 100.');
  }
  if (!closeDate) {
    fieldError(errors, 'ExpectedCloseDate', 'Expected Close Date is required.');
  } else if (isActive && closeDate < todayIso()) {
    fieldError(errors, 'ExpectedCloseDate', 'Expected Close Date cannot be in the past.');
  }
  if (!OPP_STAGES.includes(stage)) {
    fieldError(errors, 'Stage', 'Invalid opportunity stage.');
  }
  return errors;
}

function validateFollowUpInput(body, options = {}) {
  const errors = {};
  const date = (body.FollowUpDate || '').trim();
  const type = body.FollowUpType;
  const status = body.Status || 'Planned';
  const planned = options.isNew || status === 'Planned';

  if (!date) fieldError(errors, 'FollowUpDate', 'Follow-up date is required.');
  else if (planned && date < todayIso()) {
    fieldError(errors, 'FollowUpDate', 'Follow-up date cannot be earlier than today.');
  }
  if (!FOLLOW_TYPES.includes(type)) {
    fieldError(errors, 'FollowUpType', 'Follow-up type must be Call, Meeting, Email, or Task.');
  }
  if (!FOLLOW_STATUSES.includes(status)) {
    fieldError(errors, 'Status', 'Status must be Planned, Completed, Missed, or Cancelled.');
  }
  if (!body.CustomerId && !body.LeadId) {
    fieldError(errors, 'CustomerId', 'Select a customer or a lead.');
  }
  return errors;
}

function validateActivityInput(body) {
  const errors = {};
  if (!ACTIVITY_TYPES.includes(body.ActivityType)) {
    fieldError(errors, 'ActivityType', 'Activity type must be Call, Meeting, Email, or Task.');
  }
  if (!(body.Subject || '').trim()) fieldError(errors, 'Subject', 'Subject is required.');
  if (!(body.ActivityDate || '').trim()) fieldError(errors, 'ActivityDate', 'Activity date is required.');
  if (body.Status && !ACTIVITY_STATUSES.includes(body.Status)) {
    fieldError(errors, 'Status', 'Invalid activity status.');
  }
  return errors;
}

function validateRegisterInput(body, options = {}) {
  const errors = {};
  if (!(body.Name || '').trim()) fieldError(errors, 'Name', 'Name is required.');
  const email = (body.Email || '').trim().toLowerCase();
  if (!email) fieldError(errors, 'Email', 'Email is required.');
  else if (!EMAIL_RE.test(email)) fieldError(errors, 'Email', 'Enter a valid email address.');
  else {
    const existing = db.prepare(
      `SELECT UserId FROM Users WHERE lower(Email) = ? ${options.excludeId ? 'AND UserId != ?' : ''}`
    ).get(...(options.excludeId ? [email, options.excludeId] : [email]));
    if (existing) fieldError(errors, 'Email', 'Email is already registered.');
  }
  if (options.requirePassword !== false) {
    const pwdError = validatePassword(body.Password);
    if (pwdError) fieldError(errors, 'Password', pwdError);
    if (body.ConfirmPassword !== undefined && body.Password !== body.ConfirmPassword) {
      fieldError(errors, 'ConfirmPassword', 'Passwords do not match.');
    }
  } else if (body.Password) {
    const pwdError = validatePassword(body.Password);
    if (pwdError) fieldError(errors, 'Password', pwdError);
  }
  return errors;
}

function sendValidation(req, res, errors) {
  const isApi = req.originalUrl.startsWith('/api') || (req.headers.accept || '').includes('application/json');
  if (isApi) {
    return res.status(400).json({ error: 'Validation failed', errors });
  }
  return null;
}

function customerValidator(options = {}) {
  return (req, res, next) => {
    const excludeId = options.excludeIdFromParam ? Number(req.params.id) : null;
    req.validationErrors = validateCustomerInput(req.body, { excludeId });
    if (Object.keys(req.validationErrors).length) {
      const sent = sendValidation(req, res, req.validationErrors);
      if (sent) return sent;
    }
    next();
  };
}

function leadValidator() {
  return (req, res, next) => {
    req.validationErrors = validateLeadInput(req.body);
    if (Object.keys(req.validationErrors).length) {
      const sent = sendValidation(req, res, req.validationErrors);
      if (sent) return sent;
    }
    next();
  };
}

function opportunityValidator() {
  return (req, res, next) => {
    req.validationErrors = validateOpportunityInput(req.body);
    if (Object.keys(req.validationErrors).length) {
      const sent = sendValidation(req, res, req.validationErrors);
      if (sent) return sent;
    }
    next();
  };
}

function followUpValidator(options = {}) {
  return (req, res, next) => {
    req.validationErrors = validateFollowUpInput(req.body, { isNew: options.isNew !== false });
    if (Object.keys(req.validationErrors).length) {
      const sent = sendValidation(req, res, req.validationErrors);
      if (sent) return sent;
    }
    next();
  };
}

module.exports = {
  EMAIL_RE,
  PHONE_RE,
  LEAD_STATUSES,
  OPP_STAGES,
  FOLLOW_TYPES,
  FOLLOW_STATUSES,
  ACTIVITY_TYPES,
  ACTIVITY_STATUSES,
  todayIso,
  validatePassword,
  validateCustomerInput,
  validateLeadInput,
  validateOpportunityInput,
  validateFollowUpInput,
  validateActivityInput,
  validateRegisterInput,
  customerValidator,
  leadValidator,
  opportunityValidator,
  followUpValidator
};
