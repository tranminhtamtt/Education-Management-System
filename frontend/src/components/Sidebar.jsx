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
  NotificationOutlined,
  BarChartOutlined,
  ReadOutlined,
  MessageOutlined,
  SafetyCertificateOutlined
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

const getRoleLabel = (role, studentLabel, teacherLabel, defaultLabel) => {
  if (role === 'STUDENT') return studentLabel;
  if (role === 'TEACHER') return teacherLabel;
  return defaultLabel;
};

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const role = user?.role;

  const items = role === 'ACCOUNTANT'
    ? [
        // Accountant (Người 3): chỉ các chức năng tài chính học phí
        { key: '/dashboard', icon: <DashboardOutlined />, label: 'Tổng quan & Báo cáo' },
        { key: '/tuition', icon: <DollarCircleOutlined />, label: 'Công nợ học phí' },
        { key: '/payment-operations', icon: <AuditOutlined />, label: 'Giao dịch thanh toán' },
        { key: '/notifications', icon: <NotificationOutlined />, label: 'Thông báo' }
      ]
    : role === 'STUDENT' ? [
        // Trung tâm khóa học: không có mục "Kết quả học tập" (không ràng buộc điểm số)
        { key: '/dashboard', icon: <DashboardOutlined />, label: 'Không gian học tập' },
        { key: '/catalog', icon: <BookOutlined />, label: 'Khám phá khóa học' },
        { key: '/my-courses', icon: <ApartmentOutlined />, label: 'Khóa học của tôi' },
        { key: '/schedule', icon: <CalendarOutlined />, label: 'Lịch học Live' },
        { key: '/attendance', icon: <CheckSquareOutlined />, label: 'Chuyên cần' },
        { key: '/assignments', icon: <FileTextOutlined />, label: 'Bài tập & nộp bài' },
        { key: '/questions', icon: <AuditOutlined />, label: 'Hỏi đáp giảng viên' },
        { key: '/tuition', icon: <DollarCircleOutlined />, label: 'Học phí & VietQR' },
        { key: '/requests', icon: <FileTextOutlined />, label: 'Đơn từ' },
        { key: '/notifications', icon: <NotificationOutlined />, label: 'Thông báo' }
      ] : [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: 'Tổng quan'
    },
    // Admin only: Quản trị người dùng & môn
    ...(role === 'ADMIN'
      ? [
          {
            key: '/users',
            icon: <SafetyCertificateOutlined />,
            label: 'Quản lý Tài khoản'
          },
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
    ...(role === 'TEACHER'
      ? [{
          key: '/teacher-content',
          icon: <ReadOutlined />,
          label: 'Nội dung & lớp học'
        }]
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
      label: getRoleLabel(role, 'Báo cáo Chuyên cần', 'Điểm danh lớp trực tuyến', 'Quản lý Điểm danh')
    },
    // Bài tập
    {
      key: '/assignments',
      icon: <FileTextOutlined />,
      label: getRoleLabel(role, 'Bài tập & Nộp bài', 'Bài tập & chấm bài', 'Quản lý Bài tập')
    },
    // Quản trị và giảng viên quản lý điểm cuối khóa.
    ...(['ADMIN', 'TEACHER'].includes(role)
      ? [{
          key: '/grades',
          icon: <TrophyOutlined />,
          label: 'Đánh giá cuối khóa'
        }]
      : []),
    ...(['TEACHER', 'ADMIN'].includes(role)
      ? [{
          key: '/questions',
          icon: <MessageOutlined />,
          label: 'Hỏi đáp học viên'
        }]
      : []),
    // Khung chương trình (FAP Curriculum)
    ...(['ADMIN', 'STUDENT'].includes(role)
      ? [
          {
            key: '/curriculum',
            icon: <BookOutlined />,
            label: 'Khung chương trình'
          }
        ]
      : []),
    // Học phí (Admin xem, Student xem công nợ cá nhân)
    ...(['ADMIN', 'STUDENT'].includes(role)
      ? [
          {
            key: '/tuition',
            icon: <DollarCircleOutlined />,
            label: role === 'ADMIN' ? 'Học phí (Chỉ xem)' : 'Học phí & VietQR'
          }
        ]
      : []),
    // Đơn từ học vụ không thuộc luồng giảng viên.
    ...(['ADMIN', 'STUDENT'].includes(role)
      ? [{
          key: '/requests',
          icon: <AuditOutlined />,
          label: role === 'ADMIN' ? 'Xét duyệt Đơn từ' : 'Đơn từ Học vụ'
        }]
      : []),
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
