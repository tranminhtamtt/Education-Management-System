import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Select, Space, Statistic, Switch, Table, Tabs, Tag, Typography, message } from 'antd';
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
  const [advanced, setAdvanced] = useState(false);
  const [data, setData] = useState({ items: [], total: 0 });
  const [query, setQuery] = useState({ page: 1, pageSize: 20 });
  const [summary, setSummary] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [detail, setDetail] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [rangeResult, setRangeResult] = useState(null);
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
      const { type, row } = dialog;
      if (type === 'discrepancy') await api.patch(`/accountant/discrepancies/${row.id}`, values);
      if (type === 'refund') await api.post('/accountant/refunds', values);
      if (type === 'transition') await api.patch(`/accountant/refunds/${row.id}`, values);
      if (type === 'reconcile') setReconciliation((await api.post('/accountant/reconcile', values)).data);
      if (type === 'reconcile-range') {
        const [from, to] = values.range;
        setRangeResult((await api.post('/accountant/reconcile-range', { from: from.format('YYYY-MM-DD'), to: to.format('YYYY-MM-DD') })).data);
      }
      setDialog(null); message.success('Đã xử lý'); load();
    } catch (e) { message.error(e.response?.data?.message || 'Xử lý thất bại'); }
    finally { setSaving(false); }
  };
  const recoverPayment = async providerId => {
    setSaving(true);
    try {
      await api.post('/accountant/recover-payment', { providerId });
      message.success('Đã ghi nhận từ dữ liệu SePay xác minh; giao dịch sai mã sẽ vào danh sách sai lệch.');
      setReconciliation(null); setRangeResult(null); load();
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
    { title: 'Xử lý', render: (_, r) => <Button onClick={() => open('discrepancy', r)}>Kiểm tra / Ghi chú</Button> }
  ] : tab === 'refunds' ? [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: 'Giao dịch gốc', render: (_, r) => <Button type="link" onClick={() => showDetail(r.transactionId)}>SePay {r.transaction?.providerId}</Button> },
    { title: 'Sinh viên', render: (_, r) => studentOf(r.transaction) },
    { title: 'Số tiền', dataIndex: 'amount', render: money },
    { title: 'Lý do', dataIndex: 'reason', ellipsis: true },
    { title: 'Trạng thái', dataIndex: 'status', render: statusTag },
    { title: 'Mã hoàn', dataIndex: 'reference', render: v => v || '—' },
    { title: 'Xử lý', render: (_, r) => ['PENDING', 'APPROVED'].includes(r.status) && <Button onClick={() => open('transition', r)}>Xử lý</Button> }
  ] : transactionColumns;

  const rangeColumns = [
    { title: 'SePay ID', dataIndex: 'providerId' },
    { title: 'Thời gian', dataIndex: 'transactionDate', render: v => v || '—' },
    { title: 'Số tiền', dataIndex: 'amount', render: money },
    { title: 'Mã ngân hàng', dataIndex: 'reference', render: v => v || '—' },
    { title: 'Kết quả', dataIndex: 'status', render: statusTag },
    { title: 'Ghi chú', render: (_, r) => r.note || (r.status === 'UNMATCHED' ? 'Có ở ngân hàng, chưa có trong EMS' : r.localStatus ? `EMS: ${r.localStatus}` : '') },
    { title: '', render: (_, r) => r.status === 'UNMATCHED' && <Button size="small" loading={saving} onClick={() => recoverPayment(r.providerId)}>Ghi nhận</Button> }
  ];

  return <Space direction="vertical" size="large" style={{ width: '100%' }}>
    <Card title="Giao dịch thanh toán" extra={<Button onClick={load}>Tải lại</Button>}>
      <Space wrap size="large">
        <InputNumber aria-label="Năm báo cáo" min={2000} max={2100} value={year} onChange={v => v && setYear(v)} />
        <Statistic title="Tiền vào ngân hàng trong năm" value={money(summary?.bankReceived)} />
        <Statistic title="Đã phân bổ học phí trong năm" value={money(summary?.applied)} />
        <Statistic title="Đã hoàn trong năm" value={money(summary?.refunded)} />
        <Statistic title="Công nợ còn lại (toàn bộ)" value={money(summary?.outstanding)} />
        <Statistic title="Sai lệch đang mở" value={summary?.anomalous || 0} valueStyle={{ color: summary?.anomalous ? '#cf1322' : undefined }} />
      </Space>
    </Card>
    {error && <Alert type="error" showIcon message={error} />}
    <Card>
      <Space style={{ marginBottom: 16 }}><Switch checked={advanced} onChange={value => { setAdvanced(value); setTab('transactions'); setQuery({ page: 1, pageSize: 20 }); }} /><Typography.Text>Hiện đối soát & hoàn tiền (mở rộng)</Typography.Text></Space>
      <Tabs activeKey={tab} onChange={v => { setTab(v); setQuery({ page: 1, pageSize: 20 }); }} items={[['transactions', 'Lịch sử giao dịch'], ['discrepancies', 'Cần kiểm tra'], ...(advanced ? [['reconcile', 'Đối soát SePay'], ['refunds', 'Hoàn tiền']] : [])].map(([key, label]) => ({ key, label }))} />
      <Space wrap style={{ marginBottom: 16 }}>
        {['transactions', 'reconcile'].includes(tab) && <Input.Search placeholder="Mã SePay, mã ngân hàng, mã thanh toán, sinh viên" allowClear style={{ width: 320 }} onSearch={search => setQuery(q => ({ ...q, page: 1, search }))} />}
        {['transactions', 'reconcile'].includes(tab) && <DatePicker.RangePicker format="DD/MM/YYYY" onChange={r => setQuery(q => ({ ...q, page: 1, from: r?.[0]?.startOf('day').toISOString(), to: r?.[1]?.endOf('day').toISOString() }))} />}
        <Select placeholder="Trạng thái" allowClear style={{ width: 180 }} value={query.status} onChange={status => setQuery(q => ({ ...q, status, page: 1 }))} options={(tab === 'refunds' ? ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'] : tab === 'discrepancies' ? ['OPEN', 'RESOLVED'] : ['MATCHED', 'UNMATCHED', 'DISCREPANCY']).map(value => ({ value, label: STATUS_LABELS[value] || value }))} />
        {tab === 'discrepancies' && <Select placeholder="Lý do" allowClear style={{ width: 220 }} value={query.reason} onChange={reason => setQuery(q => ({ ...q, reason, page: 1 }))} options={Object.entries(REASONS).map(([value, label]) => ({ value, label }))} />}
        {tab === 'refunds' && <Button type="primary" onClick={() => open('refund')}>Tạo yêu cầu hoàn</Button>}
        {tab === 'reconcile' && <Button type="primary" onClick={() => open('reconcile-range')}>Đối soát theo khoảng ngày</Button>}
        {tab === 'reconcile' && <Button onClick={() => open('reconcile')}>Đối soát theo SePay ID</Button>}
      </Space>
      {tab === 'reconcile' && <Alert style={{ marginBottom: 16 }} type="info" showIcon message="Truy vấn trực tiếp SePay User API để so sánh với giao dịch EMS. Đối soát không cộng tiền; chỉ giao dịch UNMATCHED (ngân hàng có, EMS chưa có) mới được ghi nhận bằng dữ liệu SePay. Cần cấu hình SEPAY_API_TOKEN." />}
      {tab === 'refunds' && <Alert style={{ marginBottom: 16 }} type="info" showIcon message="Chỉ hoàn phần tiền chưa phân bổ vào học phí (chuyển thừa/trùng/sai mã). Chuyển khoản hoàn thực hiện thủ công tại ngân hàng rồi nhập mã tham chiếu. Hoàn do hủy khóa học cần quy định của nhà trường." />}
      {reconciliation && tab === 'reconcile' && <Alert style={{ marginBottom: 16 }} type={reconciliation.status === 'MATCHED' ? 'success' : 'warning'} showIcon message={`SePay ${reconciliation.providerId}: ${reconciliation.status} — ngân hàng ${money(reconciliation.bank?.amount_in)} (${reconciliation.bank?.reference_number || 'không có mã'})`} action={reconciliation.status === 'UNMATCHED' && <Button loading={saving} onClick={() => recoverPayment(reconciliation.providerId)}>Ghi nhận giao dịch đã xác minh</Button>} />}
      {rangeResult && tab === 'reconcile' && <Card size="small" style={{ marginBottom: 16 }} title={`Kết quả đối soát ${rangeResult.summary.from} → ${rangeResult.summary.to}`} extra={<Button size="small" onClick={() => setRangeResult(null)}>Đóng</Button>}>
        <Space size="large" style={{ marginBottom: 12 }}>
          <Statistic title="Giao dịch ngân hàng" value={rangeResult.summary.bankCount} />
          <Statistic title="MATCHED" value={rangeResult.summary.matched} valueStyle={{ color: '#389e0d' }} />
          <Statistic title="UNMATCHED" value={rangeResult.summary.unmatched} valueStyle={{ color: '#d46b08' }} />
          <Statistic title="DISCREPANCY" value={rangeResult.summary.discrepancy} valueStyle={{ color: '#cf1322' }} />
        </Space>
        {rangeResult.summary.truncated && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="SePay trả về số lượng tối đa; hãy thu hẹp khoảng ngày để đối soát đầy đủ." />}
        <Table size="small" rowKey="providerId" columns={rangeColumns} dataSource={rangeResult.rows} pagination={{ pageSize: 10 }} scroll={{ x: 900 }} />
      </Card>}
      <Table rowKey="id" loading={loading} columns={columns} dataSource={data.items} scroll={{ x: 1100 }} pagination={{ current: query.page, pageSize: query.pageSize, total: data.total, showSizeChanger: true, showTotal: t => `${t} bản ghi`, onChange: (page, pageSize) => setQuery(q => ({ ...q, page, pageSize })) }} />
    </Card>
    <Modal open={!!dialog} title="Xử lý thanh toán" onCancel={() => setDialog(null)} onOk={() => form.submit()} confirmLoading={saving} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={submit}>
        {dialog?.type === 'discrepancy' && <>
          <Descriptions size="small" column={1} style={{ marginBottom: 12 }} items={[
            { key: 'r', label: 'Lý do', children: REASONS[dialog.row.reason] || dialog.row.reason },
            { key: 'a', label: 'Tiền vào / đã phân bổ', children: `${money(dialog.row.transaction?.amount)} / ${money(dialog.row.transaction?.appliedAmount)}` },
            { key: 'c', label: 'Nội dung CK', children: dialog.row.transaction?.payload?.content || '—' }
          ]} />
          <Form.Item name="invoiceId" label="Ghép vào hóa đơn # (chỉ giao dịch chưa phân bổ, chỉ cộng tối đa số còn nợ)"><InputNumber min={1} precision={0} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="note" label="Ghi chú kiểm tra" rules={[{ required: true, whitespace: true, message: 'Bắt buộc ghi chú' }, { max: 4000 }]}><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="status" label="Trạng thái xử lý"><Select allowClear options={['OPEN', 'RESOLVED'].map(value => ({ value, label: STATUS_LABELS[value] || value }))} /></Form.Item>
        </>}
        {dialog?.type === 'refund' && <>
          <Form.Item name="transactionId" label="ID giao dịch EMS" rules={[{ required: true }]}><InputNumber min={1} precision={0} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="amount" label="Số tiền hoàn (VND)" rules={[{ required: true }]}><InputNumber min={1} precision={0} style={{ width: '100%' }} formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')} parser={v => v.replace(/\./g, '')} /></Form.Item>
          <Form.Item name="reason" label="Lý do" rules={[{ required: true, whitespace: true }, { max: 255 }]}><Input.TextArea /></Form.Item>
        </>}
        {dialog?.type === 'transition' && <>
          <Form.Item name="status" label="Quyết định" rules={[{ required: true }]}><Select options={(dialog.row.status === 'PENDING' ? ['APPROVED', 'REJECTED'] : ['COMPLETED']).map(value => ({ value, label: STATUS_LABELS[value] || value }))} /></Form.Item>
          {dialog.row.status === 'APPROVED' && <Form.Item name="reference" label="Mã chuyển khoản hoàn tiền thủ công" rules={[{ required: true, whitespace: true }, { max: 150 }]}><Input /></Form.Item>}
        </>}
        {dialog?.type === 'reconcile' && <Form.Item name="providerId" label="SePay transaction ID" rules={[{ required: true }]}><InputNumber min={1} precision={0} style={{ width: '100%' }} /></Form.Item>}
        {dialog?.type === 'reconcile-range' && <Form.Item name="range" label="Khoảng ngày (tối đa 31 ngày)" rules={[{ required: true }]}><DatePicker.RangePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>}
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
          { key: 'disc', label: 'Sai lệch', span: 2, children: detail.discrepancy ? `${REASONS[detail.discrepancy.reason]} — ${detail.discrepancy.status}` : 'Không' }
        ]} />
        {detail.refunds?.length > 0 && <Table size="small" rowKey="id" pagination={false} dataSource={detail.refunds} columns={[{ title: 'Hoàn #', dataIndex: 'id' }, { title: 'Số tiền', dataIndex: 'amount', render: money }, { title: 'Trạng thái', dataIndex: 'status', render: statusTag }, { title: 'Mã hoàn', dataIndex: 'reference' }]} />}
        <Typography.Text type="secondary">Audit trail</Typography.Text>
        <Table size="small" rowKey="id" pagination={false} dataSource={detail.auditLogs} columns={[{ title: 'Thời gian', dataIndex: 'createdAt', render: dateTime }, { title: 'Hành động', dataIndex: 'action' }, { title: 'Người thực hiện', dataIndex: 'actorId', render: v => (v ? `#${v}` : 'Hệ thống (webhook)') }]} />
        <Typography.Text type="secondary">Giao dịch đã xác nhận là chỉ đọc, không thể sửa hoặc xóa.</Typography.Text>
      </Space>}
    </Modal>
  </Space>;
}
