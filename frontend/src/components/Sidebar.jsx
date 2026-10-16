import React from 'react';
import { Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  UserOutlined,
  TeamOutlined,
  BookOutlined,
  ApartmentOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  FileTextOutlined,
  TrophyOutlined,
  DollarCircleOutlined,
  AuditOutlined,
  NotificationOutlined
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const role = user?.role;

  const items = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: 'Tổng quan'
    },
    // Admin only: Quản trị người dùng & môn
    ...(role === 'ADMIN'
      ? [
          {
            key: '/students',
            icon: <UserOutlined />,
            label: 'Quản lý Học viên'
          },
          {
            key: '/teachers',
            icon: <TeamOutlined />,
            label: 'Quản lý Giảng viên'
          },
          {
            key: '/courses',
            icon: <BookOutlined />,
            label: 'Quản lý Môn học'
          }
        ]
      : []),
    // Admin & Teacher: Quản lý lớp
    ...(['ADMIN', 'TEACHER'].includes(role)
      ? [
          {
            key: '/classes',
            icon: <ApartmentOutlined />,
            label: role === 'ADMIN' ? 'Quản lý Lớp học' : 'Lớp học phụ trách'
          }
        ]
      : []),
    // All roles: Thời khóa biểu
    {
      key: '/schedule',
      icon: <CalendarOutlined />,
      label: 'Thời khóa biểu'
    },
    // Điểm danh: Admin, Teacher; Student xem chuyên cần
    {
      key: '/attendance',
      icon: <CheckSquareOutlined />,
      label: role === 'STUDENT' ? 'Báo cáo Chuyên cần' : 'Quản lý Điểm danh'
    },
    // Bài tập
    {
      key: '/assignments',
      icon: <FileTextOutlined />,
      label: role === 'STUDENT' ? 'Bài tập & Nộp bài' : 'Quản lý Bài tập'
    },
    // Bảng điểm
    {
      key: '/grades',
      icon: <TrophyOutlined />,
      label: role === 'STUDENT' ? 'Bảng điểm & GPA' : 'Quản lý Điểm số'
    },
    // Học phí (Admin & Student)
    ...(['ADMIN', 'STUDENT'].includes(role)
      ? [
          {
            key: '/tuition',
            icon: <DollarCircleOutlined />,
            label: role === 'ADMIN' ? 'Quản lý Học phí' : 'Học phí & VietQR'
          }
        ]
      : []),
    // Đơn từ học vụ
    {
      key: '/requests',
      icon: <AuditOutlined />,
      label: role === 'ADMIN' ? 'Xét duyệt Đơn từ' : 'Đơn từ Học vụ'
    },
    // Thông báo
    {
      key: '/notifications',
      icon: <NotificationOutlined />,
      label: 'Thông báo'
    }
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          cursor: 'pointer'
        }}
        onClick={() => navigate('/dashboard')}
      >
        <span style={{ fontSize: 20, fontWeight: 800, color: '#F26F21', letterSpacing: 1 }}>
          EMS <span style={{ color: '#1f1f1f', fontSize: 14, fontWeight: 600 }}>PORTAL</span>
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={items}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0, paddingTop: 8 }}
        />
      </div>
    </div>
  );
};

export default Sidebar;
