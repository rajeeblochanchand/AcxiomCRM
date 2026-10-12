const bcrypt = require('bcryptjs');
const db = require('../data/db');
const { logAudit } = require('../middleware/audit');
const { validateRegisterInput } = require('../middleware/validator');

function listUsers() {
  return db.prepare(`
    SELECT u.UserId, u.Name, u.Email, u.RoleId, u.IsActive, u.FailedLoginCount, u.LockoutEnd, u.CreatedDate, r.RoleName
    FROM Users u
    JOIN Roles r ON r.RoleId = u.RoleId
    ORDER BY u.CreatedDate DESC
  `).all();
}

function roles() {
  return db.prepare('SELECT RoleId, RoleName FROM Roles ORDER BY RoleId').all();
}

function listPage(req, res) {
  res.render('layout', {
    title: 'User administration',
    view: 'users/list',
    users: listUsers(),
    roles: roles(),
    errors: {},
    values: {}
  });
}

function create(req, res) {
  const errors = validateRegisterInput(req.body);
  if (!req.body.RoleId) errors.RoleId = 'Role is required.';
  if (Object.keys(errors).length) {
    return res.status(400).render('layout', {
      title: 'User administration',
      view: 'users/list',
      users: listUsers(),
      roles: roles(),
      errors,
      values: req.body
    });
  }
  const hash = bcrypt.hashSync(req.body.Password, 10);
  const info = db.prepare(`
    INSERT INTO Users (Name, Email, PasswordHash, RoleId, IsActive)
    VALUES (?, ?, ?, ?, 1)
  `).run(req.body.Name.trim(), req.body.Email.trim().toLowerCase(), hash, Number(req.body.RoleId));
  const created = db.prepare(`
    SELECT u.UserId, u.Name, u.Email, u.RoleId, u.IsActive, r.RoleName
    FROM Users u JOIN Roles r ON r.RoleId = u.RoleId WHERE u.UserId = ?
  `).get(info.lastInsertRowid);
  logAudit(req, 'CREATE', 'User', created.UserId, null, created);
  req.session.flash = { type: 'success', message: 'User created.' };
  res.redirect('/users');
}

function updateRole(req, res) {
  const user = db.prepare('SELECT * FROM Users WHERE UserId = ?').get(Number(req.params.id));
  if (!user) {
    req.session.flash = { type: 'error', message: 'User not found.' };
    return res.redirect('/users');
  }
  const roleId = Number(req.body.RoleId);
  const role = db.prepare('SELECT * FROM Roles WHERE RoleId = ?').get(roleId);
  if (!role) {
    req.session.flash = { type: 'error', message: 'Invalid role.' };
    return res.redirect('/users');
  }
  db.prepare('UPDATE Users SET RoleId = ? WHERE UserId = ?').run(roleId, user.UserId);
  logAudit(req, 'UPDATE', 'User', user.UserId, { RoleId: user.RoleId }, { RoleId: roleId, RoleName: role.RoleName });
  if (req.session.user.userId === user.UserId) {
    req.session.user.roleId = roleId;
    req.session.user.roleName = role.RoleName;
  }
  req.session.flash = { type: 'success', message: 'Role updated.' };
  res.redirect('/users');
}

function toggleActive(req, res) {
  const user = db.prepare('SELECT * FROM Users WHERE UserId = ?').get(Number(req.params.id));
  if (!user) {
    req.session.flash = { type: 'error', message: 'User not found.' };
    return res.redirect('/users');
  }
  if (user.UserId === req.session.user.userId) {
    req.session.flash = { type: 'error', message: 'You cannot deactivate your own account.' };
    return res.redirect('/users');
  }
  const next = Number(user.IsActive) === 1 ? 0 : 1;
  db.prepare('UPDATE Users SET IsActive = ? WHERE UserId = ?').run(next, user.UserId);
  logAudit(req, 'UPDATE', 'User', user.UserId, { IsActive: user.IsActive }, { IsActive: next });
  req.session.flash = { type: 'success', message: next ? 'User activated.' : 'User deactivated.' };
  res.redirect('/users');
}

function toggleLockout(req, res) {
  const user = db.prepare('SELECT * FROM Users WHERE UserId = ?').get(Number(req.params.id));
  if (!user) {
    req.session.flash = { type: 'error', message: 'User not found.' };
    return res.redirect('/users');
  }
  if (user.LockoutEnd && db.isLocked(user.LockoutEnd)) {
    db.prepare('UPDATE Users SET FailedLoginCount = 0, LockoutEnd = NULL WHERE UserId = ?').run(user.UserId);
    logAudit(req, 'UPDATE', 'User', user.UserId, { LockoutEnd: user.LockoutEnd }, { LockoutEnd: null });
    req.session.flash = { type: 'success', message: 'Account unlocked.' };
  } else {
    db.prepare(`UPDATE Users SET LockoutEnd = datetime('now', '+15 minutes'), FailedLoginCount = 5 WHERE UserId = ?`).run(user.UserId);
    logAudit(req, 'LOCKOUT', 'User', user.UserId, { LockoutEnd: user.LockoutEnd }, { minutes: 15, admin: true });
    req.session.flash = { type: 'success', message: 'Account locked for 15 minutes.' };
  }
  res.redirect('/users');
}

function auditPage(req, res) {
  const userId = (req.query.userId || '').trim();
  const action = (req.query.action || '').trim();
  const from = (req.query.from || '').trim();
  const to = (req.query.to || '').trim();
  const where = ['1=1'];
  const params = [];
  if (userId) {
    where.push('a.UserId = ?');
    params.push(Number(userId));
  }
  if (action) {
    where.push('a.Action = ?');
    params.push(action);
  }
  if (from) {
    where.push('date(a.CreatedDate) >= date(?)');
    params.push(from);
  }
  if (to) {
    where.push('date(a.CreatedDate) <= date(?)');
    params.push(to);
  }
  const logs = db.prepare(`
    SELECT a.*, u.Name AS UserName, u.Email AS UserEmail
    FROM AuditLogs a
    LEFT JOIN Users u ON u.UserId = a.UserId
    WHERE ${where.join(' AND ')}
    ORDER BY a.CreatedDate DESC
    LIMIT 500
  `).all(...params);
  const users = db.prepare('SELECT UserId, Name, Email FROM Users ORDER BY Name').all();
  const actions = db.prepare('SELECT DISTINCT Action FROM AuditLogs ORDER BY Action').all().map((r) => r.Action);
  res.render('layout', {
    title: 'Audit logs',
    view: 'audit/list',
    logs,
    users,
    actions,
    filters: { userId, action, from, to }
  });
}

module.exports = {
  listPage,
  create,
  updateRole,
  toggleActive,
  toggleLockout,
  auditPage,
  listUsers
};
