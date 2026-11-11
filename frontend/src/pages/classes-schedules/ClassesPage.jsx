import React, { useState, useEffect } from 'react';
import {
  Table,
  Card,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Modal,
  Form,
  Typography,
  message,
  Drawer,
  Popconfirm,
  Row,
  Col,
  Tabs,
  Alert,
  Tooltip,
  Badge,
  Statistic
} from 'antd';
import {
  PlusOutlined,
  UserAddOutlined,
  TeamOutlined,
  ApartmentOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
  BookOutlined,
  LinkOutlined
} from '@ant-design/icons';
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
  const [drawerTab, setDrawerTab] = useState('enrolled');
  const [enrollStudentId, setEnrollStudentId] = useState(null);
  const [enrolling, setEnrolling] = useState(false);

  // Dữ liệu Phân tích Điều kiện tiên quyết (Prerequisite Advisor)
  const [advisorData, setAdvisorData] = useState(null);
  const [loadingAdvisor, setLoadingAdvisor] = useState(false);
  const [selectedEligibleKeys, setSelectedEligibleKeys] = useState([]);
  const [batchEnrolling, setBatchEnrolling] = useState(false);

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
      setDrawerTab('enrolled');
      setSelectedEligibleKeys([]);
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

  // Tải danh sách phân loại học viên đủ/không đủ điều kiện
  const fetchAdvisorData = async (classId) => {
    try {
      setLoadingAdvisor(true);
      const res = await apiClient.get(`/curriculum/eligible-students/${classId}`);
      if (res.success) {
        setAdvisorData(res.data);
      }
    } catch (err) {
      message.error('Lỗi phân tích điều kiện tiên quyết học viên');
    } finally {
      setLoadingAdvisor(false);
    }
  };

  useEffect(() => {
    if (drawerOpen && selectedClass && drawerTab === 'advisor') {
      fetchAdvisorData(selectedClass.id);
    }
  }, [drawerOpen, selectedClass?.id, drawerTab]);

  // Ghi danh học viên vào lớp (có hỗ trợ forceEnroll đặc cách)
  const handleEnrollStudent = async (force = false) => {
    if (!enrollStudentId) {
      message.warning('Vui lòng chọn học viên');
      return;
    }
    try {
      setEnrolling(true);
      const res = await apiClient.post(`/classes/${selectedClass.id}/enrollments`, {
        studentId: enrollStudentId,
        forceEnroll: force
      });
      if (res.success) {
        message.success('Ghi danh học viên thành công (Đã tự động tạo Bảng điểm và Hóa đơn học phí)');
        setEnrollStudentId(null);
        openClassStudents(selectedClass);
        fetchClasses();
      }
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.data?.canForce) {
        Modal.confirm({
          title: 'Cảnh báo điều kiện tiên quyết',
          content: errData.message + ' Bạn có muốn ghi danh đặc cách cho học viên này không?',
          okText: 'Đặc cách ghi danh',
          okType: 'danger',
          cancelText: 'Hủy bỏ',
          onOk: () => handleEnrollStudent(true)
        });
      } else {
        message.error(errData?.message || 'Lỗi khi ghi danh học viên');
      }
    } finally {
      setEnrolling(false);
    }
  };

  // Ghi danh nhanh hàng loạt sinh viên đủ điều kiện
  const handleBatchEnroll = async (studentIds) => {
    if (!studentIds || studentIds.length === 0) {
      message.warning('Vui lòng chọn ít nhất 1 sinh viên để xếp lớp');
      return;
    }
    try {
      setBatchEnrolling(true);
      const res = await apiClient.post(`/curriculum/batch-enroll/${selectedClass.id}`, {
        studentIds
      });
      if (res.success) {
        message.success(res.message);
        setSelectedEligibleKeys([]);
        // Tải lại chi tiết lớp và phân tích
        const classRes = await apiClient.get(`/classes/${selectedClass.id}`);
        if (classRes.success) {
          setSelectedClass(classRes.data);
        }
        fetchAdvisorData(selectedClass.id);
        fetchClasses();
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi khi xếp lớp hàng loạt');
    } finally {
      setBatchEnrolling(false);
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
      title: 'Phòng / Meet Live',
      dataIndex: 'meetUrl',
      render: (url) => url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <Tag color="cyan" icon={<LinkOutlined />}>Link Meet</Tag>
        </a>
      ) : <Tag color="default">Chưa có</Tag>
    },
    {
      title: 'Hành động',
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            ghost
            size="small"
            icon={<TeamOutlined />}
            onClick={() => openClassStudents(record)}
          >
            DS Học viên ({record.currentStudents})
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Card
        title="Quản lý Lớp học phần & Sắp xếp Lớp"
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
        <Form form={createForm} layout="vertical" onFinish={handleCreateClass} initialValues={{ maxStudents: 30 }}>
          <Form.Item
            name="classCode"
            label="Mã Lớp Học Phần"
            rules={[
              { required: true, message: 'Vui lòng nhập mã lớp' },
              { pattern: /^[A-Za-z0-9_-]+$/, message: 'Mã lớp không chứa khoảng trắng hoặc ký tự đặc biệt' }
            ]}
          >
            <Input placeholder="Ví dụ: SE1701-PRN231, SE1702-CSD201" />
          </Form.Item>

          <Form.Item
            name="courseId"
            label="Môn học"
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

          <Form.Item
            name="semester"
            label="Học kỳ"
            rules={[{ required: true, message: 'Vui lòng chọn hoặc nhập học kỳ' }]}
          >
            <Select
              placeholder="Chọn học kỳ"
              options={[
                { label: 'Spring 2026 (SP26)', value: 'SP26' },
                { label: 'Summer 2026 (SU26)', value: 'SU26' },
                { label: 'Fall 2026 (FA26)', value: 'FA26' }
              ]}
            />
          </Form.Item>

          <Form.Item name="teacherId" label="Giảng viên phụ trách">
            <Select
              placeholder="Chọn giảng viên (Tùy chọn)"
              allowClear
              options={teachers.map(t => ({
                label: `${t.code} - ${t.fullName} (${t.email})`,
                value: t.id
              }))}
            />
          </Form.Item>

          <Form.Item
            name="maxStudents"
            label="Sĩ số tối đa"
            rules={[{ required: true, message: 'Vui lòng nhập sĩ số tối đa' }]}
          >
            <Input type="number" min={1} max={100} />
          </Form.Item>

          <Form.Item name="meetUrl" label="Đường dẫn Google Meet / Zoom phòng học">
            <Input placeholder="https://meet.google.com/..." />
          </Form.Item>

          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button onClick={() => setCreateModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={creating}
                style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
              >
                Mở Lớp
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* Drawer Danh Sách Học Viên & Sắp Xếp Lớp Theo Điều Kiện Tiên Quyết */}
      <Drawer
        title={
          selectedClass
            ? `Lớp ${selectedClass.classCode} • ${selectedClass.course?.name} (${selectedClass.semester})`
            : 'Chi tiết lớp học'
        }
        width={850}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
      >
        {selectedClass && (
          <div>
            <Tabs
              activeKey={drawerTab}
              onChange={setDrawerTab}
              items={[
                {
                  key: 'enrolled',
                  label: (
                    <span>
                      <TeamOutlined /> Học viên hiện tại ({selectedClass.enrollments?.length || 0}/{selectedClass.maxStudents})
                    </span>
                  ),
                  children: (
                    <div>
                      {isAdmin && (
                        <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
                          <Row gutter={[12, 12]} align="middle">
                            <Col xs={24} md={16}>
                              <Select
                                showSearch
                                style={{ width: '100%' }}
                                placeholder="Chọn học viên cần thêm vào lớp..."
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
                            </Col>
                            <Col xs={24} md={8} style={{ textAlign: 'right' }}>
                              <Button
                                type="primary"
                                icon={<UserAddOutlined />}
                                loading={enrolling}
                                onClick={() => handleEnrollStudent(false)}
                                style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
                              >
                                Ghi danh vào lớp
                              </Button>
                            </Col>
                          </Row>
                        </Card>
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
                                {r.grade?.totalScore !== null && r.grade?.totalScore !== undefined
                                  ? `Tổng: ${r.grade.totalScore}`
                                  : 'Chưa có điểm'}
                              </Tag>
                            )
                          },
                          {
                            title: 'Học phí',
                            render: (_, r) => {
                              const st = r.tuitionInvoice?.status;
                              if (st === 'PAID') return <Tag color="success">Đã nộp</Tag>;
                              if (r.status === 'PENDING_PAYMENT') {
                                return <Tag color="warning">{st === 'PARTIAL' ? 'Đóng một phần · Chưa mở quyền học' : 'Chờ thanh toán'}</Tag>;
                              }
                              if (st === 'PARTIAL') return <Tag color="warning">Nợ 1 phần</Tag>;
                              return <Tag color="error">Chưa nộp</Tag>;
                            }
                          },
                          ...(isAdmin
                            ? [
                                {
                                  title: 'Hành động',
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
                  )
                },
                {
                  key: 'advisor',
                  label: (
                    <span>
                      <ThunderboltOutlined style={{ color: '#FA8C16' }} /> Sắp xếp lớp theo điều kiện tiên quyết
                    </span>
                  ),
                  children: (
                    <div>
                      {/* Tóm tắt điều kiện môn học */}
                      {advisorData?.targetClass && (
                        <Card size="small" style={{ marginBottom: 16, background: '#FFF7E6', borderColor: '#FFD591' }}>
                          <Row gutter={[16, 16]} align="middle">
                            <Col xs={24} md={14}>
                              <Text strong style={{ fontSize: 15, color: '#D46B08' }}>
                                Môn học: {advisorData.targetClass.course.courseCode} - {advisorData.targetClass.course.name}
                              </Text>
                              <div style={{ marginTop: 4 }}>
                                <Text type="secondary">Điều kiện tiên quyết: </Text>
                                {advisorData.targetClass.course.prerequisites?.length > 0 ? (
                                  advisorData.targetClass.course.prerequisites.map(p => (
                                    <Tag key={p} color="volcano" style={{ fontWeight: 600 }}>
                                      {p}
                                    </Tag>
                                  ))
                                ) : (
                                  <Tag color="green">Không yêu cầu môn tiên quyết</Tag>
                                )}
                              </div>
                            </Col>
                            <Col xs={24} md={10} style={{ textAlign: 'right' }}>
                              <Statistic
                                title="Chỗ trống còn lại"
                                value={advisorData.targetClass.availableSlots}
                                suffix={`/ ${advisorData.targetClass.maxStudents}`}
                                valueStyle={{
                                  color: advisorData.targetClass.availableSlots > 0 ? '#52c41a' : '#ff4d4f',
                                  fontWeight: 700
                                }}
                              />
                            </Col>
                          </Row>
                        </Card>
                      )}

                      <Tabs
                        defaultActiveKey="eligible"
                        items={[
                          {
                            key: 'eligible',
                            label: (
                              <span>
                                <CheckCircleOutlined style={{ color: '#52c41a' }} /> Đủ điều kiện xếp lớp ({advisorData?.eligibleStudents?.length || 0})
                              </span>
                            ),
                            children: (
                              <div>
                                {advisorData?.targetClass?.availableSlots > 0 && (advisorData?.eligibleStudents?.length || 0) > 0 && (
                                  <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text type="secondary">
                                      Đã chọn {selectedEligibleKeys.length} sinh viên đủ điều kiện
                                    </Text>
                                    <Space>
                                      <Button
                                        type="primary"
                                        disabled={selectedEligibleKeys.length === 0}
                                        loading={batchEnrolling}
                                        onClick={() => handleBatchEnroll(selectedEligibleKeys)}
                                        style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
                                      >
                                        Xếp vào lớp ({selectedEligibleKeys.length})
                                      </Button>
                                      <Button
                                        type="primary"
                                        ghost
                                        loading={batchEnrolling}
                                        onClick={() =>
                                          handleBatchEnroll(
                                            advisorData.eligibleStudents.slice(0, advisorData.targetClass.availableSlots).map(s => s.id)
                                          )
                                        }
                                      >
                                        Xếp nhanh tất cả ({Math.min(advisorData.eligibleStudents.length, advisorData.targetClass.availableSlots)} SV)
                                      </Button>
                                    </Space>
                                  </div>
                                )}

                                <Table
                                  size="small"
                                  rowKey="id"
                                  loading={loadingAdvisor}
                                  rowSelection={{
                                    selectedRowKeys: selectedEligibleKeys,
                                    onChange: setSelectedEligibleKeys,
                                    getCheckboxProps: () => ({
                                      disabled: advisorData?.targetClass?.availableSlots <= 0
                                    })
                                  }}
                                  dataSource={advisorData?.eligibleStudents || []}
                                  pagination={{ pageSize: 8 }}
                                  columns={[
                                    {
                                      title: 'Mã SV',
                                      dataIndex: 'code',
                                      render: (c) => <Text strong>{c}</Text>
                                    },
                                    {
                                      title: 'Họ và Tên',
                                      dataIndex: 'fullName'
                                    },
                                    {
                                      title: 'Khóa / Kỳ',
                                      render: (_, r) => (
                                        <Space>
                                          <Tag color="purple">{r.cohort}</Tag>
                                          <Tag color="cyan">Kỳ {r.calculatedTerm}</Tag>
                                        </Space>
                                      )
                                    },
                                    {
                                      title: 'TC đã đạt',
                                      dataIndex: 'passedCredits',
                                      render: (cr) => <Text strong>{cr} TC</Text>
                                    },
                                    {
                                      title: 'Trạng thái',
                                      render: () => <Tag color="success">✓ Thỏa mãn tiên quyết</Tag>
                                    },
                                    {
                                      title: 'Thao tác',
                                      render: (_, r) => (
                                        <Button
                                          size="small"
                                          type="primary"
                                          ghost
                                          disabled={advisorData?.targetClass?.availableSlots <= 0}
                                          onClick={() => handleBatchEnroll([r.id])}
                                        >
                                          Xếp lớp
                                        </Button>
                                      )
                                    }
                                  ]}
                                />
                              </div>
                            )
                          },
                          {
                            key: 'ineligible',
                            label: (
                              <span>
                                <CloseCircleOutlined style={{ color: '#ff4d4f' }} /> Chưa đủ điều kiện ({advisorData?.ineligibleStudents?.length || 0})
                              </span>
                            ),
                            children: (
                              <Table
                                size="small"
                                rowKey="id"
                                loading={loadingAdvisor}
                                dataSource={advisorData?.ineligibleStudents || []}
                                pagination={{ pageSize: 8 }}
                                columns={[
                                  {
                                    title: 'Mã SV',
                                    dataIndex: 'code',
                                    render: (c) => <Text strong>{c}</Text>
                                  },
                                  {
                                    title: 'Họ và Tên',
                                    dataIndex: 'fullName'
                                  },
                                  {
                                    title: 'Khóa / Kỳ',
                                    render: (_, r) => (
                                      <Space>
                                        <Tag color="purple">{r.cohort}</Tag>
                                        <Tag color="cyan">Kỳ {r.calculatedTerm}</Tag>
                                      </Space>
                                    )
                                  },
                                  {
                                    title: 'Lý do chưa đủ điều kiện',
                                    dataIndex: 'reasons',
                                    render: (reasons = []) => (
                                      <div>
                                        {reasons.map((res, i) => (
                                          <div key={i} style={{ color: '#ff4d4f', fontSize: 12 }}>
                                            • {res}
                                          </div>
                                        ))}
                                      </div>
                                    )
                                  },
                                  {
                                    title: 'Hành động',
                                    render: (_, r) => (
                                      <Popconfirm
                                        title="Sinh viên chưa đạt điều kiện tiên quyết. Bạn có chắc chắn muốn đặc cách ghi danh?"
                                        onConfirm={() => {
                                          setEnrollStudentId(r.id);
                                          handleEnrollStudent(true);
                                        }}
                                        okText="Đặc cách"
                                        cancelText="Hủy"
                                      >
                                        <Button size="small" danger>
                                          Đặc cách
                                        </Button>
                                      </Popconfirm>
                                    )
                                  }
                                ]}
                              />
                            )
                          }
                        ]}
                      />
                    </div>
                  )
                },
                {
                  key: 'grades_readonly',
                  label: (
                    <span>
                      <BookOutlined style={{ color: '#1890ff' }} /> Bảng điểm lớp (Chỉ đọc)
                    </span>
                  ),
                  children: (
                    <div>
                      <Alert
                        message="Bảng điểm lớp học phần (Chế độ xem chỉ đọc dành cho Giáo vụ - UC8.5*)"
                        description="Điểm số thành phần do Giảng viên phụ trách chấm và công bố. Giáo vụ theo dõi chuyên cần, giữa kỳ, thi kết thúc học phần và tỷ lệ qua môn."
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                      />
                      <Table
                        size="small"
                        rowKey="id"
                        dataSource={selectedClass.enrollments}
                        pagination={false}
                        columns={[
                          { title: 'Mã SV', dataIndex: ['student', 'code'], width: 120, render: val => <Text strong style={{ color: '#F26F21' }}>{val}</Text> },
                          { title: 'Họ và Tên', dataIndex: ['student', 'fullName'], render: val => <Text strong>{val}</Text> },
                          ...['attendanceScore:Chuyên cần (10%)', 'midtermScore:Giữa kỳ (30%)', 'finalScore:Cuối kỳ (60%)', 'totalScore:Tổng kết'].map(col => {
                            const [f, h] = col.split(':');
                            const isTot = f === 'totalScore';
                            return {
                              title: h,
                              align: 'center',
                              render: (_, row) => {
                                const sc = row.grade?.[f];
                                return sc != null ? <Text strong={isTot} style={isTot ? { color: '#1890ff', fontSize: 15 } : {}}>{sc}</Text> : <Text type="secondary">-</Text>;
                              }
                            };
                          }),
                          {
                            title: 'Kết quả',
                            align: 'center',
                            render: (_, row) => {
                              const gd = row.grade;
                              const tagMap = gd?.isBanned ? ['error', 'CẤM THI'] : gd?.isPassed ? ['success', 'QUA MÔN'] : gd?.totalScore != null ? ['warning', 'TRƯỢT MÔN'] : ['default', 'Đang học'];
                              return <Tag color={tagMap[0]}>{tagMap[1]}</Tag>;
                            }
                          }
                        ]}
                      />
                    </div>
                  )
                }
              ]}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default ClassesPage;
