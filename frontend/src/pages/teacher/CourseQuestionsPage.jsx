import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Empty, Form, Input, Modal, Select, Space, Table, Tag,
  Typography, message
} from 'antd';
import { MessageOutlined, SendOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Text } = Typography;

const STATUS = {
  PENDING: { color: 'processing', label: 'Chờ trả lời' },
  ANSWERED: { color: 'success', label: 'Đã trả lời' },
  RESOLVED: { color: 'default', label: 'Đã đóng' }
};

const renderExpandedQuestion = item => (
  <Alert
    type="info"
    showIcon
    message={item.teacherAnswer ? `Trả lời: ${item.answeredBy?.fullName || 'Giảng viên'}` : 'Chưa có câu trả lời'}
    description={item.teacherAnswer || 'Giảng viên sẽ phản hồi tại đây.'}
  />
);

const CourseQuestionsPage = () => {
  const { user } = useAuth();
  const isTeacher = user?.role === 'TEACHER';
  const [questions, setQuestions] = useState([]);
  const [classes, setClasses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [classId, setClassId] = useState();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [answering, setAnswering] = useState(null);
  const [answerForm] = Form.useForm();
  const [questionForm] = Form.useForm();

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/questions');
      setQuestions(res.data || []);
    } catch (error) {
      message.error(error.response?.data?.message || 'Không tải được danh sách hỏi đáp');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQuestions();
    if (!isTeacher) {
      apiClient.get('/classes', { params: { status: 'ONGOING' } })
        .then(res => setClasses(res.data || []))
        .catch(error => message.error(error.response?.data?.message || 'Không tải được lớp học'));
    }
  }, [isTeacher]);

  useEffect(() => {
    const selectedClass = classes.find(item => item.id === classId);
    if (!selectedClass?.course?.id) {
      setLessons([]);
      return;
    }
    apiClient.get(`/courses/${selectedClass.course.id}/lessons`)
      .then(res => setLessons(res.data || []))
      .catch(error => message.error(error.response?.data?.message || 'Không tải được bài giảng'));
  }, [classId, classes]);

  const submitQuestion = async values => {
    try {
      setSaving(true);
      await apiClient.post('/questions', values);
      message.success('Đã gửi câu hỏi cho giảng viên');
      questionForm.resetFields();
      await loadQuestions();
    } catch (error) {
      message.error(error.response?.data?.message || 'Không gửi được câu hỏi');
    } finally {
      setSaving(false);
    }
  };

  const submitAnswer = async values => {
    try {
      setSaving(true);
      await apiClient.patch(`/questions/${answering.id}/answer`, values);
      message.success('Đã gửi câu trả lời');
      setAnswering(null);
      answerForm.resetFields();
      await loadQuestions();
    } catch (error) {
      message.error(error.response?.data?.message || 'Không gửi được câu trả lời');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: 'Câu hỏi',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Text strong>{item.questionTitle}</Text>
          <Text type="secondary">{item.questionContent}</Text>
        </Space>
      )
    },
    {
      title: 'Học viên / Lớp',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Text>{item.student?.fullName || 'Học viên'}</Text>
          <Text type="secondary">
            {item.class?.classCode || item.lesson?.course?.courseCode || '-'}
            {item.lesson?.title ? ` · ${item.lesson.title}` : ''}
          </Text>
        </Space>
      )
    },
    {
      title: 'Cập nhật',
      dataIndex: 'createdAt',
      responsive: ['md'],
      render: date => dayjs(date).format('DD/MM/YYYY HH:mm')
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: status => <Tag color={STATUS[status]?.color}>{STATUS[status]?.label || status}</Tag>
    },
    ...(isTeacher ? [{
      title: 'Thao tác',
      render: (_, item) => item.status === 'RESOLVED'
        ? <Text type="secondary">Đã đóng</Text>
        : <Button size="small" type="primary" onClick={() => {
            setAnswering(item);
            answerForm.setFieldsValue({ teacherAnswer: item.teacherAnswer || '' });
          }}>{item.teacherAnswer ? 'Cập nhật trả lời' : 'Trả lời'}</Button>
    }] : [])
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {!isTeacher && (
        <Card title={<Space><MessageOutlined /> Gửi câu hỏi cho giảng viên</Space>}>
          <Form form={questionForm} layout="vertical" onFinish={submitQuestion}>
            <Form.Item name="classId" label="Lớp học" rules={[{ required: true, message: 'Chọn lớp học' }]}>
              <Select
                placeholder="Chọn lớp đang theo học"
                onChange={value => {
                  setClassId(value);
                  questionForm.setFieldValue('lessonId', undefined);
                }}
                options={classes.map(item => ({
                  value: item.id,
                  label: `${item.classCode} · ${item.course?.name || ''}`
                }))}
              />
            </Form.Item>
            <Form.Item name="lessonId" label="Bài giảng (không bắt buộc)">
              <Select allowClear placeholder="Chọn bài giảng nếu câu hỏi liên quan" options={lessons.map(item => ({
                value: item.id,
                label: `${item.orderIndex}. ${item.title}`
              }))} />
            </Form.Item>
            <Form.Item name="questionTitle" label="Tiêu đề" rules={[{ required: true, max: 200 }]}>
              <Input maxLength={200} placeholder="Ví dụ: Cách cấu hình định tuyến" />
            </Form.Item>
            <Form.Item name="questionContent" label="Nội dung câu hỏi" rules={[{ required: true, max: 10000 }]}>
              <Input.TextArea rows={4} maxLength={10000} showCount placeholder="Mô tả điều bạn cần giảng viên giải đáp..." />
            </Form.Item>
            <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={saving}>Gửi câu hỏi</Button>
          </Form>
        </Card>
      )}

      <Card title={isTeacher ? 'Hộp thư hỏi đáp học viên' : 'Câu hỏi của tôi'}>
        {questions.length === 0 && !loading
          ? <Empty description={isTeacher ? 'Chưa có câu hỏi mới' : 'Bạn chưa gửi câu hỏi nào'} />
          : <Table
              rowKey="id"
              size="middle"
              loading={loading}
              dataSource={questions}
              columns={columns}
              expandable={{
                expandedRowRender: renderExpandedQuestion
              }}
              pagination={{ pageSize: 8, showSizeChanger: false }}
              scroll={{ x: 700 }}
            />}
      </Card>

      <Modal
        title={`Trả lời: ${answering?.questionTitle || ''}`}
        open={Boolean(answering)}
        onCancel={() => { setAnswering(null); answerForm.resetFields(); }}
        footer={null}
        destroyOnClose
      >
        <Form form={answerForm} layout="vertical" onFinish={submitAnswer}>
          <Form.Item name="teacherAnswer" label="Câu trả lời" rules={[{ required: true, max: 10000 }]}>
            <Input.TextArea rows={6} maxLength={10000} showCount placeholder="Giải thích chi tiết cho học viên..." />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>Gửi phản hồi</Button>
        </Form>
      </Modal>
    </Space>
  );
};

export default CourseQuestionsPage;
