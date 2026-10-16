import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Input, Select, Space, Tag, Modal, Form, Typography, message, Drawer, Popconfirm, Row, Col } from 'antd';
import { PlusOutlined, UserAddOutlined, TeamOutlined, ApartmentOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Text, Title } = Typography;

const ClassesPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [classes, setClasses] = useState([]);
  const [courses, setCourses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modal Tạo Lớp Mới
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);

  // Drawer Danh Sách Học Viên trong Lớp
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [loadingClassDetail, setLoadingClassDetail] = useState(false);
  const [enrollStudentId, setEnrollStudentId] = useState(null);
  const [enrolling, setEnrolling] = useState(false);

  const fetchClasses = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/classes');
      if (res.success) {
        setClasses(res.data);
      }
    } catch (err) {
      message.error('Lỗi khi tải danh sách lớp học');
    } finally {
      setLoading(false);
    }
  };

  const fetchDependencies = async () => {
    try {
      const [coursesRes, teachersRes, studentsRes] = await Promise.all([
        apiClient.get('/courses'),
        apiClient.get('/teachers'),
        apiClient.get('/students', { params: { pageSize: 100 } })
      ]);
      if (coursesRes.success) setCourses(coursesRes.data);
      if (teachersRes.success) setTeachers(teachersRes.data);
      if (studentsRes.success) setAllStudents(studentsRes.data.items);
    } catch (err) {
      console.error('Error fetching dependencies:', err);
    }
  };

  useEffect(() => {
    fetchClasses();
    if (isAdmin) {
      fetchDependencies();
    }
  }, [isAdmin]);

  const handleCreateClass = async (values) => {
    try {
      setCreating(true);
      const res = await apiClient.post('/classes', values);
      if (res.success) {
        message.success('Mở lớp học phần mới thành công');
        setCreateModalOpen(false);
        createForm.resetFields();
        fetchClasses();
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi khi mở lớp học');
    } finally {
      setCreating(false);
    }
  };

  const openClassStudents = async (classItem) => {
    try {
      setLoadingClassDetail(true);
      setDrawerOpen(true);
      const res = await apiClient.get(`/classes/${classItem.id}`);
      if (res.success) {
        setSelectedClass(res.data);
      }
    } catch (err) {
      message.error('Lỗi lấy danh sách sinh viên lớp');
    } finally {
      setLoadingClassDetail(false);
    }
  };

  // Ghi danh học viên vào lớp (UC4.2: Tự động tạo Grade và TuitionInvoice)
  const handleEnrollStudent = async () => {
    if (!enrollStudentId) {
      message.warning('Vui lòng chọn học viên');
      return;
    }
    try {
      setEnrolling(true);
      const res = await apiClient.post(`/classes/${selectedClass.id}/enrollments`, {
        studentId: enrollStudentId
      });
      if (res.success) {
        message.success('Ghi danh học viên thành công (Đã tự động tạo Bảng điểm và Hóa đơn học phí)');
        setEnrollStudentId(null);
        openClassStudents(selectedClass);
        fetchClasses();
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi khi ghi danh học viên');
    } finally {
      setEnrolling(false);
    }
  };

  // Hủy ghi danh
  const handleRemoveEnrollment = async (studentId) => {
    try {
      const res = await apiClient.delete(`/classes/${selectedClass.id}/enrollments/${studentId}`);
      if (res.success) {
        message.success('Đã xóa học viên khỏi lớp');
        openClassStudents(selectedClass);
        fetchClasses();
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi hủy ghi danh');
    }
  };

  const columns = [
    {
      title: 'Mã Lớp',
      dataIndex: 'classCode',
      render: (code) => <Text strong style={{ color: '#F26F21', fontSize: 15 }}>{code}</Text>
    },
    {
      title: 'Môn học',
      dataIndex: ['course', 'name'],
      render: (name, r) => (
        <div>
          <Text strong>{name}</Text>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>{r.course?.courseCode} • {r.course?.credits} tín chỉ</div>
        </div>
      )
    },
    {
      title: 'Học kỳ',
      dataIndex: 'semester',
      render: (sem) => <Tag color="geekblue">{sem}</Tag>
    },
    {
      title: 'Giảng viên',
      dataIndex: ['teacher', 'fullName'],
      render: (t) => t ? <Tag color="blue">{t}</Tag> : <Tag color="default">Chưa phân công</Tag>
    },
    {
      title: 'Sĩ số',
      render: (_, r) => (
        <Space>
          <TeamOutlined style={{ color: '#8c8c8c' }} />
          <span><b>{r.currentStudents}</b> / {r.maxStudents}</span>
        </Space>
      )
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (st) => {
        if (st === 'ONGOING') return <Tag color="processing">Đang diễn ra</Tag>;
        if (st === 'COMPLETED') return <Tag color="success">Đã hoàn thành</Tag>;
        return <Tag color="warning">Sắp mở</Tag>;
      }
    },
    {
      title: 'Hành động',
      render: (_, record) => (
        <Button
          type="primary"
          ghost
          size="small"
          icon={<TeamOutlined />}
          onClick={() => openClassStudents(record)}
        >
          DS Học viên ({record.currentStudents})
        </Button>
      )
    }
  ];

  return (
    <div>
      <Card
        title="Quản lý Lớp học phần"
        extra={
          isAdmin && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
              onClick={() => setCreateModalOpen(true)}
            >
              Mở Lớp Học Phần Mới
            </Button>
          )
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={classes}
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Modal Mở Lớp Học Phần Mới */}
      <Modal
        title="Mở Lớp Học Phần Mới"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateClass}>
          <Form.Item
            name="classCode"
            label="Mã Lớp Học Phần"
            rules={[{ required: true, message: 'Nhập mã lớp (VD: SE1701-NJ)' }]}
          >
            <Input placeholder="SE1701-NJ" />
          </Form.Item>

          <Form.Item
            name="courseId"
            label="Chọn Môn Học"
            rules={[{ required: true, message: 'Vui lòng chọn môn học' }]}
          >
            <Select
              placeholder="Chọn môn học"
              options={courses.map(c => ({
                label: `${c.courseCode} - ${c.name} (${c.credits} TC)`,
                value: c.id
              }))}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="semester"
                label="Học kỳ"
                initialValue="SP26"
                rules={[{ required: true }]}
              >
                <Input placeholder="SP26, SU26, FA26..." />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="maxStudents"
                label="Sĩ số tối đa"
                initialValue={30}
                rules={[{ required: true }]}
              >
                <Input type="number" min={5} max={100} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="teacherId" label="Phân công Giảng viên phụ trách">
            <Select
              placeholder="Chọn giảng viên (hoặc để trống)"
              allowClear
              options={teachers.map(t => ({
                label: `${t.fullName} (${t.specialty})`,
                value: t.id
              }))}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setCreateModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={creating}
                style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
              >
                Tạo Lớp Học
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Drawer Quản Lý Học Viên Trong Lớp */}
      <Drawer
        title={
          <div>
            <span>Danh sách Sinh viên Lớp: </span>
            <Text strong style={{ color: '#F26F21' }}>{selectedClass?.classCode}</Text>
          </div>
        }
        width={720}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        {selectedClass && (
          <div>
            <div style={{ marginBottom: 20, padding: 12, background: '#fafafa', borderRadius: 8 }}>
              <div><b>Môn:</b> {selectedClass.course?.name} ({selectedClass.course?.courseCode})</div>
              <div><b>Học kỳ:</b> {selectedClass.semester} | <b>Giảng viên:</b> {selectedClass.teacher?.fullName || 'Chưa phân công'}</div>
              <div><b>Sĩ số:</b> {selectedClass.enrollments?.length} / {selectedClass.maxStudents} sinh viên</div>
            </div>

            {isAdmin && (
              <div style={{ marginBottom: 20, display: 'flex', gap: 10 }}>
                <Select
                  style={{ flex: 1 }}
                  placeholder="Chọn học viên cần thêm vào lớp..."
                  showSearch
                  optionFilterProp="label"
                  value={enrollStudentId}
                  onChange={setEnrollStudentId}
                  options={allStudents
                    .filter(s => !selectedClass.enrollments?.some(e => e.student.id === s.id))
                    .map(s => ({
                      label: `${s.code} - ${s.fullName} (${s.email})`,
                      value: s.id
                    }))}
                />
                <Button
                  type="primary"
                  icon={<UserAddOutlined />}
                  loading={enrolling}
                  onClick={handleEnrollStudent}
                  style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
                >
                  Ghi danh vào lớp
                </Button>
              </div>
            )}

            <Table
              size="small"
              rowKey="id"
              dataSource={selectedClass.enrollments}
              pagination={false}
              columns={[
                {
                  title: 'Mã SV',
                  dataIndex: ['student', 'code'],
                  render: (c) => <Text strong>{c}</Text>
                },
                {
                  title: 'Họ và Tên',
                  dataIndex: ['student', 'fullName']
                },
                {
                  title: 'Email',
                  dataIndex: ['student', 'email']
                },
                {
                  title: 'Bảng điểm',
                  render: (_, r) => (
                    <Tag color="cyan">
                      {r.grade?.totalScore !== null && r.grade?.totalScore !== undefined ? `Tổng: ${r.grade.totalScore}` : 'Chưa có điểm'}
                    </Tag>
                  )
                },
                {
                  title: 'Học phí',
                  render: (_, r) => {
                    const st = r.tuitionInvoice?.status;
                    if (st === 'PAID') return <Tag color="success">Đã nộp</Tag>;
                    if (st === 'PARTIAL') return <Tag color="warning">Nợ 1 phần</Tag>;
                    return <Tag color="error">Chưa nộp</Tag>;
                  }
                },
                ...(isAdmin
                  ? [
                      {
                        title: 'Xóa',
                        render: (_, r) => (
                          <Popconfirm
                            title="Bạn có chắc chắn muốn hủy ghi danh sinh viên này khỏi lớp?"
                            onConfirm={() => handleRemoveEnrollment(r.student.id)}
                            okText="Xóa"
                            cancelText="Hủy"
                          >
                            <Button danger size="small" type="link">
                              Hủy
                            </Button>
                          </Popconfirm>
                        )
                      }
                    ]
                  : [])
              ]}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default ClassesPage;
