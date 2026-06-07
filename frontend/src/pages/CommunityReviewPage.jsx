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