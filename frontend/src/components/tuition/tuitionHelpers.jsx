import React from 'react';
import { Tag } from 'antd';

export const formatVnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;

export const METHOD_LABELS = {
  CASH: 'Tiền mặt',
  BANK_TRANSFER: 'Chuyển khoản',
  VIETQR: 'VietQR'
};

export const STATUS_OPTIONS = [
  { label: 'Chưa thanh toán (UNPAID)', value: 'UNPAID' },
  { label: 'Nợ một phần (PARTIAL)', value: 'PARTIAL' },
  { label: 'Đã hoàn thành (PAID)', value: 'PAID' }
];

export const InvoiceStatusTag = ({ status }) => {
  if (status === 'PAID') return <Tag color="success">ĐÃ HOÀN THÀNH</Tag>;
  if (status === 'PARTIAL') return <Tag color="warning">NỢ MỘT PHẦN</Tag>;
  return <Tag color="error">CHƯA THANH TOÁN</Tag>;
};
