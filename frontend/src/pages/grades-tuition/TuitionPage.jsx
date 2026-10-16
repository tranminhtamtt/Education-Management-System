import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Tag, Space, Modal, Form, InputNumber, Typography, message, Image, Row, Col, Alert } from 'antd';
import { QrcodeOutlined, DollarCircleOutlined, CheckCircleOutlined, PrinterOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import dayjs from 'dayjs';

const { Text, Title, Paragraph } = Typography;

const TuitionPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modal VietQR
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [loadingQr, setLoadingQr] = useState(false);

  // Modal Ghi nhận Thanh toán (Admin)
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [payForm] = Form.useForm();
  const [paying, setPaying] = useState(false);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/tuition-invoices');
      if (res.success) {
        setInvoices(res.data);
      }
    } catch (err) {
      message.error('Lỗi khi tải danh sách học phí');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  // Mở mã VietQR
  const handleOpenVietQR = async (invoiceId) => {
    try {
      setLoadingQr(true);
      setQrModalOpen(true);
      const res = await apiClient.get(`/tuition-invoices/${invoiceId}/vietqr`);
      if (res.success) {
        setQrData(res.data);
      }
    } catch (err) {
      message.error('Lỗi khi tạo mã VietQR');
    } finally {
      setLoadingQr(false);
    }
  };

  // Mở modal thanh toán
  const handleOpenPayModal = (invoice) => {
    setSelectedInvoice(invoice);
    payForm.setFieldsValue({
      amountPaid: invoice.remainingAmount
    });
    setPayModalOpen(true);
  };

  // Admin ghi nhận thanh toán
  const handlePayInvoice = async (values) => {
    try {
      setPaying(true);
      const res = await apiClient.patch(`/tuition-invoices/${selectedInvoice.id}/pay`, values);
      if (res.success) {
        message.success('Ghi nhận thanh toán thành công');
        setPayModalOpen(false);
        fetchInvoices();
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi khi cập nhật thanh toán');
    } finally {
      setPaying(false);
    }
  };

  const columns = [
    {
      title: 'Hóa đơn #',
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
      title: 'Lớp & Môn học',
      render: (_, r) => (
        <div>
          <Text strong>{r.courseName}</Text>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>{r.classCode} ({r.courseCode})</div>
        </div>
      )
    },
    {
      title: 'Mức học phí',
      dataIndex: 'amount',
      render: (amt) => `${Number(amt).toLocaleString('vi-VN')} đ`
    },
    {
      title: 'Đã nộp',
      dataIndex: 'paidAmount',
      render: (amt) => <span style={{ color: '#52c41a' }}>{Number(amt).toLocaleString('vi-VN')} đ</span>
    },
    {
      title: 'Còn nợ',
      dataIndex: 'remainingAmount',
      render: (amt) => (
        <span style={{ color: amt > 0 ? '#ff4d4f' : '#52c41a', fontWeight: amt > 0 ? 600 : 400 }}>
          {Number(amt).toLocaleString('vi-VN')} đ
        </span>
      )
    },
    {
      title: 'Hạn đóng',
      dataIndex: 'dueDate',
      render: (d) => d ? dayjs(d).format('DD/MM/YYYY') : '-'
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (st) => {
        if (st === 'PAID') return <Tag color="success">ĐÃ HOÀN THÀNH</Tag>;
        if (st === 'PARTIAL') return <Tag color="warning">NỢ MỘT PHẦN</Tag>;
        return <Tag color="error">CHƯA THANH TOÁN</Tag>;
      }
    },
    {
      title: 'Hành động',
      render: (_, r) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<QrcodeOutlined />}
            style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
            onClick={() => handleOpenVietQR(r.id)}
          >
            Mã VietQR
          </Button>

          {isAdmin && r.status !== 'PAID' && (
            <Button
              size="small"
              type="primary"
              ghost
              icon={<DollarCircleOutlined />}
              onClick={() => handleOpenPayModal(r)}
            >
              Thu tiền
            </Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <Card title="Quản lý Hóa đơn & Thu Học phí Trực tuyến">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={invoices}
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Modal Quét Mã Thanh Toán VietQR */}
      <Modal
        title="Thanh toán Học phí qua VietQR (NAPAS 247)"
        open={qrModalOpen}
        onCancel={() => setQrModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setQrModalOpen(false)}>
            Đóng
          </Button>,
          <Button key="print" icon={<PrinterOutlined />} onClick={() => window.print()}>
            In Phiếu thu
          </Button>
        ]}
        width={480}
      >
        {loadingQr ? (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>Đang tạo mã VietQR...</div>
        ) : qrData ? (
          <div style={{ textAlign: 'center' }}>
            <Image
              src={qrData.qrImageUrl}
              alt="VietQR"
              width={260}
              style={{ borderRadius: 8, border: '1px solid #f0f0f0', padding: 8 }}
            />
            <div style={{ marginTop: 16, textAlign: 'left', background: '#fafafa', padding: 12, borderRadius: 8 }}>
              <div><b>Chủ tài khoản:</b> {qrData.accountName}</div>
              <div><b>Ngân hàng:</b> {qrData.bankId} • <b>Số TK:</b> {qrData.accountNo}</div>
              <div>
                <b>Số tiền:</b>{' '}
                <Text strong style={{ color: '#F26F21', fontSize: 16 }}>
                  {qrData.amount.toLocaleString('vi-VN')} VNĐ
                </Text>
              </div>
              <div><b>Nội dung chuyển khoản:</b> <Tag color="blue">{qrData.description}</Tag></div>
            </div>
            <Alert
              message="Hệ thống sẽ tự động gạch nợ học phí ngay sau khi tiền về tài khoản nhà trường."
              type="info"
              showIcon
              style={{ marginTop: 12, textAlign: 'left' }}
            />
          </div>
        ) : null}
      </Modal>

      {/* Modal Admin Ghi Nhận Thanh Toán */}
      <Modal
        title={`Ghi nhận thanh toán - Hóa đơn #${selectedInvoice?.id}`}
        open={payModalOpen}
        onCancel={() => setPayModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={payForm} layout="vertical" onFinish={handlePayInvoice}>
          <div style={{ marginBottom: 16 }}>
            <div><b>Sinh viên:</b> {selectedInvoice?.student?.fullName} ({selectedInvoice?.student?.code})</div>
            <div><b>Môn:</b> {selectedInvoice?.courseName}</div>
            <div><b>Còn nợ:</b> {selectedInvoice?.remainingAmount?.toLocaleString('vi-VN')} đ</div>
          </div>

          <Form.Item
            name="amountPaid"
            label="Số tiền thực thu (VNĐ)"
            rules={[{ required: true, message: 'Vui lòng nhập số tiền' }]}
          >
            <InputNumber
              min={1000}
              style={{ width: '100%' }}
              formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(val) => val.replace(/\$\s?|(,*)/g, '')}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setPayModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={paying}
                style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
              >
                Xác nhận Thu tiền
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TuitionPage;
