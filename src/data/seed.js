const bcrypt = require('bcryptjs');
const db = require('./db');

const PASSWORD = 'Password@123';

function seed() {
  const insertRole = db.prepare('INSERT OR IGNORE INTO Roles (RoleId, RoleName) VALUES (?, ?)');
  insertRole.run(1, 'Admin');
  insertRole.run(2, 'Manager');
  insertRole.run(3, 'Sales Executive');

  const passwordHash = bcrypt.hashSync(PASSWORD, 10);
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO Users (UserId, Name, Email, PasswordHash, RoleId, IsActive, FailedLoginCount, LockoutEnd)
    VALUES (?, ?, ?, ?, ?, 1, 0, NULL)
  `);
  insertUser.run(1, 'Aisha Verma', 'admin@crm.com', passwordHash, 1);
  insertUser.run(2, 'Rohan Mehta', 'manager@crm.com', passwordHash, 2);
  insertUser.run(3, 'Neha Kapoor', 'sales@crm.com', passwordHash, 3);

  const customerCount = db.prepare('SELECT COUNT(*) AS c FROM Customers').get().c;
  if (customerCount > 0) {
    console.log('Seed data already present. Roles and demo accounts verified.');
    return;
  }

  const insertCustomer = db.prepare(`
    INSERT INTO Customers (CustomerCode, CustomerName, Email, Phone, CompanyName, Address, City, State, Status, CreatedBy, OwnerId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?)
  `);
  const customers = [
    ['CUST-0001', 'Priya Nair', 'priya.nair@lumenlabs.com', '9810012345', 'Lumen Labs', '12 MG Road', 'Bengaluru', 'Karnataka', 1, 1],
    ['CUST-0002', 'Arjun Shah', 'arjun.shah@northwind.in', '9820023456', 'Northwind Retail', '88 CG Road', 'Ahmedabad', 'Gujarat', 1, 3],
    ['CUST-0003', 'Meera Iyer', 'meera.iyer@orbitsoft.io', '9830034567', 'OrbitSoft', '4 T Nagar', 'Chennai', 'Tamil Nadu', 3, 3],
    ['CUST-0004', 'Kabir Khan', 'kabir.khan@helixhealth.com', '9840045678', 'Helix Health', '19 Banjara Hills', 'Hyderabad', 'Telangana', 1, 1],
    ['CUST-0005', 'Sana Qureshi', 'sana.qureshi@peakfreight.in', '9850056789', 'Peak Freight', '7 Andheri East', 'Mumbai', 'Maharashtra', 3, 3]
  ];
  const customerIds = customers.map((row) => Number(insertCustomer.run(...row).lastInsertRowid));

  const insertLead = db.prepare(`
    INSERT INTO Leads (LeadCode, LeadName, Email, Phone, CompanyName, Source, Status, ExpectedValue, AssignedTo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const leads = [
    ['LEAD-0001', 'Dev Patel', 'dev.patel@brightpath.com', '9860067890', 'BrightPath', 'Website', 'New', 120000, 3],
    ['LEAD-0002', 'Ananya Rao', 'ananya.rao@cloudnest.io', '9870078901', 'CloudNest', 'Referral', 'Contacted', 250000, 3],
    ['LEAD-0003', 'Vikram Joshi', 'vikram.joshi@zenithbank.in', '9880089012', 'Zenith Bank', 'Event', 'Qualified', 480000, 3],
    ['LEAD-0004', 'Ritika Das', 'ritika.das@greenleaf.org', '9890090123', 'GreenLeaf NGO', 'Cold Call', 'Unqualified', 40000, 1],
    ['LEAD-0005', 'Harsh Malhotra', 'harsh.malhotra@apexauto.com', '9900001234', 'Apex Auto', 'LinkedIn', 'Converted', 310000, 1],
    ['LEAD-0006', 'Pooja Gill', 'pooja.gill@skylinerealty.in', '9910012340', 'Skyline Realty', 'Website', 'Lost', 90000, 2]
  ];
  const leadIds = leads.map((row) => Number(insertLead.run(...row).lastInsertRowid));

  const insertOpp = db.prepare(`
    INSERT INTO Opportunities (OpportunityName, CustomerId, LeadId, Amount, Stage, Probability, ExpectedCloseDate, Status, AssignedTo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const opportunities = [
    ['Lumen Labs CRM Expansion', customerIds[0], null, 180000, 'Qualification', 20, '2026-11-15', 'Open', 1],
    ['Northwind Annual License', customerIds[1], null, 320000, 'Proposal', 45, '2026-12-01', 'Open', 3],
    ['OrbitSoft Support Suite', customerIds[2], null, 275000, 'Negotiation', 70, '2026-10-30', 'Open', 3],
    ['Helix Health Onboarding', customerIds[3], leadIds[4], 410000, 'Won', 100, '2026-11-20', 'Closed', 1]
  ];
  const oppIds = opportunities.map((row) => Number(insertOpp.run(...row).lastInsertRowid));

  const insertFollowUp = db.prepare(`
    INSERT INTO FollowUps (CustomerId, LeadId, FollowUpDate, FollowUpType, Remarks, Status, AssignedTo)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const followUps = [
    [customerIds[1], null, '2026-10-18', 'Call', 'Confirm proposal walkthrough', 'Planned', 3],
    [null, leadIds[2], '2026-10-25', 'Meeting', 'Qualified lead discovery call', 'Planned', 3],
    [customerIds[0], null, '2026-10-05', 'Email', 'Sent pricing addendum', 'Completed', 1],
    [null, leadIds[1], '2026-10-01', 'Task', 'Overdue demo follow-up', 'Planned', 3]
  ];
  const followUpIds = followUps.map((row) => Number(insertFollowUp.run(...row).lastInsertRowid));

  const insertActivity = db.prepare(`
    INSERT INTO Activities (ActivityType, Subject, Description, ActivityDate, CustomerId, LeadId, AssignedTo, Status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertActivity.run('Call', 'Intro call with Priya Nair', 'Discussed renewal timeline', '2026-10-06 10:30:00', customerIds[0], null, 1, 'Completed');
  insertActivity.run('Meeting', 'OrbitSoft negotiation', 'Reviewed contract clauses', '2026-10-09 15:00:00', customerIds[2], null, 3, 'Completed');
  insertActivity.run('Email', 'CloudNest nurture sequence', 'Sent case study pack', '2026-10-11 09:00:00', null, leadIds[1], 3, 'Planned');
  insertActivity.run('Task', 'Prepare Zenith Bank proposal', 'Draft conversion package', '2026-10-14 11:00:00', null, leadIds[2], 3, 'Planned');

  const insertAudit = db.prepare(`
    INSERT INTO AuditLogs (UserId, Action, EntityName, RecordId, OldValue, NewValue, IpAddress)
    VALUES (?, ?, ?, ?, NULL, ?, '127.0.0.1')
  `);
  customerIds.forEach((id, i) => insertAudit.run(1, 'CREATE', 'Customer', id, JSON.stringify({ CustomerCode: customers[i][0] })));
  leadIds.forEach((id, i) => insertAudit.run(1, 'CREATE', 'Lead', id, JSON.stringify({ LeadCode: leads[i][0], Status: leads[i][6] })));
  oppIds.forEach((id, i) => insertAudit.run(1, 'CREATE', 'Opportunity', id, JSON.stringify({ OpportunityName: opportunities[i][0] })));
  followUpIds.forEach((id, i) => insertAudit.run(1, 'CREATE', 'FollowUp', id, JSON.stringify({ FollowUpDate: followUps[i][2], Status: followUps[i][5] })));
  insertAudit.run(1, 'SEED', 'System', 0, JSON.stringify({ message: 'Baseline CRM data loaded' }));

  console.log('AcxiomCRM database seeded.');
  console.log('Accounts: admin@crm.com / manager@crm.com / sales@crm.com');
  console.log('Password: Password@123');
}

seed();
