const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      child_name TEXT NOT NULL,
      child_id_card TEXT NOT NULL UNIQUE,
      child_birth_date TEXT NOT NULL,
      parent_name TEXT NOT NULL,
      parent_phone TEXT NOT NULL,
      contract_start_date TEXT NOT NULL,
      contract_end_date TEXT NOT NULL,
      apply_month TEXT NOT NULL,
      subsidy_amount REAL NOT NULL DEFAULT 1000,
      status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
      community_opinion TEXT,
      street_opinion TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payment_batches (
      id TEXT PRIMARY KEY,
      batch_no TEXT NOT NULL UNIQUE,
      total_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'CREATED',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payment_items (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      application_id TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id) REFERENCES payment_batches(id),
      FOREIGN KEY (application_id) REFERENCES applications(id)
    );
  `);
}

const STATUS = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  COMMUNITY_APPROVED: 'COMMUNITY_APPROVED',
  COMMUNITY_REJECTED: 'COMMUNITY_REJECTED',
  STREET_APPROVED: 'STREET_APPROVED',
  STREET_REJECTED: 'STREET_REJECTED',
  IN_PAYMENT: 'IN_PAYMENT',
  PAID: 'PAID'
};

const STATUS_LABELS = {
  PENDING_REVIEW: '待社区初审',
  COMMUNITY_APPROVED: '社区审核通过',
  COMMUNITY_REJECTED: '社区审核拒绝',
  STREET_APPROVED: '街道复核通过',
  STREET_REJECTED: '街道复核拒绝',
  IN_PAYMENT: '发放中',
  PAID: '已发放'
};

module.exports = { db, initDB, STATUS, STATUS_LABELS };
