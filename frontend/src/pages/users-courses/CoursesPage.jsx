import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Input, Space, Tag, Modal, Form, Typography, message, InputNumber, Row, Col } from 'antd';
import { PlusOutlined, BookOutlined, LinkOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Text } = Typography;

const CoursesPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/courses');
      if (res.success) {
        setData(res.data);
      }
    } catch (err) {
      message.error('Lỗi khi tải danh mục môn học');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const handleCreate = async (values) => {
    try {
      setSubmitting(true);
      const res = await apiClient.post('/courses', values);
      if (res.success) {
        message.success('Tạo môn học mới thành công');
        setModalOpen(false);
        form.resetFields();
        fetchCourses();
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi khi tạo môn học');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      title: 'Mã Môn',
      dataIndex: 'courseCode',
      width: 120,
      render: (code) => <Text strong style={{ color: '#F26F21' }}>{code}</Text>
    },
    {
      title: 'Tên Môn Học',
      dataIndex: 'name',
      render: (name) => <Text strong>{name}</Text>
    },
    {
      title: 'Số Tín Chỉ',
      dataIndex: 'credits',
      width: 110,
      render: (credits) => <Tag color="blue">{credits} TC</Tag>
    },
    {
      title: 'Tổng số buổi',
      dataIndex: 'totalSessions',
      width: 120,
      render: (s) => `${s} buổi`
    },
    {
      title: 'Học phí cơ bản',
      dataIndex: 'baseTuitionFee',
      render: (fee) => `${Number(fee).toLocaleString('vi-VN')} VNĐ`
    },
    {
      title: 'Số lớp đã mở',
      dataIndex: 'totalClasses',
      width: 120,
      render: (c) => <Tag color="green">{c || 0} lớp</Tag>
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 120,
      render: (st) => st === 'INACTIVE' ? <Tag color="default">Ngưng mở</Tag> : <Tag color="success">Đang mở</Tag>
    },
    {
      title: 'Syllabus',
      dataIndex: 'syllabusUrl',
      render: (url) => url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <LinkOutlined /> Xem đề cương
        </a>
      ) : '-'
    }
  ];

  return (
    <div>
      <Card
        title="Danh mục Môn học / Khóa đào tạo"
        extra={
          isAdmin && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
              onClick={() => setModalOpen(true)}
            >
              Thêm Môn Học
            </Button>
          )
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title="Thêm Môn Học Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Row gutter={16}>
            <Col span={10}>
              <Form.Item
                name="courseCode"
                label="Mã môn học"
                rules={[{ required: true, message: 'Nhập mã môn (VD: PRN231)' }]}
              >
                <Input placeholder="PRN231" />
              </Form.Item>
            </Col>
            <Col span={14}>
              <Form.Item
                name="name"
                label="Tên môn học"
                rules={[{ required: true, message: 'Nhập tên môn học' }]}
              >
                <Input placeholder="Lập trình Node.js & Express" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="credits"
                label="Số tín chỉ"
                initialValue={3}
                rules={[{ required: true }]}
              >
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="totalSessions"
                label="Tổng số buổi học"
                initialValue={30}
              >
                <InputNumber min={10} max={60} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="baseTuitionFee"
            label="Mức học phí cơ bản (VNĐ)"
            initialValue={5400000}
            rules={[{ required: true }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(value) => value.replace(/\$\s?|(,*)/g, '')}
            />
          </Form.Item>

          <Form.Item name="description" label="Mô tả môn học">
            <Input.TextArea rows={3} placeholder="Mục tiêu đầu ra, cấu trúc môn học..." />
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
                Lưu Môn Học
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CoursesPage;
