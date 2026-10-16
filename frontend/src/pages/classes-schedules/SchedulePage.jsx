import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Typography, Button, Space, Modal, Form, Select, Input, message, Row, Col } from 'antd';
import { PlusOutlined, CalendarOutlined, ClockCircleOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Title, Text } = Typography;

const DAYS = [
  { label: 'Thứ Hai', value: 2 },
  { label: 'Thứ Ba', value: 3 },
  { label: 'Thứ Tư', value: 4 },
  { label: 'Thứ Năm', value: 5 },
  { label: 'Thứ Sáu', value: 6 },
  { label: 'Thứ Bảy', value: 7 },
  { label: 'Chủ Nhật', value: 8 }
];

const SLOTS = [
  { shift: 1, time: '07:30 – 09:50' },
  { shift: 2, time: '10:00 – 12:20' },
  { shift: 3, time: '12:50 – 15:10' },
  { shift: 4, time: '15:20 – 17:40' },
  { shift: 5, time: '18:00 – 20:20' },
  { shift: 6, time: '20:30 – 22:50' }
];

const SchedulePage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState([]);

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
      const res = await apiClient.get('/classes');
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
      // Bắt lỗi xung đột trùng phòng hoặc trùng GV theo Conflict Detection
      message.error(err.response?.data?.message || 'Lỗi khi xếp lịch học');
    } finally {
      setSubmitting(false);
    }
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
      // Tìm lịch học khớp với Slot và Thứ
      const items = schedules.filter(s => s.shift === slot.shift && s.dayOfWeek === day.value);
      row[day.value] = items;
    });

    return row;
  });

  const columns = [
    {
      title: 'Ca học (Slot)',
      dataIndex: 'slotInfo',
      width: 130,
      fixed: 'left',
      align: 'center'
    },
    ...DAYS.map(day => ({
      title: day.label,
      dataIndex: day.value,
      align: 'center',
      render: (items) => {
        if (!items || items.length === 0) return <span style={{ color: '#d9d9d9' }}>-</span>;
        return (
          <Space direction="vertical" style={{ width: '100%' }} size={4}>
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
                <div style={{ fontSize: 12, fontWeight: 500, color: '#262626' }}>
                  {item.courseCode} - {item.courseName}
                </div>
                <div style={{ fontSize: 11, color: '#595959', marginTop: 2 }}>
                  Phòng: <Tag color="blue" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>{item.room}</Tag>
                </div>
                <div style={{ fontSize: 11, color: '#8c8c8c' }}>
                  GV: {item.teacherName}
                </div>
              </div>
            ))}
          </Space>
        );
      }
    }))
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <CalendarOutlined style={{ color: '#F26F21' }} />
            <span>Thời khóa biểu tuần (Chuẩn 6 Slot FAP FPT)</span>
          </Space>
        }
        extra={
          isAdmin && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
              onClick={() => setModalOpen(true)}
            >
              Xếp Lịch Học Mới
            </Button>
          )
        }
      >
        <Table
          rowKey="key"
          bordered
          columns={columns}
          dataSource={matrixData}
          loading={loading}
          pagination={false}
          scroll={{ x: 1000 }}
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
