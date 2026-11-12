import React, { useState } from 'react';
import { Layout, Drawer, Grid } from 'antd';
import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import HeaderBar from '../components/HeaderBar';
import { useAuth } from '../context/AuthContext';

const { Sider, Content } = Layout;

const MainLayout = () => {
  const { user, loading } = useAuth();
  const screens = Grid.useBreakpoint();
  const [menuOpen, setMenuOpen] = useState(false);
  const mobile = !screens.lg;

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
      {mobile ? <Drawer title="EMS Portal" open={menuOpen} onClose={() => setMenuOpen(false)} placement="left" width={280} styles={{ body: { padding: 0 } }}><div onClick={() => setMenuOpen(false)}><Sidebar /></div></Drawer> : <Sider
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
      </Sider>}

      <Layout style={{ minWidth: 0 }}>
        <HeaderBar onMenuClick={mobile ? () => setMenuOpen(true) : undefined} />
        <Content style={{ margin: screens.md ? 24 : 12, minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
