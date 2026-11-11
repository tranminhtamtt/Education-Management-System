import React, { useState, useEffect } from 'react';
import {
  Table, Card, Button, Input, Space, Tag, Modal, Form, Typography,
  message, InputNumber, Row, Col, Select, Drawer, List, Popconfirm, Switch
} from 'antd';
import {
  PlusOutlined, LinkOutlined, SearchOutlined,
  PlayCircleOutlined, DeleteOutlined, EditOutlined, VideoCameraOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Text } = Typography;
const { Option } = Select;

const CoursesPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [deliveryFilter, setDeliveryFilter] = useState('ALL');

  // Modal tạo/sửa khóa học
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // Drawer quản lý bài giảng Video (course_lessons)
  const [lessonDrawerOpen, setLessonDrawerOpen] = useState(false);
  const [currentCourse, setCurrentCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [loadingLessons, setLoadingLessons] = useState(false);

  // Modal thêm/sửa bài giảng
  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState(null);
  const [lessonForm] = Form.useForm();
  const [submittingLesson, setSubmittingLesson] = useState(false);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/courses');
      if (res.success) {
        setData(res.data);
      }
    } catch (err) {
      message.error('Lỗi khi tải danh mục môn học / khóa đào tạo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const handleOpenCreate = () => {
    setEditingCourse(null);
    form.resetFields();
    form.setFieldsValue({
      category: 'FPT_SUBJECT',
      deliveryMode: 'RECORDED',
      level: 'BEGINNER',
      credits: 3,
      totalSessions: 30,
      baseTuitionFee: 5000000,
      status: 'ACTIVE'
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (record) => {
    setEditingCourse(record);
    form.setFieldsValue({
      courseCode: record.courseCode,
      name: record.name,
      category: record.category || 'FPT_SUBJECT',
      deliveryMode: record.deliveryMode || 'RECORDED',
      level: record.level || 'BEGINNER',
      credits: record.credits || 3,
      totalSessions: record.totalSessions || 30,
      baseTuitionFee: record.baseTuitionFee || 5000000,
      syllabusUrl: record.syllabusUrl || '',
      thumbnailUrl: record.thumbnailUrl || '',
      description: record.description || '',
      status: record.status || 'ACTIVE'
    });
    setModalOpen(true);
  };

  const handleSubmitCourse = async (values) => {
    try {
      setSubmitting(true);
      if (editingCourse) {
        const res = await apiClient.put(`/courses/${editingCourse.id}`, values);
        if (res.success) {
          message.success('Cập nhật khóa học thành công');
          setModalOpen(false);
          fetchCourses();
        }
      } else {
        const res = await apiClient.post('/courses', values);
        if (res.success) {
          message.success('Tạo khóa đào tạo mới thành công');
          setModalOpen(false);
          form.resetFields();
          fetchCourses();
        }
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi khi lưu thông tin khóa học');
    } finally {
      setSubmitting(false);
    }
  };

  // Quản lý bài giảng Video
  const openLessonsDrawer = async (course) => {
    setCurrentCourse(course);
    setLessonDrawerOpen(true);
    await fetchLessons(course.id);
  };

  const fetchLessons = async (courseId) => {
    try {
      setLoadingLessons(true);
      const res = await apiClient.get(`/courses/${courseId}/lessons`);
      if (res.success) {
        setLessons(res.data);
      }
    } catch (err) {
      message.error('Lỗi khi tải danh sách bài giảng');
    } finally {
      setLoadingLessons(false);
    }
  };

  const handleOpenAddLesson = () => {
    setEditingLesson(null);
    lessonForm.resetFields();
    lessonForm.setFieldsValue({
      sectionTitle: 'Chương 1',
      orderIndex: lessons.length + 1,
      durationMinutes: 30,
      isPreview: false
    });
    setLessonModalOpen(true);
  };

  const handleOpenEditLesson = (lesson) => {
    setEditingLesson(lesson);
    lessonForm.setFieldsValue({
      sectionTitle: lesson.sectionTitle,
      title: lesson.title,
      orderIndex: lesson.orderIndex,
      videoUrl: lesson.videoUrl,
      materialUrl: lesson.materialUrl,
      durationMinutes: lesson.durationMinutes,
      isPreview: lesson.isPreview
    });
    setLessonModalOpen(true);
  };

  const handleSubmitLesson = async (values) => {
    try {
      setSubmittingLesson(true);
      if (editingLesson) {
        const res = await apiClient.put(`/lessons/${editingLesson.id}`, values);
        if (res.success) {
          message.success('Cập nhật bài giảng thành công');
          setLessonModalOpen(false);
          if (currentCourse?.id) fetchLessons(currentCourse.id);
          fetchCourses();
        }
      } else {
        const res = await apiClient.post(`/courses/${currentCourse.id}/lessons`, values);
        if (res.success) {
          message.success('Thêm bài giảng mới thành công');
          setLessonModalOpen(false);
          lessonForm.resetFields();
          if (currentCourse?.id) fetchLessons(currentCourse.id);
          fetchCourses();
        }
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi khi lưu bài giảng');
    } finally {
      setSubmittingLesson(false);
    }
  };

  const handleDeleteLesson = async (lessonId) => {
    try {
      const res = await apiClient.delete(`/lessons/${lessonId}`);
      if (res.success) {
        message.success('Đã xóa bài giảng');
        if (currentCourse?.id) fetchLessons(currentCourse.id);
        fetchCourses();
      }
    } catch (err) {
      message.error('Lỗi khi xóa bài giảng');
    }
  };

  const columns = [
    {
      title: 'Mã Khóa / Môn',
      dataIndex: 'courseCode',
      width: 130,
      render: (code) => <Text strong style={{ color: '#F26F21', fontSize: 14 }}>{code}</Text>
    },
    {
      title: 'Tên Khóa Học',
      dataIndex: 'name',
      render: (name, record) => (
        <div>
          <Text strong>{name}</Text>
          <div style={{ marginTop: 4 }}>
            {record.category === 'CERTIFICATE' ? (
              <Tag color="purple">Chứng chỉ Quốc tế</Tag>
            ) : (
              <Tag color="blue">Môn Đại học FPT</Tag>
            )}
            {record.level && <Tag color="cyan">{record.level}</Tag>}
          </div>
        </div>
      )
    },
    {
      title: 'Hình thức Đào tạo',
      dataIndex: 'deliveryMode',
      width: 170,
      render: (mode) => (
        mode === 'LIVE_ONLINE' ? (
          <Tag color="geekblue" icon={<VideoCameraOutlined />}>Lớp Trực Tuyến (Live)</Tag>
        ) : (
          <Tag color="purple" icon={<PlayCircleOutlined />}>Video Quay Sẵn (VOD)</Tag>
        )
      )
    },
    {
      title: 'Bài giảng / Lớp',
      width: 150,
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          <Tag color="magenta">{r.totalLessons || 0} Video VOD</Tag>
          <Tag color="green">{r.totalClasses || 0} Lớp đã mở</Tag>
        </Space>
      )
    },
    {
      title: 'Học phí niêm yết',
      dataIndex: 'baseTuitionFee',
      width: 150,
      render: (fee) => <Text strong>{Number(fee).toLocaleString('vi-VN')} đ</Text>
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 110,
      render: (st) => st === 'INACTIVE' ? <Tag color="default">Ngưng mở</Tag> : <Tag color="success">Đang mở</Tag>
    },
    {
      title: 'Hành động',
      width: 220,
      render: (_, record) => (
        <Space wrap direction="horizontal" size="small">
          <Button
            type="primary"
            size="small"
            icon={<PlayCircleOutlined />}
            style={{ backgroundColor: '#722ED1', borderColor: '#722ED1' }}
            onClick={() => openLessonsDrawer(record)}
          >
            Bài giảng ({record.totalLessons || 0})
          </Button>
          {isAdmin && (
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleOpenEdit(record)}
            >
              Sửa
            </Button>
          )}
        </Space>
      )
    }
  ];

  const filteredData = data.filter(c => {
    if (categoryFilter !== 'ALL' && c.category !== categoryFilter) return false;
    if (deliveryFilter !== 'ALL' && c.deliveryMode !== deliveryFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (c.courseCode && c.courseCode.toLowerCase().includes(s)) ||
      (c.name && c.name.toLowerCase().includes(s))
    );
  });

  return (
    <div>
      <Card
        title="Quản lý Danh mục Khóa học & Đào tạo (EMS)"
        extra={
          isAdmin && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
              onClick={handleOpenCreate}
            >
              Thêm Khóa Học Mới
            </Button>
          )
        }
      >
        <Space wrap style={{ marginBottom: 16 }}>
          <Input
            placeholder="Tìm theo Mã khóa (PRF192, CCNA), Tên..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 280 }}
          />
          <Select value={categoryFilter} onChange={setCategoryFilter} style={{ width: 200 }}>
            <Option value="ALL">Tất cả Nhóm danh mục</Option>
            <Option value="FPT_SUBJECT">Môn Chuyên ngành FPT</Option>
            <Option value="CERTIFICATE">Luyện thi Chứng chỉ</Option>
          </Select>
          <Select value={deliveryFilter} onChange={setDeliveryFilter} style={{ width: 220 }}>
            <Option value="ALL">Tất cả Hình thức</Option>
            <Option value="RECORDED">Video quay sẵn (RECORDED)</Option>
            <Option value="LIVE_ONLINE">Lớp trực tuyến (LIVE_ONLINE)</Option>
          </Select>
        </Space>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredData}
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Modal Thêm / Sửa Khóa học */}
      <Modal
        title={editingCourse ? `Chỉnh sửa Khóa học: ${editingCourse.courseCode}` : "Thêm Khóa Đào Tạo Mới"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnClose
        width={680}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmitCourse}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="courseCode"
                label="Mã Khóa học"
                rules={[{ required: true, message: 'Nhập mã (VD: PRF192, CCNA-200)' }]}
              >
                <Input placeholder="PRF192" disabled={!!editingCourse} />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item
                name="name"
                label="Tên Khóa đào tạo"
                rules={[{ required: true, message: 'Nhập tên khóa học' }]}
              >
                <Input placeholder="Master PRF192 - Lập trình C nền tảng" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="category" label="Nhóm Danh mục" rules={[{ required: true }]}>
                <Select>
                  <Option value="FPT_SUBJECT">Môn Chuyên ngành FPT</Option>
                  <Option value="CERTIFICATE">Chứng chỉ Quốc tế</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="deliveryMode" label="Hình thức Đào tạo" rules={[{ required: true }]}>
                <Select>
                  <Option value="RECORDED">Video quay sẵn (VOD)</Option>
                  <Option value="LIVE_ONLINE">Lớp trực tuyến (Live)</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="level" label="Cấp độ">
                <Select>
                  <Option value="BEGINNER">Cơ bản (Beginner)</Option>
                  <Option value="INTERMEDIATE">Trung cấp (Intermediate)</Option>
                  <Option value="ADVANCED">Nâng cao (Advanced)</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="credits" label="Số tín chỉ / Quy đổi">
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="totalSessions" label="Tổng số buổi học">
                <InputNumber min={1} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="baseTuitionFee"
                label="Học phí niêm yết (VNĐ)"
                rules={[{ required: true }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(value) => (value ? value.replace(/\$\s?|(,*)/g, '') : '')}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="syllabusUrl" label="Link Đề cương (Syllabus PDF / Drive)">
                <Input placeholder="https://..." />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="thumbnailUrl" label="Link Ảnh bìa (Thumbnail URL)">
                <Input placeholder="https://..." />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="Mô tả Khóa học & Chuẩn đầu ra">
            <Input.TextArea rows={3} placeholder="Kiến thức đạt được, đối tượng phù hợp..." />
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
                Lưu Khóa Học
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Drawer Quản lý Bài giảng Video (course_lessons) */}
      <Drawer
        title={
          <span>
            Quản lý Bài giảng Video: <Text strong style={{ color: '#F26F21' }}>{currentCourse?.courseCode}</Text> — {currentCourse?.name}
          </span>
        }
        width={720}
        open={lessonDrawerOpen}
        onClose={() => setLessonDrawerOpen(false)}
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ backgroundColor: '#722ED1', borderColor: '#722ED1' }}
            onClick={handleOpenAddLesson}
          >
            Thêm Bài Giảng
          </Button>
        }
      >
        <List
          loading={loadingLessons}
          itemLayout="horizontal"
          dataSource={lessons}
          locale={{ emptyText: 'Chưa có bài giảng nào trong khóa học này. Hãy bấm "Thêm Bài Giảng" để bắt đầu.' }}
          renderItem={(item) => (
            <List.Item
              key={item.id}
              actions={[
                <Button key="edit" type="link" icon={<EditOutlined />} onClick={() => handleOpenEditLesson(item)}>Sửa</Button>,
                <Popconfirm key="delete" title="Xác nhận xóa bài giảng này?" onConfirm={() => handleDeleteLesson(item.id)} okText="Xóa" cancelText="Hủy">
                  <Button type="link" danger icon={<DeleteOutlined />}>Xóa</Button>
                </Popconfirm>
              ]}
            >
              <List.Item.Meta
                avatar={<PlayCircleOutlined style={{ fontSize: 28, color: '#722ED1' }} />}
                title={
                  <Space>
                    <Text strong>#{item.orderIndex}. {item.title}</Text>
                    {item.isPreview && <Tag color="green">Cho học thử</Tag>}
                    <Tag color="blue">{item.durationMinutes} phút</Tag>
                  </Space>
                }
                description={
                  <div>
                    <div style={{ color: '#8c8c8c', fontSize: 12 }}>Chương mục: <b>{item.sectionTitle}</b></div>
                    {item.videoUrl && (
                      <div style={{ marginTop: 2 }}>
                        <LinkOutlined /> <a href={item.videoUrl} target="_blank" rel="noopener noreferrer">Xem Video</a>
                      </div>
                    )}
                    {item.materialUrl && (
                      <div style={{ marginTop: 2 }}>
                        <FileTextOutlined /> <a href={item.materialUrl} target="_blank" rel="noopener noreferrer">Tài liệu đính kèm</a>
                      </div>
                    )}
                  </div>
                }
              />
            </List.Item>
          )}
        />
      </Drawer>

      {/* Modal Thêm / Sửa Bài giảng */}
      <Modal
        title={editingLesson ? "Chỉnh Sửa Bài Giảng" : "Thêm Bài Giảng Mới"}
        open={lessonModalOpen}
        onCancel={() => setLessonModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={lessonForm} layout="vertical" onFinish={handleSubmitLesson}>
          <Row gutter={16}>
            <Col span={14}>
              <Form.Item
                name="sectionTitle"
                label="Tên Chương / Module"
                rules={[{ required: true, message: 'Nhập tên chương' }]}
              >
                <Input placeholder="Chương 1: Cú pháp cơ bản" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="orderIndex" label="Thứ tự hiển thị" rules={[{ required: true }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="title"
            label="Tiêu đề Bài học"
            rules={[{ required: true, message: 'Nhập tiêu đề bài học' }]}
          >
            <Input placeholder="Bài 1: Cài đặt môi trường & Cú pháp cơ bản" />
          </Form.Item>

          <Form.Item name="videoUrl" label="Đường dẫn Video bài giảng (YouTube, Vimeo, MP4)">
            <Input placeholder="https://www.youtube.com/watch?v=..." />
          </Form.Item>

          <Row gutter={16}>
            <Col span={14}>
              <Form.Item name="materialUrl" label="Link Tài liệu / Slide đính kèm">
                <Input placeholder="https://drive.google.com/..." />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="durationMinutes" label="Thời lượng (Phút)">
                <InputNumber min={1} max={300} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="isPreview" label="Cho phép học thử miễn phí (Preview)" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setLessonModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={submittingLesson}
                style={{ backgroundColor: '#722ED1', borderColor: '#722ED1' }}
              >
                Lưu Bài Giảng
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CoursesPage;
