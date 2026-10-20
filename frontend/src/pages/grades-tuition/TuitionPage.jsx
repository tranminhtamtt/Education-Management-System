import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table,
  Card,
  Button,
  Space,
  Modal,
  Form,
  InputNumber,
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
  Checkbox,
  Descriptions
} from 'antd';
import {
  QrcodeOutlined,
  DollarCircleOutlined,
  BellOutlined,
  ReloadOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  WalletOutlined,
  FileDoneOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { VietQRModal, ReceiptModal, PaymentHistory } from '../../components/tuition/TuitionModals';
import { formatVnd, InvoiceStatusTag, STATUS_OPTIONS, METHOD_LABELS } from '../../components/tuition/tuitionHelpers';

const { Text } = Typography;

const EMPTY_SUMMARY = { totalAmount: 0, paidAmount: 0, remainingAmount: 0, UNPAID: 0, PARTIAL: 0, PAID: 0, overdueCount: 0 };

const TuitionPage = () => {
  const { user } = useAuth();
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
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  // Modals
  const [qrInvoiceId, setQrInvoiceId] = useState(null);
  const [receiptPaymentId, setReceiptPaymentId] = useState(null);

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [payForm] = Form.useForm();
  const [paying, setPaying] = useState(false);
  const watchedAmount = Form.useWatch('amountPaid', payForm);

  const [remindModalOpen, setRemindModalOpen] = useState(false);
  const [remindTargetIds, setRemindTargetIds] = useState([]); // [] = tất cả HV còn nợ
  const [remindForm] = Form.useForm();
  const [reminding, setReminding] = useState(false);

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filters.search) params.search = filters.search;
      if (filters.status?.length) params.status = filters.status.join(',');
      if (filters.classId) params.classId = filters.classId;
      if (filters.overdue) params.overdue = 'true';

      const res = await apiClient.get('/tuition-invoices', { params });
      if (res.success) {
        setInvoices(res.data.invoices);
        setSummary(res.data.summary);
        setSelectedRowKeys((keys) => keys.filter((k) => res.data.invoices.some((i) => i.id === k)));
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi khi tải danh sách học phí');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    if (!isFinanceView) return;
    apiClient
      .get('/classes')
      .then((res) => res.success && setClasses(res.data))
      .catch(() => {});
  }, [isFinanceView]);

  // ---------- UC9.2: Ghi nhận thanh toán ----------
  const handleOpenPayModal = (invoice) => {
    setSelectedInvoice(invoice);
    payForm.setFieldsValue({ amountPaid: invoice.remainingAmount, method: 'BANK_TRANSFER', note: '' });
    setPayModalOpen(true);
  };

  const handlePayInvoice = async (values) => {
    try {
      setPaying(true);
      const res = await apiClient.patch(`/tuition-invoices/${selectedInvoice.id}/pay`, values);
      if (res.success) {
        message.success(res.message);
        setPayModalOpen(false);
        await fetchInvoices();
        // DF35: mở ngay phiếu thu của đợt vừa ghi nhận để in
        if (res.data?.receipt?.id) setReceiptPaymentId(res.data.receipt.id);
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi khi cập nhật thanh toán');
    } finally {
      setPaying(false);
    }
  };

  const previewStatus = useMemo(() => {
    if (!selectedInvoice || !watchedAmount) return null;
    const after = selectedInvoice.paidAmount + Number(watchedAmount);
    if (Number(watchedAmount) > selectedInvoice.remainingAmount) return { error: true };
    return {
      status: after >= selectedInvoice.amount ? 'PAID' : 'PARTIAL',
      remainingAfter: Math.max(0, selectedInvoice.amount - after)
    };
  }, [selectedInvoice, watchedAmount]);

  // ---------- UC10.2 Trigger 3: Nhắc nợ ----------
  const openRemindModal = (ids) => {
    setRemindTargetIds(ids);
    remindForm.setFieldsValue({ onlyOverdue: false, note: '' });
    setRemindModalOpen(true);
  };

  const handleSendReminders = async (values) => {
    try {
      setReminding(true);
      const res = await apiClient.post('/tuition-invoices/reminders', {
        invoiceIds: remindTargetIds,
        onlyOverdue: values.onlyOverdue,
        note: values.note
      });
      if (res.success) {
        message.success(res.message);
        setRemindModalOpen(false);
        setSelectedRowKeys([]);
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi gửi thông báo nhắc nợ');
    } finally {
      setReminding(false);
    }
  };

  // ---------- Bảng ----------
  const columns = [
    {
      title: 'Hóa đơn',
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
      title: 'Lớp & Môn học',
      render: (_, r) => (
        <div>
          <Text strong>{r.courseName}</Text>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            {r.classCode} ({r.courseCode}) • {r.semester}
          </div>
        </div>
      )
    },
    {
      title: 'Học phí',
      dataIndex: 'amount',
      align: 'right',
      render: (amt) => formatVnd(amt)
    },
    {
      title: 'Đã nộp',
      dataIndex: 'paidAmount',
      align: 'right',
      render: (amt, r) => (
        <Tooltip title={`${r.payments.length} đợt thanh toán`}>
          <span style={{ color: '#52c41a' }}>{formatVnd(amt)}</span>
        </Tooltip>
      )
    },
    {
      title: 'Còn nợ',
      dataIndex: 'remainingAmount',
      align: 'right',
      sorter: (a, b) => a.remainingAmount - b.remainingAmount,
      render: (amt) => (
        <span style={{ color: amt > 0 ? '#ff4d4f' : '#52c41a', fontWeight: amt > 0 ? 600 : 400 }}>{formatVnd(amt)}</span>
      )
    },
    {
      title: 'Hạn đóng',
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
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (st) => <InvoiceStatusTag status={st} />
    },
    {
      title: 'Hành động',
      fixed: 'right',
      render: (_, r) => (
        <Space wrap>
          {r.remainingAmount > 0 && (
            <Button
              size="small"
              icon={<QrcodeOutlined />}
              type={isStudent ? 'primary' : 'default'}
              style={isStudent ? { backgroundColor: '#F26F21', borderColor: '#F26F21' } : undefined}
              onClick={() => setQrInvoiceId(r.id)}
            >
              VietQR
            </Button>
          )}
          {isAccountant && r.status !== 'PAID' && (
            <Button size="small" type="primary" icon={<DollarCircleOutlined />} onClick={() => handleOpenPayModal(r)}>
              Thu tiền
            </Button>
          )}
          {isAccountant && r.status !== 'PAID' && (
            <Tooltip title="Gửi thông báo nhắc đóng học phí (TUITION)">
              <Button size="small" icon={<BellOutlined />} onClick={() => openRemindModal([r.id])} />
            </Tooltip>
          )}
        </Space>
      )
    }
  ];

  const collectedRate = summary.totalAmount > 0 ? Math.round((summary.paidAmount / summary.totalAmount) * 1000) / 10 : 0;

  return (
    <div>
      {/* ===== Thẻ tổng hợp công nợ ===== */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false}>
            <Statistic
              title={isStudent ? 'Tổng học phí phải nộp' : 'Tổng phải thu'}
              value={summary.totalAmount}
              formatter={(v) => formatVnd(v)}
              prefix={<WalletOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false}>
            <Statistic
              title={isStudent ? 'Đã đóng' : 'Đã thu'}
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
              title="Còn nợ"
              value={summary.remainingAmount}
              formatter={(v) => formatVnd(v)}
              valueStyle={{ color: summary.remainingAmount > 0 ? '#ff4d4f' : '#52c41a' }}
              prefix={<DollarCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false}>
            <Statistic
              title="Hóa đơn quá hạn"
              value={summary.overdueCount}
              valueStyle={{ color: summary.overdueCount > 0 ? '#ff4d4f' : undefined }}
              prefix={<WarningOutlined />}
              suffix={
                <Text type="secondary" style={{ fontSize: 13 }}>
                  / {summary.UNPAID} chưa đóng • {summary.PARTIAL} nợ một phần
                </Text>
              }
            />
          </Card>
        </Col>
      </Row>

      {isStudent && summary.remainingAmount > 0 && (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message={`Bạn còn nợ ${formatVnd(summary.remainingAmount)} học phí.`}
          description='Bấm nút "VietQR" ở hóa đơn tương ứng để quét mã và chuyển khoản đúng số tiền còn nợ. Phòng Kế toán sẽ gạch nợ sau khi đối soát.'
        />
      )}
      {isStudent && invoices.length > 0 && summary.remainingAmount === 0 && (
        <Alert style={{ marginBottom: 16 }} type="success" showIcon message="Bạn đã hoàn thành toàn bộ học phí. Cảm ơn bạn!" />
      )}

      <Card
        title={
          isAccountant
            ? 'Quản lý Công nợ & Thu Học phí'
            : isStudent
            ? 'Công nợ Học phí Cá nhân'
            : 'Danh sách Hóa đơn Học phí (Chỉ xem)'
        }
        extra={
          <Space wrap>
            {isAccountant && (
              <>
                <Button
                  icon={<BellOutlined />}
                  disabled={selectedRowKeys.length === 0}
                  onClick={() => openRemindModal(selectedRowKeys)}
                >
                  Nhắc nợ đã chọn ({selectedRowKeys.length})
                </Button>
                <Button
                  type="primary"
                  icon={<BellOutlined />}
                  style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
                  onClick={() => openRemindModal([])}
                >
                  Nhắc tất cả HV còn nợ
                </Button>
              </>
            )}
            <Button icon={<ReloadOutlined />} onClick={fetchInvoices} />
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
          </Row>
        )}

        <Table
          rowKey="id"
          columns={columns}
          dataSource={invoices}
          loading={loading}
          scroll={{ x: 1100 }}
          pagination={{ pageSize: 10, showTotal: (t) => `${t} hóa đơn` }}
          rowSelection={
            isAccountant
              ? {
                  selectedRowKeys,
                  onChange: setSelectedRowKeys,
                  getCheckboxProps: (r) => ({ disabled: r.status === 'PAID' })
                }
              : undefined
          }
          rowClassName={(r) => (r.isOverdue ? 'tuition-row-overdue' : '')}
          expandable={{
            expandedRowRender: (r) => <PaymentHistory invoice={r} onOpenReceipt={setReceiptPaymentId} />,
            rowExpandable: () => true
          }}
        />
      </Card>

      {/* ===== Modal VietQR (UC9.3) ===== */}
      <VietQRModal open={!!qrInvoiceId} invoiceId={qrInvoiceId} onClose={() => setQrInvoiceId(null)} />

      {/* ===== Modal Phiếu thu (DF35) ===== */}
      <ReceiptModal open={!!receiptPaymentId} paymentId={receiptPaymentId} onClose={() => setReceiptPaymentId(null)} />

      {/* ===== Modal Ghi nhận thanh toán (UC9.2) ===== */}
      <Modal
        title={`Ghi nhận thanh toán - Hóa đơn #${selectedInvoice?.id || ''}`}
        open={payModalOpen}
        onCancel={() => setPayModalOpen(false)}
        footer={null}
        destroyOnClose
        width={560}
      >
        {selectedInvoice && (
          <Form form={payForm} layout="vertical" onFinish={handlePayInvoice} preserve={false}>
            <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Học viên" span={2}>
                {selectedInvoice.student?.fullName} ({selectedInvoice.student?.code})
              </Descriptions.Item>
              <Descriptions.Item label="Môn / Lớp" span={2}>
                {selectedInvoice.courseCode} – {selectedInvoice.classCode}
              </Descriptions.Item>
              <Descriptions.Item label="Tổng học phí">{formatVnd(selectedInvoice.amount)}</Descriptions.Item>
              <Descriptions.Item label="Đã nộp">{formatVnd(selectedInvoice.paidAmount)}</Descriptions.Item>
              <Descriptions.Item label="Còn nợ">
                <Text strong type="danger">
                  {formatVnd(selectedInvoice.remainingAmount)}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <InvoiceStatusTag status={selectedInvoice.status} />
              </Descriptions.Item>
            </Descriptions>

            <Form.Item
              name="amountPaid"
              label="Số tiền thực thu đợt này (VNĐ)"
              rules={[
                { required: true, message: 'Vui lòng nhập số tiền' },
                {
                  validator: (_, v) => {
                    if (v === undefined || v === null || v === '') return Promise.resolve();
                    if (Number(v) <= 0) return Promise.reject(new Error('Số tiền phải lớn hơn 0'));
                    if (Number(v) > selectedInvoice.remainingAmount)
                      return Promise.reject(new Error(`Không được vượt quá số còn nợ ${formatVnd(selectedInvoice.remainingAmount)}`));
                    return Promise.resolve();
                  }
                }
              ]}
              extra={
                <Space size={4} style={{ marginTop: 6 }} wrap>
                  <Button size="small" onClick={() => payForm.setFieldsValue({ amountPaid: selectedInvoice.remainingAmount })}>
                    Thu đủ
                  </Button>
                  {[500000, 1000000, 2000000]
                    .filter((v) => v < selectedInvoice.remainingAmount)
                    .map((v) => (
                      <Button key={v} size="small" onClick={() => payForm.setFieldsValue({ amountPaid: v })}>
                        {formatVnd(v)}
                      </Button>
                    ))}
                </Space>
              }
            >
              <InputNumber
                id="pay-amount"
                min={1}
                max={selectedInvoice.remainingAmount}
                step={100000}
                style={{ width: '100%' }}
                formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(val) => val.replace(/[^\d]/g, '')}
                addonAfter="đ"
              />
            </Form.Item>

            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="method" label="Hình thức thanh toán" rules={[{ required: true }]}>
                  <Select
                    id="pay-method"
                    options={Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label }))}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="note" label="Ghi chú">
                  <Input id="pay-note" placeholder="VD: Thu đợt 1, mã GD ngân hàng..." maxLength={255} />
                </Form.Item>
              </Col>
            </Row>

            {previewStatus && !previewStatus.error && (
              <Alert
                style={{ marginBottom: 16 }}
                type={previewStatus.status === 'PAID' ? 'success' : 'info'}
                showIcon
                message={
                  <span>
                    Sau khi thu: trạng thái <b>{selectedInvoice.status}</b> → <b>{previewStatus.status}</b>
                    {previewStatus.status === 'PARTIAL' && <> • còn nợ {formatVnd(previewStatus.remainingAfter)}</>}
                  </span>
                }
              />
            )}

            <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setPayModalOpen(false)}>Hủy</Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={paying}
                  icon={<FileDoneOutlined />}
                  style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
                >
                  Xác nhận thu & Xuất phiếu thu
                </Button>
              </Space>
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* ===== Modal Nhắc nợ (UC10.2 - Trigger 3) ===== */}
      <Modal
        title="Gửi thông báo nhắc đóng học phí (TUITION)"
        open={remindModalOpen}
        onCancel={() => setRemindModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Alert
          style={{ marginBottom: 16 }}
          type="info"
          showIcon
          message={
            remindTargetIds.length > 0
              ? `Gửi nhắc cho ${remindTargetIds.length} hóa đơn đã chọn.`
              : 'Gửi nhắc cho TẤT CẢ hóa đơn chưa hoàn thành (UNPAID / PARTIAL).'
          }
          description="Mỗi học viên sẽ nhận một thông báo trên quả chuông, kèm số tiền còn nợ, hạn đóng và nội dung chuyển khoản VietQR."
        />
        <Form form={remindForm} layout="vertical" onFinish={handleSendReminders}>
          <Form.Item name="onlyOverdue" valuePropName="checked">
            <Checkbox>Chỉ gửi cho hóa đơn đã quá hạn</Checkbox>
          </Form.Item>
          <Form.Item name="note" label="Lời nhắn thêm (tùy chọn)">
            <Input.TextArea rows={3} maxLength={300} placeholder="VD: Hạn chót đóng học phí kỳ 2026A là 30/10/2026." />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setRemindModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={reminding}
                icon={<BellOutlined />}
                style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
              >
                Gửi thông báo
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TuitionPage;
