import React from 'react';
import { Layout, Space, Avatar, Typography, Tag, Dropdown, Button, Grid } from 'antd';
import { UserOutlined, LogoutOutlined, MenuOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';

const { Header } = Layout;
const { Text } = Typography;

const HeaderBar = ({ onMenuClick }) => {
  const { user, logout } = useAuth();
  const screens = Grid.useBreakpoint();

  const getRoleTag = (role) => {
    switch (role) {
      case 'ADMIN': return <Tag color="error">Quản trị viên</Tag>;
      case 'TEACHER': return <Tag color="processing">Giảng viên</Tag>;
      case 'STUDENT': return <Tag color="warning">Sinh viên</Tag>;
      case 'ACCOUNTANT': return <Tag color="green">Kế toán</Tag>;
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
        padding: screens.md ? '0 24px' : '0 12px',
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
      <Space style={{ minWidth: 0, overflow: 'hidden' }}>
        {onMenuClick && <Button aria-label="Mở menu" type="text" icon={<MenuOutlined />} onClick={onMenuClick} />}
        <Text strong ellipsis style={{ fontSize: screens.md ? 16 : 14, color: '#262626' }}>
          {user?.role === 'STUDENT' ? 'EMS · Cổng học tập' : 'EMS · Quản lý giáo dục'}
        </Text>
      </Space>

      <Space size={screens.md ? 'large' : 'small'} style={{ flexShrink: 0 }}>
        <NotificationBell />

        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" arrow>
          <Space style={{ cursor: 'pointer' }}>
            <Avatar
              style={{ backgroundColor: '#F26F21' }}
              icon={<UserOutlined />}
              src={user?.avatar}
            />
            {screens.md && <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <Text strong style={{ fontSize: 14 }}>
                {user?.fullName || user?.code}
              </Text>
              <div style={{ marginTop: 2 }}>{getRoleTag(user?.role)}</div>
            </div>}
          </Space>
        </Dropdown>
      </Space>
    </Header>
  );
};

export default HeaderBar;
