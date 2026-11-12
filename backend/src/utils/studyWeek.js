const { httpError } = require('./query');
const vietnamToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function studyWeek(value) {
  const dateStr = value || vietnamToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw httpError('Ngày bắt đầu tuần không hợp lệ');
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateStr) throw httpError('Ngày bắt đầu tuần không hợp lệ');
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return (dayOfWeek, week = 0) => new Date(date.getTime() + ((dayOfWeek - 2) + week * 7) * 86400000).toISOString().slice(0, 10);
}
module.exports = { studyWeek, vietnamToday };
