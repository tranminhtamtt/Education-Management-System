import React, { useEffect, useState } from 'react';
import {
  Button, Card, Empty, Form, Input, Modal, Select, Space, Table, Tag,
  Typography, message
} from 'antd';
import { BookOutlined, EditOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';

const { Text } = Typography;

const TeacherContentPage = () => {
  const [courses, setCourses] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState();
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lessonForm] = Form.useForm();
  const [classForm] = Form.useForm();
  const [lessonModal, setLessonModal] = useState(false);
  const [editingLesson, setEditingLesson] = useState(null);
  const [editingClass, setEditingClass] = useState(null);

  const loadTeacherData = async () => {
    try {
      const res = await apiClient.get('/teacher/dashboard');
      setCourses(res.data.courses || []);
      setClasses(res.data.classes || []);
      if (!selectedCourseId && res.data.courses?.length) {
        setSelectedCourseId(res.data.courses[0].id);
      }
    } catch (error) {
      message.error(error.response?.data?.message || 'Không tải được khóa học của giảng viên');
    }
  };

  const loadLessons = async courseId => {
    if (!courseId) return;
    try {
      setLoading(true);
      const res = await apiClient.get(`/courses/${courseId}/lessons`);
      setLessons(res.data || []);
    } catch (error) {
      message.error(error.response?.data?.message || 'Không tải được nội dung bài giảng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadTeacherData(); }, []);
  useEffect(() => { void loadLessons(selectedCourseId); }, [selectedCourseId]);

  const openLessonForm = lesson => {
    setEditingLesson(lesson || null);
    lessonForm.setFieldsValue(lesson || { sectionTitle: 'Chương 1', durationMinutes: 0 });
    setLessonModal(true);
  };

  const saveLesson = async values => {
    try {
      setSaving(true);
      if (editingLesson) {
        await apiClient.put(`/lessons/${editingLesson.id}`, values);
      } else {
        await apiClient.post(`/courses/${selectedCourseId}/lessons`, values);
      }
      message.success(editingLesson ? 'Đã cập nhật bài giảng' : 'Đã thêm bài giảng');
      setLessonModal(false);
      lessonForm.resetFields();
      await loadLessons(selectedCourseId);
    } catch (error) {
      message.error(error.response?.data?.message || 'Không lưu được bài giảng');
    } finally {
      setSaving(false);
    }
  };

  const saveClassLink = async values => {
    try {
      setSaving(true);
      await apiClient.patch(`/teacher/classes/${editingClass.id}`, { meetUrl: values.meetUrl || '' });
      message.success('Đã cập nhật link phòng học');
      setEditingClass(null);
      classForm.resetFields();
      await loadTeacherData();
    } catch (error) {
      message.error(error.response?.data?.message || 'Không cập nhật được link phòng học');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card
        title={<Space><BookOutlined /> Lớp LIVE_ONLINE phụ trách</Space>}
        extra={<Text type="secondary">Cập nhật link phòng để học viên vào lớp</Text>}
      >
        {classes.filter(item => item.deliveryMode === 'LIVE_ONLINE').length === 0
          ? <Empty description="Chưa được phân công lớp trực tuyến" />
          : <Table
              rowKey="id"
              size="small"
              dataSource={classes.filter(item => item.deliveryMode === 'LIVE_ONLINE')}
              pagination={false}
              columns={[
                { title: 'Lớp học', render: (_, item) => <><Text strong>{item.classCode}</Text><div>{item.courseName}</div></> },
                { title: 'Học kỳ', dataIndex: 'semester' },
                {
                  title: 'Link lớp',
                  dataIndex: 'meetUrl',
                  render: url => url
                    ? <a href={url} target="_blank" rel="noopener noreferrer"><LinkOutlined /> Mở phòng học</a>
                    : <Tag>Chưa thiết lập</Tag>
                },
                {
                  title: 'Thao tác',
                  render: (_, item) => (
                    <Button size="small" icon={<EditOutlined />} onClick={() => {
                      setEditingClass(item);
                      classForm.setFieldsValue({ meetUrl: item.meetUrl || '' });
                    }}>Sửa link</Button>
                  )
                }
              ]}
            />}
      </Card>

      <Card
        title={<Space><BookOutlined /> Nội dung khóa học</Space>}
        extra={
          <Space wrap>
            <Select
              style={{ minWidth: 260 }}
              value={selectedCourseId}
              onChange={setSelectedCourseId}
              placeholder="Chọn khóa học"
              options={courses.map(item => ({
                value: item.id,
                label: `${item.courseCode} · ${item.name}`
              }))}
            />
            <Button type="primary" icon={<PlusOutlined />} disabled={!selectedCourseId} onClick={() => openLessonForm(null)}>
              Thêm bài giảng
            </Button>
          </Space>
        }
      >
        {!selectedCourseId
          ? <Empty description="Chưa có khóa học được phân công" />
          : <Table
              rowKey="id"
              size="small"
              loading={loading}
              dataSource={lessons}
              locale={{ emptyText: 'Khóa học chưa có bài giảng' }}
              pagination={{ pageSize: 8, showSizeChanger: false }}
              columns={[
                { title: 'Thứ tự', dataIndex: 'orderIndex', width: 90 },
                { title: 'Chương / Bài giảng', render: (_, item) => <><Text type="secondary">{item.sectionTitle}</Text><div><Text strong>{item.title}</Text></div></> },
                { title: 'Video', dataIndex: 'videoUrl', responsive: ['md'], render: url => url ? <a href={url} target="_blank" rel="noopener noreferrer">Mở video</a> : '-' },
                { title: 'Tài liệu', dataIndex: 'materialUrl', render: url => url ? <a href={url} target="_blank" rel="noopener noreferrer">Mở tài liệu</a> : '-' },
                {
                  title: 'Thao tác',
                  render: (_, item) => <Button size="small" icon={<EditOutlined />} onClick={() => openLessonForm(item)}>Cập nhật</Button>
                }
              ]}
            />}
      </Card>

      <Modal
        title={editingLesson ? 'Cập nhật bài giảng' : 'Thêm bài giảng'}
        open={lessonModal}
        onCancel={() => { setLessonModal(false); lessonForm.resetFields(); }}
        onOk={() => lessonForm.submit()}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={lessonForm} layout="vertical" onFinish={saveLesson}>
          <Form.Item name="sectionTitle" label="Chương">
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="title" label="Tên bài giảng" rules={[{ required: true, max: 200 }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="orderIndex" label="Thứ tự">
            <Input type="number" min={1} />
          </Form.Item>
          <Form.Item name="videoUrl" label="Link video">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="materialUrl" label="Link tài liệu / slide / code">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="durationMinutes" label="Thời lượng (phút)">
            <Input type="number" min={0} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Link phòng học · ${editingClass?.classCode || ''}`}
        open={Boolean(editingClass)}
        onCancel={() => { setEditingClass(null); classForm.resetFields(); }}
        onOk={() => classForm.submit()}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={classForm} layout="vertical" onFinish={saveClassLink}>
          <Form.Item
            name="meetUrl"
            label="Google Meet / Zoom"
            rules={[{ type: 'url', warningOnly: true, message: 'Link nên có dạng https://...' }]}
          >
            <Input allowClear placeholder="https://meet.google.com/... (để trống để xóa link)" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};

export default TeacherContentPage;
