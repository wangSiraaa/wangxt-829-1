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

router.get('/applications', async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM applications ORDER BY created_at DESC';
    let params = [];
    if (status) {
      sql = 'SELECT * FROM applications WHERE status = ? ORDER BY created_at DESC';
      params = [status];
    }
    const rows = await db.all(sql, ...params);
    const result = rows.map(row => ({
      ...row,
      status_label: STATUS_LABELS[row.status]
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/applications/:id', async (req, res) => {
  try {
    const row = await db.get('SELECT * FROM applications WHERE id = ?', req.params.id);
    if (!row) {
      return res.status(404).json({ error: '申请记录不存在' });
    }
    res.json({
      ...row,
      status_label: STATUS_LABELS[row.status]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/applications', async (req, res) => {
  try {
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

    const existing = await db.get('SELECT * FROM applications WHERE child_id_card = ?', child_id_card);
    if (existing) {
      return res.status(400).json({ error: '该幼儿证件号已存在申报记录，不得重复申报' });
    }

    if (!isContractCoverApplyMonth(contract_start_date, contract_end_date, apply_month)) {
      return res.status(400).json({ error: '合同月份未覆盖申请月份，不能申请补助' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO applications (
        id, child_name, child_id_card, child_birth_date,
        parent_name, parent_phone, contract_start_date,
        contract_end_date, apply_month, subsidy_amount, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, child_name, child_id_card, child_birth_date,
      parent_name, parent_phone, contract_start_date,
      contract_end_date, apply_month, subsidy_amount, STATUS.PENDING_REVIEW,
      now, now
    );

    const app = await db.get('SELECT * FROM applications WHERE id = ?', id);
    res.status(201).json({
      ...app,
      status_label: STATUS_LABELS[app.status]
    });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: '该幼儿证件号已存在申报记录，不得重复申报' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post('/applications/:id/community-review', async (req, res) => {
  try {
    const { approved, opinion } = req.body;
    const app = await db.get('SELECT * FROM applications WHERE id = ?', req.params.id);

    if (!app) {
      return res.status(404).json({ error: '申请记录不存在' });
    }

    if (app.status !== STATUS.PENDING_REVIEW) {
      return res.status(400).json({ error: '当前状态不允许社区审核' });
    }

    const newStatus = approved ? STATUS.COMMUNITY_APPROVED : STATUS.COMMUNITY_REJECTED;
    const now = new Date().toISOString();

    await db.run(
      'UPDATE applications SET status = ?, community_opinion = ?, updated_at = ? WHERE id = ?',
      newStatus, opinion, now, req.params.id
    );

    const updated = await db.get('SELECT * FROM applications WHERE id = ?', req.params.id);
    res.json({
      ...updated,
      status_label: STATUS_LABELS[updated.status]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/applications/:id/street-review', async (req, res) => {
  try {
    const { approved, opinion } = req.body;
    const app = await db.get('SELECT * FROM applications WHERE id = ?', req.params.id);

    if (!app) {
      return res.status(404).json({ error: '申请记录不存在' });
    }

    if (app.status !== STATUS.COMMUNITY_APPROVED) {
      return res.status(400).json({ error: '当前状态不允许街道复核' });
    }

    const newStatus = approved ? STATUS.STREET_APPROVED : STATUS.STREET_REJECTED;
    const now = new Date().toISOString();

    await db.run(
      'UPDATE applications SET status = ?, street_opinion = ?, updated_at = ? WHERE id = ?',
      newStatus, opinion, now, req.params.id
    );

    const updated = await db.get('SELECT * FROM applications WHERE id = ?', req.params.id);
    res.json({
      ...updated,
      status_label: STATUS_LABELS[updated.status]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/payments/stats', async (req, res) => {
  try {
    const row = await db.get(
      'SELECT COUNT(*) as count, COALESCE(SUM(subsidy_amount), 0) as amount FROM applications WHERE status = ?',
      STATUS.STREET_APPROVED
    );
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/payments/batches', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM payment_batches ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/payments/batches', async (req, res) => {
  try {
    const apps = await db.all(
      'SELECT * FROM applications WHERE status = ? ORDER BY created_at ASC',
      STATUS.STREET_APPROVED
    );

    if (apps.length === 0) {
      return res.status(400).json({ error: '没有待发放的申请记录' });
    }

    const batchId = uuidv4();
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const batchNo = 'PAY' + dateStr + String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const totalAmount = apps.reduce((sum, app) => sum + app.subsidy_amount, 0);
    const now = new Date().toISOString();

    await db.run(
      'INSERT INTO payment_batches (id, batch_no, total_amount, status, created_at) VALUES (?, ?, ?, ?, ?)',
      batchId, batchNo, totalAmount, 'CREATED', now
    );

    for (const app of apps) {
      const itemId = uuidv4();
      await db.run(
        'INSERT INTO payment_items (id, batch_id, application_id, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        itemId, batchId, app.id, app.subsidy_amount, 'PENDING', now
      );
      await db.run(
        'UPDATE applications SET status = ?, updated_at = ? WHERE id = ?',
        STATUS.IN_PAYMENT, now, app.id
      );
    }

    const batch = await db.get('SELECT * FROM payment_batches WHERE id = ?', batchId);
    const items = await db.all('SELECT * FROM payment_items WHERE batch_id = ?', batchId);
    res.status(201).json({ ...batch, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/payments/batches/:id/confirm', async (req, res) => {
  try {
    const batch = await db.get('SELECT * FROM payment_batches WHERE id = ?', req.params.id);
    if (!batch) {
      return res.status(404).json({ error: '发放批次不存在' });
    }

    const now = new Date().toISOString();
    await db.run(
      'UPDATE payment_batches SET status = ?, created_at = ? WHERE id = ?',
      'PAID', now, req.params.id
    );
    await db.run(
      'UPDATE payment_items SET status = ? WHERE batch_id = ?',
      'PAID', req.params.id
    );

    const items = await db.all('SELECT application_id FROM payment_items WHERE batch_id = ?', req.params.id);
    for (const item of items) {
      await db.run(
        'UPDATE applications SET status = ?, updated_at = ? WHERE id = ?',
        STATUS.PAID, now, item.application_id
      );
    }

    res.json({ message: '发放确认成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
