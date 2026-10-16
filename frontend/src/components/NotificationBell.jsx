import React, { useState, useEffect } from 'react';
import { Badge, Button, Drawer, List, Typography, Space, Tag, message } from 'antd';
import { BellOutlined, CheckCircleOutlined } from '@ant-design/icons';
import apiClient from '../api/client';
import dayjs from 'dayjs';

const { Text, Paragraph } = Typography;

const NotificationBell = () => {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/notifications');
      if (res.success) {
        setUnreadCount(res.data.unreadCount);
        setNotifications(res.data.notifications);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Tự làm mới mỗi 30s
    return () => clearInterval(interval);
  }, []);

  const handleMarkAsRead = async (id) => {
    try {
      await apiClient.patch(`/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      message.error('Lỗi khi cập nhật thông báo');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiClient.patch('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
      message.success('Đã đánh dấu đọc tất cả');
    } catch (err) {
      message.error('Lỗi khi cập nhật thông báo');
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

  return (
    <>
      <Badge count={unreadCount} overflowCount={99} offset={[-2, 6]}>
        <Button
          type="text"
          shape="circle"
          icon={<BellOutlined style={{ fontSize: 20 }} />}
          onClick={() => {
            setOpen(true);
            fetchNotifications();
          }}
        />
      </Badge>

      <Drawer
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Thông báo ({unreadCount} chưa đọc)</span>
            {unreadCount > 0 && (
              <Button size="small" type="link" onClick={handleMarkAllRead}>
                Đọc tất cả
              </Button>
            )}
          </div>
        }
        placement="right"
        width={380}
        onClose={() => setOpen(false)}
        open={open}
      >
        <List
          loading={loading}
          dataSource={notifications}
          renderItem={(item) => (
            <List.Item
              style={{
                backgroundColor: item.isRead ? 'transparent' : '#FFF7E6',
                padding: '12px',
                borderRadius: '6px',
                marginBottom: '8px',
                cursor: 'pointer'
              }}
              onClick={() => !item.isRead && handleMarkAsRead(item.id)}
            >
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    {getTypeTag(item.type)}
                    <Text strong style={{ fontSize: 13 }}>{item.title}</Text>
                  </Space>
                  {!item.isRead && <Badge status="processing" color="#F26F21" />}
                </div>
                <Paragraph style={{ margin: '6px 0', fontSize: 13, color: '#595959' }}>
                  {item.message}
                </Paragraph>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {dayjs(item.createdAt).format('HH:mm DD/MM/YYYY')}
                  </Text>
                  {!item.isRead && (
                    <Button
                      type="link"
                      size="small"
                      icon={<CheckCircleOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAsRead(item.id);
                      }}
                    >
                      Đã đọc
                    </Button>
                  )}
                </div>
              </div>
            </List.Item>
          )}
        />
      </Drawer>
    </>
  );
};

export default NotificationBell;
