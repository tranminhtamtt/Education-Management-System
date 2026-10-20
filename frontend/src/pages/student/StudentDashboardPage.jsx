import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Statistic, Typography, Table, Tag, Alert, Spin, Empty, Button, Steps, List, Space } from 'antd';
import {
  TrophyOutlined,
  ApartmentOutlined,
  FileTextOutlined,
  DollarCircleOutlined,
  BellOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  QrcodeOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { formatVnd } from '../../components/tuition/tuitionHelpers';
import { PRIMARY, AttendanceWarningTag } from './studentHelpers';

const { Title, Text } = Typography;

/**
 * BF-STU-1 / UC11.2: Student Dashboard (DF31)
 * Tổng hợp toàn bộ vòng đời học tập: lịch hôm nay, deadline, chuyên cần, GPA, công nợ, thông báo.
 */
const StudentDashboardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiClient.get('/analytics/dashboard');
      if (res.success) setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Không tải được dữ liệu dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !data) {
    return <Alert type="error" showIcon message={error || 'Không có dữ liệu'} action={<Button onClick={load}>Thử lại</Button>} />;
  }

  const todoAssignments = data.pendingAssignments + data.missingAssignments;
  const debt = data.tuition.remainingAmount;

  // Vòng đời học tập của học viên (BF-STU-1 → BF-STU-10)
  const lifecycle = [
    {
      title: 'Lịch học',
      icon: <CalendarOutlined />,
      path: '/schedule',
      description: `${data.todaySchedules.length} ca hôm nay`,
      status: 'finish'
    },
    {
      title: 'Chuyên cần',
      icon: <CheckSquareOutlined />,
      path: '/attendance',
      description: data.attendanceWarnings.length > 0 ? `${data.attendanceWarnings.length} môn cảnh báo` : 'An toàn',
      status: data.attendanceWarnings.some((w) => w.isBanned) ? 'error' : 'finish'
    },
    {
      title: 'Thông báo',
      icon: <BellOutlined />,
      path: '/notifications',
      description: data.unreadNotifications > 0 ? `${data.unreadNotifications} chưa đọc` : 'Đã đọc hết',
      status: data.unreadNotifications > 0 ? 'process' : 'finish'
    },
    {
      title: 'Bài tập',
      icon: <FileTextOutlined />,
      path: '/assignments',
      description: todoAssignments > 0 ? `${todoAssignments} bài cần xử lý` : 'Đã nộp đủ',
      status: data.missingAssignments > 0 ? 'error' : todoAssignments > 0 ? 'process' : 'finish'
    },
    {
      title: 'Điểm & GPA',
      icon: <TrophyOutlined />,
      path: '/grades',
      description: `GPA ${data.gpa.toFixed(2)}`,
      status: 'finish'
    },
    {
      title: 'Học phí',
      icon: <QrcodeOutlined />,
      path: '/tuition',
      description: debt > 0 ? `Còn nợ ${formatVnd(debt)}` : 'Đã hoàn thành',
      status: debt > 0 ? (data.tuition.overdueCount > 0 ? 'error' : 'process') : 'finish'
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Xin chào, {user?.fullName || user?.code} 👋
          </Title>
          <Text type="secondary">Cổng thông tin học viên EMS • {dayjs().format('dddd, DD/MM/YYYY')}</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load}>
          Làm mới
        </Button>
      </div>

      {/* ===== KPI ===== */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} hoverable onClick={() => navigate('/grades')}>
            <Statistic
              title="GPA tích lũy (thang 10)"
              value={data.gpa}
              precision={2}
              prefix={<TrophyOutlined style={{ color: '#faad14' }} />}
              suffix={<Text type="secondary" style={{ fontSize: 13 }}>/ {data.totalCredits} TC</Text>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} hoverable onClick={() => navigate('/schedule')}>
            <Statistic
              title="Lớp đang theo học"
              value={data.enrolledClassesCount}
              prefix={<ApartmentOutlined style={{ color: PRIMARY }} />}
              suffix={<Text type="secondary" style={{ fontSize: 13 }}>• {data.passedCourses} môn đã qua</Text>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} hoverable onClick={() => navigate('/assignments')}>
            <Statistic
              title="Bài tập cần nộp"
              value={todoAssignments}
              valueStyle={{ color: data.missingAssignments > 0 ? '#ff4d4f' : undefined }}
              prefix={<FileTextOutlined style={{ color: '#1677ff' }} />}
              suffix={
                data.missingAssignments > 0 ? (
                  <Text type="danger" style={{ fontSize: 13 }}>
                    • {data.missingAssignments} quá hạn
                  </Text>
                ) : null
              }
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} hoverable onClick={() => navigate('/tuition')}>
            <Statistic
              title="Học phí còn nợ"
              value={debt}
              formatter={(v) => formatVnd(v)}
              valueStyle={{ color: debt > 0 ? '#ff4d4f' : '#52c41a' }}
              prefix={<DollarCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* ===== Vòng đời học tập ===== */}
      <Card bordered={false} title="Tiến trình học tập của bạn" style={{ marginBottom: 16 }}>
        <Steps
          size="small"
          responsive
          items={lifecycle.map((s) => ({
            title: (
              <a onClick={() => navigate(s.path)} style={{ color: 'inherit' }}>
                {s.title}
              </a>
            ),
            description: s.description,
            icon: s.icon,
            status: s.status
          }))}
        />
      </Card>

      {/* ===== Cảnh báo ===== */}
      {data.attendanceWarnings.length > 0 && (
        <Alert
          style={{ marginBottom: 16 }}
          type={data.attendanceWarnings.some((w) => w.isBanned) ? 'error' : 'warning'}
          showIcon
          message="Cảnh báo chuyên cần (quy chế vắng không phép ≥ 20% bị cấm thi)"
          description={
            <Space direction="vertical" size={2}>
              {data.attendanceWarnings.map((w) => (
                <span key={w.classCode}>
                  <b>{w.classCode}</b> – {w.courseName}: vắng không phép {w.absentUnexcused}/{w.totalSessions} buổi (
                  {w.absentRate}%) <AttendanceWarningTag level={w.warningLevel} />
                </span>
              ))}
            </Space>
          }
          action={<Button size="small" onClick={() => navigate('/attendance')}>Xem chi tiết</Button>}
        />
      )}
      {debt > 0 && (
        <Alert
          style={{ marginBottom: 16 }}
          type={data.tuition.overdueCount > 0 ? 'error' : 'warning'}
          showIcon
          message={`Bạn còn nợ ${formatVnd(debt)} học phí${data.tuition.overdueCount > 0 ? ` (${data.tuition.overdueCount} hóa đơn quá hạn)` : ''}.`}
          action={
            <Button size="small" type="primary" icon={<QrcodeOutlined />} onClick={() => navigate('/tuition')}>
              Thanh toán VietQR
            </Button>
          }
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="Lịch học hôm nay" bordered={false} style={{ height: '100%' }}>
            {data.todaySchedules.length === 0 ? (
              <Alert message="Hôm nay bạn không có ca học nào." type="info" showIcon />
            ) : (
              <Table
                dataSource={data.todaySchedules}
                rowKey="id"
                pagination={false}
                size="small"
                columns={[
                  { title: 'Ca', dataIndex: 'shift', render: (s) => <Tag color="orange">Slot {s}</Tag> },
                  { title: 'Thời gian', render: (_, r) => `${r.startTime} – ${r.endTime}` },
                  {
                    title: 'Môn học',
                    render: (_, r) => (
                      <div>
                        <Text strong>{r.courseName}</Text>
                        <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                          {r.classCode} • GV: {r.teacherName}
                        </div>
                      </div>
                    )
                  },
                  { title: 'Phòng', dataIndex: 'room', render: (r) => <Tag color="blue">{r}</Tag> }
                ]}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            title="Deadline 7 ngày tới"
            bordered={false}
            style={{ height: '100%' }}
            extra={<a onClick={() => navigate('/assignments')}>Tất cả bài tập</a>}
          >
            {data.upcomingDeadlines.length === 0 ? (
              <Text type="secondary">Không có bài tập nào sắp đến hạn.</Text>
            ) : (
              <List
                size="small"
                dataSource={data.upcomingDeadlines}
                renderItem={(a) => (
                  <List.Item
                    actions={[
                      a.isSubmitted ? (
                        <Tag color="success">Đã nộp</Tag>
                      ) : (
                        <Button size="small" type="primary" onClick={() => navigate('/assignments')}>
                          Nộp bài
                        </Button>
                      )
                    ]}
                  >
                    <List.Item.Meta
                      title={a.title}
                      description={
                        <span>
                          {a.classCode} • Hạn: <b>{dayjs(a.dueDate).format('HH:mm DD/MM/YYYY')}</b>
                        </span>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="Biểu đồ GPA theo học kỳ" bordered={false}>
            {data.gpaBySemester.length === 0 ? (
              <Empty description="Chưa có môn nào có điểm tổng kết" />
            ) : (
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.gpaBySemester} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="semester" />
                    <YAxis domain={[0, 10]} />
                    <Tooltip formatter={(v) => [Number(v).toFixed(2), 'GPA']} />
                    <ReferenceLine y={4} stroke="#ff4d4f" strokeDasharray="4 4" label={{ value: 'Ngưỡng qua môn 4.0', fontSize: 11, fill: '#ff4d4f' }} />
                    <Bar dataKey="gpa" fill={PRIMARY} radius={[6, 6, 0, 0]} maxBarSize={60} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default StudentDashboardPage;
