const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db, STATUS, STATUS_LABELS } = require('./db');

const router = express.Router();

function isContractCoverApplyMonth(contractStart, contractEnd, applyMonth) {
  const applyYearMonth = applyMonth;
  const contractStartYM = contractStart.substring(0, 7);
  const contractEndYM = contractEnd.substring(0, 7);
  return applyYearMonth >= contractStartYM && applyYearMonth <= contractEndYM;
}

router.get('/applications', (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT * FROM applications ORDER BY created_at DESC';
  let params = [];
  if (status) {
    sql = 'SELECT * FROM applications WHERE status = ? ORDER BY created_at DESC';
    params = [status];
  }
  const rows = db.prepare(sql).all(...params);
  const result = rows.map(row => ({
    ...row,
    status_label: STATUS_LABELS[row.status]
  }));
  res.json(result);
});

router.get('/applications/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: '申请记录不存在' });
  }
  res.json({
    ...row,
    status_label: STATUS_LABELS[row.status]
  });
});

router.post('/applications', (req, res) => {
  const {
    child_name, child_id_card, child_birth_date,
    parent_name, parent_phone, contract_start_date,
    contract_end_date, apply_month, subsidy_amount = 1000
  } = req.body;

  if (!child_name || !child_id_card || !child_birth_date ||
      !parent_name || !parent_phone || !contract_start_date ||
      !contract_end_date || !apply_month) {
    return res.status(400).json({ error: '请填写所有必填项' });
  }

  const existing = db.prepare('SELECT * FROM applications WHERE child_id_card = ?').get(child_id_card);
  if (existing) {
    return res.status(400).json({ error: '该幼儿证件号已存在申报记录，不得重复申报' });
  }

  if (!isContractCoverApplyMonth(contract_start_date, contract_end_date, apply_month)) {
    return res.status(400).json({ error: '合同月份未覆盖申请月份，不能申请补助' });
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO applications (
      id, child_name, child_id_card, child_birth_date,
      parent_name, parent_phone, contract_start_date,
      contract_end_date, apply_month, subsidy_amount, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, child_name, child_id_card, child_birth_date,
    parent_name, parent_phone, contract_start_date,
    contract_end_date, apply_month, subsidy_amount, STATUS.PENDING_REVIEW,
    now, now
  );

  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  res.status(201).json({
    ...app,
    status_label: STATUS_LABELS[app.status]
  });
});

router.post('/applications/:id/community-review', (req, res) => {
  const { approved, opinion } = req.body;
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  
  if (!app) {
    return res.status(404).json({ error: '申请记录不存在' });
  }
  
  if (app.status !== STATUS.PENDING_REVIEW) {
    return res.status(400).json({ error: '当前状态不允许社区审核' });
  }

  const newStatus = approved ? STATUS.COMMUNITY_APPROVED : STATUS.COMMUNITY_REJECTED;
  const now = new Date().toISOString();
  
  db.prepare(`
    UPDATE applications SET status = ?, community_opinion = ?, updated_at = ? WHERE id = ?
  `).run(newStatus, opinion || '', now, req.params.id);

  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  res.json({
    ...updated,
    status_label: STATUS_LABELS[updated.status]
  });
});

router.post('/applications/:id/street-review', (req, res) => {
  const { approved, opinion } = req.body;
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  
  if (!app) {
    return res.status(404).json({ error: '申请记录不存在' });
  }
  
  if (app.status !== STATUS.COMMUNITY_APPROVED) {
    return res.status(400).json({ error: '请先通过社区初审' });
  }

  const newStatus = approved ? STATUS.STREET_APPROVED : STATUS.STREET_REJECTED;
  const now = new Date().toISOString();
  
  db.prepare(`
    UPDATE applications SET status = ?, street_opinion = ?, updated_at = ? WHERE id = ?
  `).run(newStatus, opinion || '', now, req.params.id);

  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  res.json({
    ...updated,
    status_label: STATUS_LABELS[updated.status]
  });
});

router.post('/payments/batches', (req, res) => {
  const approvedApps = db.prepare(
    `SELECT * FROM applications WHERE status = ?`
  ).all(STATUS.STREET_APPROVED);

  if (approvedApps.length === 0) {
    return res.status(400).json({ error: '没有可发放的申请记录' });
  }

  const batchId = uuidv4();
  const batchNo = 'PAY' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  const totalAmount = approvedApps.reduce((sum, app) => sum + app.subsidy_amount, 0);
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO payment_batches (id, batch_no, total_amount, status, created_at)
      VALUES (?, ?, ?, 'CREATED', ?)
    `).run(batchId, batchNo, totalAmount, now);

    const insertItem = db.prepare(`
      INSERT INTO payment_items (id, batch_id, application_id, amount, status, created_at)
      VALUES (?, ?, ?, ?, 'PENDING', ?)
    `);

    const updateApp = db.prepare(`
      UPDATE applications SET status = ?, updated_at = ? WHERE id = ?
    `);

    for (const app of approvedApps) {
      insertItem.run(uuidv4(), batchId, app.id, app.subsidy_amount, now);
      updateApp.run(STATUS.IN_PAYMENT, now, app.id);
    }
  });

  tx();

  const batch = db.prepare('SELECT * FROM payment_batches WHERE id = ?').get(batchId);
  const items = db.prepare('SELECT * FROM payment_items WHERE batch_id = ?').all(batchId);
  
  res.status(201).json({
    ...batch,
    items: items,
    count: items.length
  });
});

router.get('/payments/batches', (req, res) => {
  const batches = db.prepare('SELECT * FROM payment_batches ORDER BY created_at DESC').all();
  const result = batches.map(batch => {
    const items = db.prepare('SELECT * FROM payment_items WHERE batch_id = ?').all(batch.id);
    return {
      ...batch,
      items,
      count: items.length
    };
  });
  res.json(result);
});

router.post('/payments/batches/:id/confirm', (req, res) => {
  const batch = db.prepare('SELECT * FROM payment_batches WHERE id = ?').get(req.params.id);
  if (!batch) {
    return res.status(404).json({ error: '批次不存在' });
  }

  const items = db.prepare('SELECT * FROM payment_items WHERE batch_id = ?').all(req.params.id);
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare('UPDATE payment_batches SET status = ? WHERE id = ?').run('COMPLETED', req.params.id);
    db.prepare('UPDATE payment_items SET status = ? WHERE batch_id = ?').run('PAID', req.params.id);
    for (const item of items) {
      db.prepare('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?')
        .run(STATUS.PAID, now, item.application_id);
    }
  });

  tx();

  const updated = db.prepare('SELECT * FROM payment_batches WHERE id = ?').get(req.params.id);
  const updatedItems = db.prepare('SELECT * FROM payment_items WHERE batch_id = ?').all(req.params.id);
  
  res.json({
    ...updated,
    items: updatedItems,
    count: updatedItems.length
  });
});

router.get('/status-options', (req, res) => {
  res.json(STATUS_LABELS);
});

module.exports = router;