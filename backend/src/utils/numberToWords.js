/**
 * Đọc số tiền thành chữ tiếng Việt (dùng cho Phiếu thu / Biên lai học phí)
 * VD: 2000000 -> "Hai triệu đồng"; 3005000 -> "Ba triệu không trăm linh năm nghìn đồng"
 */
const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const SCALES = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

const readGroup = (n, full) => {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const parts = [];

  if (h > 0 || full) parts.push(`${DIGITS[h]} trăm`);

  if (t > 1) {
    parts.push(`${DIGITS[t]} mươi`);
    if (u === 1) parts.push('mốt');
    else if (u === 5) parts.push('lăm');
    else if (u > 0) parts.push(DIGITS[u]);
  } else if (t === 1) {
    parts.push('mười');
    if (u === 5) parts.push('lăm');
    else if (u > 0) parts.push(DIGITS[u]);
  } else if (u > 0) {
    if (h > 0 || full) parts.push('linh');
    parts.push(DIGITS[u]);
  }

  return parts.join(' ');
};

const numberToVietnameseWords = (value) => {
  let n = Math.round(Math.abs(Number(value) || 0));
  if (n === 0) return 'Không đồng';

  const groups = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }

  const words = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    const full = i < groups.length - 1;
    words.push(`${readGroup(g, full)}${SCALES[i] ? ` ${SCALES[i]}` : ''}`);
  }

  const text = words.join(' ').replace(/\s+/g, ' ').trim();
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} đồng`;
};

module.exports = { numberToVietnameseWords };
