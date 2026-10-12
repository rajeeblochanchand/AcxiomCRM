const db = require('../data/db');
const { scopedWhere, isAdmin, isManager } = require('../middleware/auth');

function pipelineData(req) {
  const scope = scopedWhere(req, { assignedColumn: 'o.AssignedTo' });
  const byStage = db.prepare(`
    SELECT o.Stage,
           COUNT(*) AS Count,
           COALESCE(SUM(o.Amount), 0) AS TotalAmount,
           COALESCE(SUM((o.Amount * o.Probability) / 100), 0) AS WeightedValue
    FROM Opportunities o
    WHERE 1=1 ${scope.sql}
    GROUP BY o.Stage
  `).all(...scope.params);
  const byOwner = db.prepare(`
    SELECT u.UserId, u.Name AS OwnerName,
           COUNT(*) AS Count,
           COALESCE(SUM(o.Amount), 0) AS TotalAmount,
           COALESCE(SUM((o.Amount * o.Probability) / 100), 0) AS WeightedValue
    FROM Opportunities o
    LEFT JOIN Users u ON u.UserId = o.AssignedTo
    WHERE 1=1 ${scope.sql}
    GROUP BY u.UserId, u.Name
    ORDER BY WeightedValue DESC
  `).all(...scope.params);
  return { byStage, byOwner };
}

function conversionData(req) {
  const scope = scopedWhere(req, { assignedColumn: 'l.AssignedTo' });
  const totals = db.prepare(`
    SELECT
      SUM(CASE WHEN l.Status = 'Converted' THEN 1 ELSE 0 END) AS Converted,
      SUM(CASE WHEN l.Status = 'Lost' THEN 1 ELSE 0 END) AS Lost,
      SUM(CASE WHEN l.Status = 'Qualified' THEN 1 ELSE 0 END) AS Qualified,
      COUNT(*) AS Total
    FROM Leads l
    WHERE 1=1 ${scope.sql}
  `).get(...scope.params);
  const byOwner = db.prepare(`
    SELECT u.Name AS OwnerName,
           SUM(CASE WHEN l.Status = 'Converted' THEN 1 ELSE 0 END) AS Converted,
           SUM(CASE WHEN l.Status = 'Lost' THEN 1 ELSE 0 END) AS Lost,
           COUNT(*) AS Total
    FROM Leads l
    LEFT JOIN Users u ON u.UserId = l.AssignedTo
    WHERE 1=1 ${scope.sql}
    GROUP BY u.UserId, u.Name
  `).all(...scope.params);
  return { totals, byOwner };
}

function activityAuditData(req) {
  const scopeUser = req.session.user.roleName === 'Sales Executive' ? req.session.user.userId : null;
  const userId = scopeUser || (req.query.userId ? Number(req.query.userId) : null);
  const action = (req.query.action || '').trim();
  const from = (req.query.from || '').trim();
  const to = (req.query.to || '').trim();
  const where = ['1=1'];
  const params = [];
  if (userId) {
    where.push('a.UserId = ?');
    params.push(userId);
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
    SELECT a.*, u.Name AS UserName
    FROM AuditLogs a
    LEFT JOIN Users u ON u.UserId = a.UserId
    WHERE ${where.join(' AND ')}
    ORDER BY a.CreatedDate DESC
    LIMIT 200
  `).all(...params);
  return { logs, filters: { userId: userId || '', action, from, to } };
}

function page(req, res) {
  const pipeline = pipelineData(req);
  const conversion = conversionData(req);
  const activity = activityAuditData(req);
  const users = isAdmin(req) || isManager(req)
    ? db.prepare('SELECT UserId, Name FROM Users ORDER BY Name').all()
    : [];
  const actions = db.prepare('SELECT DISTINCT Action FROM AuditLogs ORDER BY Action').all().map((r) => r.Action);
  res.render('layout', {
    title: 'Reports',
    view: 'reports/index',
    pipeline,
    conversion,
    activity,
    users,
    actions,
    canSeeTeam: isAdmin(req) || isManager(req)
  });
}

function pipelineApi(req) {
  return pipelineData(req);
}

module.exports = { page, pipelineData, conversionData, pipelineApi };
