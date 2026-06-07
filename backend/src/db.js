const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { promisify } = require('util');

const dbPath = path.join(__dirname, '../data.db');
const db = new sqlite3.Database(dbPath);

db.run = promisify(db.run.bind(db));
db.get = promisify(db.get.bind(db));
db.all = promisify(db.all.bind(db));
db.exec = promisify(db.exec.bind(db));

async function initDB() {
  await db.exec(`
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
      has_supplement INTEGER NOT NULL DEFAULT 0,
      supplement_verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS supplementary_materials (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      material_type TEXT NOT NULL,
      description TEXT NOT NULL,
      file_url TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
      reviewer_opinion TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (application_id) REFERENCES applications(id)
    );

    CREATE TABLE IF NOT EXISTS status_logs (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      old_status TEXT,
      new_status TEXT NOT NULL,
      operator TEXT NOT NULL,
      remark TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (application_id) REFERENCES applications(id)
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
  PENDING_SUPPLEMENT: 'PENDING_SUPPLEMENT',
  SUPPLEMENT_SUBMITTED: 'SUPPLEMENT_SUBMITTED',
  COMMUNITY_APPROVED: 'COMMUNITY_APPROVED',
  COMMUNITY_REJECTED: 'COMMUNITY_REJECTED',
  STREET_APPROVED: 'STREET_APPROVED',
  STREET_REJECTED: 'STREET_REJECTED',
  IN_PAYMENT: 'IN_PAYMENT',
  PAID: 'PAID'
};

const STATUS_LABELS = {
  PENDING_REVIEW: '待社区初审',
  PENDING_SUPPLEMENT: '待补充材料',
  SUPPLEMENT_SUBMITTED: '已提交补充材料',
  COMMUNITY_APPROVED: '社区审核通过',
  COMMUNITY_REJECTED: '社区审核拒绝',
  STREET_APPROVED: '街道复核通过',
  STREET_REJECTED: '街道复核拒绝',
  IN_PAYMENT: '发放中',
  PAID: '已发放'
};

const MATERIAL_TYPES = {
  CONTRACT_MONTH: 'CONTRACT_MONTH',
  CHILD_ID: 'CHILD_ID',
  DAYCARE_VOUCHER: 'DAYCARE_VOUCHER'
};

const MATERIAL_TYPE_LABELS = {
  CONTRACT_MONTH: '合同月份补充说明',
  CHILD_ID: '幼儿证件补充说明',
  DAYCARE_VOUCHER: '托育凭证补充说明'
};

const SUPPLEMENT_STATUS = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED'
};

const SUPPLEMENT_STATUS_LABELS = {
  PENDING_REVIEW: '待审核',
  VERIFIED: '审核通过',
  REJECTED: '审核拒绝'
};

async function logStatus(applicationId, oldStatus, newStatus, operator, remark) {
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  await db.run(
    'INSERT INTO status_logs (id, application_id, old_status, new_status, operator, remark) VALUES (?, ?, ?, ?, ?, ?)',
    id, applicationId, oldStatus, newStatus, operator, remark
  );
}

module.exports = {
  db,
  initDB,
  STATUS,
  STATUS_LABELS,
  MATERIAL_TYPES,
  MATERIAL_TYPE_LABELS,
  SUPPLEMENT_STATUS,
  SUPPLEMENT_STATUS_LABELS,
  logStatus
};
