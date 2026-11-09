import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Typography, Button, Space, Modal, Form, Select, Input, message, Row, Col, Radio, Alert, Badge } from 'antd';
import { PlusOutlined, CalendarOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Text } = Typography;

const DAYS = [
  { label: 'Thứ Hai', value: 2, w1Date: '02/11', w2Date: '09/11' },
  { label: 'Thứ Ba', value: 3, w1Date: '03/11', w2Date: '10/11' },
  { label: 'Thứ Tư', value: 4, w1Date: '04/11', w2Date: '11/11' },
  { label: 'Thứ Năm', value: 5, w1Date: '05/11', w2Date: '12/11' },
  { label: 'Thứ Sáu', value: 6, w1Date: '06/11', w2Date: '13/11' },
  { label: 'Thứ Bảy', value: 7, w1Date: '07/11', w2Date: '14/11' },
  { label: 'Chủ Nhật', value: 8, w1Date: '08/11', w2Date: '15/11' }
];

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

  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('BOTH'); // 'WEEK1', 'WEEK2', 'BOTH'

  // Modal Xếp Lịch
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/schedules/my-schedule');
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
  }, [isAdmin]);

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
    const isFutureDate = session.date && session.date > '2026-11-09';

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
            {selectedWeek === 'WEEK1' && `Ngày ${day.w1Date}/2026`}
            {selectedWeek === 'WEEK2' && `Ngày ${day.w2Date}/2026`}
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

  return (
    <div>
      <Alert
        message="Thời khóa biểu Học kỳ SP26 (Kỳ học chuẩn 2 tuần: 02/11/2026 – 15/11/2026)"
        description={
          isStudent
            ? `Bạn đang theo học ${uniqueClassesCount} môn trong học kỳ SP26 (${schedules.length} buổi/tuần • Tổng ${schedules.length * 2} buổi trong 2 tuần). Trạng thái điểm danh từng buổi được đồng bộ trực tiếp với Báo cáo chuyên cần.`
            : 'Lịch học cố định theo tuần trong kỳ học 2 tuần (Tuần 1: 02/11 - 08/11/2026 & Tuần 2: 09/11 - 15/11/2026).'
        }
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Card
        title={
          <Space wrap>
            <CalendarOutlined style={{ color: '#F26F21' }} />
            <span>Thời khóa biểu Kỳ học 2 Tuần (Chuẩn 6 Slot FAP FPT)</span>
          </Space>
        }
        extra={
          <Space wrap>
            <Radio.Group
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              buttonStyle="solid"
            >
              <Radio.Button value="BOTH">Cả kỳ (2 Tuần)</Radio.Button>
              <Radio.Button value="WEEK1">Tuần 1 (02/11 – 08/11)</Radio.Button>
              <Radio.Button value="WEEK2">Tuần 2 (09/11 – 15/11)</Radio.Button>
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
        <Table
          rowKey="key"
          bordered
          columns={columns}
          dataSource={matrixData}
          loading={loading}
          pagination={false}
          scroll={{ x: 1100 }}
        />
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
