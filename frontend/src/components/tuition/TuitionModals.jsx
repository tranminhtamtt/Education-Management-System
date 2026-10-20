import React, { useEffect, useRef, useState } from 'react';
import { Modal, Button, Image, Typography, Tag, Alert, Spin, Descriptions, message } from 'antd';
import { PrinterOutlined, CopyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { formatVnd, METHOD_LABELS } from './tuitionHelpers';

const { Text } = Typography;

// ============================================================
// UC9.3: Modal hiển thị mã VietQR theo số tiền còn nợ (DF32 -> DF33)
// ============================================================
export const VietQRModal = ({ open, invoiceId, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !invoiceId) return;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        setQrData(null);
        const res = await apiClient.get(`/tuition-invoices/${invoiceId}/vietqr`);
        if (res.success) setQrData(res.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Lỗi khi tạo mã VietQR');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open, invoiceId]);

  const copy = (text) => {
    navigator.clipboard?.writeText(String(text));
    message.success('Đã sao chép');
  };

  return (
    <Modal
      title="Thanh toán Học phí qua VietQR (NAPAS 247)"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          Đóng
        </Button>
      ]}
      width={480}
      destroyOnClose
    >
      {loading && (
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          <Spin tip="Đang tạo mã VietQR..." />
        </div>
      )}
      {error && <Alert type="warning" showIcon message={error} />}
      {qrData && !loading && (
        <div style={{ textAlign: 'center' }}>
          <Image
            src={qrData.qrImageUrl}
            alt="Mã VietQR thanh toán học phí"
            width={260}
            style={{ borderRadius: 8, border: '1px solid #f0f0f0', padding: 8 }}
          />
          <div style={{ marginTop: 16, textAlign: 'left', background: '#fafafa', padding: 12, borderRadius: 8, lineHeight: 1.9 }}>
            <div>
              <b>Học viên:</b> {qrData.studentName} • <b>Môn:</b> {qrData.courseName}
            </div>
            <div>
              <b>Chủ tài khoản:</b> {qrData.accountName}
            </div>
            <div>
              <b>Ngân hàng:</b> {qrData.bankId} • <b>Số TK:</b> {qrData.accountNo}{' '}
              <Button size="small" type="link" icon={<CopyOutlined />} onClick={() => copy(qrData.accountNo)} />
            </div>
            <div>
              <b>Số tiền còn nợ:</b>{' '}
              <Text strong style={{ color: '#F26F21', fontSize: 16 }}>
                {formatVnd(qrData.amount)}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {' '}
                (Tổng {formatVnd(qrData.totalAmount)} – đã đóng {formatVnd(qrData.paidAmount)})
              </Text>
            </div>
            <div>
              <b>Nội dung chuyển khoản:</b> <Tag color="blue">{qrData.description}</Tag>
              <Button size="small" type="link" icon={<CopyOutlined />} onClick={() => copy(qrData.description)} />
            </div>
          </div>
          <Alert
            message="Vui lòng ghi đúng nội dung chuyển khoản. Phòng Kế toán sẽ đối soát và gạch nợ sau khi nhận được tiền."
            type="info"
            showIcon
            style={{ marginTop: 12, textAlign: 'left' }}
          />
        </div>
      )}
    </Modal>
  );
};

// ============================================================
// UC9.3 / DF35: Phiếu thu / Biên lai học phí - in trên trình duyệt
// ============================================================
const RECEIPT_PRINT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', serif; color: #000; margin: 0; padding: 24px; }
  .receipt { max-width: 720px; margin: 0 auto; border: 1px solid #000; padding: 28px 32px; }
  .r-head { display: flex; justify-content: space-between; font-size: 13px; }
  .r-title { text-align: center; margin: 18px 0 4px; font-size: 22px; font-weight: bold; letter-spacing: 1px; }
  .r-sub { text-align: center; font-size: 13px; font-style: italic; margin-bottom: 18px; }
  .r-row { display: flex; font-size: 15px; margin: 7px 0; }
  .r-row .k { width: 190px; flex-shrink: 0; }
  .r-row .v { flex: 1; border-bottom: 1px dotted #555; font-weight: 600; }
  table.r-table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 14px; }
  table.r-table td, table.r-table th { border: 1px solid #000; padding: 6px 8px; }
  table.r-table th { background: #f2f2f2; }
  .r-num { text-align: right; }
  .r-sign { display: flex; justify-content: space-around; margin-top: 28px; text-align: center; font-size: 14px; }
  .r-sign .s { width: 45%; }
  .r-sign .space { height: 70px; }
  .r-foot { font-size: 12px; font-style: italic; margin-top: 18px; text-align: center; }
`;

export const ReceiptModal = ({ open, paymentId, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const printRef = useRef(null);

  useEffect(() => {
    if (!open || !paymentId) return;
    const load = async () => {
      try {
        setLoading(true);
        setData(null);
        const res = await apiClient.get(`/tuition-payments/${paymentId}/receipt`);
        if (res.success) setData(res.data);
      } catch (err) {
        message.error(err.response?.data?.message || 'Lỗi tải phiếu thu');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open, paymentId]);

  const handlePrint = () => {
    if (!printRef.current) return;
    const win = window.open('', '_blank', 'width=860,height=900');
    if (!win) {
      message.warning('Trình duyệt đã chặn cửa sổ in. Vui lòng cho phép pop-up.');
      return;
    }
    win.document.write(
      `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/><title>Phiếu thu ${data?.receiptNo || ''}</title>` +
        `<style>${RECEIPT_PRINT_CSS}</style></head><body>${printRef.current.innerHTML}</body></html>`
    );
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 250);
  };

  return (
    <Modal
      title={`Phiếu thu học phí ${data?.receiptNo ? `- ${data.receiptNo}` : ''}`}
      open={open}
      onCancel={onClose}
      width={820}
      destroyOnClose
      footer={[
        <Button key="close" onClick={onClose}>
          Đóng
        </Button>,
        <Button
          key="print"
          type="primary"
          icon={<PrinterOutlined />}
          disabled={!data}
          onClick={handlePrint}
          style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
        >
          In phiếu thu
        </Button>
      ]}
    >
      {loading && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      )}
      {data && !loading && (
        <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, maxHeight: '65vh', overflow: 'auto' }}>
          <style>{RECEIPT_PRINT_CSS.replace(/\*\s*\{[^}]*\}/, '').replace(/body\s*\{[^}]*\}/, '')}</style>
          <div ref={printRef}>
            <div className="receipt" style={{ background: '#fff' }}>
              <div className="r-head">
                <div>
                  <div style={{ fontWeight: 'bold' }}>{data.organization.name}</div>
                  <div>{data.organization.address}</div>
                  <div>ĐT: {data.organization.phone}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div>
                    Số phiếu: <b>{data.receiptNo}</b>
                  </div>
                  <div>Hóa đơn: #{data.invoice.id}</div>
                  <div>Đợt thu: {data.installment}</div>
                </div>
              </div>

              <div className="r-title">PHIẾU THU HỌC PHÍ</div>
              <div className="r-sub">Ngày {dayjs(data.paidAt).format('DD')} tháng {dayjs(data.paidAt).format('MM')} năm {dayjs(data.paidAt).format('YYYY')} – {dayjs(data.paidAt).format('HH:mm')}</div>

              <div className="r-row"><span className="k">Họ tên học viên:</span><span className="v">{data.student.fullName}</span></div>
              <div className="r-row"><span className="k">Mã học viên:</span><span className="v">{data.student.code}</span></div>
              <div className="r-row"><span className="k">Môn học / Lớp:</span><span className="v">{data.invoice.courseCode} – {data.invoice.courseName} ({data.invoice.classCode}, kỳ {data.invoice.semester})</span></div>
              <div className="r-row"><span className="k">Hình thức thanh toán:</span><span className="v">{METHOD_LABELS[data.method] || data.method}</span></div>
              <div className="r-row"><span className="k">Số tiền thu:</span><span className="v">{formatVnd(data.amount)}</span></div>
              <div className="r-row"><span className="k">Bằng chữ:</span><span className="v" style={{ fontStyle: 'italic' }}>{data.amountInWords}</span></div>
              {data.note && <div className="r-row"><span className="k">Ghi chú:</span><span className="v">{data.note}</span></div>}

              <table className="r-table">
                <thead>
                  <tr>
                    <th>Tổng học phí</th>
                    <th>Đã đóng trước đợt này</th>
                    <th>Thu đợt này</th>
                    <th>Còn nợ sau đợt này</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="r-num">{formatVnd(data.invoice.amount)}</td>
                    <td className="r-num">{formatVnd(data.invoice.paidBefore)}</td>
                    <td className="r-num"><b>{formatVnd(data.amount)}</b></td>
                    <td className="r-num"><b>{formatVnd(data.invoice.remainingAfter)}</b></td>
                  </tr>
                </tbody>
              </table>

              <div className="r-sign">
                <div className="s">
                  <b>Người nộp tiền</b>
                  <div><i>(Ký, ghi rõ họ tên)</i></div>
                  <div className="space" />
                  <div>{data.student.fullName}</div>
                </div>
                <div className="s">
                  <b>Người thu tiền</b>
                  <div><i>(Ký, ghi rõ họ tên)</i></div>
                  <div className="space" />
                  <div>{data.collectedBy || ''}</div>
                </div>
              </div>

              <div className="r-foot">Phiếu thu được in từ hệ thống EMS. Vui lòng giữ lại để đối chiếu khi cần.</div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

// ============================================================
// Lịch sử các đợt thu của 1 hóa đơn (dùng trong bảng mở rộng)
// ============================================================
export const PaymentHistory = ({ invoice, onOpenReceipt }) => {
  if (!invoice.payments || invoice.payments.length === 0) {
    return <Text type="secondary">Chưa có đợt thanh toán nào được ghi nhận.</Text>;
  }
  return (
    <Descriptions
      size="small"
      bordered
      column={1}
      title={<span style={{ fontSize: 14 }}>Lịch sử thanh toán hóa đơn #{invoice.id}</span>}
    >
      {invoice.payments.map((p, idx) => (
        <Descriptions.Item
          key={p.id}
          label={
            <span>
              Đợt {idx + 1} • {dayjs(p.paidAt).format('HH:mm DD/MM/YYYY')}
            </span>
          }
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>
              <Text strong style={{ color: '#52c41a' }}>+{formatVnd(p.amount)}</Text>{' '}
              <Tag>{METHOD_LABELS[p.method] || p.method}</Tag>
              <Text type="secondary">{p.receiptNo}</Text>
              {p.collectedBy && <Text type="secondary"> • Thu bởi: {p.collectedBy}</Text>}
              {p.note && <Text type="secondary"> • {p.note}</Text>}
            </span>
            <Button size="small" icon={<PrinterOutlined />} onClick={() => onOpenReceipt(p.id)}>
              Phiếu thu
            </Button>
          </div>
        </Descriptions.Item>
      ))}
    </Descriptions>
  );
};
