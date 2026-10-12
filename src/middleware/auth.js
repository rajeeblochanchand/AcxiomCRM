function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    if (wantsJson(req)) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/login');
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    const roleName = req.session && req.session.user ? req.session.user.roleName : null;
    if (!roleName || !roles.includes(roleName)) {
      if (wantsJson(req)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      req.session.flash = { type: 'error', message: 'You do not have permission to access that page.' };
      return res.redirect('/dashboard');
    }
    next();
  };
}

function wantsJson(req) {
  const accept = req.headers.accept || '';
  return req.path.startsWith('/api') || req.originalUrl.startsWith('/api') || accept.includes('application/json');
}

function isAdmin(req) {
  return req.session && req.session.user && req.session.user.roleName === 'Admin';
}

function isManager(req) {
  return req.session && req.session.user && req.session.user.roleName === 'Manager';
}

function isSales(req) {
  return req.session && req.session.user && req.session.user.roleName === 'Sales Executive';
}

function scopedWhere(req, columns = {}) {
  if (!isSales(req)) {
    return { sql: '', params: [] };
  }
  const userId = req.session.user.userId;
  const parts = [];
  const params = [];
  if (columns.ownerColumn) {
    parts.push(`${columns.ownerColumn} = ?`);
    params.push(userId);
  }
  if (columns.assignedColumn) {
    parts.push(`${columns.assignedColumn} = ?`);
    params.push(userId);
  }
  if (!parts.length) {
    return { sql: 'AND 1 = 0', params: [] };
  }
  return { sql: `AND (${parts.join(' OR ')})`, params };
}

function canAccessRecord(req, record) {
  if (!record) return false;
  if (!isSales(req)) return true;
  const userId = req.session.user.userId;
  return record.OwnerId === userId || record.AssignedTo === userId || record.CreatedBy === userId;
}

module.exports = {
  requireAuth,
  requireRole,
  wantsJson,
  isAdmin,
  isManager,
  isSales,
  scopedWhere,
  canAccessRecord
};
