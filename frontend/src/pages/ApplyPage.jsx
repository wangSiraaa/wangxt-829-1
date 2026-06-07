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
              { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }
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