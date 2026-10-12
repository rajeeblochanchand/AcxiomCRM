const db = require('../data/db');

function logAudit(req, action, entityName, recordId, oldValue, newValue) {
  const userId = req && req.session && req.session.user ? req.session.user.userId : null;
  const forwarded = req && req.headers ? req.headers['x-forwarded-for'] : null;
  let ip = null;
  if (typeof forwarded === 'string' && forwarded.trim()) {
    ip = forwarded.split(',')[0].trim();
  } else if (req && req.ip) {
    ip = req.ip;
  } else if (req && req.socket && req.socket.remoteAddress) {
    ip = req.socket.remoteAddress;
  }

  const stringify = (value) => {
    if (value === undefined || value === null) return null;
    return typeof value === 'string' ? value : JSON.stringify(value);
  };

  db.prepare(`
    INSERT INTO AuditLogs (UserId, Action, EntityName, RecordId, OldValue, NewValue, IpAddress)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, action, entityName, recordId == null ? null : recordId, stringify(oldValue), stringify(newValue), ip);
}

module.exports = { logAudit };
