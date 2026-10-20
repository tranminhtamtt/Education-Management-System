import React, { useCallback, useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Typography, Table, Tag, Space, Button, DatePicker, Progress, Spin, Empty, message } from 'antd';
import {
  DollarCircleOutlined,
  WalletOutlined,
  WarningOutlined,
  RiseOutlined,
  TeamOutlined,
  ReloadOutlined,
  DownloadOutlined,
  PrinterOutlined,
  ArrowRightOutlined
} from '@ant-design/icons';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import { ReceiptModal } from '../../components/tuition/TuitionModals';
import { formatVnd, InvoiceStatusTag, METHOD_LABELS } from '../../components/tuition/tuitionHelpers';

const { Title, Text } = Typography;

const toMillion = (v) => `${(Number(v) / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}Tr`;

// Xuất danh sách công nợ ra CSV (mở được bằng Excel, có BOM UTF-8 để hiển thị tiếng Việt)
const exportDebtCsv = (rows, year) => {
  const header = ['Mã HĐ', 'Mã HV', 'Họ tên', 'Email', 'SĐT', 'Lớp', 'Môn', 'Học phí', 'Đã nộp', 'Còn nợ', 'Trạng thái', 'Hạn đóng', 'Số ngày quá hạn'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.id,
      r.student.code,
      r.student.fullName,
      r.student.email,
      r.student.phone,
      r.classCode,
      r.courseCode,
      r.amount,
      r.paidAmount,
      r.remainingAmount,
      r.status,
      dayjs(r.dueDate).format('DD/MM/YYYY'),
      r.overdueDays
    ]
      .map(esc)
      .join(',')
  );
  const csv = '\uFEFF' + [header.map(esc).join(','), ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cong-no-hoc-phi-${year}-${dayjs().format('YYYYMMDD')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const TuitionReportPage = ({ embedded = false }) => {
  const navigate = useNavigate();
  const [year, setYear] = useState(dayjs().year());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [receiptPaymentId, setReceiptPaymentId] = useState(null);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/analytics/tuition-revenue', { params: { year } });
      if (res.success) setData(res.data);
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi tải thống kê doanh thu');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  const { kpi, monthly, statusBreakdown, byCourse, debtList, recentPayments } = data;
  const hasMonthlyData = monthly.some((m) => m.collected > 0 || m.outstanding > 0);

  return (
    <Spin spinning={loading}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          {embedded ? (
            <Title level={5} style={{ margin: 0 }}>
              Tổng quan Tài chính Học phí
            </Title>
          ) : (
            <Title level={4} style={{ margin: 0 }}>
              Báo cáo Doanh thu & Công nợ Học phí
            </Title>
          )}
          <Text type="secondary">Đã thu theo ngày thu từng đợt • Còn nợ theo tháng phát sinh hóa đơn</Text>
        </div>
        <Space>
          <DatePicker
            id="revenue-year-picker"
            picker="year"
            allowClear={false}
            value={dayjs().year(year)}
            onChange={(d) => d && setYear(d.year())}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchReport} />
        </Space>
      </div>

      {/* ===== KPI ===== */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} xl={4}>
          <Card bordered={false}>
            <Statistic title="Tổng phải thu" value={kpi.totalAmount} formatter={formatVnd} prefix={<WalletOutlined style={{ color: '#1677ff' }} />} valueStyle={{ fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={5}>
          <Card bordered={false}>
            <Statistic title="Đã thu" value={kpi.paidAmount} formatter={formatVnd} valueStyle={{ color: '#52c41a', fontSize: 20 }} prefix={<DollarCircleOutlined />} />
            <Progress percent={kpi.paidRate} size="small" strokeColor="#52c41a" />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={5}>
          <Card bordered={false}>
            <Statistic title="Còn nợ" value={kpi.debtAmount} formatter={formatVnd} valueStyle={{ color: '#ff4d4f', fontSize: 20 }} prefix={<DollarCircleOutlined />} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {kpi.unpaidCount} chưa đóng • {kpi.partialCount} nợ một phần • {kpi.paidCount} hoàn thành
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={5}>
          <Card bordered={false}>
            <Statistic
              title="Quá hạn"
              value={kpi.overdueAmount}
              formatter={formatVnd}
              valueStyle={{ color: kpi.overdueCount ? '#cf1322' : undefined, fontSize: 20 }}
              prefix={<WarningOutlined />}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {kpi.overdueCount} hóa đơn quá hạn
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={5}>
          <Card bordered={false}>
            <Statistic title={`Thu trong tháng ${dayjs().format('MM/YYYY')}`} value={kpi.collectedThisMonth} formatter={formatVnd} valueStyle={{ color: '#F26F21', fontSize: 20 }} prefix={<RiseOutlined />} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              <TeamOutlined /> {kpi.debtorCount} học viên còn nợ
            </Text>
          </Card>
        </Col>
      </Row>

      {/* ===== Biểu đồ ===== */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={16}>
          <Card bordered={false} title={`Doanh thu đã thu vs Còn nợ theo tháng – năm ${year}`}>
            {hasMonthlyData ? (
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthly} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" />
                    <YAxis tickFormatter={toMillion} />
                    <Tooltip formatter={(v) => formatVnd(v)} />
                    <Legend />
                    <Bar dataKey="collected" name="Đã thu" fill="#52c41a" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="outstanding" name="Còn nợ" fill="#ff4d4f" radius={[6, 6, 0, 0]} />
                    <Line type="monotone" dataKey="issued" name="Phát sinh phải thu" stroke="#F26F21" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty description={`Chưa có dữ liệu học phí trong năm ${year}`} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card bordered={false} title="Tình trạng hóa đơn">
            {kpi.invoiceCount > 0 ? (
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusBreakdown} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={4} label={({ value }) => value || ''}>
                      {statusBreakdown.map((s) => (
                        <Cell key={s.status} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty />
            )}
          </Card>
        </Col>
      </Row>

      {/* ===== Danh sách công nợ ===== */}
      <Card
        bordered={false}
        style={{ marginBottom: 16 }}
        title={
          <span>
            Danh sách công nợ <Tag color="red">{debtList.length}</Tag>
          </span>
        }
        extra={
          <Space>
            <Button icon={<DownloadOutlined />} disabled={debtList.length === 0} onClick={() => exportDebtCsv(debtList, year)}>
              Xuất Excel (CSV)
            </Button>
            <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => navigate('/tuition')} style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}>
              Đến trang Thu phí
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          size="small"
          dataSource={embedded ? debtList.slice(0, 5) : debtList}
          pagination={embedded ? false : { pageSize: 8 }}
          scroll={{ x: 900 }}
          rowClassName={(r) => (r.isOverdue ? 'tuition-row-overdue' : '')}
          columns={[
            {
              title: 'Học viên',
              render: (_, r) => (
                <div>
                  <Text strong>{r.student.fullName}</Text>
                  <div style={{ fontSize: 12, color: '#F26F21' }}>{r.student.code}</div>
                </div>
              )
            },
            { title: 'Lớp / Môn', render: (_, r) => `${r.classCode} (${r.courseCode})` },
            { title: 'Còn nợ', dataIndex: 'remainingAmount', align: 'right', render: (v) => <Text strong type="danger">{formatVnd(v)}</Text> },
            { title: 'Trạng thái', dataIndex: 'status', render: (s) => <InvoiceStatusTag status={s} /> },
            {
              title: 'Hạn đóng',
              dataIndex: 'dueDate',
              render: (d, r) => (
                <span>
                  {dayjs(d).format('DD/MM/YYYY')}{' '}
                  {r.isOverdue && <Tag color="red">Quá {r.overdueDays} ngày</Tag>}
                </span>
              )
            }
          ]}
        />
        {embedded && debtList.length > 5 && (
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <Button type="link" onClick={() => navigate('/tuition-report')}>
              Xem toàn bộ {debtList.length} khoản nợ →
            </Button>
          </div>
        )}
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card bordered={false} title="Doanh thu theo môn học">
            <Table
              rowKey="courseCode"
              size="small"
              pagination={false}
              dataSource={byCourse}
              columns={[
                { title: 'Môn', render: (_, r) => <CourseCell code={r.courseCode} name={r.courseName} /> },
                { title: 'Phải thu', dataIndex: 'total', align: 'right', render: formatVnd },
                { title: 'Đã thu', dataIndex: 'paid', align: 'right', render: (v) => <span style={{ color: '#52c41a' }}>{formatVnd(v)}</span> },
                { title: 'Còn nợ', dataIndex: 'debt', align: 'right', render: (v) => <span style={{ color: v ? '#ff4d4f' : undefined }}>{formatVnd(v)}</span> }
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card bordered={false} title="Giao dịch thu gần đây">
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={recentPayments}
              locale={{ emptyText: 'Chưa có giao dịch' }}
              columns={[
                { title: 'Thời gian', dataIndex: 'paidAt', render: (d) => dayjs(d).format('DD/MM HH:mm') },
                { title: 'Học viên', render: (_, r) => `${r.studentCode} • ${r.courseCode}` },
                { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: (v) => <Text strong style={{ color: '#52c41a' }}>+{formatVnd(v)}</Text> },
                { title: 'HT', dataIndex: 'method', render: (m) => <Tag>{METHOD_LABELS[m] || m}</Tag> },
                {
                  title: '',
                  render: (_, r) => <Button size="small" type="text" icon={<PrinterOutlined />} onClick={() => setReceiptPaymentId(r.id)} />
                }
              ]}
            />
          </Card>
        </Col>
      </Row>

      <ReceiptModal open={!!receiptPaymentId} paymentId={receiptPaymentId} onClose={() => setReceiptPaymentId(null)} />
    </Spin>
  );
};

const CourseCell = ({ code, name }) => (
  <div>
    <Text strong>{code}</Text>
    <div style={{ fontSize: 12, color: '#8c8c8c', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>
      {name}
    </div>
  </div>
);

export default TuitionReportPage;
