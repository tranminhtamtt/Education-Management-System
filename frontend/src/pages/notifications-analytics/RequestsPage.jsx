import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Tag, Space, Modal, Form, Input, Select, Typography, message, Upload, DatePicker, Row, Col } from 'antd';
import { PlusOutlined, UploadOutlined, AuditOutlined, CheckCircleOutlined, CloseCircleOutlined, LinkOutlined, CalendarOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

// Các loại đơn giữa học viên và trung tâm khóa học
const REQUEST_TYPES = [
  { value: 'ABSENCE', short: 'Xin nghỉ buổi Live', label: 'Xin nghỉ một buổi học Live (ốm, bận việc…)', color: 'blue', needsClass: true },
  { value: 'CLASS_TRANSFER', short: 'Chuyển lớp / đổi lịch', label: 'Xin chuyển sang lớp Live khác / đổi lịch học', color: 'cyan', needsClass: true },
  { value: 'DEFERRAL', short: 'Bảo lưu khóa học', label: 'Xin bảo lưu khóa học, học tiếp đợt sau', color: 'geekblue', needsClass: true },
  { value: 'REFUND', short: 'Hủy khóa & hoàn tiền', label: 'Xin hủy khóa học và hoàn học phí', color: 'red', needsClass: true },
  { value: 'PAYMENT_ISSUE', short: 'Lỗi thanh toán', label: 'Đã chuyển khoản nhưng khóa học chưa mở / sai số tiền', color: 'gold' },
  { value: 'CONFIRMATION', short: 'Giấy xác nhận', label: 'Xin giấy xác nhận học viên / chứng nhận hoàn thành khóa', color: 'purple' },
  { value: 'FEEDBACK', short: 'Góp ý / khiếu nại', label: 'Góp ý, khiếu nại về khóa học hoặc giảng viên', color: 'magenta' }
];

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
      // Học viên chỉ chọn khóa của mình; admin vẫn xem danh sách lớp
      const res = await apiClient.get(isStudent ? '/my-courses' : '/classes');
      if (res.success) {
        setClasses(isStudent
          ? (res.data || []).map(e => ({ id: e.classId, classCode: e.class.classCode, course: e.class.course, pending: e.status === 'PENDING_PAYMENT' }))
          : res.data);
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
        message.success('Đã gửi đơn tới trung tâm');
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
            ? 'Đã duyệt đơn (buổi học được cập nhật thành Vắng có phép)'
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
    const t = REQUEST_TYPES.find(x => x.value === type);
    if (t) return <Tag color={t.color}>{t.short}</Tag>;
    if (type === 'REMARK') return <Tag color="orange">Phúc khảo điểm (cũ)</Tag>;
    return <Tag>{type}</Tag>;
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
      render: (c) => c || '-'
    },
    {
      title: 'Ngày nghỉ',
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
      title: 'Phản hồi của trung tâm',
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
        title={isStudent ? 'Đơn từ gửi trung tâm' : 'Quản lý Đơn từ của học viên'}
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
          scroll={{ x: 1000 }}
        />
      </Card>

      {/* Modal Học Viên Gửi Đơn Online */}
      <Modal
        title="Gửi đơn tới trung tâm"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateRequest}>
          <Form.Item
            name="requestType"
            label="Loại đơn"
            rules={[{ required: true, message: 'Vui lòng chọn loại đơn' }]}
            initialValue="ABSENCE"
          >
            <Select options={REQUEST_TYPES.map(t => ({ label: t.label, value: t.value }))} />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.requestType !== cur.requestType}>
            {({ getFieldValue }) => {
              const type = REQUEST_TYPES.find(t => t.value === getFieldValue('requestType'));
              const options = classes
                .filter(c => getFieldValue('requestType') === 'ABSENCE' || getFieldValue('requestType') === 'CLASS_TRANSFER' ? !c.classCode.startsWith('VIDEO-') && !c.pending : true)
                .map(c => ({ label: `${c.course.name} (${c.classCode.startsWith('VIDEO-') ? 'Video' : c.classCode})${c.pending ? ' – chờ thanh toán' : ''}`, value: c.id }));
              return (
                <Form.Item name="classId" label="Khóa học liên quan" rules={[{ required: !!type?.needsClass, message: 'Vui lòng chọn khóa học' }]}>
                  <Select placeholder={type?.needsClass ? 'Chọn khóa học' : 'Không bắt buộc'} allowClear options={options} notFoundContent="Không có khóa học phù hợp" />
                </Form.Item>
              );
            }}
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
                Gửi đơn
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
