import React from 'react';
import { Tag } from 'antd';

export const formatVnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;

export const METHOD_LABELS = {
  CASH: 'Tiền mặt',
  BANK_TRANSFER: 'Chuyển khoản',
  VIETQR: 'VietQR'
};

const INVOICE_STATUSES = {
  UNPAID: { label: 'Chờ thanh toán', tagColor: 'gold', chartColor: '#faad14' },
  PARTIAL: { label: 'Đã thanh toán một phần', tagColor: 'blue', chartColor: '#1677ff' },
  PAID: { label: 'Đã thanh toán', tagColor: 'success', chartColor: '#52c41a' }
};

export const STATUS_OPTIONS = Object.entries(INVOICE_STATUSES).map(([value, { label }]) => ({ value, label }));

export const InvoiceStatusTag = ({ status }) => {
  const { label, tagColor } = INVOICE_STATUSES[status] || {};
  return <Tag color={tagColor}>{label || status || '—'}</Tag>;
};

export const invoiceChartStatus = ({ status, name, color, ...data }) => ({
  ...data,
  status,
  name: INVOICE_STATUSES[status]?.label || name,
  color: INVOICE_STATUSES[status]?.chartColor || color
});

export function sumUncollectedByStatus(invoices) {
  const totals = { UNPAID: 0, PARTIAL: 0 };
  for (const invoice of invoices) {
    if (invoice.status === 'UNPAID' || invoice.status === 'PARTIAL') {
      totals[invoice.status] += invoice.remainingAmount;
    }
  }
  return totals;
}
