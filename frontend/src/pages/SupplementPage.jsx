import React, { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, message,
  Space, Tag, Card, Descriptions, Timeline, Tabs, Row, Col
} from 'antd';
import { FileTextOutlined, AuditOutlined } from '@ant-design/icons';
import {
  getApplications, getApplication, submitSupplement,
  getSupplementaryMaterials, reviewSupplement, getMaterialTypes
} from '../api';

const { TabPane } = Tabs;
const { TextArea } = Input;
const { Option } = Select;

const SupplementPage = () => {
  const [loading, setLoading] = useState(false);
  const [applications, setApplications] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [materialTypes, setMaterialTypes] = useState([]);
  const [submitModalVisible, setSubmitModalVisible] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [currentApp, setCurrentApp] = useState(null);
  const [currentMaterial, setCurrentMaterial] = useState(null);
  const [appDetail, setAppDetail] = useState(null);
  const [reviewType, setReviewType] = useState(null);
  const [submitForm] = Form.useForm();
  const [reviewForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState('applications');

  const fetchMaterialTypes = async () => {
    try {
      const res = await getMaterialTypes();
      setMaterialTypes(res.data.types);
    } catch (err) {
      message.error('获取材料类型失败');
    }
  };

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const res = await getApplications();
      const filtered = res.data.filter(app =>
        ['PENDING_SUPPLEMENT', 'SUPPLEMENT_SUBMITTED'].includes(app.status)
      );
      setApplications(filtered);
    } catch (err) {
      message.error('获取申请列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchMaterials = async () => {
    setLoading(true);
    try {
      const res = await getSupplementaryMaterials();
      setMaterials(res.data);
    } catch (err) {
      message.error('获取补充材料列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaterialTypes();
    fetchApplications();
    fetchMaterials();
  }, []);

  const handleOpenSubmit = async (record) => {
    setCurrentApp(record);
    setSubmitModalVisible(true);
    submitForm.resetFields();
  };

  const handleOpenReview = (record, type) => {
    setCurrentMaterial(record);
    setReviewType(type);
    setReviewModalVisible(true);
    reviewForm.resetFields();
  };

  const handleViewDetail = async (record) => {
    setCurrentApp(record);
    try {
      const res = await getApplication(record.id);
      setAppDetail(res.data);
      setDetailModalVisible(true);
    } catch (err) {
      message.error('获取详情失败');
    }
  };

  const handleSubmitSupplement = async (values) => {
    try {
      await submitSupplement(currentApp.id, {
        material_type: values.material_type,
        description: values.description,
        file_url: values.file_url
      });
      message.success('补充材料提交成功');
      setSubmitModalVisible(false);
      fetchApplications();
      fetchMaterials();
    } catch (err) {
      message.error(err.response?.data?.error || '提交失败');
    }
  };

  const handleReview = async (values) => {
    try {
      await reviewSupplement(currentMaterial.id, {
        approved: reviewType === 'approve',
        opinion: values.opinion || ''
      });
      message.success(reviewType === 'approve' ? '审核通过成功' : '审核拒绝成功');
      setReviewModalVisible(false);
      fetchApplications();
      fetchMaterials();
    } catch (err) {
      message.error(err.response?.data?.error || '审核失败');
    }
  };

  const appColumns = [
    { title: '幼儿姓名', dataIndex: 'child_name', key: 'child_name' },
    { title: '幼儿证件号', dataIndex: 'child_id_card', key: 'child_id_card' },
    { title: '申请月份', dataIndex: 'apply_month', key: 'apply_month' },
    {
      title: '合同期限',
      key: 'contract',
      render: (_, record) => (
        <span>{record.contract_start_date} 至 {record.contract_end_date}</span>
      )
    },
    {
      title: '状态',
      dataIndex: 'status_label',
      key: 'status_label',
      render: (text) => <Tag color="orange">{text}</Tag>
    },
    {
      title: '补充材料',
      key: 'has_supplement',
      render: (_, record) => (
        record.has_supplement ? <Tag color="green">已提交</Tag> : <Tag color="default">未提交</Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => handleViewDetail(record)}>
            查看详情
          </Button>
          <Button type="primary" size="small" onClick={() => handleOpenSubmit(record)}>
            提交补充材料
          </Button>
        </Space>
      )
    }
  ];

  const materialColumns = [
    { title: '材料类型', dataIndex: 'material_type_label', key: 'material_type_label' },
    { title: '补充说明', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status_label',
      key: 'status_label',
      render: (text) => {
        let color = 'default';
        if (text === '审核通过') color = 'green';
        if (text === '审核拒绝') color = 'red';
        if (text === '待审核') color = 'orange';
        return <Tag color={color}>{text}</Tag>;
      }
    },
    { title: '审核意见', dataIndex: 'reviewer_opinion', key: 'reviewer_opinion', ellipsis: true },
    { title: '提交时间', dataIndex: 'created_at', key: 'created_at' },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        record.status === 'PENDING_REVIEW' && (
          <Space>
            <Button type="primary" size="small" onClick={() => handleOpenReview(record, 'approve')}>
              通过
            </Button>
            <Button danger size="small" onClick={() => handleOpenReview(record, 'reject')}>
              拒绝
            </Button>
          </Space>
        )
      )
    }
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="补充材料管理">
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab="待补材申请" key="applications">
            <Table
              columns={appColumns}
              dataSource={applications}
              rowKey="id"
              loading={loading}
            />
          </TabPane>
          <TabPane tab="补充材料列表" key="materials">
            <Table
              columns={materialColumns}
              dataSource={materials}
              rowKey="id"
              loading={loading}
            />
          </TabPane>
        </Tabs>
      </Card>

      <Modal
        title="提交补充材料"
        open={submitModalVisible}
        onCancel={() => setSubmitModalVisible(false)}
        footer={null}
        destroyOnClose
        width={600}
      >
        {currentApp && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions title="申请信息" bordered size="small" column={1}>
              <Descriptions.Item label="幼儿姓名">{currentApp.child_name}</Descriptions.Item>
              <Descriptions.Item label="幼儿证件号">{currentApp.child_id_card}</Descriptions.Item>
              <Descriptions.Item label="申请月份">{currentApp.apply_month}</Descriptions.Item>
              <Descriptions.Item label="合同期限">
                {currentApp.contract_start_date} 至 {currentApp.contract_end_date}
              </Descriptions.Item>
            </Descriptions>
            <Form form={submitForm} layout="vertical" onFinish={handleSubmitSupplement}>
              <Form.Item
                label="材料类型"
                name="material_type"
                rules={[{ required: true, message: '请选择材料类型' }]}
              >
                <Select placeholder="请选择材料类型">
                  {materialTypes.map(type => (
                    <Option key={type.key} value={type.key}>{type.label}</Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                label="补充说明"
                name="description"
                rules={[{ required: true, message: '请填写补充说明' }]}
              >
                <TextArea rows={4} placeholder="请详细描述补充说明内容" />
              </Form.Item>
              <Form.Item label="附件链接（选填）" name="file_url">
                <Input placeholder="请输入附件文件链接" />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit">
                    提交
                  </Button>
                  <Button onClick={() => setSubmitModalVisible(false)}>
                    取消
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Space>
        )}
      </Modal>

      <Modal
        title={reviewType === 'approve' ? '审核通过' : '审核拒绝'}
        open={reviewModalVisible}
        onCancel={() => setReviewModalVisible(false)}
        footer={null}
        destroyOnClose
      >
        {currentMaterial && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions title="材料信息" bordered size="small" column={1}>
              <Descriptions.Item label="材料类型">{currentMaterial.material_type_label}</Descriptions.Item>
              <Descriptions.Item label="补充说明">{currentMaterial.description}</Descriptions.Item>
            </Descriptions>
            <Form form={reviewForm} layout="vertical" onFinish={handleReview}>
              <Form.Item label="审核意见" name="opinion">
                <TextArea rows={4} placeholder="请输入审核意见（选填）" />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit">
                    确认
                  </Button>
                  <Button onClick={() => setReviewModalVisible(false)}>
                    取消
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Space>
        )}
      </Modal>

      <Modal
        title="申请详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        destroyOnClose
        width={800}
      >
        {appDetail && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions title="基本信息" bordered size="small" column={2}>
              <Descriptions.Item label="幼儿姓名">{appDetail.child_name}</Descriptions.Item>
              <Descriptions.Item label="幼儿证件号">{appDetail.child_id_card}</Descriptions.Item>
              <Descriptions.Item label="出生日期">{appDetail.child_birth_date}</Descriptions.Item>
              <Descriptions.Item label="家长姓名">{appDetail.parent_name}</Descriptions.Item>
              <Descriptions.Item label="联系电话">{appDetail.parent_phone}</Descriptions.Item>
              <Descriptions.Item label="申请月份">{appDetail.apply_month}</Descriptions.Item>
              <Descriptions.Item label="合同开始">{appDetail.contract_start_date}</Descriptions.Item>
              <Descriptions.Item label="合同结束">{appDetail.contract_end_date}</Descriptions.Item>
              <Descriptions.Item label="补助金额">{appDetail.subsidy_amount}元</Descriptions.Item>
              <Descriptions.Item label="当前状态">
                <Tag color="blue">{appDetail.status_label}</Tag>
              </Descriptions.Item>
            </Descriptions>

            {appDetail.supplementary_materials && appDetail.supplementary_materials.length > 0 && (
              <Card title="补充材料记录" size="small">
                <Table
                  dataSource={appDetail.supplementary_materials}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={[
                    { title: '类型', dataIndex: 'material_type_label', key: 'type' },
                    { title: '说明', dataIndex: 'description', key: 'desc', ellipsis: true },
                    {
                      title: '状态',
                      dataIndex: 'status_label',
                      key: 'status',
                      render: (text) => {
                        let color = 'default';
                        if (text === '审核通过') color = 'green';
                        if (text === '审核拒绝') color = 'red';
                        if (text === '待审核') color = 'orange';
                        return <Tag color={color}>{text}</Tag>;
                      }
                    },
                    { title: '审核意见', dataIndex: 'reviewer_opinion', key: 'opinion', ellipsis: true },
                    { title: '提交时间', dataIndex: 'created_at', key: 'time' }
                  ]}
                />
              </Card>
            )}

            {appDetail.status_logs && appDetail.status_logs.length > 0 && (
              <Card title="状态变更日志" size="small">
                <Timeline>
                  {appDetail.status_logs.map(log => (
                    <Timeline.Item key={log.id}>
                      <p><strong>{log.operator}</strong> - {log.remark}</p>
                      <p style={{ color: '#999', fontSize: '12px' }}>{log.created_at}</p>
                    </Timeline.Item>
                  ))}
                </Timeline>
              </Card>
            )}
          </Space>
        )}
      </Modal>
    </Space>
  );
};

export default SupplementPage;
