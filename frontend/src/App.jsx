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