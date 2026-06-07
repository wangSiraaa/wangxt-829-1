const fs = require('fs');
const path = require('path');

const BASE_DIR = '/Users/mingyuan/workspace/sihuo/wangxtw3/829';

function writeFile(relativePath, content) {
  const fullPath = path.join(BASE_DIR, relativePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, content.trim());
  console.log(`Created: ${relativePath}`);
}

writeFile('backend/src/routes.js', `
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
  
  db.prepare(\`
    INSERT INTO applications (
      id, child_name, child_id_card, child_birth_date,
      parent_name, parent_phone, contract_start_date,
      contract_end_date, apply_month, subsidy_amount, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  \`).run(
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
  
  db.prepare(\`
    UPDATE applications SET status = ?, community_opinion = ?, updated_at = ? WHERE id = ?
  \`).run(newStatus, opinion || '', now, req.params.id);

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
  
  db.prepare(\`
    UPDATE applications SET status = ?, street_opinion = ?, updated_at = ? WHERE id = ?
  \`).run(newStatus, opinion || '', now, req.params.id);

  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  res.json({
    ...updated,
    status_label: STATUS_LABELS[updated.status]
  });
});

router.post('/payments/batches', (req, res) => {
  const approvedApps = db.prepare(
    \`SELECT * FROM applications WHERE status = ?\`
  ).all(STATUS.STREET_APPROVED);

  if (approvedApps.length === 0) {
    return res.status(400).json({ error: '没有可发放的申请记录' });
  }

  const batchId = uuidv4();
  const batchNo = 'PAY' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  const totalAmount = approvedApps.reduce((sum, app) => sum + app.subsidy_amount, 0);
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(\`
      INSERT INTO payment_batches (id, batch_no, total_amount, status, created_at)
      VALUES (?, ?, ?, 'CREATED', ?)
    \`).run(batchId, batchNo, totalAmount, now);

    const insertItem = db.prepare(\`
      INSERT INTO payment_items (id, batch_id, application_id, amount, status, created_at)
      VALUES (?, ?, ?, ?, 'PENDING', ?)
    \`);

    const updateApp = db.prepare(\`
      UPDATE applications SET status = ?, updated_at = ? WHERE id = ?
    \`);

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
`);

writeFile('frontend/src/App.jsx', `
import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import {
  FileAddOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  DollarOutlined
} from '@ant-design/icons';
import ApplyPage from './pages/ApplyPage';
import CommunityReviewPage from './pages/CommunityReviewPage';
import StreetReviewPage from './pages/StreetReviewPage';
import PaymentPage from './pages/PaymentPage';

const { Header, Content, Sider } = Layout;

function App() {
  const location = useLocation();

  const menuItems = [
    {
      key: '/apply',
      icon: <FileAddOutlined />,
      label: <Link to="/apply">家长申报</Link>
    },
    {
      key: '/community-review',
      icon: <AuditOutlined />,
      label: <Link to="/community-review">社区初审</Link>
    },
    {
      key: '/street-review',
      icon: <CheckCircleOutlined />,
      label: <Link to="/street-review">街道复核</Link>
    },
    {
      key: '/payment',
      icon: <DollarOutlined />,
      label: <Link to="/payment">财务发放</Link>
    }
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ background: '#001529', padding: '0 24px' }}>
        <h1 style={{ color: 'white', margin: 0, lineHeight: '64px' }}>
          社区托育补助发放系统
        </h1>
      </Header>
      <Layout>
        <Sider width={200} theme="light">
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            style={{ height: '100%', borderRight: 0 }}
          />
        </Sider>
        <Layout style={{ padding: '24px' }}>
          <Content
            style={{
              background: '#fff',
              padding: 24,
              margin: 0,
              minHeight: 280,
              borderRadius: 8
            }}
          >
            <Routes>
              <Route path="/" element={<ApplyPage />} />
              <Route path="/apply" element={<ApplyPage />} />
              <Route path="/community-review" element={<CommunityReviewPage />} />
              <Route path="/street-review" element={<StreetReviewPage />} />
              <Route path="/payment" element={<PaymentPage />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
}

export default App;
`);

writeFile('frontend/src/pages/ApplyPage.jsx', `
import React, { useState, useEffect } from 'react';
import { Form, Input, DatePicker, Button, Table, message, Card, Space } from 'antd';
import dayjs from 'dayjs';
import { createApplication, getApplications } from '../api';

const ApplyPage = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [applications, setApplications] = useState([]);

  const fetchApplications = async () => {
    setListLoading(true);
    try {
      const res = await getApplications();
      setApplications(res.data);
    } catch (err) {
      message.error('获取申请列表失败');
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  const onSubmit = async (values) => {
    setLoading(true);
    try {
      const data = {
        child_name: values.child_name,
        child_id_card: values.child_id_card,
        child_birth_date: values.child_birth_date.format('YYYY-MM-DD'),
        parent_name: values.parent_name,
        parent_phone: values.parent_phone,
        contract_start_date: values.contract_start_date.format('YYYY-MM-DD'),
        contract_end_date: values.contract_end_date.format('YYYY-MM-DD'),
        apply_month: values.apply_month.format('YYYY-MM'),
        subsidy_amount: 1000
      };
      await createApplication(data);
      message.success('申请提交成功！');
      form.resetFields();
      fetchApplications();
    } catch (err) {
      const errorMsg = err.response?.data?.error || '提交失败，请重试';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: '幼儿姓名', dataIndex: 'child_name', key: 'child_name' },
    { title: '幼儿证件号', dataIndex: 'child_id_card', key: 'child_id_card' },
    { title: '家长姓名', dataIndex: 'parent_name', key: 'parent_name' },
    { title: '联系电话', dataIndex: 'parent_phone', key: 'parent_phone' },
    { title: '申请月份', dataIndex: 'apply_month', key: 'apply_month' },
    { title: '补助金额', dataIndex: 'subsidy_amount', key: 'subsidy_amount' },
    { title: '状态', dataIndex: 'status_label', key: 'status_label' }
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="托育补助申请">
        <Form
          form={form}
          layout="vertical"
          onFinish={onSubmit}
          initialValues={{ apply_month: dayjs() }}
        >
          <Form.Item
            label="幼儿姓名"
            name="child_name"
            rules={[{ required: true, message: '请输入幼儿姓名' }]}
          >
            <Input placeholder="请输入幼儿姓名" />
          </Form.Item>
          <Form.Item
            label="幼儿证件号"
            name="child_id_card"
            rules={[
              { required: true, message: '请输入幼儿证件号' },
              { len: 18, message: '证件号应为18位' }
            ]}
          >
            <Input placeholder="请输入18位证件号" maxLength={18} />
          </Form.Item>
          <Form.Item
            label="幼儿出生日期"
            name="child_birth_date"
            rules={[{ required: true, message: '请选择出生日期' }]}
          >
            <DatePicker style={{ width: '100%' }} placeholder="请选择出生日期" />
          </Form.Item>
          <Form.Item
            label="家长姓名"
            name="parent_name"
            rules={[{ required: true, message: '请输入家长姓名' }]}
          >
            <Input placeholder="请输入家长姓名" />
          </Form.Item>
          <Form.Item
            label="联系电话"
            name="parent_phone"
            rules={[
              { required: true, message: '请输入联系电话' },
              { pattern: /^1[3-9]\\d{9}$/, message: '请输入正确的手机号' }
            ]}
          >
            <Input placeholder="请输入联系电话" maxLength={11} />
          </Form.Item>
          <Form.Item
            label="托育合同开始日期"
            name="contract_start_date"
            rules={[{ required: true, message: '请选择合同开始日期' }]}
          >
            <DatePicker style={{ width: '100%' }} placeholder="请选择合同开始日期" />
          </Form.Item>
          <Form.Item
            label="托育合同结束日期"
            name="contract_end_date"
            rules={[{ required: true, message: '请选择合同结束日期' }]}
          >
            <DatePicker style={{ width: '100%' }} placeholder="请选择合同结束日期" />
          </Form.Item>
          <Form.Item
            label="申请月份"
            name="apply_month"
            rules={[{ required: true, message: '请选择申请月份' }]}
          >
            <DatePicker.MonthPicker style={{ width: '100%' }} placeholder="请选择申请月份" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              提交申请
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="申请记录列表">
        <Table
          columns={columns}
          dataSource={applications}
          rowKey="id"
          loading={listLoading}
        />
      </Card>
    </Space>
  );
};

export default ApplyPage;
`);

writeFile('frontend/src/pages/CommunityReviewPage.jsx', `
import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, message, Space, Tag, Card } from 'antd';
import { communityReview, getApplications } from '../api';

const CommunityReviewPage = () => {
  const [loading, setLoading] = useState(false);
  const [applications, setApplications] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [currentApp, setCurrentApp] = useState(null);
  const [reviewType, setReviewType] = useState(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await getApplications('PENDING_REVIEW');
      setApplications(res.data);
    } catch (err) {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenReview = (record, type) => {
    setCurrentApp(record);
    setReviewType(type);
    setModalVisible(true);
    form.resetFields();
  };

  const handleReview = async (values) => {
    try {
      await communityReview(currentApp.id, {
        approved: reviewType === 'approve',
        opinion: values.opinion || ''
      });
      message.success(reviewType === 'approve' ? '审核通过成功' : '审核拒绝成功');
      setModalVisible(false);
      fetchData();
    } catch (err) {
      message.error(err.response?.data?.error || '审核失败');
    }
  };

  const columns = [
    { title: '幼儿姓名', dataIndex: 'child_name', key: 'child_name' },
    { title: '幼儿证件号', dataIndex: 'child_id_card', key: 'child_id_card' },
    { title: '家长姓名', dataIndex: 'parent_name', key: 'parent_name' },
    { title: '联系电话', dataIndex: 'parent_phone', key: 'parent_phone' },
    { title: '申请月份', dataIndex: 'apply_month', key: 'apply_month' },
    { title: '补助金额', dataIndex: 'subsidy_amount', key: 'subsidy_amount' },
    {
      title: '状态',
      dataIndex: 'status_label',
      key: 'status_label',
      render: (text) => <Tag color="blue">{text}</Tag>
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="primary" size="small" onClick={() => handleOpenReview(record, 'approve')}>
            通过
          </Button>
          <Button danger size="small" onClick={() => handleOpenReview(record, 'reject')}>
            拒绝
          </Button>
        </Space>
      )
    }
  ];

  return (
    <Card title="社区初审">
      <Table
        columns={columns}
        dataSource={applications}
        rowKey="id"
        loading={loading}
      />
      <Modal
        title={reviewType === 'approve' ? '审核通过' : '审核拒绝'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleReview}>
          <Form.Item label="审核意见" name="opinion">
            <Input.TextArea rows={4} placeholder="请输入审核意见（选填）" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                确认
              </Button>
              <Button onClick={() => setModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default CommunityReviewPage;
`);

writeFile('frontend/src/pages/StreetReviewPage.jsx', `
import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, message, Space, Tag, Card } from 'antd';
import { streetReview, getApplications } from '../api';

const StreetReviewPage = () => {
  const [loading, setLoading] = useState(false);
  const [applications, setApplications] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [currentApp, setCurrentApp] = useState(null);
  const [reviewType, setReviewType] = useState(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await getApplications('COMMUNITY_APPROVED');
      setApplications(res.data);
    } catch (err) {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenReview = (record, type) => {
    setCurrentApp(record);
    setReviewType(type);
    setModalVisible(true);
    form.resetFields();
  };

  const handleReview = async (values) => {
    try {
      await streetReview(currentApp.id, {
        approved: reviewType === 'approve',
        opinion: values.opinion || ''
      });
      message.success(reviewType === 'approve' ? '复核通过成功' : '复核拒绝成功');
      setModalVisible(false);
      fetchData();
    } catch (err) {
      message.error(err.response?.data?.error || '复核失败');
    }
  };

  const columns = [
    { title: '幼儿姓名', dataIndex: 'child_name', key: 'child_name' },
    { title: '幼儿证件号', dataIndex: 'child_id_card', key: 'child_id_card' },
    { title: '家长姓名', dataIndex: 'parent_name', key: 'parent_name' },
    { title: '申请月份', dataIndex: 'apply_month', key: 'apply_month' },
    { title: '补助金额', dataIndex: 'subsidy_amount', key: 'subsidy_amount' },
    {
      title: '状态',
      dataIndex: 'status_label',
      key: 'status_label',
      render: (text) => <Tag color="green">{text}</Tag>
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="primary" size="small" onClick={() => handleOpenReview(record, 'approve')}>
            通过
          </Button>
          <Button danger size="small" onClick={() => handleOpenReview(record, 'reject')}>
            拒绝
          </Button>
        </Space>
      )
    }
  ];

  return (
    <Card title="街道复核">
      <Table
        columns={columns}
        dataSource={applications}
        rowKey="id"
        loading={loading}
      />
      <Modal
        title={reviewType === 'approve' ? '复核通过' : '复核拒绝'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleReview}>
          <Form.Item label="复核意见" name="opinion">
            <Input.TextArea rows={4} placeholder="请输入复核意见（选填）" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                确认
              </Button>
              <Button onClick={() => setModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default StreetReviewPage;
`);

writeFile('frontend/src/pages/PaymentPage.jsx', `
import React, { useState, useEffect } from 'react';
import { Table, Button, message, Space, Tag, Card, Statistic, Row, Col } from 'antd';
import { createPaymentBatch, getPaymentBatches, confirmPaymentBatch, getApplications } from '../api';

const PaymentPage = () => {
  const [loading, setLoading] = useState(false);
  const [batches, setBatches] = useState([]);
  const [approvedCount, setApprovedCount] = useState(0);
  const [approvedAmount, setApprovedAmount] = useState(0);

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const res = await getPaymentBatches();
      setBatches(res.data);
    } catch (err) {
      message.error('获取批次列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchApproved = async () => {
    try {
      const res = await getApplications('STREET_APPROVED');
      setApprovedCount(res.data.length);
      setApprovedAmount(res.data.reduce((sum, item) => sum + item.subsidy_amount, 0));
    } catch (err) {
      message.error('获取待发放数据失败');
    }
  };

  useEffect(() => {
    fetchBatches();
    fetchApproved();
  }, []);

  const handleCreateBatch = async () => {
    try {
      await createPaymentBatch();
      message.success('批次创建成功');
      fetchBatches();
      fetchApproved();
    } catch (err) {
      message.error(err.response?.data?.error || '创建批次失败');
    }
  };

  const handleConfirm = async (id) => {
    try {
      await confirmPaymentBatch(id);
      message.success('发放确认成功');
      fetchBatches();
    } catch (err) {
      message.error('确认失败');
    }
  };

  const columns = [
    { title: '批次号', dataIndex: 'batch_no', key: 'batch_no' },
    { title: '发放笔数', dataIndex: 'count', key: 'count' },
    { title: '总金额', dataIndex: 'total_amount', key: 'total_amount' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (text) => (
        <Tag color={text === 'COMPLETED' ? 'green' : 'orange'}>
          {text === 'COMPLETED' ? '已发放' : '待确认'}
        </Tag>
      )
    },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at' },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          {record.status !== 'COMPLETED' && (
            <Button type="primary" size="small" onClick={() => handleConfirm(record.id)}>
              确认发放
            </Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="财务发放">
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Statistic title="待发放笔数" value={approvedCount} suffix="笔" />
          </Col>
          <Col span={8}>
            <Statistic title="待发放总金额" value={approvedAmount} prefix="¥" />
          </Col>
          <Col span={8} style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
            <Button type="primary" onClick={handleCreateBatch} disabled={approvedCount === 0}>
              生成发放批次
            </Button>
          </Col>
        </Row>
        <Table
          columns={columns}
          dataSource={batches}
          rowKey="id"
          loading={loading}
        />
      </Card>
    </Space>
  );
};

export default PaymentPage;
`);

console.log('\n所有文件创建完成！');
