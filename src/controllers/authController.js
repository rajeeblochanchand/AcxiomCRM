const bcrypt = require('bcryptjs');
const db = require('../data/db');
const { logAudit } = require('../middleware/audit');
const { validatePassword, validateRegisterInput } = require('../middleware/validator');
const { wantsJson } = require('../middleware/auth');

function loadUserByEmail(email) {
  return db.prepare(`
    SELECT u.*, r.RoleName
    FROM Users u
    JOIN Roles r ON r.RoleId = u.RoleId
    WHERE lower(u.Email) = lower(?)
  `).get(email);
}

function attemptLogin(req, email, password) {
  const user = loadUserByEmail(email);
  if (!user) {
    return { status: 401, error: 'Invalid email or password.' };
  }
  if (Number(user.IsActive) !== 1) {
    return { status: 403, error: 'Account is deactivated. Contact an administrator.' };
  }
  if (db.isLocked(user.LockoutEnd)) {
    return { status: 403, error: 'Account temporarily locked due to repeated failed login attempts.' };
  }

  const ok = bcrypt.compareSync(password || '', user.PasswordHash);
  if (!ok) {
    const failed = Number(user.FailedLoginCount || 0) + 1;
    if (failed >= 5) {
      db.prepare(`
        UPDATE Users
        SET FailedLoginCount = ?, LockoutEnd = datetime('now', '+15 minutes')
        WHERE UserId = ?
      `).run(failed, user.UserId);
      logAudit(req, 'FAILED_LOGIN', 'User', user.UserId, null, { email: user.Email, failed });
      logAudit(req, 'LOCKOUT', 'User', user.UserId, null, { email: user.Email, minutes: 15 });
      return { status: 403, error: 'Account temporarily locked due to repeated failed login attempts.' };
    }
    db.prepare('UPDATE Users SET FailedLoginCount = ? WHERE UserId = ?').run(failed, user.UserId);
    logAudit(req, 'FAILED_LOGIN', 'User', user.UserId, null, { email: user.Email, failed });
    return { status: 401, error: 'Invalid email or password.' };
  }

  db.prepare('UPDATE Users SET FailedLoginCount = 0, LockoutEnd = NULL WHERE UserId = ?').run(user.UserId);
  const dto = db.toUserDto(user);
  req.session.user = dto;
  logAudit(req, 'LOGIN', 'User', user.UserId, null, { email: user.Email });
  return { status: 200, user: dto };
}

function loginPage(req, res) {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('login', { title: 'Sign in', errors: {}, values: {}, message: null });
}

function login(req, res) {
  const email = (req.body.Email || req.body.email || '').trim();
  const password = req.body.Password || req.body.password || '';
  const result = attemptLogin(req, email, password);
  if (result.error) {
    if (wantsJson(req)) return res.status(result.status).json({ error: result.error });
    return res.status(result.status).render('login', {
      title: 'Sign in',
      errors: { Email: result.error },
      values: { Email: email },
      message: result.error
    });
  }
  if (wantsJson(req)) return res.json({ user: result.user });
  res.redirect('/dashboard');
}

function registerPage(req, res) {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('register', { title: 'Create account', errors: {}, values: {} });
}

function register(req, res) {
  const errors = validateRegisterInput(req.body);
  const values = {
    Name: req.body.Name || '',
    Email: req.body.Email || ''
  };
  if (Object.keys(errors).length) {
    return res.status(400).render('register', { title: 'Create account', errors, values });
  }
  const salesRole = db.prepare("SELECT RoleId FROM Roles WHERE RoleName = 'Sales Executive'").get();
  const hash = bcrypt.hashSync(req.body.Password, 10);
  const info = db.prepare(`
    INSERT INTO Users (Name, Email, PasswordHash, RoleId, IsActive)
    VALUES (?, ?, ?, ?, 1)
  `).run(req.body.Name.trim(), req.body.Email.trim().toLowerCase(), hash, salesRole.RoleId);
  const user = db.prepare(`
    SELECT u.*, r.RoleName FROM Users u JOIN Roles r ON r.RoleId = u.RoleId WHERE u.UserId = ?
  `).get(info.lastInsertRowid);
  logAudit({ session: { user: db.toUserDto(user) }, ip: req.ip, headers: req.headers }, 'CREATE', 'User', user.UserId, null, {
    email: user.Email,
    role: user.RoleName
  });
  req.session.user = db.toUserDto(user);
  logAudit(req, 'LOGIN', 'User', user.UserId, null, { email: user.Email, via: 'register' });
  res.redirect('/dashboard');
}

function logout(req, res) {
  const userId = req.session.user ? req.session.user.userId : null;
  logAudit(req, 'LOGOUT', 'User', userId, null, null);
  req.session.destroy(() => {
    if (wantsJson(req)) return res.json({ ok: true });
    res.redirect('/login');
  });
}

module.exports = {
  attemptLogin,
  loginPage,
  login,
  registerPage,
  register,
  logout,
  validatePassword
};
