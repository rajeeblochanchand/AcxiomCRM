const db = require('../data/db');
const { scopedWhere } = require('../middleware/auth');

function page(req, res) {
  const customerScope = scopedWhere(req, { ownerColumn: 'c.OwnerId' });
  const leadScope = scopedWhere(req, { assignedColumn: 'l.AssignedTo' });
  const oppScope = scopedWhere(req, { assignedColumn: 'o.AssignedTo' });

  const totalCustomers = db.prepare(`SELECT COUNT(*) AS c FROM Customers c WHERE 1=1 ${customerScope.sql}`).get(...customerScope.params).c;
  const totalLeads = db.prepare(`SELECT COUNT(*) AS c FROM Leads l WHERE 1=1 ${leadScope.sql}`).get(...leadScope.params).c;
  const openLeads = db.prepare(`
    SELECT COUNT(*) AS c FROM Leads l
    WHERE l.Status IN ('New', 'Contacted', 'Qualified') ${leadScope.sql}
  `).get(...leadScope.params).c;
  const totalOpportunities = db.prepare(`SELECT COUNT(*) AS c FROM Opportunities o WHERE 1=1 ${oppScope.sql}`).get(...oppScope.params).c;
  const openOpportunities = db.prepare(`
    SELECT COUNT(*) AS c FROM Opportunities o WHERE o.Status = 'Open' AND o.Stage NOT IN ('Won', 'Lost') ${oppScope.sql}
  `).get(...oppScope.params).c;
  const wonOpportunities = db.prepare(`SELECT COUNT(*) AS c FROM Opportunities o WHERE o.Stage = 'Won' ${oppScope.sql}`).get(...oppScope.params).c;
  const lostOpportunities = db.prepare(`SELECT COUNT(*) AS c FROM Opportunities o WHERE o.Stage = 'Lost' ${oppScope.sql}`).get(...oppScope.params).c;
  const pipelineValue = db.prepare(`
    SELECT COALESCE(SUM(o.Amount), 0) AS v
    FROM Opportunities o
    WHERE o.Status = 'Open' AND o.Stage NOT IN ('Won', 'Lost') ${oppScope.sql}
  `).get(...oppScope.params).v;

  const leadBreakdownRows = db.prepare(`
    SELECT l.Status, COUNT(*) AS c
    FROM Leads l
    WHERE 1=1 ${leadScope.sql}
    GROUP BY l.Status
  `).all(...leadScope.params);
  const leadLabels = ['New', 'Contacted', 'Qualified', 'Lost', 'Converted'];
  const leadCounts = leadLabels.map((label) => {
    const row = leadBreakdownRows.find((r) => r.Status === label);
    return row ? row.c : 0;
  });

  const stageRows = db.prepare(`
    SELECT o.Stage, COUNT(*) AS c
    FROM Opportunities o
    WHERE 1=1 ${oppScope.sql}
    GROUP BY o.Stage
  `).all(...oppScope.params);
  const stageLabels = ['Qualification', 'Proposal', 'Negotiation', 'Won', 'Lost'];
  const stageCounts = stageLabels.map((label) => {
    const row = stageRows.find((r) => r.Stage === label);
    return row ? row.c : 0;
  });

  const upcomingFollowUps = db.prepare(`
    SELECT f.*, u.Name AS OwnerName, c.CustomerName, l.LeadName
    FROM FollowUps f
    LEFT JOIN Users u ON u.UserId = f.AssignedTo
    LEFT JOIN Customers c ON c.CustomerId = f.CustomerId
    LEFT JOIN Leads l ON l.LeadId = f.LeadId
    WHERE f.Status = 'Planned' AND date(f.FollowUpDate) >= date('now')
    ${scopedWhere(req, { assignedColumn: 'f.AssignedTo' }).sql}
    ORDER BY f.FollowUpDate ASC
    LIMIT 5
  `).all(...scopedWhere(req, { assignedColumn: 'f.AssignedTo' }).params);

  res.render('layout', {
    title: 'Dashboard',
    view: 'dashboard',
    kpis: {
      totalCustomers,
      totalLeads,
      openLeads,
      totalOpportunities,
      openOpportunities,
      wonOpportunities,
      lostOpportunities,
      pipelineValue
    },
    charts: {
      leadLabels,
      leadCounts,
      stageLabels,
      stageCounts
    },
    upcomingFollowUps
  });
}

module.exports = { page };
