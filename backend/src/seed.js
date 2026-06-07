const { db, initDB, STATUS } = require('./db');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  await initDB();

  await db.run('DELETE FROM payment_items');
  await db.run('DELETE FROM payment_batches');
  await db.run('DELETE FROM applications');

  const applications = [
    {
      id: uuidv4(),
      child_name: '张三',
      child_id_card: '110101202001011234',
      child_birth_date: '2020-01-01',
      parent_name: '张父',
      parent_phone: '13800138001',
      contract_start_date: '2024-01-01',
      contract_end_date: '2024-12-31',
      apply_month: '2024-06',
      subsidy_amount: 1000,
      status: STATUS.PENDING_REVIEW
    },
    {
      id: uuidv4(),
      child_name: '李四',
      child_id_card: '110101202002022345',
      child_birth_date: '2020-02-02',
      parent_name: '李父',
      parent_phone: '13800138002',
      contract_start_date: '2024-03-01',
      contract_end_date: '2024-09-30',
      apply_month: '2024-06',
      subsidy_amount: 1000,
      status: STATUS.COMMUNITY_APPROVED
    },
    {
      id: uuidv4(),
      child_name: '王五',
      child_id_card: '110101202003033456',
      child_birth_date: '2020-03-03',
      parent_name: '王母',
      parent_phone: '13800138003',
      contract_start_date: '2024-01-01',
      contract_end_date: '2024-12-31',
      apply_month: '2024-06',
      subsidy_amount: 1000,
      status: STATUS.STREET_APPROVED
    }
  ];

  const insertStmt = `
    INSERT INTO applications (
      id, child_name, child_id_card, child_birth_date,
      parent_name, parent_phone, contract_start_date,
      contract_end_date, apply_month, subsidy_amount, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  for (const app of applications) {
    await db.run(insertStmt, [
      app.id, app.child_name, app.child_id_card, app.child_birth_date,
      app.parent_name, app.parent_phone, app.contract_start_date,
      app.contract_end_date, app.apply_month, app.subsidy_amount, app.status
    ]);
  }

  console.log('种子数据插入成功！共插入', applications.length, '条申请记录。');
  process.exit(0);
}

seed().catch(err => {
  console.error('种子数据插入失败:', err);
  process.exit(1);
});
