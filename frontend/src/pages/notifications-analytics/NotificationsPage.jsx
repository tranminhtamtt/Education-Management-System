import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Tag, Space, Modal, Form, Input, Select, Typography, message, Badge } from 'antd';
import { PlusOutlined, NotificationOutlined, CheckCircleOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import dayjs from 'dayjs';

const { Text, Title, Paragraph } = Typography;

const NotificationsPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState([]);

  // Modal Gửi Thông Báo Mới (Admin)
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [sending, setSending] = useState(false);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/notifications');
      if (res.success) {
        setNotifications(res.data.notifications);
      }
    } catch (err) {
      message.error('Lỗi khi tải thông báo');
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
    fetchNotifications();
    if (isAdmin) {
      fetchClasses();
    }
  }, [isAdmin]);

  const handleMarkAsRead = async (id) => {
    try {
      await apiClient.patch(`/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, isRead: true } : n))
      );
      message.success('Đã đánh dấu đã đọc');
    } catch (err) {
      message.error('Lỗi cập nhật');
    }
  };

  const handleSendNotification = async (values) => {
    try {
      setSending(true);
      const res = await apiClient.post('/notifications/broadcast', values);
      if (res.success) {
        message.success('Phát hành thông báo thành công');
        setCreateModalOpen(false);
        form.resetFields();
        fetchNotifications();
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi gửi thông báo');
    } finally {
      setSending(false);
    }
  };

  const getTypeTag = (type) => {
    switch (type) {
      case 'ASSIGNMENT': return <Tag color="blue">Bài tập</Tag>;
      case 'GRADE': return <Tag color="green">Điểm thi</Tag>;
      case 'TUITION': return <Tag color="orange">Học phí</Tag>;
      case 'REQUEST': return <Tag color="purple">Đơn học vụ</Tag>;
      default: return <Tag color="default">Hệ thống</Tag>;
    }
  };

  const columns = [
    {
      title: 'Trạng thái',
      width: 100,
      render: (_, r) => (
        <Badge
          status={r.isRead ? 'default' : 'processing'}
          color={r.isRead ? '#d9d9d9' : '#F26F21'}
          text={r.isRead ? 'Đã đọc' : 'Mới'}
        />
      )
    },
    {
      title: 'Phân loại',
      dataIndex: 'type',
      width: 130,
      render: (t) => getTypeTag(t)
    },
    {
      title: 'Tiêu đề & Nội dung',
      render: (_, r) => (
        <div>
          <Text strong style={{ fontSize: 14 }}>{r.title}</Text>
          <Paragraph type="secondary" style={{ margin: '4px 0 0', fontSize: 13 }}>
            {r.message}
          </Paragraph>
        </div>
      )
    },
    {
      title: 'Thời gian gửi',
      dataIndex: 'createdAt',
      width: 160,
      render: (d) => dayjs(d).format('HH:mm DD/MM/YYYY')
    },
    {
      title: 'Hành động',
      width: 120,
      render: (_, r) => !r.isRead && (
        <Button
          size="small"
          type="link"
          icon={<CheckCircleOutlined />}
          onClick={() => handleMarkAsRead(r.id)}
        >
          Đã đọc
        </Button>
      )
    }
  ];

  return (
    <div>
      <Card
        title="Danh sách Thông báo Hệ thống & Lớp học"
        extra={
          isAdmin && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
              onClick={() => setCreateModalOpen(true)}
            >
              Phát Hành Thông Báo Mới
            </Button>
          )
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={notifications}
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Modal Phát Hành Thông Báo Mới Cho Admin */}
      <Modal
        title="Phát Hành Thông Báo Mới"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSendNotification}>
          <Form.Item
            name="title"
            label="Tiêu đề thông báo"
            rules={[{ required: true, message: 'Vui lòng nhập tiêu đề' }]}
          >
            <Input placeholder="Thông báo lịch nghỉ lễ / Thông báo học phí kỳ SP26" />
          </Form.Item>

          <Form.Item
            name="type"
            label="Phân loại thông báo"
            initialValue="SYSTEM"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { label: 'Hệ thống / Toàn trường (SYSTEM)', value: 'SYSTEM' },
                { label: 'Học phí (TUITION)', value: 'TUITION' },
                { label: 'Khảo thí & Điểm thi (GRADE)', value: 'GRADE' },
                { label: 'Bài tập (ASSIGNMENT)', value: 'ASSIGNMENT' }
              ]}
            />
          </Form.Item>

          <Form.Item name="classId" label="Gửi riêng theo Lớp học phần (Để trống nếu gửi toàn trường)">
            <Select
              placeholder="Chọn lớp học (hoặc bỏ trống gửi toàn trường)"
              allowClear
              options={classes.map(c => ({
                label: `${c.classCode} - ${c.course.name}`,
                value: c.id
              }))}
            />
          </Form.Item>

          <Form.Item
            name="message"
            label="Nội dung thông báo"
            rules={[{ required: true, message: 'Vui lòng nhập nội dung' }]}
          >
            <Input.TextArea rows={4} placeholder="Nội dung chi tiết thông báo..." />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setCreateModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={sending}
                style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
              >
                Gửi Thông Báo
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default NotificationsPage;
