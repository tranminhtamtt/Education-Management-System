/**
 * Tiện ích tạo chuỗi liên kết thanh toán VietQR (chuẩn VietQR QuickLink)
 * Format URL: https://img.vietqr.io/image/<BANK_ID>-<ACCOUNT_NO>-<TEMPLATE>.png?amount=<AMOUNT>&addInfo=<DESCRIPTION>&accountName=<ACCOUNT_NAME>
 */
const generateVietQRData = ({ amount, studentCode, classCode, invoiceId }) => {
  const bankId = process.env.VIETQR_BANK_ID || 'MB'; // Mặc định MBBank
  const accountNo = process.env.VIETQR_ACCOUNT_NO || '0981234567';
  const accountName = process.env.VIETQR_ACCOUNT_NAME || 'DAI HOC FPT - EMS TUITION';
  const template = 'compact2';

  // Nội dung chuyển khoản cú pháp: [MaSV] [MaLop] HP[InvoiceId]
  const description = `${studentCode} ${classCode} HP${invoiceId}`.trim();
  const encodedDesc = encodeURIComponent(description);
  const encodedName = encodeURIComponent(accountName);

  const qrImageUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png?amount=${Math.round(amount)}&addInfo=${encodedDesc}&accountName=${encodedName}`;

  return {
    bankId,
    accountNo,
    accountName,
    amount: Math.round(amount),
    description,
    qrImageUrl
  };
};

module.exports = {
  generateVietQRData
};
