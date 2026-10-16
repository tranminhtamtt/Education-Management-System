import React from 'react';
import { Layout } from 'antd';
import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import HeaderBar from '../components/HeaderBar';
import { useAuth } from '../context/AuthContext';

const { Sider, Content } = Layout;

const MainLayout = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        Đang tải hệ thống EMS...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={250}
        theme="light"
        style={{
          borderRight: '1px solid #f0f0f0',
          position: 'sticky',
          top: 0,
          height: '100vh',
          left: 0
        }}
      >
        <Sidebar />
      </Sider>

      <Layout>
        <HeaderBar />
        <Content style={{ margin: '24px', minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
