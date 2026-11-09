/**
 * Seed dữ liệu EMS trên MongoDB Atlas — sinh viên khớp khung chương trình từng kỳ.
 *
 *   npm run seed           → chỉ xem trước (không ghi DB)
 *   npm run seed:reset     → sao lưu JSON rồi XÓA TOÀN BỘ dữ liệu EMS và tạo lại
 *
 * Yêu cầu: MONGODB_URI, SEED_PASSWORD (≥ 8 ký tự, mật khẩu chung của tài khoản mẫu).
 * Dừng backend trước khi reset để tránh ghi đồng thời.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { connectDB, disconnectDB } = require('../src/config/db');
const models = require('../src/models');
const { SE_CURRICULUM, TOTAL_TERMS } = require('../src/modules/curriculum/curriculumData');
const { calculateGrade } = require('../src/modules/grades-tuition');

const STUDENTS_PER_TERM = 3;
const FEE_PER_CREDIT = 1400000;
const DAY = 86400000;
const SLOT_HOURS = { 1: ['07:30', '09:50'], 2: ['10:00', '12:20'] };

const LAST = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương'];
const MIDDLE_M = ['Văn', 'Minh', 'Đức', 'Quang', 'Hữu', 'Gia'];
const MIDDLE_F = ['Thị', 'Ngọc', 'Thu', 'Khánh', 'Mai', 'Thanh'];
const FIRST_M = ['An', 'Bảo', 'Cường', 'Dũng', 'Hiếu', 'Khoa', 'Long', 'Nam', 'Phúc', 'Quân', 'Sơn', 'Tùng', 'Việt', 'Huy'];
const FIRST_F = ['Anh', 'Chi', 'Giang', 'Hà', 'Hương', 'Lan', 'Linh', 'My', 'Ngân', 'Phương', 'Trang', 'Vy', 'Yến', 'Thảo'];

/** Kỳ lịch FPT: SP (T1–T4), SU (T5–T8), FA (T9–T12). index = năm*3 + mùa */
function calendarTerm(index) {
  const year = Math.floor(index / 3), season = index % 3;
  return { semester: ['SP', 'SU', 'FA'][season] + String(year).slice(-2), date: new Date(Date.UTC(year, season * 4, 1)), year };
}
const currentCalendarIndex = (now = new Date()) => now.getUTCFullYear() * 3 + Math.floor(now.getUTCMonth() / 4);

function personName(i, female) {
  const pick = (arr, k) => arr[k % arr.length];
  return `${pick(LAST, i * 7 + 3)} ${pick(female ? MIDDLE_F : MIDDLE_M, i * 5 + 1)} ${pick(female ? FIRST_F : FIRST_M, i * 3 + 2)}`;
}

// Điểm mẫu xác định (tái lập được), luôn đạt: final ≥ 5, total ≥ 5
function pastScores(seed) {
  const r = n => ((seed * 9301 + n * 49297) % 233280) / 233280;
  const att = Math.round((8 + r(1) * 2) * 10) / 10;
  const mid = Math.round((5.5 + r(2) * 4) * 10) / 10;
  const fin = Math.round((5 + r(3) * 4.5) * 10) / 10;
  return { attendanceScore: att, midtermScore: mid, finalScore: fin, ...calculateGrade(att, mid, fin, false) };
}

/**
 * Sinh toàn bộ dữ liệu trong bộ nhớ (thuần, không chạm DB) để có thể kiểm thử.
 * Sinh viên kỳ K: đã PASS toàn bộ môn kỳ 1..K-1, đang học toàn bộ môn kỳ K.
 */
function buildSeed({ passwordHash, now = new Date() }) {
  const currentIndex = currentCalendarIndex(now);
  const ids = {};
  const next = name => (ids[name] = (ids[name] || 0) + 1);
  const data = { users: [], courses: [], classes: [], schedules: [], enrollments: [], grades: [], tuition_invoices: [], tuition_payments: [], notifications: [] };
  const extraData = { attendances: [], assignments: [], submissions: [] };

  data.users.push({ id: next('users'), code: 'ADM001', email: 'admin@fpt.edu.vn', fullName: 'Phòng Quản lý Đào tạo', role: 'ADMIN', passwordHash, phone: '02473005588' });
  data.users.push({ id: next('users'), code: 'ACC001', email: 'ketoan@fpt.edu.vn', fullName: 'Phòng Kế toán - Tài chính', role: 'ACCOUNTANT', passwordHash, phone: '02473005589' });

  // Môn học + 1 giảng viên phụ trách mỗi môn (không trùng lịch giảng viên)
  const courseByCode = new Map(), teacherByCourse = new Map();
  SE_CURRICULUM.forEach((c, i) => {
    const course = { id: next('courses'), courseCode: c.courseCode, name: c.name, credits: c.credits, description: c.description, totalSessions: c.credits >= 10 ? 60 : 30, baseTuitionFee: c.credits * FEE_PER_CREDIT, status: 'ACTIVE' };
    data.courses.push(course);
    courseByCode.set(c.courseCode, course);
    const female = i % 3 === 1;
    const t = { id: next('users'), code: `GV${String(i + 1).padStart(3, '0')}`, email: `gv${String(i + 1).padStart(3, '0')}@fpt.edu.vn`, fullName: personName(i + 50, female), role: 'TEACHER', passwordHash, teacherProfile: { degree: i % 4 === 0 ? 'Tiến sĩ' : 'Thạc sĩ', specialty: c.name, bio: `Giảng viên phụ trách môn ${c.courseCode}` } };
    data.users.push(t);
    teacherByCourse.set(c.courseCode, t);
  });

  let studentSeq = 0;
  for (let term = 1; term <= TOTAL_TERMS; term++) {
    const startIndex = currentIndex - term + 1; // kỳ lịch nhập học của khóa đang ở kỳ `term`
    const intake = calendarTerm(startIndex);
    const students = [];
    for (let n = 1; n <= STUDENTS_PER_TERM; n++) {
      const female = n % 2 === 0;
      const code = `SE${String(term).padStart(2, '0')}${String(n).padStart(3, '0')}`;
      const s = {
        id: next('users'), code, email: `${code.toLowerCase()}@fpt.edu.vn`, fullName: personName(studentSeq++, female), role: 'STUDENT', passwordHash,
        phone: `09${String(10000000 + studentSeq * 7919).slice(-8)}`,
        studentProfile: { enrollmentYear: intake.year, gender: female ? 'FEMALE' : 'MALE', dob: new Date(Date.UTC(intake.year - 18, (n * 3) % 12, 10 + n)), address: 'Hà Nội' }
      };
      data.users.push(s);
      students.push(s);
    }

    for (let t = 1; t <= term; t++) {
      const cal = calendarTerm(startIndex + t - 1);
      const isCurrent = t === term;
      SE_CURRICULUM.filter(c => c.term === t).forEach((c, slot) => {
        const course = courseByCode.get(c.courseCode);
        const cls = { id: next('classes'), classCode: `${c.courseCode}-${cal.semester}-K${term}`, courseId: course.id, teacherId: teacherByCourse.get(c.courseCode).id, semester: cal.semester, status: isCurrent ? 'ONGOING' : 'COMPLETED', maxStudents: 30, createdAt: cal.date };
        data.classes.push(cls);
        // Mỗi kỳ khung dùng dãy phòng riêng → các khóa học cùng kỳ lịch không trùng phòng; môn trong kỳ khác thứ → không trùng lịch SV
        const shift = 1 + (t % 2);
        const dayOfWeek = 2 + slot;
        data.schedules.push({ id: next('schedules'), classId: cls.id, dayOfWeek, shift, startTime: SLOT_HOURS[shift][0], endTime: SLOT_HOURS[shift][1], room: `R${t}0${slot + 1}` });

        let asg1 = null;
        if (isCurrent) {
          asg1 = {
            id: next('assignments'),
            classId: cls.id,
            title: `[Tuần 1] Bài tập thực hành Lab 1 - ${c.courseCode}`,
            description: `Hoàn thành bài tập thực hành Tuần 1 môn ${c.name} (${c.courseCode}). Nộp link GitHub hoặc file PDF báo cáo.`,
            fileUrl: `https://lms.fpt.edu.vn/materials/${c.courseCode.toLowerCase()}-week1-lab1.pdf`,
            dueDate: new Date('2026-11-07T23:59:00Z'),
            createdAt: new Date('2026-11-02T08:00:00Z')
          };
          const asg2 = {
            id: next('assignments'),
            classId: cls.id,
            title: `[Tuần 2] Dự án / Kiểm tra định kỳ - ${c.courseCode}`,
            description: `Hoàn thành bài tập lớn Tuần 2 môn ${c.name} (${c.courseCode}) tổng kết kiến thức 2 tuần học.`,
            fileUrl: `https://lms.fpt.edu.vn/materials/${c.courseCode.toLowerCase()}-week2-project.pdf`,
            dueDate: new Date('2026-11-15T23:59:00Z'),
            createdAt: new Date('2026-11-09T08:00:00Z')
          };
          extraData.assignments.push(asg1, asg2);
        }

        students.forEach((s, si) => {
          const enrollment = { id: next('enrollments'), classId: cls.id, studentId: s.id, enrolledAt: cal.date, status: 'ACTIVE' };
          data.enrollments.push(enrollment);
          data.grades.push(isCurrent
            ? { id: next('grades'), enrollmentId: enrollment.id, attendanceScore: null, midtermScore: null, finalScore: null, totalScore: null, isPassed: false, isBanned: false }
            : { id: next('grades'), enrollmentId: enrollment.id, ...pastScores(enrollment.id) });

          if (isCurrent) {
            const w1Date = `2026-11-${String(2 + (dayOfWeek - 2)).padStart(2, '0')}`;
            const w2Date = `2026-11-${String(9 + (dayOfWeek - 2)).padStart(2, '0')}`;
            for (const dateStr of [w1Date, w2Date]) {
              // Chỉ điểm danh các buổi đã diễn ra tính đến ngày 09/11/2026
              if (dateStr <= '2026-11-09') {
                const status = si === 2 && slot === 0 && dateStr === w1Date ? 'LATE' : 'PRESENT';
                extraData.attendances.push({
                  id: next('attendances'),
                  classId: cls.id,
                  studentId: s.id,
                  sessionDate: new Date(`${dateStr}T00:00:00.000Z`),
                  status,
                  note: status === 'LATE' ? 'Đi muộn 10 phút' : 'Có mặt đúng giờ'
                });
              }
            }
            if (asg1) {
              extraData.submissions.push({
                id: next('submissions'),
                assignmentId: asg1.id,
                studentId: s.id,
                content: `Em nộp bài tập Tuần 1 môn ${c.courseCode} - Sinh viên ${s.fullName} (${s.code})`,
                fileUrl: `https://github.com/${s.code.toLowerCase()}/${c.courseCode.toLowerCase()}-lab1`,
                score: Number((7.5 + ((si + slot) % 3) * 0.8).toFixed(1)),
                feedback: 'Bài làm tốt, nắm vững kiến thức Tuần 1.',
                submittedAt: new Date('2026-11-06T14:30:00Z')
              });
            }
          }

          const amount = course.baseTuitionFee;
          const invoice = { id: next('tuition_invoices'), studentId: s.id, enrollmentId: enrollment.id, amount, paidAmount: 0, status: 'UNPAID', paidAt: null, createdAt: cal.date, dueDate: new Date(cal.date.getTime() + 30 * DAY) };
          if (!isCurrent) {
            // Kỳ đã học: ghi nhận số dư đầu kỳ (đã đóng trước khi tích hợp SePay). Không tạo payment_transactions giả.
            const paidAt = new Date(cal.date.getTime() + 20 * DAY);
            Object.assign(invoice, { paidAmount: amount, status: 'PAID', paidAt });
            data.tuition_payments.push({ id: next('tuition_payments'), invoiceId: invoice.id, transactionId: null, receiptNo: `OPENING-${invoice.id}`, amount, method: 'CASH', note: 'Số dư đầu kỳ khi khởi tạo dữ liệu mẫu (không phải giao dịch SePay)', collectedById: null, paidAt });
          } else if (si > 0) {
            invoice.dueDate = new Date(now.getTime() + 15 * DAY); // SV đầu tiên mỗi khóa để quá hạn (demo nhắc nợ)
          }
          data.tuition_invoices.push(invoice);
        });
      });
    }
  }

  data.notifications.push({ id: next('notifications'), userId: null, title: 'Chào mừng học kỳ mới', message: `Học kỳ ${calendarTerm(currentIndex).semester} đã bắt đầu. Sinh viên vui lòng kiểm tra thời khóa biểu và học phí.`, type: 'SYSTEM', createdAt: now });

  return { data, extraData, counters: ids, currentSemester: calendarTerm(currentIndex).semester };
}

const COLLECTION_MODELS = {
  users: models.User, courses: models.Course, classes: models.Class, schedules: models.Schedule, enrollments: models.Enrollment,
  grades: models.Grade, tuition_invoices: models.TuitionInvoice, tuition_payments: models.TuitionPayment, notifications: models.Notification,
  attendances: models.Attendance, assignments: models.Assignment, submissions: models.Submission
};

function describe(seed) {
  const { data, currentSemester } = seed;
  const students = data.users.filter(u => u.role === 'STUDENT');
  return {
    currentSemester,
    students: students.length,
    teachers: data.users.filter(u => u.role === 'TEACHER').length,
    courses: data.courses.length,
    classes: data.classes.length,
    enrollments: data.enrollments.length,
    invoices: data.tuition_invoices.length,
    unpaidInvoices: data.tuition_invoices.filter(i => i.status === 'UNPAID').length,
    openingReceipts: data.tuition_payments.length
  };
}

async function main() {
  const reset = process.argv.includes('--reset');
  const preview = buildSeed({ passwordHash: 'preview' });
  console.log('Seed plan:', describe(preview));
  if (!reset) {
    console.log('Preview only. Run `npm run seed:reset` to back up and REPLACE ALL EMS data on MongoDB. Stop the backend first.');
    return;
  }
  if (!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD.length < 8) throw new Error('Set SEED_PASSWORD (at least 8 characters).');
  await connectDB();

  // 1. Sao lưu toàn bộ collection hiện có trước khi xóa
  const backupDir = path.resolve(__dirname, '../backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const tables = {};
  for (const m of Object.values(models).filter(m => m && m.modelName)) tables[m.collection.collectionName] = await m.find({}).lean();
  const total = Object.values(tables).reduce((n, rows) => n + rows.length, 0);
  if (total > 0) {
    const backupFile = path.join(backupDir, `ems-mongo-${Date.now()}.json`);
    const serialized = JSON.stringify({ createdAt: new Date().toISOString(), tables }, null, 2);
    fs.writeFileSync(backupFile, serialized, { flag: 'wx', mode: 0o600 });
    if (fs.readFileSync(backupFile, 'utf8') !== serialized) throw new Error('Backup verification failed');
    console.log('Backup verified:', path.basename(backupFile), 'SHA256:', crypto.createHash('sha256').update(serialized).digest('hex'), `(${total} documents)`);
  }

  // 2. Xóa sạch dữ liệu EMS (kể cả dữ liệu thanh toán và bộ đếm ID)
  for (const m of Object.values(models).filter(m => m && m.modelName)) await m.deleteMany({});

  // 3. Tạo dữ liệu mới
  const seed = buildSeed({ passwordHash: await bcrypt.hash(process.env.SEED_PASSWORD, 10) });
  for (const [collection, rows] of Object.entries({ ...seed.data, ...(seed.extraData || {}) })) {
    if (rows.length) await COLLECTION_MODELS[collection].insertMany(rows, { ordered: true });
  }
  for (const [name, seq] of Object.entries(seed.counters)) await models.Counter.updateOne({ _id: name }, { $set: { seq } }, { upsert: true });

  console.log('Reset completed:', describe(seed));
  console.log('Accounts: admin@fpt.edu.vn, ketoan@fpt.edu.vn, gv001@fpt.edu.vn..., se01001@fpt.edu.vn ... se09003@fpt.edu.vn — password = SEED_PASSWORD');
  console.log('Current-term invoices are UNPAID. No SePay transactions are fabricated.');
}

if (require.main === module) {
  main()
    .catch(e => { console.error('Seed failed:', e.message); process.exitCode = 1; })
    .finally(() => disconnectDB());
}

module.exports = { calendarTerm, currentCalendarIndex, buildSeed, describe };

