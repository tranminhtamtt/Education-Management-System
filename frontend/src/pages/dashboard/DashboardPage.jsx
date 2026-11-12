import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Typography, Table, Tag, Alert, Progress, Spin, Button, Space } from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  ApartmentOutlined,
  DollarCircleOutlined,
  TrophyOutlined,
  FileTextOutlined,
  MessageOutlined,
  ReadOutlined,
  VideoCameraOutlined,
  BookOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import TuitionReportPage from '../grades-tuition/TuitionReportPage';

const { Title, Text } = Typography;

const DashboardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;

  const [loading, setLoading] = useState(true);
  const [adminData, setAdminData] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const [todaySchedules, setTodaySchedules] = useState([]);
  const [teacherData, setTeacherData] = useState(null);

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
        } else if (role === 'TEACHER') {
          const res = await apiClient.get('/teacher/dashboard');
          if (res.success) {
            setTeacherData(res.data);
            const currentDayOfWeek = dayjs().day() === 0 ? 8 : dayjs().day() + 1;
            setTodaySchedules(res.data.schedules.filter(s => s.dayOfWeek === currentDayOfWeek));
          }
          return;
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
      {role === 'ACCOUNTANT' && <TuitionReportPage />}

      {/* ========================================================
          1. GIAO DIỆN ADMIN DASHBOARD
      ======================================================== */}
      {role === 'ADMIN' && adminData && (
        <>
          {/* 4 KPI Tổng quan theo chuẩn System Admin */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12} lg={6}>
              <Card bordered={false} hoverable>
                <Statistic
                  title="Tổng số Học viên"
                  value={adminData.kpi.totalStudents}
                  prefix={<UserOutlined style={{ color: '#F26F21', marginRight: 8 }} />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card bordered={false} hoverable>
                <Statistic
                  title="Tổng số Giảng viên"
                  value={adminData.kpi.totalTeachers}
                  prefix={<TeamOutlined style={{ color: '#1890ff', marginRight: 8 }} />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card bordered={false} hoverable>
                <Statistic
                  title="Khóa & Lớp đang mở"
                  value={`${adminData.kpi.totalCourses || 0} Khóa / ${adminData.kpi.activeClasses || 0} Lớp`}
                  prefix={<ApartmentOutlined style={{ color: '#52c41a', marginRight: 8 }} />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card bordered={false} hoverable>
                <Statistic
                  title="Doanh thu Trung tâm"
                  value={adminData.kpi.totalRevenue || adminData.financial?.paidAmount || 0}
                  suffix="VNĐ"
                  prefix={<DollarCircleOutlined style={{ color: '#faad14', marginRight: 8 }} />}
                  formatter={(val) => Number(val).toLocaleString('vi-VN')}
                />
              </Card>
            </Col>
          </Row>

          {/* Thống kê chuyên sâu: Khóa FPT vs Chứng chỉ CCNA/IELTS + Hình thức & Tỷ lệ hoàn thành */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} lg={14}>
              <Card
                title={
                  <Space>
                    <BookOutlined style={{ color: '#F26F21' }} />
                    <span>Thống kê Khóa học FPT vs. Chứng chỉ CCNA/IELTS</span>
                  </Space>
                }
                bordered={false}
              >
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={adminData.courseCategoryComparison || [
                        { name: 'Khóa học FPT', courses: 0, students: 0 },
                        { name: 'Chứng chỉ (CCNA/IELTS)', courses: 0, students: 0 }
                      ]}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="courses" name="Số môn / Khóa học" fill="#F26F21" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="students" name="Số lượt Học viên ghi danh" fill="#722ED1" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-around' }}>
                  <Tag color="orange" style={{ padding: '4px 12px', fontSize: 13 }}>
                    Môn FPT: {adminData.courseStats?.fptCoursesCount || 0} khóa ({adminData.courseStats?.fptEnrollments || 0} HV)
                  </Tag>
                  <Tag color="purple" style={{ padding: '4px 12px', fontSize: 13 }}>
                    Chứng chỉ Quốc tế: {adminData.courseStats?.certificateCoursesCount || 0} khóa ({adminData.courseStats?.certificateEnrollments || 0} HV)
                  </Tag>
                </div>
              </Card>
            </Col>

            <Col xs={24} lg={10}>
              <Card
                title={
                  <Space>
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    <span>Hình thức Đào tạo & Tỷ lệ Hoàn thành</span>
                  </Space>
                }
                bordered={false}
              >
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={adminData.deliveryModeComparison || []}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, value }) => `${value}`}
                      >
                        {(adminData.deliveryModeComparison || []).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ marginTop: 16, padding: '12px 16px', background: '#fafafa', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text strong>Tỷ lệ hoàn thành đào tạo:</Text>
                    <Text strong style={{ color: '#52c41a' }}>
                      {adminData.kpi.completionRate || 0}%
                    </Text>
                  </div>
                  <Progress
                    percent={adminData.kpi.completionRate || 0}
                    strokeColor="#52c41a"
                    status="active"
                  />
                </div>
              </Card>
            </Col>
          </Row>

          {/* Biểu đồ tài chính và kết quả học lực */}
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={14}>
              <Card title="Thống kê Tài chính Học phí" bordered={false}>
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        {
                          name: 'Tổng tiền',
                          'Đã thu': adminData.financial?.paidAmount || 0,
                          'Còn nợ': adminData.financial?.debtAmount || 0
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
                    Tỷ lệ hoàn thành công nợ: <b>{adminData.financial?.paidRate || 0}%</b>
                  </Text>
                  <Progress percent={adminData.financial?.paidRate || 0} strokeColor="#52c41a" status="active" />
                </div>
              </Card>
            </Col>

            <Col xs={24} lg={10}>
              <Card title="Tỷ lệ Học lực & Qua môn toàn trường" bordered={false}>
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={adminData.academicPerformance || []}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={95}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {(adminData.academicPerformance || []).map((entry, index) => (
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
                    { title: 'Thời gian', render: (_, r) => `${r.startTime} - ${r.endTime}` },
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
          <Col xs={24} sm={12} lg={8} xl={4}>
            <Card bordered={false}>
              <Statistic title="Khóa học quay sẵn" value={teacherData?.summary.recordedCourseCount || 0} prefix={<ReadOutlined style={{ color: '#F26F21' }} />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <Card bordered={false}>
              <Statistic title="Lớp trực tuyến" value={teacherData?.summary.liveClassCount || 0} prefix={<VideoCameraOutlined style={{ color: '#1890ff' }} />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <Card bordered={false}>
              <Statistic title="Học viên đang học" value={teacherData?.summary.activeLearnerCount || 0} prefix={<TeamOutlined style={{ color: '#52c41a' }} />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={12} xl={4}>
            <Card bordered={false}>
              <Statistic title="Bài tập chờ chấm" value={teacherData?.summary.pendingGradingCount || 0} prefix={<FileTextOutlined style={{ color: '#fa8c16' }} />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={12} xl={4}>
            <Card bordered={false}>
              <Statistic title="Câu hỏi mới" value={teacherData?.summary.newQuestionCount || 0} prefix={<MessageOutlined style={{ color: '#722ed1' }} />} />
            </Card>
          </Col>
          <Col xs={24}>
            <Card
              title="Tổng quan giảng dạy"
              bordered={false}
              extra={<Space wrap>
                <Button onClick={() => navigate('/teacher-content')}>Nội dung & lớp học</Button>
                <Button onClick={() => navigate('/attendance')}>Điểm danh</Button>
                <Button onClick={() => navigate('/grades')}>Nhập điểm cuối khóa</Button>
                <Button type="primary" onClick={() => navigate('/assignments')}>Bài tập & chấm bài</Button>
                <Button onClick={() => navigate('/questions')}>Hỏi đáp</Button>
              </Space>}
            >
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <div>
                  <Text strong>Khóa học và lớp được phân công</Text>
                  <Table
                    size="small"
                    rowKey="id"
                    pagination={false}
                    dataSource={teacherData?.classes || []}
                    locale={{ emptyText: 'Bạn chưa được phân công lớp nào' }}
                    columns={[
                      { title: 'Lớp', dataIndex: 'classCode', render: code => <Text strong>{code}</Text> },
                      { title: 'Khóa học', dataIndex: 'courseName' },
                      { title: 'Hình thức', dataIndex: 'deliveryMode', render: mode => <Tag color={mode === 'LIVE_ONLINE' ? 'blue' : 'purple'}>{mode}</Tag> },
                      { title: 'Học kỳ', dataIndex: 'semester' },
                      { title: 'Trạng thái', dataIndex: 'status' },
                      { title: 'Học viên', dataIndex: 'activeLearnerCount' },
                      { title: 'Phòng học', dataIndex: 'meetUrl', render: url => url
                        ? <Button type="link" href={url} target="_blank" rel="noreferrer">Vào lớp</Button>
                        : <Text type="secondary">Chưa có link</Text> }
                    ]}
                  />
                </div>
                <div>
                  <Text strong>Lịch giảng dạy hàng tuần</Text>
                  <Table
                    size="small"
                    rowKey="id"
                    pagination={false}
                    locale={{ emptyText: 'Chưa có lịch giảng dạy' }}
                    dataSource={teacherData?.schedules || []}
                    columns={[
                      { title: 'Thứ', dataIndex: 'dayOfWeek', render: day => day === 8 ? 'Chủ Nhật' : `Thứ ${day}` },
                      { title: 'Ca', dataIndex: 'shift', render: shift => <Tag color="orange">Slot {shift}</Tag> },
                      { title: 'Thời gian', render: (_, item) => `${item.startTime} – ${item.endTime}` },
                      { title: 'Lớp', dataIndex: 'classCode' },
                      { title: 'Phòng', dataIndex: 'room' },
                      { title: 'Tham gia', dataIndex: 'meetUrl', render: url => url
                        ? <Button type="link" href={url} target="_blank" rel="noreferrer">Zoom / Meet</Button>
                        : <Text type="secondary">Chưa có link</Text> }
                    ]}
                  />
                </div>
              </Space>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="Lịch dạy hôm nay" bordered={false}>
              {todaySchedules.length === 0 ? (
                <Alert message="Hôm nay Thầy/Cô không có ca dạy nào theo lịch phân công." type="info" showIcon />
              ) : (
                <Table
                  dataSource={todaySchedules}
                  rowKey="id"
                  pagination={false}
                  columns={[
                    { title: 'Ca học', dataIndex: 'shift', render: (s) => <Tag color="orange">Slot {s}</Tag> },
                    { title: 'Thời gian', render: (_, r) => `${r.startTime} - ${r.endTime}` },
                    { title: 'Lớp', dataIndex: 'classCode', render: (c) => <Text strong>{c}</Text> },
                    { title: 'Môn học', dataIndex: 'courseName' },
                    { title: 'Phòng học', dataIndex: 'room', render: (r) => <Tag color="blue">{r}</Tag> },
                    { title: 'Tham gia', dataIndex: 'meetUrl', render: url => url
                      ? <Button type="link" href={url} target="_blank" rel="noreferrer">Vào lớp</Button>
                      : <Text type="secondary">Chưa có link</Text> }
                  ]}
                />
              )}
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="Cảnh báo chuyên cần — vắng trên 20%" bordered={false}>
              <Table
                size="small"
                rowKey={item => `${item.classId}-${item.studentId}`}
                dataSource={teacherData?.attendanceWarnings || []}
                pagination={{ pageSize: 5 }}
                locale={{ emptyText: 'Chưa có sinh viên vượt ngưỡng vắng 20%' }}
                columns={[
                  { title: 'Lớp', dataIndex: 'classCode' },
                  { title: 'Sinh viên', render: (_, item) => `${item.code} — ${item.fullName}` },
                  { title: 'Số buổi vắng', render: (_, item) => `${item.absentUnexcused}/${item.totalSessions}` },
                  { title: 'Tỷ lệ', dataIndex: 'absentRate', render: rate => <Tag color="error">{rate}%</Tag> }
                ]}
              />
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
};

export default DashboardPage;
