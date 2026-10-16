import React from 'react';
import { Layout, Space, Avatar, Typography, Tag, Dropdown } from 'antd';
import { UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';

const { Header } = Layout;
const { Text } = Typography;

const HeaderBar = () => {
  const { user, logout } = useAuth();

  const getRoleTag = (role) => {
    switch (role) {
      case 'ADMIN': return <Tag color="error">Quản trị viên</Tag>;
      case 'TEACHER': return <Tag color="processing">Giảng viên</Tag>;
      case 'STUDENT': return <Tag color="warning">Sinh viên</Tag>;
      default: return null;
    }
  };

  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Đăng xuất',
      danger: true,
      onClick: logout
    }
  ];

  return (
    <Header
      style={{
        background: '#fff',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #f0f0f0',
        height: 64,
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}
    >
      <div>
        <Text strong style={{ fontSize: 16, color: '#262626' }}>
          Hệ Thống Quản Lý Giáo Dục Đại Học
        </Text>
      </div>

      <Space size="large">
        <NotificationBell />

        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" arrow>
          <Space style={{ cursor: 'pointer' }}>
            <Avatar
              style={{ backgroundColor: '#F26F21' }}
              icon={<UserOutlined />}
              src={user?.avatar}
            />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <Text strong style={{ fontSize: 14 }}>
                {user?.fullName || user?.code}
              </Text>
              <div style={{ marginTop: 2 }}>{getRoleTag(user?.role)}</div>
            </div>
          </Space>
        </Dropdown>
      </Space>
    </Header>
  );
};

export default HeaderBar;
