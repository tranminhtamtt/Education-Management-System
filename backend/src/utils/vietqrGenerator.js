/**
 * Tiện ích tạo chuỗi liên kết thanh toán VietQR (chuẩn VietQR QuickLink)
 * Format URL: https://img.vietqr.io/image/<BANK_ID>-<ACCOUNT_NO>-<TEMPLATE>.png?amount=<AMOUNT>&addInfo=<DESCRIPTION>&accountName=<ACCOUNT_NAME>
 *
 * DF32 (EMS -> Payment System): Số tiền còn nợ + Nội dung CK "STU2026001 WEB101"
 * DF33 (Payment System -> EMS): Ảnh mã VietQR tĩnh trả về (qrImageUrl)
 */
const generateVietQRData = ({ amount, studentCode, courseCode, classCode, invoiceId }) => {
  const bankId = process.env.VIETQR_BANK_ID || 'MB'; // Mặc định MBBank
  const accountNo = process.env.VIETQR_ACCOUNT_NO || '0981234567';
  const accountName = process.env.VIETQR_ACCOUNT_NAME || 'DAI HOC FPT - EMS TUITION';
  const template = 'compact2';

  // Nội dung chuyển khoản theo đặc tả: [MaHV] [MaMon] (VD: "STU2026001 WEB101")
  // Fallback về mã lớp nếu không có mã môn
  const description = `${studentCode} ${courseCode || classCode || ''}`.trim();
  const encodedDesc = encodeURIComponent(description);
  const encodedName = encodeURIComponent(accountName);

  const qrImageUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png?amount=${Math.round(amount)}&addInfo=${encodedDesc}&accountName=${encodedName}`;

  return {
    invoiceId,
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
