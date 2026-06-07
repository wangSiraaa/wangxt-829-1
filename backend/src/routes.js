const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  db,
  STATUS,
  STATUS_LABELS,
  MATERIAL_TYPES,
  MATERIAL_TYPE_LABELS,
  SUPPLEMENT_STATUS,
  SUPPLEMENT_STATUS_LABELS,
  logStatus
} = require('./db');

const router = express.Router();

function isContractCoverApplyMonth(contractStart, contractEnd, applyMonth) {
  const applyYearMonth = applyMonth;
  const contractStartYM = contractStart.substring(0, 7);
  const contractEndYM = contractEnd.substring(0, 7);
  return applyYearMonth >= contractStartYM && applyYearMonth <= contractEndYM;
}

async function checkDuplicateIdCard(childIdCard, excludeId = null) {
  let sql = 'SELECT * FROM applications WHERE child_id_card = ?';
  let params = [childIdCard];
  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  const existing = await db.get(sql, ...params);
  return !!existing;
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
    const materials = await db.all(
      'SELECT * FROM supplementary_materials WHERE application_id = ? ORDER BY created_at DESC',
      req.params.id
    );
    const materialsWithLabels = materials.map(m => ({
      ...m,
      material_type_label: MATERIAL_TYPE_LABELS[m.material_type],
      status_label: SUPPLEMENT_STATUS_LABELS[m.status]
    }));
    const logs = await db.all(
      'SELECT * FROM status_logs WHERE application_id = ? ORDER BY created_at DESC',
      req.params.id
    );
    res.json({
      ...row,
      status_label: STATUS_LABELS[row.status],
      supplementary_materials: materialsWithLabels,
      status_logs: logs
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

    const duplicate = await checkDuplicateIdCard(child_id_card);
    if (duplicate) {
      return res.status(400).json({ error: '该幼儿证件号已存在申报记录，不得重复申报' });
    }

    const contractCovered = isContractCoverApplyMonth(contract_start_date, contract_end_date, apply_month);

    const id = uuidv4();
    const now = new Date().toISOString();

    const initialStatus = contractCovered ? STATUS.PENDING_REVIEW : STATUS.PENDING_SUPPLEMENT;

    await db.run(
      `INSERT INTO applications (
        id, child_name, child_id_card, child_birth_date,
        parent_name, parent_phone, contract_start_date,
        contract_end_date, apply_month, subsidy_amount, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, child_name, child_id_card, child_birth_date,
      parent_name, parent_phone, contract_start_date,
      contract_end_date, apply_month, subsidy_amount, initialStatus,
      now, now
    );

    await logStatus(id, null, initialStatus, '家长', '提交申请');

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

router.post('/applications/:id/supplement', async (req, res) => {
  try {
    const { material_type, description, file_url } = req.body;
    const app = await db.get('SELECT * FROM applications WHERE id = ?', req.params.id);

    if (!app) {
      return res.status(404).json({ error: '申请记录不存在' });
    }

    if (![STATUS.PENDING_SUPPLEMENT, STATUS.SUPPLEMENT_SUBMITTED, STATUS.COMMUNITY_REJECTED].includes(app.status)) {
      return res.status(400).json({ error: '当前状态不允许提交补充材料' });
    }

    if (!material_type || !Object.values(MATERIAL_TYPES).includes(material_type)) {
      return res.status(400).json({ error: '请选择有效的材料类型' });
    }

    if (!description || description.trim().length === 0) {
      return res.status(400).json({ error: '请填写补充说明' });
    }

    const materialId = uuidv4();
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO supplementary_materials (
        id, application_id, material_type, description, file_url, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      materialId, req.params.id, material_type, description, file_url || null,
      SUPPLEMENT_STATUS.PENDING_REVIEW, now, now
    );

    const newStatus = STATUS.SUPPLEMENT_SUBMITTED;
    await db.run(
      'UPDATE applications SET status = ?, has_supplement = 1, updated_at = ? WHERE id = ?',
      newStatus, now, req.params.id
    );

    await logStatus(req.params.id, app.status, newStatus, '家长', `提交补充材料: ${MATERIAL_TYPE_LABELS[material_type]}`);

    const material = await db.get('SELECT * FROM supplementary_materials WHERE id = ?', materialId);
    res.status(201).json({
      ...material,
      material_type_label: MATERIAL_TYPE_LABELS[material.material_type],
      status_label: SUPPLEMENT_STATUS_LABELS[material.status]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/supplementary-materials', async (req, res) => {
  try {
    const { status, application_id } = req.query;
    let sql = 'SELECT * FROM supplementary_materials WHERE 1=1';
    let params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (application_id) {
      sql += ' AND application_id = ?';
      params.push(application_id);
    }
    sql += ' ORDER BY created_at DESC';

    const rows = await db.all(sql, ...params);
    const result = rows.map(row => ({
      ...row,
      material_type_label: MATERIAL_TYPE_LABELS[row.material_type],
      status_label: SUPPLEMENT_STATUS_LABELS[row.status]
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/supplementary-materials/:id/review', async (req, res) => {
  try {
    const { approved, opinion } = req.body;
    const material = await db.get('SELECT * FROM supplementary_materials WHERE id = ?', req.params.id);

    if (!material) {
      return res.status(404).json({ error: '补充材料不存在' });
    }

    if (material.status !== SUPPLEMENT_STATUS.PENDING_REVIEW) {
      return res.status(400).json({ error: '该材料已审核，不能重复审核' });
    }

    const app = await db.get('SELECT * FROM applications WHERE id = ?', material.application_id);
    if (!app) {
      return res.status(404).json({ error: '关联申请不存在' });
    }

    const newMaterialStatus = approved ? SUPPLEMENT_STATUS.VERIFIED : SUPPLEMENT_STATUS.REJECTED;
    const now = new Date().toISOString();

    await db.run(
      'UPDATE supplementary_materials SET status = ?, reviewer_opinion = ?, updated_at = ? WHERE id = ?',
      newMaterialStatus, opinion || '', now, req.params.id
    );

    let newAppStatus = app.status;
    let supplementVerified = app.supplement_verified;
    let remark = '';

    if (approved) {
      const pendingMaterials = await db.get(
        'SELECT COUNT(*) as count FROM supplementary_materials WHERE application_id = ? AND status = ?',
        material.application_id, SUPPLEMENT_STATUS.PENDING_REVIEW
      );

      if (pendingMaterials.count === 0) {
        supplementVerified = 1;

        const contractCovered = isContractCoverApplyMonth(
          app.contract_start_date,
          app.contract_end_date,
          app.apply_month
        );

        if (contractCovered) {
          newAppStatus = STATUS.PENDING_REVIEW;
          remark = '补充材料审核通过，进入社区初审';
        } else {
          newAppStatus = STATUS.PENDING_SUPPLEMENT;
          remark = '补充材料审核通过，但合同月份仍未覆盖申请月份，需继续补充';
          supplementVerified = 0;
        }
      } else {
        remark = '部分补充材料审核通过，仍有待审核材料';
      }
    } else {
      newAppStatus = STATUS.PENDING_SUPPLEMENT;
      supplementVerified = 0;
      remark = '补充材料审核拒绝，需重新提交';
    }

    if (newAppStatus !== app.status) {
      await db.run(
        'UPDATE applications SET status = ?, supplement_verified = ?, updated_at = ? WHERE id = ?',
        newAppStatus, supplementVerified, now, app.id
      );
      await logStatus(app.id, app.status, newAppStatus, '社区经办人', remark);
    } else {
      await db.run(
        'UPDATE applications SET supplement_verified = ?, updated_at = ? WHERE id = ?',
        supplementVerified, now, app.id
      );
    }

    const updatedMaterial = await db.get('SELECT * FROM supplementary_materials WHERE id = ?', req.params.id);
    res.json({
      ...updatedMaterial,
      material_type_label: MATERIAL_TYPE_LABELS[updatedMaterial.material_type],
      status_label: SUPPLEMENT_STATUS_LABELS[updatedMaterial.status]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/applications/:id/status-logs', async (req, res) => {
  try {
    const logs = await db.all(
      'SELECT * FROM status_logs WHERE application_id = ? ORDER BY created_at DESC',
      req.params.id
    );
    res.json(logs);
  } catch (err) {
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

    if (app.status !== STATUS.PENDING_REVIEW && app.status !== STATUS.SUPPLEMENT_SUBMITTED) {
      return res.status(400).json({ error: '当前状态不允许社区审核' });
    }

    const oldStatus = app.status;
    const newStatus = approved ? STATUS.COMMUNITY_APPROVED : STATUS.COMMUNITY_REJECTED;
    const now = new Date().toISOString();

    await db.run(
      'UPDATE applications SET status = ?, community_opinion = ?, updated_at = ? WHERE id = ?',
      newStatus, opinion, now, req.params.id
    );

    await logStatus(req.params.id, oldStatus, newStatus, '社区经办人',
      approved ? '社区审核通过' : `社区审核拒绝: ${opinion || ''}`);

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

    if (app.has_supplement && !app.supplement_verified) {
      return res.status(400).json({ error: '该申请存在未审核通过的补充材料，不能进行街道复核' });
    }

    const oldStatus = app.status;
    const newStatus = approved ? STATUS.STREET_APPROVED : STATUS.STREET_REJECTED;
    const now = new Date().toISOString();

    await db.run(
      'UPDATE applications SET status = ?, street_opinion = ?, updated_at = ? WHERE id = ?',
      newStatus, opinion, now, req.params.id
    );

    await logStatus(req.params.id, oldStatus, newStatus, '街道经办人',
      approved ? '街道复核通过' : `街道复核拒绝: ${opinion || ''}`);

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

    const validApps = [];
    const invalidApps = [];

    for (const app of apps) {
      const duplicate = await checkDuplicateIdCard(app.child_id_card, app.id);
      const contractCovered = isContractCoverApplyMonth(
        app.contract_start_date,
        app.contract_end_date,
        app.apply_month
      );

      let isValid = true;
      let reason = '';

      if (duplicate) {
        isValid = false;
        reason = '存在重复证件号';
      } else if (!contractCovered) {
        isValid = false;
        reason = '合同月份未覆盖申请月份';
      } else if (app.has_supplement && !app.supplement_verified) {
        isValid = false;
        reason = '补充材料未审核通过';
      }

      if (isValid) {
        validApps.push(app);
      } else {
        invalidApps.push({ ...app, invalid_reason: reason });
      }
    }

    if (validApps.length === 0) {
      return res.status(400).json({
        error: '没有符合条件的申请记录可生成发放批次',
        invalid_apps: invalidApps
      });
    }

    const batchId = uuidv4();
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const batchNo = 'PAY' + dateStr + String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const totalAmount = validApps.reduce((sum, app) => sum + app.subsidy_amount, 0);
    const now = new Date().toISOString();

    await db.run(
      'INSERT INTO payment_batches (id, batch_no, total_amount, status, created_at) VALUES (?, ?, ?, ?, ?)',
      batchId, batchNo, totalAmount, 'CREATED', now
    );

    for (const app of validApps) {
      const itemId = uuidv4();
      await db.run(
        'INSERT INTO payment_items (id, batch_id, application_id, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        itemId, batchId, app.id, app.subsidy_amount, 'PENDING', now
      );
      await db.run(
        'UPDATE applications SET status = ?, updated_at = ? WHERE id = ?',
        STATUS.IN_PAYMENT, now, app.id
      );
      await logStatus(app.id, app.status, STATUS.IN_PAYMENT, '系统', '进入发放批次');
    }

    const batch = await db.get('SELECT * FROM payment_batches WHERE id = ?', batchId);
    const items = await db.all('SELECT * FROM payment_items WHERE batch_id = ?', batchId);
    res.status(201).json({
      ...batch,
      items,
      skipped_count: invalidApps.length,
      skipped_apps: invalidApps
    });
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
      const app = await db.get('SELECT status FROM applications WHERE id = ?', item.application_id);
      await db.run(
        'UPDATE applications SET status = ?, updated_at = ? WHERE id = ?',
        STATUS.PAID, now, item.application_id
      );
      await logStatus(item.application_id, app ? app.status : null, STATUS.PAID, '系统', '发放完成');
    }

    res.json({ message: '发放确认成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/material-types', (req, res) => {
  res.json({
    types: Object.entries(MATERIAL_TYPES).map(([key, value]) => ({
      key: value,
      label: MATERIAL_TYPE_LABELS[value]
    }))
  });
});

module.exports = router;
