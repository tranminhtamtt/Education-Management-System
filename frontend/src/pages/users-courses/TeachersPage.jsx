import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Input, Space, Tag, Modal, Form, Typography, message, Select, Row, Col } from 'antd';
import { PlusOutlined, TeamOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Text } = Typography;

const TeachersPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const fetchTeachers = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/teachers');
      if (res.success) {
        setData(res.data);
      }
    } catch (err) {
      message.error('Lỗi khi tải danh sách giảng viên');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeachers();
  }, []);

  const handleCreate = async (values) => {
    try {
      setSubmitting(true);
      const res = await apiClient.post('/teachers', values);
      if (res.success) {
        message.success('Thêm giảng viên thành công');
        setModalOpen(false);
        form.resetFields();
        fetchTeachers();
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi khi tạo giảng viên');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      title: 'Mã GV',
      dataIndex: 'code',
      width: 110,
      render: (code) => <Text strong style={{ color: '#1890ff' }}>{code}</Text>
    },
    {
      title: 'Họ và Tên',
      dataIndex: 'fullName',
      render: (name) => <Text strong>{name}</Text>
    },
    {
      title: 'Học vị',
      dataIndex: 'degree',
      render: (deg) => <Tag color="geekblue">{deg}</Tag>
    },
    {
      title: 'Chuyên ngành',
      dataIndex: 'specialty'
    },
    {
      title: 'Email',
      dataIndex: 'email'
    },
    {
      title: 'Điện thoại',
      dataIndex: 'phone',
      render: (p) => p || '-'
    },
    {
      title: 'Lớp đang dạy',
      dataIndex: 'activeClassesCount',
      render: (count) => <Tag color="green">{count} lớp</Tag>
    }
  ];

  return (
    <div>
      <Card
        title="Quản lý Danh mục Giảng viên"
        extra={
          isAdmin && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
              onClick={() => setModalOpen(true)}
            >
              Thêm Giảng Viên
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
        title="Thêm Hồ Sơ Giảng Viên"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="fullName"
            label="Họ và Tên Giảng viên"
            rules={[{ required: true, message: 'Vui lòng nhập họ tên' }]}
          >
            <Input placeholder="Ví dụ: ThS. Nguyễn Hoài Nam" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="code" label="Mã GV (để trống tự sinh)">
                <Input placeholder="GV004" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="degree" label="Học vị" initialValue="Thạc sĩ">
                <Select
                  options={[
                    { label: 'Cử nhân', value: 'Cử nhân' },
                    { label: 'Kỹ sư', value: 'Kỹ sư' },
                    { label: 'Thạc sĩ', value: 'Thạc sĩ' },
                    { label: 'Tiến sĩ', value: 'Tiến sĩ' },
                    { label: 'Phó Giáo sư', value: 'Phó Giáo sư' }
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: 'Vui lòng nhập Email' },
                  { type: 'email', message: 'Email không đúng định dạng' }
                ]}
              >
                <Input placeholder="namnh@fpt.edu.vn" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="Số điện thoại">
                <Input placeholder="0981234567" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="specialty" label="Chuyên ngành bộ môn" initialValue="Kỹ thuật Phần mềm (SE)">
            <Input placeholder="Ví dụ: Khoa học Máy tính (CS)" />
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
                Lưu Giảng Viên
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TeachersPage;
