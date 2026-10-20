import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Typography, Table, Tag, Space, Alert, Progress, Spin } from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  ApartmentOutlined,
  DollarCircleOutlined,
  ClockCircleOutlined,
  TrophyOutlined
} from '@ant-design/icons';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import TuitionReportPage from '../grades-tuition/TuitionReportPage';

dayjs.extend(utc);

const { Title, Text } = Typography;

// Cột TIME do Prisma trả về dạng 1970-01-01THH:mm:00.000Z -> "HH:mm"
const fmtTime = (t) => (t && String(t).includes('T') ? dayjs(t).utc().format('HH:mm') : t || '');

const DashboardPage = () => {
  const { user } = useAuth();
  const role = user?.role;

  const [loading, setLoading] = useState(true);
  const [adminData, setAdminData] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const [todaySchedules, setTodaySchedules] = useState([]);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setLoading(true);

        if (role === 'ADMIN') {
          const res = await apiClient.get('/analytics/admin-overview');
          if (res.success) setAdminData(res.data);
        } else if (role === 'STUDENT') {
          const res = await apiClient.get('/analytics/student-overview');
          if (res.success) setStudentData(res.data);
        }

        // Kế toán không có lịch học/lịch dạy -> dashboard riêng (TuitionReportPage tự tải dữ liệu)
        if (role === 'ACCOUNTANT') return;

        // Lấy lịch học hôm nay
        const schedRes = await apiClient.get('/schedules/my-schedule');
        if (schedRes.success) {
          // Lấy thứ hiện tại trong tuần (dayjs: 0=CN, 1=T2, ... -> đổi sang 2-8)
          const currentDayOfWeek = dayjs().day() === 0 ? 8 : dayjs().day() + 1;
          const today = schedRes.data.filter(s => s.dayOfWeek === currentDayOfWeek);
          setTodaySchedules(today);
        }
      } catch (err) {
        console.error('Error fetching dashboard:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [role]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>
          Xin chào, {user?.fullName || user?.code} 👋
        </Title>
        <Text type="secondary">
          Cổng thông tin đào tạo EMS • {dayjs().format('dddd, DD/MM/YYYY')}
        </Text>
      </div>

      {/* ========================================================
          0. GIAO DIỆN ACCOUNTANT DASHBOARD (Người 3)
      ======================================================== */}
      {role === 'ACCOUNTANT' && <TuitionReportPage embedded />}

      {/* ========================================================
          1. GIAO DIỆN ADMIN DASHBOARD
      ======================================================== */}
      {role === 'ADMIN' && adminData && (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12} lg={6}>
              <Card bordered={false}>
                <Statistic
                  title="Tổng số Sinh viên"
                  value={adminData.kpi.totalStudents}
                  prefix={<UserOutlined style={{ color: '#F26F21', marginRight: 8 }} />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card bordered={false}>
                <Statistic
                  title="Tổng số Giảng viên"
                  value={adminData.kpi.totalTeachers}
                  prefix={<TeamOutlined style={{ color: '#1890ff', marginRight: 8 }} />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card bordered={false}>
                <Statistic
                  title="Lớp đang vận hành"
                  value={adminData.kpi.activeClasses}
                  prefix={<ApartmentOutlined style={{ color: '#52c41a', marginRight: 8 }} />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card bordered={false}>
                <Statistic
                  title="Học phí đã thu"
                  value={adminData.financial.paidAmount}
                  suffix="VNĐ"
                  prefix={<DollarCircleOutlined style={{ color: '#faad14', marginRight: 8 }} />}
                  formatter={(val) => Number(val).toLocaleString('vi-VN')}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={14}>
              <Card title="Thống kê Tài chính Học phí" bordered={false}>
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        {
                          name: 'Tổng tiền',
                          'Đã thu': adminData.financial.paidAmount,
                          'Còn nợ': adminData.financial.debtAmount
                        }
                      ]}
                      margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
                    >
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(val) => `${(val / 1e6).toFixed(0)}Tr`} />
                      <Tooltip formatter={(val) => `${Number(val).toLocaleString('vi-VN')} VNĐ`} />
                      <Legend />
                      <Bar dataKey="Đã thu" fill="#52c41a" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="Còn nợ" fill="#ff4d4f" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ marginTop: 12, textAlign: 'center' }}>
                  <Text type="secondary">
                    Tỷ lệ hoàn thành công nợ: <b>{adminData.financial.paidRate}%</b>
                  </Text>
                  <Progress percent={adminData.financial.paidRate} strokeColor="#52c41a" status="active" />
                </div>
              </Card>
            </Col>

            <Col xs={24} lg={10}>
              <Card title="Tỷ lệ Học lực & Qua môn toàn trường" bordered={false}>
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={adminData.academicPerformance}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {adminData.academicPerformance.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* ========================================================
          2. GIAO DIỆN STUDENT DASHBOARD
      ======================================================== */}
      {role === 'STUDENT' && studentData && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card bordered={false}>
              <Statistic
                title="Điểm tích lũy (GPA)"
                value={studentData.gpa}
                precision={2}
                prefix={<TrophyOutlined style={{ color: '#faad14' }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card bordered={false}>
              <Statistic
                title="Lớp đang theo học"
                value={studentData.enrolledClassesCount}
                prefix={<ApartmentOutlined style={{ color: '#F26F21' }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card bordered={false}>
              <Statistic
                title="Môn đã qua (Passed)"
                value={studentData.passedCourses}
                prefix={<UserOutlined style={{ color: '#52c41a' }} />}
              />
            </Card>
          </Col>

          <Col xs={24} lg={14}>
            <Card title="Lịch học hôm nay" bordered={false} style={{ height: '100%' }}>
              {todaySchedules.length === 0 ? (
                <Alert message="Hôm nay bạn không có ca học nào trên lớp." type="info" showIcon />
              ) : (
                <Table
                  dataSource={todaySchedules}
                  rowKey="id"
                  pagination={false}
                  columns={[
                    { title: 'Ca học', dataIndex: 'shift', render: (s) => <Tag color="orange">Slot {s}</Tag> },
                    { title: 'Thời gian', render: (_, r) => `${fmtTime(r.startTime)} - ${fmtTime(r.endTime)}` },
                    { title: 'Môn học', dataIndex: 'courseName' },
                    { title: 'Phòng', dataIndex: 'room', render: (r) => <Tag color="blue">{r}</Tag> }
                  ]}
                />
              )}
            </Card>
          </Col>

          <Col xs={24} lg={10}>
            <Card title="Hạn nộp bài tập sắp tới" bordered={false} style={{ height: '100%' }}>
              {studentData.upcomingDeadlines.length === 0 ? (
                <Text type="secondary">Tuyệt vời! Không có bài tập nào sắp đến hạn.</Text>
              ) : (
                <Table
                  dataSource={studentData.upcomingDeadlines}
                  rowKey="id"
                  pagination={false}
                  columns={[
                    { title: 'Bài tập', dataIndex: 'title' },
                    {
                      title: 'Hạn nộp',
                      dataIndex: 'dueDate',
                      render: (d) => dayjs(d).format('HH:mm DD/MM')
                    },
                    {
                      title: 'Trạng thái',
                      render: (_, r) => r.isSubmitted ? <Tag color="success">Đã nộp</Tag> : <Tag color="error">Chưa nộp</Tag>
                    }
                  ]}
                />
              )}
            </Card>
          </Col>
        </Row>
      )}

      {/* ========================================================
          3. GIAO DIỆN TEACHER DASHBOARD
      ======================================================== */}
      {role === 'TEACHER' && (
        <Row gutter={[16, 16]}>
          <Col xs={24}>
            <Card title="Lịch giảng dạy hôm nay" bordered={false}>
              {todaySchedules.length === 0 ? (
                <Alert message="Hôm nay Thầy/Cô không có ca dạy nào theo lịch phân công." type="info" showIcon />
              ) : (
                <Table
                  dataSource={todaySchedules}
                  rowKey="id"
                  pagination={false}
                  columns={[
                    { title: 'Ca học', dataIndex: 'shift', render: (s) => <Tag color="orange">Slot {s}</Tag> },
                    { title: 'Thời gian', render: (_, r) => `${fmtTime(r.startTime)} - ${fmtTime(r.endTime)}` },
                    { title: 'Lớp', dataIndex: 'classCode', render: (c) => <Text strong>{c}</Text> },
                    { title: 'Môn học', dataIndex: 'courseName' },
                    { title: 'Phòng học', dataIndex: 'room', render: (r) => <Tag color="blue">{r}</Tag> }
                  ]}
                />
              )}
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
};

export default DashboardPage;
