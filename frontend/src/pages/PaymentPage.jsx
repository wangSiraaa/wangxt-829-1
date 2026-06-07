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