import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Input, Select, Space, Tag, Modal, Form, Typography, message, Row, Col, Descriptions, Divider, Tabs } from 'antd';
import { PlusOutlined, SearchOutlined, EyeOutlined, UserOutlined, BookOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const StudentsPage = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal Thêm Học Viên
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);

  // Modal Hồ Sơ 360
  const [profile360ModalOpen, setProfile360ModalOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const fetchStudents = async (page = 1, pageSize = 10, searchKey = search, status = statusFilter) => {
    try {
      setLoading(true);
      const res = await apiClient.get('/students', {
        params: { page, pageSize, search: searchKey, status }
      });
      if (res.success) {
        setData(res.data.items);
        setPagination({
          current: res.data.pagination.page,
          pageSize: res.data.pagination.pageSize,
          total: res.data.pagination.total
        });
      }
    } catch (err) {
      message.error('Lỗi khi tải danh sách học viên');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const handleTableChange = (pag) => {
    fetchStudents(pag.current, pag.pageSize, search, statusFilter);
  };

  const handleSearch = () => {
    fetchStudents(1, pagination.pageSize, search, statusFilter);
  };

  // Mở hồ sơ 360
  const handleViewProfile360 = async (studentId) => {
    try {
      setLoadingProfile(true);
      setProfile360ModalOpen(true);
      const res = await apiClient.get(`/students/${studentId}/profile-360`);
      if (res.success) {
        setSelectedProfile(res.data);
      }
    } catch (err) {
      message.error('Lỗi lấy hồ sơ 360 của học viên');
    } finally {
      setLoadingProfile(false);
    }
  };

  // Tạo học viên mới
  const handleCreateStudent = async (values) => {
    try {
      setCreating(true);
      const res = await apiClient.post('/students', values);
      if (res.success) {
        message.success('Thêm học viên mới thành công');
        setCreateModalOpen(false);
        createForm.resetFields();
        fetchStudents(pagination.current, pagination.pageSize);
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi khi tạo học viên');
    } finally {
      setCreating(false);
    }
  };

  const columns = [
    {
      title: 'Mã SV',
      dataIndex: 'code',
      width: 120,
      render: (code) => <Text strong style={{ color: '#F26F21' }}>{code}</Text>
    },
    {
      title: 'Họ và Tên',
      dataIndex: 'fullName',
      render: (name) => <Text strong>{name}</Text>
    },
    {
      title: 'Email',
      dataIndex: 'email'
    },
    {
      title: 'Điện thoại',
      dataIndex: 'phone',
      render: (phone) => phone || '-'
    },
    {
      title: 'Giới tính',
      dataIndex: ['profile', 'gender'],
      render: (g) => {
        if (g === 'MALE') return <Tag color="blue">Nam</Tag>;
        if (g === 'FEMALE') return <Tag color="magenta">Nữ</Tag>;
        return <Tag>Khác</Tag>;
      }
    },
    {
      title: 'Năm nhập học',
      dataIndex: ['profile', 'enrollmentYear'],
      render: (year) => year || '-'
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (status) => (
        <Tag color={status === 'ACTIVE' ? 'success' : 'error'}>
          {status === 'ACTIVE' ? 'Đang học' : 'Bảo lưu/Nghỉ'}
        </Tag>
      )
    },
    {
      title: 'Hành động',
      width: 140,
      render: (_, record) => (
        <Button
          type="primary"
          ghost
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handleViewProfile360(record.id)}
        >
          Hồ sơ 360°
        </Button>
      )
    }
  ];

  return (
    <div>
      <Card
        title="Quản lý Danh sách Học viên"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
            onClick={() => setCreateModalOpen(true)}
          >
            Thêm Học Viên Mới
          </Button>
        }
      >
        <Space style={{ marginBottom: 16 }} wrap>
          <Input
            placeholder="Tìm theo Mã SV, Họ tên, Email..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 260 }}
          />
          <Select
            placeholder="Lọc trạng thái"
            allowClear
            value={statusFilter || undefined}
            onChange={(val) => {
              setStatusFilter(val || '');
              fetchStudents(1, pagination.pageSize, search, val || '');
            }}
            style={{ width: 160 }}
            options={[
              { label: 'Đang học', value: 'ACTIVE' },
              { label: 'Bảo lưu / Tạm ngưng', value: 'INACTIVE' }
            ]}
          />
          <Button type="primary" onClick={handleSearch}>
            Tìm kiếm
          </Button>
        </Space>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={pagination}
          onChange={handleTableChange}
        />
      </Card>

      {/* Modal Thêm Học Viên */}
      <Modal
        title="Tạo Hồ Sơ Học Viên Mới"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateStudent}>
          <Form.Item
            name="fullName"
            label="Họ và Tên"
            rules={[{ required: true, message: 'Vui lòng nhập họ tên' }]}
          >
            <Input placeholder="Ví dụ: Nguyễn Văn An" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="code"
                label="Mã SV (để trống tự sinh)"
              >
                <Input placeholder="Ví dụ: HE180001" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="gender"
                label="Giới tính"
                initialValue="MALE"
              >
                <Select
                  options={[
                    { label: 'Nam', value: 'MALE' },
                    { label: 'Nữ', value: 'FEMALE' },
                    { label: 'Khác', value: 'OTHER' }
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
                  { type: 'email', message: 'Email không hợp lệ' }
                ]}
              >
                <Input placeholder="annvhe180001@fpt.edu.vn" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="Số điện thoại">
                <Input placeholder="0901234567" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="enrollmentYear" label="Khóa / Năm nhập học" initialValue={2026}>
                <Input type="number" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="address" label="Địa chỉ">
                <Input placeholder="Hà Nội, Việt Nam" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setCreateModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={creating}
                style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
              >
                Lưu Học Viên
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Hồ Sơ 360 Độ */}
      <Modal
        title={
          <Space>
            <UserOutlined style={{ color: '#F26F21' }} />
            <span>Hồ Sơ Học Viên 360° - {selectedProfile?.personalInfo?.fullName}</span>
          </Space>
        }
        open={profile360ModalOpen}
        onCancel={() => setProfile360ModalOpen(false)}
        width={850}
        footer={[
          <Button key="close" onClick={() => setProfile360ModalOpen(false)}>
            Đóng
          </Button>
        ]}
      >
        {loadingProfile ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>Đang tải hồ sơ...</div>
        ) : selectedProfile ? (
          <div>
            <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }}>
              <Descriptions.Item label="Mã SV"><b>{selectedProfile.personalInfo.code}</b></Descriptions.Item>
              <Descriptions.Item label="Họ tên">{selectedProfile.personalInfo.fullName}</Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <Tag color={selectedProfile.personalInfo.status === 'ACTIVE' ? 'success' : 'error'}>
                  {selectedProfile.personalInfo.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Email">{selectedProfile.personalInfo.email}</Descriptions.Item>
              <Descriptions.Item label="Điện thoại">{selectedProfile.personalInfo.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="Khóa">{selectedProfile.personalInfo.profile?.enrollmentYear || '-'}</Descriptions.Item>
              <Descriptions.Item label="Điểm GPA tích lũy">
                <Text strong style={{ color: '#F26F21', fontSize: 16 }}>
                  {selectedProfile.academicSummary.gpa} / 10.0
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Môn đã qua">{selectedProfile.academicSummary.passedCourses}</Descriptions.Item>
              <Descriptions.Item label="Môn trượt">{selectedProfile.academicSummary.failedCourses}</Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: '16px 0' }} />

            <Title level={5}>Danh sách Lớp học phần & Kết quả</Title>
            <Table
              size="small"
              rowKey="classId"
              dataSource={selectedProfile.classes}
              pagination={false}
              columns={[
                { title: 'Lớp', dataIndex: 'classCode', render: (c) => <Tag color="blue">{c}</Tag> },
                { title: 'Môn học', dataIndex: 'courseName' },
                { title: 'Học kỳ', dataIndex: 'semester' },
                { title: 'Giảng viên', dataIndex: 'teacher' },
                {
                  title: 'Điểm tổng kết',
                  render: (_, r) => r.grade?.totalScore !== null && r.grade?.totalScore !== undefined
                    ? <Text strong>{r.grade.totalScore}</Text>
                    : '-'
                },
                {
                  title: 'Kết quả',
                  render: (_, r) => {
                    if (r.grade?.isBanned) return <Tag color="error">CẤM THI</Tag>;
                    if (r.grade?.isPassed) return <Tag color="success">QUA MÔN</Tag>;
                    if (r.grade?.totalScore !== null) return <Tag color="warning">TRƯỢT</Tag>;
                    return <Tag color="default">Đang học</Tag>;
                  }
                },
                {
                  title: 'Học phí',
                  render: (_, r) => {
                    const st = r.tuition?.status;
                    if (st === 'PAID') return <Tag color="success">Đã hoàn thành</Tag>;
                    if (st === 'PARTIAL') return <Tag color="orange">Đóng 1 phần</Tag>;
                    return <Tag color="error">Chưa đóng</Tag>;
                  }
                }
              ]}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default StudentsPage;
