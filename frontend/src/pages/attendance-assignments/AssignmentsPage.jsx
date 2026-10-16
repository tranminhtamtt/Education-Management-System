import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Input, Select, Space, Tag, Modal, Form, Typography, message, Upload, DatePicker, Row, Col, InputNumber } from 'antd';
import { PlusOutlined, UploadOutlined, FileTextOutlined, CheckCircleOutlined, LinkOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import dayjs from 'dayjs';

const { Text, Title, Paragraph } = Typography;

const AssignmentsPage = () => {
  const { user } = useAuth();
  const isStudent = user?.role === 'STUDENT';
  const isTeacherOrAdmin = ['TEACHER', 'ADMIN'].includes(user?.role);

  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modal Tạo Bài Tập
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);

  // Modal Nộp Bài Tập (Student)
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [currentAssignment, setCurrentAssignment] = useState(null);
  const [submittingFile, setSubmittingFile] = useState(false);
  const [fileList, setFileList] = useState([]);

  // Modal Xem Danh Sách Bài Nộp & Chấm Điểm (Teacher)
  const [gradingModalOpen, setGradingModalOpen] = useState(false);
  const [assignmentDetail, setAssignmentDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Chấm điểm 1 bài nộp
  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [gradeForm] = Form.useForm();
  const [savingGrade, setSavingGrade] = useState(false);

  const fetchClasses = async () => {
    try {
      const res = await apiClient.get('/classes');
      if (res.success && res.data.length > 0) {
        setClasses(res.data);
        setSelectedClassId(res.data[0].id);
      }
    } catch (err) {
      console.error('Error fetching classes:', err);
    }
  };

  const fetchAssignments = async (classId) => {
    if (!classId) return;
    try {
      setLoading(true);
      const res = await apiClient.get(`/classes/${classId}/assignments`);
      if (res.success) {
        setAssignments(res.data);
      }
    } catch (err) {
      message.error('Lỗi khi tải danh sách bài tập');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      fetchAssignments(selectedClassId);
    }
  }, [selectedClassId]);

  // Tạo bài tập mới
  const handleCreateAssignment = async (values) => {
    try {
      setCreating(true);
      const formData = new FormData();
      formData.append('title', values.title);
      formData.append('description', values.description || '');
      formData.append('dueDate', values.dueDate.toISOString());
      if (fileList.length > 0) {
        formData.append('file', fileList[0].originFileObj);
      }

      const res = await apiClient.post(`/classes/${selectedClassId}/assignments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.success) {
        message.success('Giao bài tập mới thành công');
        setCreateModalOpen(false);
        createForm.resetFields();
        setFileList([]);
        fetchAssignments(selectedClassId);
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi khi giao bài tập');
    } finally {
      setCreating(false);
    }
  };

  // Nộp bài tập (Student)
  const handleSubmitWork = async () => {
    if (fileList.length === 0) {
      message.warning('Vui lòng chọn file bài làm để nộp');
      return;
    }
    try {
      setSubmittingFile(true);
      const formData = new FormData();
      formData.append('file', fileList[0].originFileObj);

      const res = await apiClient.post(`/assignments/${currentAssignment.id}/submissions`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.success) {
        message.success(res.message);
        setSubmitModalOpen(false);
        setFileList([]);
        fetchAssignments(selectedClassId);
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi khi nộp bài');
    } finally {
      setSubmittingFile(false);
    }
  };

  // Mở modal chấm bài của lớp
  const handleOpenGrading = async (assignmentId) => {
    try {
      setLoadingDetail(true);
      setGradingModalOpen(true);
      const res = await apiClient.get(`/assignments/${assignmentId}`);
      if (res.success) {
        setAssignmentDetail(res.data);
      }
    } catch (err) {
      message.error('Lỗi khi lấy thông tin bài nộp');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Mở modal nhập điểm 1 bài nộp
  const handleOpenGradeForm = (submission) => {
    setSelectedSubmission(submission);
    gradeForm.setFieldsValue({
      score: submission.score,
      teacherFeedback: submission.teacherFeedback
    });
    setGradeModalOpen(true);
  };

  // Lưu điểm bài nộp
  const handleSaveGrade = async (values) => {
    try {
      setSavingGrade(true);
      const res = await apiClient.patch(`/submissions/${selectedSubmission.id}/grade`, values);
      if (res.success) {
        message.success('Chấm điểm bài làm thành công');
        setGradeModalOpen(false);
        // Refresh danh sách bài nộp
        handleOpenGrading(assignmentDetail.id);
      }
    } catch (err) {
      message.error('Lỗi lưu điểm');
    } finally {
      setSavingGrade(false);
    }
  };

  const columns = [
    {
      title: 'Tiêu đề bài tập',
      dataIndex: 'title',
      render: (t, r) => (
        <div>
          <Text strong style={{ fontSize: 14 }}>{t}</Text>
          {r.description && <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: '4px 0 0', fontSize: 12 }}>{r.description}</Paragraph>}
        </div>
      )
    },
    {
      title: 'Đề bài',
      dataIndex: 'fileUrl',
      render: (url) => url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <LinkOutlined /> Tải đề bài
        </a>
      ) : '-'
    },
    {
      title: 'Hạn nộp (Deadline)',
      dataIndex: 'dueDate',
      render: (d) => {
        const isPast = dayjs().isAfter(dayjs(d));
        return (
          <Space>
            <span>{dayjs(d).format('HH:mm DD/MM/YYYY')}</span>
            {isPast ? <Tag color="error">Đã hết hạn</Tag> : <Tag color="processing">Còn hạn</Tag>}
          </Space>
        );
      }
    },
    ...(isTeacherOrAdmin
      ? [
          {
            title: 'Bài đã nộp',
            dataIndex: 'totalSubmissions',
            render: (count) => <Tag color="blue">{count} bài nộp</Tag>
          },
          {
            title: 'Hành động',
            render: (_, r) => (
              <Button
                type="primary"
                ghost
                size="small"
                onClick={() => handleOpenGrading(r.id)}
              >
                Chấm bài ({r.totalSubmissions})
              </Button>
            )
          }
        ]
      : []),
    ...(isStudent
      ? [
          {
            title: 'Trạng thái nộp',
            render: (_, r) => {
              if (r.mySubmission) {
                return (
                  <div>
                    <Tag color="success">Đã nộp bài</Tag>
                    {r.mySubmission.score !== null && (
                      <div style={{ marginTop: 4 }}>
                        Điểm: <Text strong style={{ color: '#52c41a' }}>{r.mySubmission.score}/10</Text>
                      </div>
                    )}
                  </div>
                );
              }
              return <Tag color="error">Chưa nộp</Tag>;
            }
          },
          {
            title: 'Hành động',
            render: (_, r) => (
              <Button
                type="primary"
                size="small"
                style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
                onClick={() => {
                  setCurrentAssignment(r);
                  setSubmitModalOpen(true);
                }}
              >
                {r.mySubmission ? 'Nộp lại bài' : 'Nộp bài trực tuyến'}
              </Button>
            )
          }
        ]
      : [])
  ];

  return (
    <div>
      <Card
        title="Quản lý Bài tập Lớp học"
        extra={
          isTeacherOrAdmin && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
              onClick={() => setCreateModalOpen(true)}
            >
              Giao Bài Tập Mới
            </Button>
          )
        }
      >
        <Space style={{ marginBottom: 20 }} wrap>
          <Text strong>Chọn Lớp Học:</Text>
          <Select
            style={{ width: 260 }}
            value={selectedClassId}
            onChange={setSelectedClassId}
            options={classes.map(c => ({
              label: `${c.classCode} - ${c.course.name}`,
              value: c.id
            }))}
          />
        </Space>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={assignments}
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Modal Giảng Viên Giao Bài Tập Mới */}
      <Modal
        title="Giao Bài Tập Mới Cho Lớp"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateAssignment}>
          <Form.Item
            name="title"
            label="Tiêu đề bài tập"
            rules={[{ required: true, message: 'Nhập tiêu đề bài tập' }]}
          >
            <Input placeholder="Assignment 1: Xây dựng RESTful API với Express" />
          </Form.Item>

          <Form.Item name="description" label="Hướng dẫn / Yêu cầu chi tiết">
            <Input.TextArea rows={4} placeholder="Yêu cầu sinh viên nộp file zip chứa mã nguồn..." />
          </Form.Item>

          <Form.Item
            name="dueDate"
            label="Hạn nộp bài (Deadline)"
            rules={[{ required: true, message: 'Chọn hạn nộp' }]}
          >
            <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="Đính kèm tài liệu đề bài (PDF, Zip, Docx)">
            <Upload
              beforeUpload={() => false}
              fileList={fileList}
              onChange={({ fileList }) => setFileList(fileList)}
              maxCount={1}
            >
              <Button icon={<UploadOutlined />}>Chọn file đính kèm</Button>
            </Upload>
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
                Giao Bài Tập
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Học Viên Nộp Bài Trực Tuyến */}
      <Modal
        title={`Nộp bài: ${currentAssignment?.title}`}
        open={submitModalOpen}
        onCancel={() => setSubmitModalOpen(false)}
        onOk={handleSubmitWork}
        confirmLoading={submittingFile}
        okText="Xác nhận nộp bài"
        cancelText="Hủy"
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">
            Hạn chót: <b>{dayjs(currentAssignment?.dueDate).format('HH:mm DD/MM/YYYY')}</b>
          </Text>
        </div>
        <Upload
          beforeUpload={() => false}
          fileList={fileList}
          onChange={({ fileList }) => setFileList(fileList)}
          maxCount={1}
        >
          <Button icon={<UploadOutlined />} size="large">
            Chọn file bài làm (.zip, .pdf, tối đa 25MB)
          </Button>
        </Upload>
      </Modal>

      {/* Modal Giảng Viên Xem Danh Sách Nộp & Chấm Bài */}
      <Modal
        title={`Danh sách nộp bài: ${assignmentDetail?.title}`}
        open={gradingModalOpen}
        onCancel={() => setGradingModalOpen(false)}
        width={800}
        footer={[
          <Button key="close" onClick={() => setGradingModalOpen(false)}>
            Đóng
          </Button>
        ]}
      >
        <Table
          size="small"
          rowKey="id"
          dataSource={assignmentDetail?.submissions || []}
          loading={loadingDetail}
          pagination={false}
          columns={[
            {
              title: 'Mã SV',
              dataIndex: ['student', 'code'],
              render: (c) => <Text strong>{c}</Text>
            },
            {
              title: 'Họ tên',
              dataIndex: ['student', 'fullName']
            },
            {
              title: 'Thời gian nộp',
              dataIndex: 'submittedAt',
              render: (t) => dayjs(t).format('HH:mm DD/MM/YYYY')
            },
            {
              title: 'File bài làm',
              dataIndex: 'fileUrl',
              render: (url) => (
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <LinkOutlined /> Tải bài nộp
                </a>
              )
            },
            {
              title: 'Điểm số',
              dataIndex: 'score',
              render: (s) => s !== null ? <Text strong style={{ color: '#52c41a' }}>{s}/10</Text> : <Tag>Chưa chấm</Tag>
            },
            {
              title: 'Nhận xét',
              dataIndex: 'teacherFeedback',
              render: (fb) => fb || '-'
            },
            {
              title: 'Chấm điểm',
              render: (_, r) => (
                <Button size="small" type="primary" onClick={() => handleOpenGradeForm(r)}>
                  Nhập điểm
                </Button>
              )
            }
          ]}
        />
      </Modal>

      {/* Modal Nhập Điểm Cho 1 Bài Nộp */}
      <Modal
        title={`Chấm bài học viên: ${selectedSubmission?.student?.fullName}`}
        open={gradeModalOpen}
        onCancel={() => setGradeModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={gradeForm} layout="vertical" onFinish={handleSaveGrade}>
          <Form.Item
            name="score"
            label="Điểm số (Thang 10.0)"
            rules={[{ required: true, message: 'Vui lòng nhập điểm từ 0 đến 10' }]}
          >
            <InputNumber min={0} max={10} step={0.1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="teacherFeedback" label="Lời phê / Nhận xét của Giảng viên">
            <Input.TextArea rows={4} placeholder="Nhận xét ưu điểm, lỗi cần khắc phục..." />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setGradeModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={savingGrade}
                style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
              >
                Lưu Điểm & Nhận Xét
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AssignmentsPage;
