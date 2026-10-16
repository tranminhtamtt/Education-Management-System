import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Tag, Space, Modal, Form, Input, Select, Typography, message, Upload, DatePicker, Row, Col } from 'antd';
import { PlusOutlined, UploadOutlined, AuditOutlined, CheckCircleOutlined, CloseCircleOutlined, LinkOutlined, CalendarOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

const RequestsPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isStudent = user?.role === 'STUDENT';

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState([]);

  // Modal Học Viên Tạo Đơn Mới
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);
  const [fileList, setFileList] = useState([]);

  // Modal Admin Xét Duyệt Đơn
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [reviewForm] = Form.useForm();
  const [reviewing, setReviewing] = useState(false);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/requests');
      if (res.success) {
        setRequests(res.data);
      }
    } catch (err) {
      message.error('Lỗi khi tải danh sách đơn từ');
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const res = await apiClient.get('/classes');
      if (res.success) {
        setClasses(res.data);
      }
    } catch (err) {
      console.error('Error fetching classes:', err);
    }
  };

  useEffect(() => {
    fetchRequests();
    fetchClasses();
  }, []);

  // Nộp đơn online (Student)
  const handleCreateRequest = async (values) => {
    try {
      setCreating(true);
      const formData = new FormData();
      formData.append('requestType', values.requestType);
      if (values.classId) formData.append('classId', values.classId);
      if (values.sessionDate) formData.append('sessionDate', values.sessionDate.format('YYYY-MM-DD'));
      formData.append('reason', values.reason);
      if (fileList.length > 0) {
        formData.append('attachment', fileList[0].originFileObj);
      }

      const res = await apiClient.post('/requests', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.success) {
        message.success('Gửi đơn học vụ trực tuyến thành công');
        setCreateModalOpen(false);
        createForm.resetFields();
        setFileList([]);
        fetchRequests();
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi khi gửi đơn');
    } finally {
      setCreating(false);
    }
  };

  // Mở modal duyệt đơn (Admin)
  const handleOpenReview = (request) => {
    setSelectedRequest(request);
    reviewForm.setFieldsValue({
      status: 'APPROVED',
      adminResponse: ''
    });
    setReviewModalOpen(true);
  };

  // Duyệt đơn
  const handleReviewRequest = async (values) => {
    try {
      setReviewing(true);
      const res = await apiClient.patch(`/requests/${selectedRequest.id}/review`, values);
      if (res.success) {
        message.success(
          values.status === 'APPROVED' && selectedRequest.requestType === 'ABSENCE'
            ? 'Đã duyệt đơn (Đã tự động cập nhật trạng thái điểm danh sang Vắng có phép và đồng bộ cấm thi)'
            : 'Đã hoàn tất xét duyệt đơn học vụ'
        );
        setReviewModalOpen(false);
        fetchRequests();
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi xét duyệt đơn');
    } finally {
      setReviewing(false);
    }
  };

  const getRequestTypeTag = (type) => {
    switch (type) {
      case 'ABSENCE': return <Tag color="blue">Xin nghỉ học có phép</Tag>;
      case 'REMARK': return <Tag color="orange">Phúc khảo điểm thi</Tag>;
      case 'CONFIRMATION': return <Tag color="purple">Xin cấp giấy xác nhận SV</Tag>;
      default: return <Tag>{type}</Tag>;
    }
  };

  const getStatusTag = (status) => {
    switch (status) {
      case 'APPROVED': return <Tag color="success" icon={<CheckCircleOutlined />}>ĐÃ DUYỆT</Tag>;
      case 'REJECTED': return <Tag color="error" icon={<CloseCircleOutlined />}>TỪ CHỐI</Tag>;
      default: return <Tag color="warning">CHỜ DUYỆT</Tag>;
    }
  };

  const columns = [
    {
      title: 'Mã Đơn',
      dataIndex: 'id',
      width: 90,
      render: (id) => <Text strong>#{id}</Text>
    },
    ...(isAdmin
      ? [
          {
            title: 'Học viên',
            render: (_, r) => (
              <div>
                <Text strong>{r.student?.fullName}</Text>
                <div style={{ fontSize: 12, color: '#F26F21' }}>{r.student?.code}</div>
              </div>
            )
          }
        ]
      : []),
    {
      title: 'Loại đơn',
      dataIndex: 'requestType',
      render: (type) => getRequestTypeTag(type)
    },
    {
      title: 'Lớp liên quan',
      dataIndex: 'classInfo',
      render: (c) => c || 'Toàn trường'
    },
    {
      title: 'Ngày xin nghỉ',
      dataIndex: 'sessionDate',
      render: (d) => d ? <Tag color="cyan">{dayjs(d).format('DD/MM/YYYY')}</Tag> : '-'
    },
    {
      title: 'Lý do & Nội dung',
      dataIndex: 'reason'
    },
    {
      title: 'Minh chứng đính kèm',
      dataIndex: 'attachmentUrl',
      render: (url) => url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <LinkOutlined /> Xem tệp
        </a>
      ) : '-'
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (st) => getStatusTag(st)
    },
    {
      title: 'Phản hồi từ Giáo vụ',
      dataIndex: 'adminResponse',
      render: (resp) => resp || '-'
    },
    {
      title: 'Ngày nộp',
      dataIndex: 'createdAt',
      render: (d) => dayjs(d).format('HH:mm DD/MM/YYYY')
    },
    ...(isAdmin
      ? [
          {
            title: 'Hành động',
            render: (_, r) => r.status === 'PENDING' ? (
              <Button
                type="primary"
                size="small"
                onClick={() => handleOpenReview(r)}
                style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
              >
                Xét duyệt
              </Button>
            ) : null
          }
        ]
      : [])
  ];

  return (
    <div>
      <Card
        title="Quản lý Đơn từ Học vụ Trực tuyến (Online Applications)"
        extra={
          isStudent && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
              onClick={() => setCreateModalOpen(true)}
            >
              Gửi Đơn Mới
            </Button>
          )
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={requests}
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Modal Học Viên Gửi Đơn Online */}
      <Modal
        title="Nộp Đơn Học Vụ Trực Tuyến"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateRequest}>
          <Form.Item
            name="requestType"
            label="Loại đơn học vụ"
            rules={[{ required: true, message: 'Vui lòng chọn loại đơn' }]}
            initialValue="ABSENCE"
          >
            <Select
              options={[
                { label: 'Đơn xin nghỉ học có phép (Minh chứng y tế / công việc)', value: 'ABSENCE' },
                { label: 'Đơn phúc khảo bài thi kết thúc môn', value: 'REMARK' },
                { label: 'Đơn xin cấp Giấy xác nhận sinh viên (Vay vốn / NVQS)', value: 'CONFIRMATION' }
              ]}
            />
          </Form.Item>

          <Form.Item name="classId" label="Lớp học phần liên quan (nếu có)">
            <Select
              placeholder="Chọn lớp học (không bắt buộc với đơn xác nhận)"
              allowClear
              options={classes.map(c => ({
                label: `${c.classCode} - ${c.course.name}`,
                value: c.id
              }))}
            />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.requestType !== cur.requestType}
          >
            {({ getFieldValue }) =>
              getFieldValue('requestType') === 'ABSENCE' ? (
                <Form.Item
                  name="sessionDate"
                  label="Ngày buổi học xin nghỉ phép"
                  rules={[{ required: true, message: 'Vui lòng chọn ngày buổi học xin nghỉ' }]}
                >
                  <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" placeholder="Chọn ngày cần xin nghỉ phép" />
                </Form.Item>
              ) : null
            }
          </Form.Item>

          <Form.Item
            name="reason"
            label="Lý do & Nội dung chi tiết"
            rules={[{ required: true, message: 'Vui lòng nhập lý do' }]}
          >
            <Input.TextArea rows={4} placeholder="Trình bày rõ ràng lý do gửi đơn..." />
          </Form.Item>

          <Form.Item label="Tệp minh chứng đính kèm (Ảnh chụp, PDF)">
            <Upload
              beforeUpload={() => false}
              fileList={fileList}
              onChange={({ fileList }) => setFileList(fileList)}
              maxCount={1}
            >
              <Button icon={<UploadOutlined />}>Tải tệp minh chứng</Button>
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
                Gửi Đơn Đến Giáo Vụ
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Admin Duyệt Đơn */}
      <Modal
        title={`Xét duyệt đơn #${selectedRequest?.id} - ${selectedRequest?.student?.fullName}`}
        open={reviewModalOpen}
        onCancel={() => setReviewModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={reviewForm} layout="vertical" onFinish={handleReviewRequest}>
          <div style={{ marginBottom: 16 }}>
            <div><b>Loại đơn:</b> {getRequestTypeTag(selectedRequest?.requestType)}</div>
            <div><b>Lý do sinh viên:</b> {selectedRequest?.reason}</div>
          </div>

          <Form.Item
            name="status"
            label="Kết quả xét duyệt"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { label: 'Chấp thuận (APPROVED)', value: 'APPROVED' },
                { label: 'Từ chối (REJECTED)', value: 'REJECTED' }
              ]}
            />
          </Form.Item>

          <Form.Item name="adminResponse" label="Ghi chú phản hồi cho sinh viên">
            <Input.TextArea rows={3} placeholder="Lý do phê duyệt hoặc từ chối..." />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setReviewModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={reviewing}
                style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
              >
                Lưu Quyết Định Xét Duyệt
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default RequestsPage;
