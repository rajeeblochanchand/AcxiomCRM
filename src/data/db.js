const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', '..', 'crm.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS Roles (
    RoleId INTEGER PRIMARY KEY AUTOINCREMENT,
    RoleName TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS Users (
    UserId INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT NOT NULL,
    Email TEXT UNIQUE NOT NULL,
    PasswordHash TEXT NOT NULL,
    RoleId INTEGER NOT NULL,
    IsActive INTEGER DEFAULT 1,
    FailedLoginCount INTEGER DEFAULT 0,
    LockoutEnd DATETIME NULL,
    CreatedDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (RoleId) REFERENCES Roles(RoleId)
  );

  CREATE TABLE IF NOT EXISTS Customers (
    CustomerId INTEGER PRIMARY KEY AUTOINCREMENT,
    CustomerCode TEXT UNIQUE NOT NULL,
    CustomerName TEXT NOT NULL,
    Email TEXT UNIQUE NOT NULL,
    Phone TEXT UNIQUE NOT NULL,
    CompanyName TEXT,
    Address TEXT,
    City TEXT,
    State TEXT,
    Status TEXT DEFAULT 'Active',
    CreatedDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    CreatedBy INTEGER,
    OwnerId INTEGER,
    FOREIGN KEY (OwnerId) REFERENCES Users(UserId)
  );

  CREATE TABLE IF NOT EXISTS Leads (
    LeadId INTEGER PRIMARY KEY AUTOINCREMENT,
    LeadCode TEXT UNIQUE NOT NULL,
    LeadName TEXT NOT NULL,
    Email TEXT NOT NULL,
    Phone TEXT NOT NULL,
    CompanyName TEXT,
    Source TEXT,
    Status TEXT NOT NULL DEFAULT 'New' CHECK(Status IN ('New', 'Contacted', 'Qualified', 'Unqualified', 'Converted', 'Lost')),
    ExpectedValue REAL DEFAULT 0,
    CreatedDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    AssignedTo INTEGER,
    FOREIGN KEY (AssignedTo) REFERENCES Users(UserId)
  );

  CREATE TABLE IF NOT EXISTS Opportunities (
    OpportunityId INTEGER PRIMARY KEY AUTOINCREMENT,
    OpportunityName TEXT NOT NULL,
    CustomerId INTEGER,
    LeadId INTEGER,
    Amount REAL NOT NULL,
    Stage TEXT NOT NULL CHECK(Stage IN ('Qualification', 'Proposal', 'Negotiation', 'Won', 'Lost')),
    Probability REAL NOT NULL,
    ExpectedCloseDate DATE NOT NULL,
    Status TEXT DEFAULT 'Open',
    CreatedDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    AssignedTo INTEGER,
    FOREIGN KEY (CustomerId) REFERENCES Customers(CustomerId),
    FOREIGN KEY (AssignedTo) REFERENCES Users(UserId)
  );

  CREATE TABLE IF NOT EXISTS FollowUps (
    FollowUpId INTEGER PRIMARY KEY AUTOINCREMENT,
    CustomerId INTEGER,
    LeadId INTEGER,
    FollowUpDate DATE NOT NULL,
    FollowUpType TEXT NOT NULL CHECK(FollowUpType IN ('Call', 'Meeting', 'Email', 'Task')),
    Remarks TEXT,
    Status TEXT DEFAULT 'Planned' CHECK(Status IN ('Planned', 'Completed', 'Missed', 'Cancelled')),
    AssignedTo INTEGER,
    FOREIGN KEY (AssignedTo) REFERENCES Users(UserId)
  );

  CREATE TABLE IF NOT EXISTS Activities (
    ActivityId INTEGER PRIMARY KEY AUTOINCREMENT,
    ActivityType TEXT NOT NULL CHECK(ActivityType IN ('Call', 'Meeting', 'Email', 'Task')),
    Subject TEXT NOT NULL,
    Description TEXT,
    ActivityDate DATETIME NOT NULL,
    CustomerId INTEGER,
    LeadId INTEGER,
    AssignedTo INTEGER,
    Status TEXT DEFAULT 'Planned',
    FOREIGN KEY (AssignedTo) REFERENCES Users(UserId)
  );

  CREATE TABLE IF NOT EXISTS AuditLogs (
    AuditLogId INTEGER PRIMARY KEY AUTOINCREMENT,
    UserId INTEGER,
    Action TEXT NOT NULL,
    EntityName TEXT NOT NULL,
    RecordId INTEGER,
    OldValue TEXT,
    NewValue TEXT,
    CreatedDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    IpAddress TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON Users(Email);
  CREATE INDEX IF NOT EXISTS idx_customers_owner ON Customers(OwnerId);
  CREATE INDEX IF NOT EXISTS idx_customers_status ON Customers(Status);
  CREATE INDEX IF NOT EXISTS idx_leads_assigned ON Leads(AssignedTo);
  CREATE INDEX IF NOT EXISTS idx_leads_status ON Leads(Status);
  CREATE INDEX IF NOT EXISTS idx_opps_assigned ON Opportunities(AssignedTo);
  CREATE INDEX IF NOT EXISTS idx_opps_stage ON Opportunities(Stage);
  CREATE INDEX IF NOT EXISTS idx_followups_assigned ON FollowUps(AssignedTo);
  CREATE INDEX IF NOT EXISTS idx_followups_date ON FollowUps(FollowUpDate);
  CREATE INDEX IF NOT EXISTS idx_audit_user ON AuditLogs(UserId);
  CREATE INDEX IF NOT EXISTS idx_audit_action ON AuditLogs(Action);
`);

function nextCode(prefix, table, column) {
  const row = db
    .prepare(`SELECT ${column} AS code FROM ${table} WHERE ${column} LIKE ? ORDER BY ${column} DESC LIMIT 1`)
    .get(`${prefix}-%`);
  let n = 1;
  if (row && row.code) {
    const match = String(row.code).match(/(\d+)$/);
    if (match) n = Number(match[1]) + 1;
  }
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

function toUserDto(row) {
  if (!row) return null;
  return {
    userId: row.UserId,
    name: row.Name,
    email: row.Email,
    roleId: row.RoleId,
    roleName: row.RoleName,
    isActive: Number(row.IsActive) === 1
  };
}

function isLocked(lockoutEnd) {
  if (!lockoutEnd) return false;
  const row = db.prepare(`SELECT datetime(?) > datetime('now') AS locked`).get(lockoutEnd);
  return Number(row.locked) === 1;
}

module.exports = db;
module.exports.nextCode = nextCode;
module.exports.toUserDto = toUserDto;
module.exports.isLocked = isLocked;
module.exports.dbPath = dbPath;
