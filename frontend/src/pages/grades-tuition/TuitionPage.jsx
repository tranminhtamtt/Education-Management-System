import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Card,
  Button,
  Space,
  Input,
  Select,
  Switch,
  Typography,
  message,
  Row,
  Col,
  Alert,
  Statistic,
  Tooltip,
  Tag,
  Progress,
} from 'antd';
import {
  QrcodeOutlined,
  DollarCircleOutlined,
  ReloadOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  WalletOutlined,
  FileDoneOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { Link, useLocation } from 'react-router-dom';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { VietQRModal, ReceiptModal, PaymentHistory } from '../../components/tuition/TuitionModals';
import { formatVnd, InvoiceStatusTag, STATUS_OPTIONS, sumUncollectedByStatus } from '../../components/tuition/tuitionHelpers';

const { Text } = Typography;

const EMPTY_SUMMARY = { totalAmount: 0, paidAmount: 0, remainingAmount: 0, UNPAID: 0, PARTIAL: 0, PAID: 0, overdueCount: 0 };

const TuitionPage = () => {
  const { user } = useAuth();
  const { state } = useLocation();
  const role = user?.role;
  const isAccountant = role === 'ACCOUNTANT';
  const isStudent = role === 'STUDENT';
  const isFinanceView = ['ACCOUNTANT', 'ADMIN'].includes(role);

  const [invoices, setInvoices] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState([]);

  // Bộ lọc (Kế toán / Admin)
  const [filters, setFilters] = useState({ search: '', status: [], classId: undefined, overdue: false });

  // Modals
  const [qrInvoiceId, setQrInvoiceId] = useState(() => (
    isStudent && Number.isSafeInteger(state?.invoiceId) && state.invoiceId > 0 ? state.invoiceId : null
  ));
  const [receiptPaymentId, setReceiptPaymentId] = useState(null);

  const fetchInvoices = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const params = {};
      if (filters.search) params.search = filters.search;
      if (filters.status?.length) params.status = filters.status.join(',');
      if (filters.classId) params.classId = filters.classId;
      if (filters.semester) params.semester = filters.semester;
      if (filters.overdue) params.overdue = 'true';

      const res = await apiClient.get('/tuition-invoices', { params });
      if (res.success) {
        setInvoices(res.data.invoices);
        setSummary(res.data.summary);
      }
    } catch (err) {
      if (!silent) message.error(err.response?.data?.message || (isStudent ? 'Không tải được đơn mua khóa học' : 'Lỗi khi tải danh sách học phí'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filters, isStudent]);

  useEffect(() => {
    fetchInvoices();
    const timer = setInterval(() => fetchInvoices(true), 15000);
    return () => clearInterval(timer);
  }, [fetchInvoices]);

  useEffect(() => {
    if (!isFinanceView) return;
    apiClient
      .get('/classes')
      .then((res) => res.success && setClasses(res.data))
      .catch(() => {});
  }, [isFinanceView]);

  // ---------- Bảng ----------
  const columns = [
    {
      title: isStudent ? 'Mã đơn' : 'Hóa đơn',
      dataIndex: 'id',
      width: 90,
      render: (id) => <Text strong>#{id}</Text>
    },
    ...(isFinanceView
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
      title: isStudent ? 'Khóa học' : 'Lớp & Môn học',
      render: (_, r) => (
        <div>
          <Text strong>{r.courseName}</Text>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            {isStudent
              ? [r.courseCode, r.semester !== 'SELF_PACED' && r.classCode].filter(Boolean).join(' · ')
              : <>{r.classCode} ({r.courseCode}){!isAccountant && <> • {r.semester}</>}</>}
          </div>
        </div>
      )
    },
    {
      title: isStudent ? 'Giá khóa học' : 'Học phí',
      dataIndex: 'amount',
      align: 'right',
      render: (amt) => formatVnd(amt)
    },
    {
      title: isStudent ? 'Đã thanh toán' : 'Đã nộp',
      dataIndex: 'paidAmount',
      align: 'right',
      render: (amt, r) => (
        <Tooltip title={`${r.payments.length} đợt thanh toán`}>
          <span style={{ color: '#52c41a' }}>{formatVnd(amt)}</span>
        </Tooltip>
      )
    },
    {
      title: isStudent ? 'Còn thiếu' : 'Chưa thu',
      dataIndex: 'remainingAmount',
      align: 'right',
      sorter: (a, b) => a.remainingAmount - b.remainingAmount,
      render: (amt, invoice) => isStudent && invoice.status !== 'PARTIAL' ? '—' : (
        <span style={{ fontWeight: amt > 0 ? 600 : 400 }}>{formatVnd(amt)}</span>
      )
    },
    ...(!isStudent ? [{
      title: 'Hạn thanh toán',
      dataIndex: 'dueDate',
      sorter: (a, b) => new Date(a.dueDate) - new Date(b.dueDate),
      render: (d, r) => (
        <div>
          <div>{d ? dayjs(d).format('DD/MM/YYYY') : '-'}</div>
          {r.isOverdue && (
            <Tag color="red" icon={<WarningOutlined />} style={{ marginTop: 2 }}>
              Quá hạn
            </Tag>
          )}
        </div>
      )
    }] : []),
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (st) => <InvoiceStatusTag status={st} />
    },
    ...(isStudent ? [{
      title: 'Thanh toán',
      fixed: 'right',
      render: (_, invoice) => invoice.remainingAmount > 0 && (
        <Button size="small" type="primary" icon={<QrcodeOutlined />} onClick={() => setQrInvoiceId(invoice.id)}>
          {invoice.status === 'PARTIAL' ? 'Thanh toán phần còn thiếu' : 'Thanh toán VietQR'}
        </Button>
      )
    }] : [])
  ];

  const collectedRate = summary.totalAmount > 0 ? Math.round((summary.paidAmount / summary.totalAmount) * 1000) / 10 : 0;
  const remainingByStatus = sumUncollectedByStatus(invoices);

  return (
    <div>
      {isAccountant && <Alert style={{ marginBottom: 16 }} showIcon type="info" message="Hệ thống tự ghi nhận khi nhận xác nhận tiền vào. Kế toán xem hóa đơn, phiếu thu và theo dõi giao dịch sai lệch. Dữ liệu làm mới mỗi 15 giây." />}
      {/* ===== Tổng hợp hóa đơn ===== */}
      {!isStudent && <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false}>
            <Statistic
              title="Tổng giá trị hóa đơn"
              value={summary.totalAmount}
              formatter={(v) => formatVnd(v)}
              prefix={<WalletOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false}>
            <Statistic
              title="Đã thu"
              value={summary.paidAmount}
              formatter={(v) => formatVnd(v)}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
            <Progress percent={collectedRate} size="small" strokeColor="#52c41a" showInfo={false} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false}>
            <Statistic
              title="Chưa thu"
              value={summary.remainingAmount}
              formatter={(v) => formatVnd(v)}
              prefix={<DollarCircleOutlined />}
            />
            <Space direction="vertical" size={0}>
              <Text type="secondary">Chờ thanh toán ({summary.UNPAID}) · {formatVnd(remainingByStatus.UNPAID)}</Text>
              <Text type="secondary">Đã trả một phần ({summary.PARTIAL}) · {formatVnd(remainingByStatus.PARTIAL)}</Text>
            </Space>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false}>
            <Statistic
              title="Hóa đơn quá hạn"
              value={summary.overdueCount}
              valueStyle={{ color: summary.overdueCount > 0 ? '#ff4d4f' : undefined }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
      </Row>}

      <Card
        title={
          isAccountant
            ? 'Hóa đơn mua khóa học'
            : isStudent
            ? 'Đơn mua khóa học'
            : 'Danh sách Hóa đơn Học phí (Chỉ xem)'
        }
        extra={
          <Space wrap>
            {isStudent && <Link to="/catalog">Khám phá khóa học</Link>}
            <Button aria-label="Tải lại danh sách" icon={<ReloadOutlined />} onClick={() => fetchInvoices()} />
          </Space>
        }
      >
        {isFinanceView && (
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={8}>
              <Input.Search
                id="tuition-search"
                allowClear
                placeholder="Tìm mã HV, tên, email, mã lớp, mã môn..."
                onSearch={(v) => setFilters((f) => ({ ...f, search: v.trim() }))}
              />
            </Col>
            <Col xs={24} md={6}>
              <Select
                id="tuition-status-filter"
                mode="multiple"
                allowClear
                style={{ width: '100%' }}
                placeholder="Lọc trạng thái"
                options={STATUS_OPTIONS}
                value={filters.status}
                onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
              />
            </Col>
            <Col xs={24} md={6}>
              <Select
                id="tuition-class-filter"
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: '100%' }}
                placeholder="Lọc theo lớp học phần"
                value={filters.classId}
                options={classes.map((c) => ({ label: `${c.classCode} - ${c.course?.courseCode}`, value: c.id }))}
                onChange={(v) => setFilters((f) => ({ ...f, classId: v }))}
              />
            </Col>
            <Col xs={24} md={4} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Switch
                id="tuition-overdue-filter"
                checked={filters.overdue}
                onChange={(v) => setFilters((f) => ({ ...f, overdue: v }))}
              />
              <Text>Chỉ quá hạn</Text>
            </Col>
            {!isAccountant && <Col xs={24} md={6}>
              <Input.Search allowClear placeholder="Học kỳ (SP26, SU26, FA26...)" onSearch={v => setFilters(f => ({ ...f, semester: v.trim().toUpperCase() }))} />
            </Col>}
          </Row>
        )}

        <Table
          rowKey="id"
          columns={columns}
          dataSource={invoices}
          loading={loading}
          scroll={{ x: 1100 }}
          pagination={{ pageSize: 10, showTotal: (t) => `${t} ${isStudent ? 'đơn mua' : 'hóa đơn'}` }}
          locale={isStudent ? { emptyText: 'Bạn chưa có đơn mua khóa học.' } : undefined}
          rowClassName={(r) => (!isStudent && r.isOverdue ? 'tuition-row-overdue' : '')}
          expandable={{
            expandedRowRender: (r) => <PaymentHistory invoice={r} studentView={isStudent} onOpenReceipt={setReceiptPaymentId} />,
            rowExpandable: (r) => !isStudent || r.payments.length > 0
          }}
        />
      </Card>

      {/* ===== Modal VietQR (UC9.3) ===== */}
      <VietQRModal open={!!qrInvoiceId} invoiceId={qrInvoiceId} onClose={() => setQrInvoiceId(null)} onPayment={() => fetchInvoices(true)} />

      {/* ===== Modal Phiếu thu (DF35) ===== */}
      <ReceiptModal open={!!receiptPaymentId} paymentId={receiptPaymentId} studentView={isStudent} onClose={() => setReceiptPaymentId(null)} />

    </div>
  );
};

export default TuitionPage;
