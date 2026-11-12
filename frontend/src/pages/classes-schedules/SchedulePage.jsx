import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Typography, Button, Space, Modal, Form, Select, Input, message, Row, Col, Radio, Alert, Badge, Grid, Empty } from 'antd';
import { PlusOutlined, CalendarOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import dayjs from 'dayjs';

const { Text } = Typography;

const SLOTS = [
  { shift: 1, time: '07:30 – 09:50' },
  { shift: 2, time: '10:00 – 12:20' },
  { shift: 3, time: '12:50 – 15:10' },
  { shift: 4, time: '15:20 – 17:40' },
  { shift: 5, time: '18:00 – 20:20' },
  { shift: 6, time: '20:30 – 22:50' }
];

const ATTENDANCE_BADGE = {
  PRESENT: { color: 'success', text: 'Có mặt', icon: <CheckCircleOutlined /> },
  LATE: { color: 'warning', text: 'Đi muộn', icon: <ClockCircleOutlined /> },
  ABSENT_EXCUSED: { color: 'purple', text: 'Nghỉ có phép', icon: <ExclamationCircleOutlined /> },
  ABSENT_UNEXCUSED: { color: 'error', text: 'Vắng mặt', icon: <CloseCircleOutlined /> }
};

const SchedulePage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isStudent = user?.role === 'STUDENT';
  const isTeacher = user?.role === 'TEACHER';

  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('BOTH'); // 'WEEK1', 'WEEK2', 'BOTH'
  const [weekStart, setWeekStart] = useState(() => dayjs().subtract((dayjs().day() + 6) % 7, 'day').format('YYYY-MM-DD'));
  const DAYS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'].map((label, index) => ({
    label, value: index + 2, w1Date: dayjs(weekStart).add(index, 'day').format('DD/MM/YYYY'), w2Date: dayjs(weekStart).add(index + 7, 'day').format('DD/MM/YYYY')
  }));

  // Modal Xếp Lịch
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/schedules/my-schedule', { params: { weekStart } });
      if (res.success) {
        setSchedules(res.data);
      }
    } catch (err) {
      message.error('Lỗi khi tải thời khóa biểu');
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const res = await apiClient.get('/classes', { params: { status: 'ONGOING' } });
      if (res.success) {
        setClasses(res.data);
      }
    } catch (err) {
      console.error('Error fetching classes:', err);
    }
  };

  useEffect(() => {
    fetchSchedules();
    if (isAdmin) {
      fetchClasses();
    }
  }, [isAdmin, weekStart]);

  // Học viên: biết khóa nào không nằm trên thời khóa biểu và vì sao (video tự học, chờ thanh toán, sắp khai giảng).
  const screens = Grid.useBreakpoint();
  const [myCourses, setMyCourses] = useState([]);
  useEffect(() => {
    if (isStudent) apiClient.get('/my-courses').then(res => setMyCourses(res.data || [])).catch(() => setMyCourses([]));
  }, [isStudent]);

  // Xếp lịch học mới (Admin)
  const handleCreateSchedule = async (values) => {
    try {
      setSubmitting(true);
      const res = await apiClient.post(`/classes/${values.classId}/schedules`, {
        dayOfWeek: values.dayOfWeek,
        shift: values.shift,
        room: values.room
      });
      if (res.success) {
        message.success('Xếp lịch học thành công');
        setModalOpen(false);
        form.resetFields();
        fetchSchedules();
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi khi xếp lịch học');
    } finally {
      setSubmitting(false);
    }
  };

  const renderSessionBadge = (session, weekLabel) => {
    if (!isStudent || !session) return null;
    const statusInfo = session.status ? ATTENDANCE_BADGE[session.status] : null;
    const shortDate = session.date ? session.date.slice(8, 10) + '/' + session.date.slice(5, 7) : '';
    const isFutureDate = session.date && session.date > dayjs().format('YYYY-MM-DD');

    return (
      <div style={{ marginTop: 4, fontSize: 11 }}>
        <Tag
          color={statusInfo ? statusInfo.color : 'default'}
          icon={statusInfo ? statusInfo.icon : <ClockCircleOutlined />}
          style={{ fontSize: 10, padding: '0 5px', margin: 0 }}
        >
          {weekLabel} ({shortDate}): {statusInfo ? statusInfo.text : isFutureDate ? 'Chưa học' : 'Chưa điểm danh'}
        </Tag>
      </div>
    );
  };

  // Chuẩn bị dữ liệu hiển thị dạng Ma trận (Slot 1-6 x 7 ngày)
  const matrixData = SLOTS.map(slot => {
    const row = {
      key: slot.shift,
      slotInfo: (
        <div>
          <Text strong style={{ color: '#F26F21' }}>Slot {slot.shift}</Text>
          <div style={{ fontSize: 11, color: '#8c8c8c' }}>{slot.time}</div>
        </div>
      )
    };

    DAYS.forEach(day => {
      const items = schedules.filter(s => s.shift === slot.shift && s.dayOfWeek === day.value);
      row[day.value] = items;
    });

    return row;
  });

  const columns = [
    {
      title: 'Ca học (Slot)',
      dataIndex: 'slotInfo',
      width: 125,
      fixed: 'left',
      align: 'center'
    },
    ...DAYS.map(day => ({
      title: (
        <div>
          <div>{day.label}</div>
          <div style={{ fontSize: 11, fontWeight: 400, color: '#8c8c8c' }}>
            {selectedWeek === 'WEEK1' && `Ngày ${day.w1Date}`}
            {selectedWeek === 'WEEK2' && `Ngày ${day.w2Date}`}
            {selectedWeek === 'BOTH' && `T1: ${day.w1Date} • T2: ${day.w2Date}`}
          </div>
        </div>
      ),
      dataIndex: day.value,
      align: 'center',
      render: (items) => {
        if (!items || items.length === 0) return <span style={{ color: '#d9d9d9' }}>-</span>;
        return (
          <Space direction="vertical" style={{ width: '100%' }} size={6}>
            {items.map(item => (
              <div
                key={item.id}
                style={{
                  background: '#FFF7E6',
                  border: '1px solid #FFD591',
                  borderRadius: 6,
                  padding: '6px 8px',
                  textAlign: 'left'
                }}
              >
                <div style={{ fontWeight: 700, color: '#D46B08', fontSize: 13 }}>
                  {item.classCode}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#262626' }}>
                  {item.courseCode} - {item.courseName}
                </div>
                <div style={{ fontSize: 11, color: '#595959', marginTop: 2 }}>
                  Phòng: <Tag color="blue" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>{item.room}</Tag>
                </div>
                <div style={{ fontSize: 11, color: '#8c8c8c' }}>
                  GV: {item.teacherName}
                </div>
                {item.meetUrl && /^https?:\/\//i.test(item.meetUrl) && <Button type="link" href={item.meetUrl} target="_blank" rel="noreferrer" size="small">Vào phòng học Online</Button>}
                {(selectedWeek === 'WEEK1' || selectedWeek === 'BOTH') &&
                  renderSessionBadge(item.week1Session, 'Tuần 1')}
                {(selectedWeek === 'WEEK2' || selectedWeek === 'BOTH') &&
                  renderSessionBadge(item.week2Session, 'Tuần 2')}
              </div>
            ))}
          </Space>
        );
      }
    }))
  ];

  const uniqueClassesCount = new Set(schedules.map(s => s.classId)).size;
  const scheduledClassIds = new Set(schedules.map(s => s.classId));
  const offTimetable = myCourses.filter(e => !scheduledClassIds.has(e.classId));
  const offReason = e => e.class?.course?.deliveryMode === 'RECORDED'
    ? 'Khóa video – tự học, không có lịch'
    : e.status === 'PENDING_PAYMENT' ? 'Chờ thanh toán – lịch hiện sau khi thanh toán'
    : e.class?.status === 'UPCOMING' ? 'Sắp khai giảng' : 'Lớp đã kết thúc';
  // Danh sách theo ngày cho điện thoại (thay cho bảng 7 cột phải cuộn ngang)
  const mobileList = isStudent && !screens.md;
  const weeks = selectedWeek === 'BOTH' ? [0, 1] : selectedWeek === 'WEEK1' ? [0] : [1];
  const dayGroups = weeks.flatMap(w => DAYS.map(day => ({
    key: `${w}-${day.value}`,
    label: `${day.label} ${w === 0 ? day.w1Date : day.w2Date}`,
    items: schedules.filter(s => s.dayOfWeek === day.value).sort((a, b) => a.shift - b.shift).map(s => ({ ...s, session: w === 0 ? s.week1Session : s.week2Session }))
  }))).filter(g => g.items.length);

  if (isTeacher) {
    return (
      <Card title="Thời khóa biểu giảng dạy hàng tuần" bordered={false} loading={loading}>
        <Alert
          type="info"
          showIcon
          message="Lịch dạy lặp lại theo thứ và ca học"
          description="Sử dụng nút Zoom / Google Meet để vào lớp trực tuyến. Nếu lớp chưa có đường dẫn, cập nhật tại mục Nội dung & lớp học."
          style={{ marginBottom: 16 }}
        />
        <Table
          rowKey="id"
          dataSource={schedules}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'Bạn chưa có lịch giảng dạy được phân công' }}
          columns={[
            { title: 'Ngày', dataIndex: 'dayOfWeek', render: day => day === 8 ? 'Chủ Nhật' : `Thứ ${day}` },
            { title: 'Ca', dataIndex: 'shift', render: shift => <Tag color="orange">Slot {shift}</Tag> },
            { title: 'Thời gian', render: (_, item) => `${item.startTime} – ${item.endTime}` },
            { title: 'Khóa học', render: (_, item) => <><Text strong>{item.courseCode}</Text><br />{item.courseName}</> },
            { title: 'Lớp', dataIndex: 'classCode' },
            { title: 'Phòng', dataIndex: 'room' },
            {
              title: 'Lớp trực tuyến',
              dataIndex: 'meetUrl',
              render: url => url
                ? <Button type="primary" size="small" href={url} target="_blank" rel="noreferrer">Zoom / Meet</Button>
                : <Text type="secondary">Chưa có link</Text>
            }
          ]}
        />
      </Card>
    );
  }

  return (
    <div>
      <Alert
        message={`Lịch học từ ${dayjs(weekStart).format('DD/MM/YYYY')} đến ${dayjs(weekStart).add(13, 'day').format('DD/MM/YYYY')}`}
        description={
          isStudent
            ? `Bạn có ${uniqueClassesCount} lớp Live (${schedules.length} buổi/tuần). Trạng thái điểm danh được lấy từ dữ liệu của bạn.`
            : 'Xem lịch giảng dạy và phòng học theo tuần.'
        }
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      {isStudent && offTimetable.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${offTimetable.length} khóa học không có trên thời khóa biểu`}
          description={<div>{offTimetable.map(e => <div key={e.id}>• <b>{e.class.course.name}</b> — {offReason(e)}</div>)}</div>}
        />
      )}

      <Card
        title={
          <Space wrap>
            <CalendarOutlined style={{ color: '#F26F21' }} />
            <span>Thời khóa biểu</span>
          </Space>
        }
        extra={
          <Space wrap>
            <Button onClick={() => setWeekStart(dayjs(weekStart).subtract(7, 'day').format('YYYY-MM-DD'))}>Tuần trước</Button>
            <Button onClick={() => setWeekStart(dayjs(weekStart).add(7, 'day').format('YYYY-MM-DD'))}>Tuần sau</Button>
            <Radio.Group
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              buttonStyle="solid"
            >
              <Radio.Button value="BOTH">Hai tuần</Radio.Button>
              <Radio.Button value="WEEK1">Tuần đã chọn</Radio.Button>
              <Radio.Button value="WEEK2">Tuần kế tiếp</Radio.Button>
            </Radio.Group>
            {isAdmin && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
                onClick={() => setModalOpen(true)}
              >
                Xếp Lịch Học Mới
              </Button>
            )}
          </Space>
        }
      >
        {mobileList ? (
          dayGroups.length === 0 ? <Empty description="Không có buổi học Live trong khoảng thời gian này" /> : (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {dayGroups.map(g => (
                <div key={g.key}>
                  <Text strong style={{ color: '#F26F21' }}>{g.label}</Text>
                  {g.items.map(item => (
                    <div key={item.id} style={{ background: '#FFF7E6', border: '1px solid #FFD591', borderRadius: 8, padding: '8px 10px', marginTop: 6 }}>
                      <div style={{ fontWeight: 700, color: '#D46B08' }}>{item.startTime}–{item.endTime} · {item.courseName}</div>
                      <div style={{ fontSize: 12, color: '#595959' }}>{item.classCode} · GV: {item.teacherName}</div>
                      <Space wrap size={4} style={{ marginTop: 4 }}>
                        {renderSessionBadge(item.session, 'Buổi')}
                        {item.meetUrl && /^https?:\/\//i.test(item.meetUrl) && <Button type="link" size="small" href={item.meetUrl} target="_blank" rel="noreferrer" style={{ padding: 0 }}>Vào phòng học Online</Button>}
                      </Space>
                    </div>
                  ))}
                </div>
              ))}
            </Space>
          )
        ) : (
        <Table
          rowKey="key"
          bordered
          columns={columns}
          dataSource={matrixData}
          loading={loading}
          pagination={false}
          scroll={{ x: 1100 }}
        />
        )}
      </Card>

      {/* Modal Xếp Lịch Học Mới Cho Admin */}
      <Modal
        title="Xếp Lịch Học Cho Lớp Học Phần"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreateSchedule}>
          <Form.Item
            name="classId"
            label="Chọn Lớp Học Phần"
            rules={[{ required: true, message: 'Vui lòng chọn lớp học' }]}
          >
            <Select
              placeholder="Chọn lớp học"
              options={classes.map(c => ({
                label: `${c.classCode} - ${c.course.name} (Học kỳ: ${c.semester})`,
                value: c.id
              }))}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="dayOfWeek"
                label="Thứ trong tuần"
                rules={[{ required: true }]}
              >
                <Select
                  placeholder="Chọn thứ"
                  options={DAYS.map(d => ({ label: d.label, value: d.value }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="shift"
                label="Ca học (Slot)"
                rules={[{ required: true }]}
              >
                <Select
                  placeholder="Chọn Slot"
                  options={SLOTS.map(s => ({
                    label: `Slot ${s.shift} (${s.time})`,
                    value: s.shift
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="room"
            label="Phòng học"
            rules={[{ required: true, message: 'Vui lòng nhập phòng học (VD: BE-301)' }]}
          >
            <Input placeholder="BE-301, AL-205, Lab-01..." />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={submitting}
                style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
              >
                Lưu Lịch Học (Kiểm tra xung đột)
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SchedulePage;
