import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Select, Space, Statistic, Table, Tabs, Tag, Typography, message } from 'antd';
import { Navigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const money = n => Number(n || 0).toLocaleString('vi-VN') + ' đ';
const dateTime = v => (v ? new Date(v).toLocaleString('vi-VN') : '—');
const STATUS_COLORS = { MATCHED: 'green', UNMATCHED: 'orange', DISCREPANCY: 'red', OPEN: 'red', RESOLVED: 'green', PENDING: 'gold', APPROVED: 'blue', REJECTED: 'default', COMPLETED: 'green' };
const STATUS_LABELS = { MATCHED: 'Đã khớp', UNMATCHED: 'Chưa khớp', DISCREPANCY: 'Cần kiểm tra', OPEN: 'Chưa xử lý', RESOLVED: 'Đã xử lý', PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', COMPLETED: 'Hoàn tất' };
const statusTag = v => <Tag color={STATUS_COLORS[v] || 'default'}>{STATUS_LABELS[v] || v}</Tag>;
const REASONS = { UNDERPAYMENT: 'Chuyển thiếu', OVERPAYMENT_OR_DUPLICATE: 'Chuyển thừa / trùng', UNKNOWN_PAYMENT_CODE: 'Sai / thiếu mã thanh toán' };
const studentOf = t => (t?.invoice?.student ? `${t.invoice.student.code} - ${t.invoice.student.fullName}` : 'Chưa xác định');

export default function PaymentOperationsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('transactions');
  const [data, setData] = useState({ items: [], total: 0 });
  const [query, setQuery] = useState({ page: 1, pageSize: 20 });
  const [summary, setSummary] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [detail, setDetail] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [range, setRange] = useState(null);
  const [rangeResult, setRangeResult] = useState(null);
  const [rangeError, setRangeError] = useState('');
  const [rangeLoading, setRangeLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    if (user?.role !== 'ACCOUNTANT') return;
    setLoading(true); setError('');
    try {
      const resource = tab === 'reconcile' ? 'transactions' : tab;
      const [list, totals] = await Promise.all([
        api.get(`/accountant/${resource}`, { params: query }),
        api.get('/accountant/summary', { params: { year } })
      ]);
      setData(list.data); setSummary(totals.data);
    } catch (e) { setError(e.response?.data?.message || 'Không tải được dữ liệu'); }
    finally { setLoading(false); }
  }, [tab, query, user?.role, year]);
  useEffect(() => { load(); }, [load]);
  if (user?.role !== 'ACCOUNTANT') return <Navigate to="/dashboard" replace />;

  const open = (type, row) => { form.resetFields(); setDialog({ type, row }); };
  const showDetail = async id => {
    try { setDetail((await api.get(`/accountant/transactions/${id}`)).data); }
    catch (e) { message.error(e.response?.data?.message || 'Không tải được chi tiết giao dịch'); }
  };
  const submit = async values => {
    setSaving(true);
    try {
      if (dialog.type === 'discrepancy') {
        await api.patch('/accountant/discrepancies/' + dialog.row.id, { status: 'RESOLVED', note: values.note });
      } else {
        setReconciliation((await api.post('/accountant/reconcile', values)).data);
      }
      setDialog(null); message.success('Đã xử lý'); load();
    } catch (e) { message.error(e.response?.data?.message || 'Xử lý thất bại'); }
    finally { setSaving(false); }
  };
  const reconcileRange = async dates => {
    setRangeLoading(true);
    setRangeError('');
    setRangeResult(null);
    try {
      const result = await api.post('/accountant/reconcile-range', {
        from: dates[0].format('YYYY-MM-DD'),
        to: dates[1].format('YYYY-MM-DD')
      });
      setRangeResult(result.data);
    } catch (e) {
      setRangeError(e.response?.data?.message || 'Không kết nối được SePay. Vui lòng thử lại.');
    } finally {
      setRangeLoading(false);
    }
  };
  const recoverPayment = async providerId => {
    setSaving(true);
    try {
      await api.post('/accountant/recover-payment', { providerId });
      message.success('Đã ghi nhận từ dữ liệu SePay xác minh; giao dịch sai mã sẽ vào danh sách sai lệch.');
      if (rangeResult && range) await reconcileRange(range);
      if (reconciliation?.providerId === providerId) {
        setReconciliation((await api.post('/accountant/reconcile', { providerId })).data);
      }
      load();
    } catch (e) { message.error(e.response?.data?.message || 'Không khôi phục được giao dịch'); }
    finally { setSaving(false); }
  };

  const transactionColumns = [
    { title: 'SePay ID', dataIndex: 'providerId' },
    { title: 'Mã ngân hàng', dataIndex: 'reference', render: v => v || '—' },
    { title: 'Mã thanh toán', render: (_, r) => r.order?.code || <Typography.Text type="warning">Chưa khớp</Typography.Text> },
    { title: 'Sinh viên', render: (_, r) => studentOf(r) },
    { title: 'Hóa đơn', render: (_, r) => (r.invoiceId ? `#${r.invoiceId} ${r.invoice?.enrollment?.class?.course?.courseCode || ''}` : '—') },
    { title: 'Tiền vào', dataIndex: 'amount', render: money },
    { title: 'Phân bổ', dataIndex: 'appliedAmount', render: money },
    { title: 'Thời gian', dataIndex: 'occurredAt', render: dateTime },
    { title: 'Trạng thái', dataIndex: 'status', render: statusTag },
    { title: '', render: (_, r) => <Button size="small" onClick={() => showDetail(r.id)}>Chi tiết</Button> }
  ];
  const columns = tab === 'discrepancies' ? [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: 'Giao dịch', render: (_, r) => <Button type="link" onClick={() => showDetail(r.transactionId)}>SePay {r.transaction?.providerId}</Button> },
    { title: 'Lý do', dataIndex: 'reason', render: v => REASONS[v] || v },
    { title: 'Sinh viên', render: (_, r) => studentOf(r.transaction) },
    { title: 'Tiền vào / Phân bổ', render: (_, r) => `${money(r.transaction?.amount)} / ${money(r.transaction?.appliedAmount)}` },
    { title: 'Trạng thái', dataIndex: 'status', render: statusTag },
    { title: 'Ghi chú', dataIndex: 'note', ellipsis: true },
    { title: '', render: (_, r) => r.status === 'OPEN' && <Button onClick={() => open('discrepancy', r)}>Đánh dấu đã xử lý</Button> },
  ] : transactionColumns;


  return <Space direction="vertical" size="large" style={{ width: '100%' }}>
    <Card title="Giao dịch thanh toán" extra={<Button onClick={load}>Tải lại</Button>}>
      <Space wrap size="large">
        <InputNumber aria-label="Năm báo cáo" min={2000} max={2100} value={year} onChange={v => v && setYear(v)} />
        <Statistic title="Tiền vào ngân hàng trong năm" value={money(summary?.bankReceived)} />
        <Statistic title="Đã phân bổ học phí trong năm" value={money(summary?.applied)} />
        <Statistic title="Chưa thu trên hóa đơn (toàn bộ)" value={money(summary?.outstanding)} />
        <Statistic title="Sai lệch đang mở" value={summary?.anomalous || 0} valueStyle={{ color: summary?.anomalous ? '#cf1322' : undefined }} />
      </Space>
    </Card>
    {error && <Alert type="error" showIcon message={error} />}
    <Card>
      <Tabs activeKey={tab} onChange={v => { setTab(v); setQuery({ page: 1, pageSize: 20, ...(v === 'discrepancies' ? { status: 'OPEN' } : {}) }); }} items={[['transactions', 'Lịch sử giao dịch'], ['discrepancies', 'Cần kiểm tra'], ['reconcile', 'Đối soát SePay']].map(([key, label]) => ({ key, label }))} />
      {tab !== 'reconcile' && <Space wrap style={{ marginBottom: 16 }}>
        {tab === 'transactions' && <Input.Search placeholder="Mã SePay, mã ngân hàng, mã thanh toán, sinh viên" allowClear style={{ width: 320 }} onSearch={search => setQuery(q => ({ ...q, page: 1, search }))} />}
        {['transactions', 'reconcile'].includes(tab) && <DatePicker.RangePicker format="DD/MM/YYYY" onChange={r => setQuery(q => ({ ...q, page: 1, from: r?.[0]?.startOf('day').toISOString(), to: r?.[1]?.endOf('day').toISOString() }))} />}
        <Select placeholder="Trạng thái" allowClear style={{ width: 180 }} value={query.status} onChange={status => setQuery(q => ({ ...q, status, page: 1 }))} options={(tab === 'discrepancies' ? ['OPEN', 'RESOLVED'] : ['MATCHED', 'UNMATCHED', 'DISCREPANCY']).map(value => ({ value, label: STATUS_LABELS[value] || value }))} />
        {tab === 'discrepancies' && <Select placeholder="Lý do" allowClear style={{ width: 220 }} value={query.reason} onChange={reason => setQuery(q => ({ ...q, reason, page: 1 }))} options={Object.entries(REASONS).map(([value, label]) => ({ value, label }))} />}
      </Space>}
      {tab === 'reconcile' && <>
        <Space wrap style={{ marginBottom: 16 }}>
          <DatePicker.RangePicker value={range} disabled={rangeLoading || saving} placeholder={['Ngày bắt đầu', 'Ngày kết thúc']} onChange={dates => { setRange(dates); setRangeResult(null); setRangeError(''); }} />
          <Button type="primary" loading={rangeLoading} disabled={!range?.[0] || !range?.[1] || saving} onClick={() => reconcileRange(range)}>Đối soát</Button>
          <Button disabled={rangeLoading || saving} onClick={() => open('reconcile')}>Đối soát theo SePay ID</Button>
        </Space>
        {rangeError && <Alert type="error" showIcon message={rangeError} />}
        {rangeResult?.summary.truncated && <Alert type="warning" showIcon message="Dữ liệu SePay đạt giới hạn 5.000 giao dịch và có thể chưa đầy đủ. Hãy thu hẹp khoảng ngày. EMS chưa kết luận các giao dịch vắng trong kết quả là thiếu ở ngân hàng." />}
        <Table rowKey="providerId" loading={rangeLoading} dataSource={rangeResult?.rows || []} pagination={{ pageSize: 20 }} scroll={{ x: 1000 }} columns={[
          { title: 'SePay ID', dataIndex: 'providerId' },
          { title: 'Mã tham chiếu', dataIndex: 'reference' },
          { title: 'Thời gian', dataIndex: 'transactionDate' },
          { title: 'Số tiền', dataIndex: 'amount', render: money },
          { title: 'Nội dung chuyển khoản', dataIndex: 'content' },
          { title: 'Đối soát ngân hàng', dataIndex: 'status', render: statusTag },
          { title: 'Phân bổ trong EMS', dataIndex: 'localStatus', render: v => v ? statusTag(v) : 'Chưa ghi nhận' },
          { title: 'Ghi chú', dataIndex: 'note' },
          { title: '', render: (_, row) => row.status === 'UNMATCHED' && <Button loading={saving} disabled={rangeLoading} onClick={() => recoverPayment(row.providerId)}>Ghi nhận</Button> }
        ]} />
      </>}
      {tab === 'reconcile' && <Alert style={{ marginBottom: 16 }} type="info" showIcon message="Truy vấn trực tiếp SePay User API để so sánh với giao dịch EMS. Đối soát không cộng tiền; chỉ giao dịch UNMATCHED (ngân hàng có, EMS chưa có) mới được ghi nhận bằng dữ liệu SePay. Khớp ngân hàng không đồng nghĩa đã phân bổ đủ học phí hoặc hồ sơ sai lệch đã xử lý." />}
      {reconciliation && tab === 'reconcile' && <Alert style={{ marginBottom: 16 }} type={reconciliation.status === 'MATCHED' ? 'success' : 'warning'} showIcon message={`SePay ${reconciliation.providerId}: ${reconciliation.status} — ngân hàng ${money(reconciliation.bank?.amount_in)} (${reconciliation.bank?.reference_number || 'không có mã'}). Phân bổ trong EMS: ${STATUS_LABELS[reconciliation.localStatus] || 'Chưa ghi nhận'}`} action={reconciliation.status === 'UNMATCHED' && <Button loading={saving} onClick={() => recoverPayment(reconciliation.providerId)}>Ghi nhận giao dịch đã xác minh</Button>} />}
      {tab !== 'reconcile' && <Table rowKey="id" loading={loading} columns={columns} dataSource={data.items} scroll={{ x: 1100 }} pagination={{ current: query.page, pageSize: query.pageSize, total: data.total, showSizeChanger: true, showTotal: t => `${t} bản ghi`, onChange: (page, pageSize) => setQuery(q => ({ ...q, page, pageSize })) }} />}
    </Card>
    <Modal open={!!dialog} title={dialog?.type === 'discrepancy' ? 'Đánh dấu đã xử lý' : 'Đối soát theo SePay ID'} onCancel={() => setDialog(null)} onOk={() => form.submit()} confirmLoading={saving} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={submit}>
        {dialog?.type === 'discrepancy' && <>
          <Alert type="info" showIcon message="Chỉ đóng hồ sơ sau khi trung tâm xác nhận đã xử lý. EMS không chuyển hoàn tiền hoặc sửa số tiền hóa đơn; việc đóng hồ sơ không phải bằng chứng ngân hàng đã hoàn tiền." />
          <Form.Item name="note" label="Kết quả kiểm tra / xử lý ngoài EMS" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập ghi chú xử lý' }, { max: 4000 }]}><Input.TextArea rows={4} maxLength={4000} showCount /></Form.Item>
        </>}
        {dialog?.type === 'reconcile' && <Form.Item name="providerId" label="SePay transaction ID" rules={[{ required: true }]}><InputNumber min={1} precision={0} style={{ width: '100%' }} /></Form.Item>}
      </Form>
    </Modal>
    <Modal open={!!detail} width={760} title={`Chi tiết giao dịch #${detail?.id || ''}`} footer={null} onCancel={() => setDetail(null)}>
      {detail && <Space direction="vertical" style={{ width: '100%' }}>
        <Descriptions column={2} bordered size="small" items={[
          { key: 'provider', label: 'SePay ID', children: detail.providerId },
          { key: 'ref', label: 'Mã ngân hàng', children: detail.reference || '—' },
          { key: 'status', label: 'Trạng thái', children: statusTag(detail.status) },
          { key: 'time', label: 'Thời gian', children: dateTime(detail.occurredAt) },
          { key: 'amount', label: 'Tiền vào', children: money(detail.amount) },
          { key: 'applied', label: 'Đã phân bổ', children: money(detail.appliedAmount) },
          { key: 'order', label: 'Mã thanh toán', children: detail.order?.code || 'Không khớp' },
          { key: 'invoice', label: 'Hóa đơn', children: detail.invoiceId ? `#${detail.invoiceId} (${detail.invoice?.status})` : 'Chưa ghép' },
          { key: 'student', label: 'Sinh viên', span: 2, children: studentOf(detail) },
          { key: 'content', label: 'Nội dung CK', span: 2, children: detail.payload?.content || '—' },
          { key: 'disc', label: 'Sai lệch', span: 2, children: detail.discrepancy ? `${REASONS[detail.discrepancy.reason]} — ${detail.discrepancy.status}` : 'Không' },
          { key: 'note', label: 'Ghi chú xử lý', span: 2, children: detail.discrepancy?.note || '—' }
        ]} />
        {detail.refunds?.length > 0 && <Table size="small" rowKey="id" pagination={false} dataSource={detail.refunds} columns={[{ title: 'Hoàn #', dataIndex: 'id' }, { title: 'Số tiền', dataIndex: 'amount', render: money }, { title: 'Trạng thái', dataIndex: 'status', render: statusTag }, { title: 'Mã hoàn', dataIndex: 'reference' }]} />}
        <Typography.Text type="secondary">Audit trail</Typography.Text>
        <Table size="small" rowKey="id" pagination={false} dataSource={detail.auditLogs} columns={[{ title: 'Thời gian', dataIndex: 'createdAt', render: dateTime }, { title: 'Hành động', dataIndex: 'action' }, { title: 'Người thực hiện', dataIndex: 'actorId', render: v => (v ? `#${v}` : 'Hệ thống (webhook)') }]} />
        <Typography.Text type="secondary">Giao dịch đã xác nhận là chỉ đọc, không thể sửa hoặc xóa.</Typography.Text>
      </Space>}
    </Modal>
  </Space>;
}
