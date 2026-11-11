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
const SLOT_HOURS = {
  1: ['07:30', '09:50'],
  2: ['10:00', '12:20'],
  3: ['12:50', '15:10'],
  4: ['15:20', '17:40']
};

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
function buildSeed({ passwordHash, now = new Date(), fullTwoWeekSchedule = false }) {
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
        const days = isCurrent && fullTwoWeekSchedule
          ? (slot % 2 === 0 ? [2, 4, 6] : [3, 5, 7])
          : [2 + slot];
        const shift = isCurrent && fullTwoWeekSchedule
          ? (slot < 2 ? 1 + (t % 2) : 3 + (t % 2))
          : 1 + (t % 2);
        const room = `R${t}0${slot + 1}`;
        for (const dayOfWeek of days) {
          data.schedules.push({ id: next('schedules'), classId: cls.id, dayOfWeek, shift, startTime: SLOT_HOURS[shift][0], endTime: SLOT_HOURS[shift][1], room });
        }

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
            const sessionDates = [];
            for (const dayOfWeek of days) {
              sessionDates.push(`2026-11-${String(2 + (dayOfWeek - 2)).padStart(2, '0')}`);
              sessionDates.push(`2026-11-${String(9 + (dayOfWeek - 2)).padStart(2, '0')}`);
            }
            for (const dateStr of sessionDates) {
              // Chỉ điểm danh các buổi đã diễn ra tính đến ngày 09/11/2026
              if (dateStr <= '2026-11-09') {
                const status = si === 2 && slot === 0 && dateStr === sessionDates[0] ? 'LATE' : 'PRESENT';
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
  attendances: models.Attendance, assignments: models.Assignment, submissions: models.Submission, student_requests: models.StudentRequest
};

// Khung giờ chuẩn 6 Slot FAP FPT (dạng chuỗi "HH:mm" cho Mongoose Schedule)
const LEGACY_SLOT_TIMES = {
  1: { start: '07:30', end: '09:50' },
  2: { start: '10:00', end: '12:20' },
  3: { start: '12:50', end: '15:10' },
  4: { start: '15:20', end: '17:40' },
  5: { start: '18:00', end: '20:20' },
  6: { start: '20:30', end: '22:50' }
};

function getTwoWeekDatesForDays(daysOfWeek) {
  const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
  const week1 = sortedDays.map(d => new Date(`2026-11-${String(2 + (d - 2)).padStart(2, '0')}T00:00:00.000Z`));
  const week2 = sortedDays.map(d => new Date(`2026-11-${String(9 + (d - 2)).padStart(2, '0')}T00:00:00.000Z`));
  return [...week1, ...week2];
}

function calcAttendanceMetrics(statuses, totalSessions = 6) {
  const present = statuses.filter(s => s === 'PRESENT').length;
  const late = statuses.filter(s => s === 'LATE').length;
  const absentExcused = statuses.filter(s => s === 'ABSENT_EXCUSED').length;
  const absentUnexcused = statuses.filter(s => s === 'ABSENT_UNEXCUSED').length;
  const absentRate = (absentUnexcused / totalSessions) * 100;
  const isBanned = absentRate >= 20.0;
  const earned = present * 1.0 + late * 0.8 + absentExcused * 0.9;
  const attendanceScore = statuses.length
    ? parseFloat(Math.max(0, Math.min(10, (earned / statuses.length) * 10)).toFixed(1))
    : 10.0;
  return { attendanceScore, isBanned, absentRate };
}

/**
 * Xây dựng bộ dữ liệu gốc (khớp 100% với dữ liệu từ TiDB sang MongoDB Atlas):
 * - 1 Admin (admin@fpt.edu.vn), 1 Accountant (ketoan@fpt.edu.vn)
 * - 3 Giảng viên (thaynam@fpt.edu.vn, colinh@fpt.edu.vn, thaytuan@fpt.edu.vn)
 * - 10 Sinh viên đa dạng Kỳ 1..7 (HE170001..HE170010)
 * - 25 Môn học, 35 Lớp học phần (19 HIST + 14 ONGOING SP26 + 2 UPCOMING SU26)
 * - Lịch học 2 tuần, Điểm danh đến 09/11/2026, Bài tập & Bài nộp, Đơn từ, Thông báo, Học phí
 */
function buildLegacyTiDBSeed({ passwordHash }) {
  const ids = {};
  const next = name => (ids[name] = (ids[name] || 0) + 1);
  const data = {
    users: [], courses: [], course_lessons: [], classes: [], schedules: [], enrollments: [],
    grades: [], attendances: [], tuition_invoices: [], tuition_payments: [],
    assignments: [], submissions: [], student_requests: [], notifications: []
  };

  const admin = {
    id: next('users'),
    code: 'ADM001',
    email: 'admin@fpt.edu.vn',
    passwordHash,
    fullName: 'Phòng Quản lý Đào tạo FAP',
    role: 'ADMIN',
    phone: '02473005588',
    status: 'ACTIVE'
  };
  const accountant = {
    id: next('users'),
    code: 'ACC001',
    email: 'ketoan@fpt.edu.vn',
    passwordHash,
    fullName: 'Phòng Kế toán - Tài chính',
    role: 'ACCOUNTANT',
    phone: '02473005599',
    status: 'ACTIVE'
  };
  data.users.push(admin, accountant);

  const teachersData = [
    { code: 'GV001', email: 'thaynam@fpt.edu.vn', name: 'ThS. Nguyễn Hoài Nam', specialty: 'Kỹ thuật Phần mềm (SE)', degree: 'Thạc sĩ' },
    { code: 'GV002', email: 'colinh@fpt.edu.vn', name: 'TS. Trần Thùy Linh', specialty: 'Khoa học Máy tính & AI (CS)', degree: 'Tiến sĩ' },
    { code: 'GV003', email: 'thaytuan@fpt.edu.vn', name: 'ThS. Lê Anh Tuấn', specialty: 'Hệ thống Thông tin & CSDL (IS)', degree: 'Thạc sĩ' }
  ];
  const teachers = teachersData.map(t => {
    const u = {
      id: next('users'),
      code: t.code,
      email: t.email,
      passwordHash,
      fullName: t.name,
      role: 'TEACHER',
      phone: '0981234567',
      status: 'ACTIVE',
      teacherProfile: {
        degree: t.degree,
        specialty: t.specialty,
        bio: `Giảng viên cơ hữu bộ môn ${t.specialty} tại Đại học FPT.`
      }
    };
    data.users.push(u);
    return u;
  });

  const studentsData = [
    { code: 'HE170001', email: 'namnvhe170001@fpt.edu.vn', name: 'Nguyễn Văn Nam', gender: 'MALE', year: 2023, dob: '2003-04-12', address: 'Cầu Giấy, Hà Nội' },
    { code: 'HE170002', email: 'trangtthe170002@fpt.edu.vn', name: 'Trần Thu Trang', gender: 'FEMALE', year: 2023, dob: '2003-08-25', address: 'Đống Đa, Hà Nội' },
    { code: 'HE170003', email: 'longldhe170003@fpt.edu.vn', name: 'Lê Đức Long', gender: 'MALE', year: 2023, dob: '2003-11-05', address: 'Nam Từ Liêm, Hà Nội' },
    { code: 'HE170004', email: 'linhpthe170004@fpt.edu.vn', name: 'Phạm Thùy Linh', gender: 'FEMALE', year: 2024, dob: '2004-02-19', address: 'Thanh Xuân, Hà Nội' },
    { code: 'HE170005', email: 'hoangnmhe170005@fpt.edu.vn', name: 'Ngô Minh Hoàng', gender: 'MALE', year: 2024, dob: '2004-06-30', address: 'Hai Bà Trưng, Hà Nội' },
    { code: 'HE170006', email: 'quynhntkhe170006@fpt.edu.vn', name: 'Nguyễn Thị Kim Quỳnh', gender: 'FEMALE', year: 2024, dob: '2004-09-14', address: 'Tây Hồ, Hà Nội' },
    { code: 'HE170007', email: 'dungdvhe170007@fpt.edu.vn', name: 'Đỗ Việt Dũng', gender: 'MALE', year: 2025, dob: '2005-01-22', address: 'Hoàn Kiếm, Hà Nội' },
    { code: 'HE170008', email: 'maipmhe170008@fpt.edu.vn', name: 'Phan Phương Mai', gender: 'FEMALE', year: 2025, dob: '2005-05-18', address: 'Ba Đình, Hà Nội' },
    { code: 'HE170009', email: 'bachnvhe170009@fpt.edu.vn', name: 'Nguyễn Vũ Bách', gender: 'MALE', year: 2025, dob: '2005-07-09', address: 'Long Biên, Hà Nội' },
    { code: 'HE170010', email: 'haonvhe170010@fpt.edu.vn', name: 'Nguyễn Văn Hào', gender: 'MALE', year: 2026, dob: '2006-03-15', address: 'Thạch Thất, Hà Nội' }
  ];
  const studentByCode = {};
  for (const s of studentsData) {
    const u = {
      id: next('users'),
      code: s.code,
      email: s.email,
      passwordHash,
      fullName: s.name,
      role: 'STUDENT',
      phone: '0901234567',
      status: 'ACTIVE',
      studentProfile: {
        dob: new Date(s.dob),
        gender: s.gender,
        address: s.address,
        enrollmentYear: s.year
      }
    };
    data.users.push(u);
    studentByCode[s.code] = u;
  }

  const courseByCode = {};
  for (const c of SE_CURRICULUM) {
    const isRecorded = ['PRF192', 'PRO192', 'CSD201'].includes(c.courseCode);
    let courseLevel = 'ADVANCED';
    if (c.term <= 2) {
      courseLevel = 'BEGINNER';
    } else if (c.term <= 4) {
      courseLevel = 'INTERMEDIATE';
    }
    const course = {
      id: next('courses'),
      courseCode: c.courseCode,
      name: c.name,
      category: 'FPT_SUBJECT',
      deliveryMode: isRecorded ? 'RECORDED' : 'LIVE_ONLINE',
      level: courseLevel,
      credits: c.credits,
      totalSessions: 6,
      baseTuitionFee: c.credits >= 10 ? 8500000 : c.term >= 5 ? 5000000 : 4500000,
      description: c.description,
      syllabusUrl: `https://fap.fpt.edu.vn/syllabus/${c.courseCode}.pdf`,
      status: 'ACTIVE'
    };
    data.courses.push(course);
    courseByCode[c.courseCode] = course;

    // Seed bài giảng mẫu cho khóa học RECORDED PRF192
    if (c.courseCode === 'PRF192') {
      const prfLessons = [
        { sectionTitle: 'Chương 1: Nhập môn Lập trình C', title: 'Bài 1: Cài đặt GCC & Viết chương trình Hello World', orderIndex: 1, durationMinutes: 25, isPreview: true, videoUrl: 'https://www.youtube.com/watch?v=KJgsSFOSQv0' },
        { sectionTitle: 'Chương 1: Nhập môn Lập trình C', title: 'Bài 2: Kiểu dữ liệu, Biến và Hằng số trong C', orderIndex: 2, durationMinutes: 30, isPreview: true, videoUrl: 'https://www.youtube.com/watch?v=KJgsSFOSQv0' },
        { sectionTitle: 'Chương 2: Cấu trúc Điều khiển', title: 'Bài 3: Cấu trúc Rẽ nhánh if-else và switch-case', orderIndex: 3, durationMinutes: 45, isPreview: false, videoUrl: 'https://www.youtube.com/watch?v=KJgsSFOSQv0' },
        { sectionTitle: 'Chương 2: Cấu trúc Điều khiển', title: 'Bài 4: Vòng lặp for, while và do-while thực chiến', orderIndex: 4, durationMinutes: 40, isPreview: false, videoUrl: 'https://www.youtube.com/watch?v=KJgsSFOSQv0' },
        { sectionTitle: 'Chương 3: Hàm và Mảng', title: 'Bài 5: Khai báo Hàm, Truyền tham trị & Tham chiếu', orderIndex: 5, durationMinutes: 50, isPreview: false, videoUrl: 'https://www.youtube.com/watch?v=KJgsSFOSQv0' }
      ];
      prfLessons.forEach(l => {
        data.course_lessons.push({
          id: next('course_lessons'),
          courseId: course.id,
          ...l,
          materialUrl: 'https://fpt.edu.vn/materials/prf192-slides.pdf'
        });
      });
    }
  }

  const historicalClassesSpec = [
    { classCode: 'HIST-PRF192', courseCode: 'PRF192', semester: 'FA24', teacherIdx: 1 },
    { classCode: 'HIST-CEA201', courseCode: 'CEA201', semester: 'FA24', teacherIdx: 2 },
    { classCode: 'HIST-CSI104', courseCode: 'CSI104', semester: 'FA24', teacherIdx: 0 },
    { classCode: 'HIST-MAE101', courseCode: 'MAE101', semester: 'FA24', teacherIdx: 0 },
    { classCode: 'HIST-PRO192', courseCode: 'PRO192', semester: 'SP25', teacherIdx: 0 },
    { classCode: 'HIST-MAD101', courseCode: 'MAD101', semester: 'SP25', teacherIdx: 1 },
    { classCode: 'HIST-OSG201', courseCode: 'OSG201', semester: 'SP25', teacherIdx: 2 },
    { classCode: 'HIST-SSG104', courseCode: 'SSG104', semester: 'SP25', teacherIdx: 2 },
    { classCode: 'HIST-CSD201', courseCode: 'CSD201', semester: 'SU25', teacherIdx: 1 },
    { classCode: 'HIST-DBI202', courseCode: 'DBI202', semester: 'SU25', teacherIdx: 2 },
    { classCode: 'HIST-MAS291', courseCode: 'MAS291', semester: 'SU25', teacherIdx: 1 },
    { classCode: 'HIST-JPD113', courseCode: 'JPD113', semester: 'SU25', teacherIdx: 0 },
    { classCode: 'HIST-PRJ301', courseCode: 'PRJ301', semester: 'FA25', teacherIdx: 0 },
    { classCode: 'HIST-SWE201c', courseCode: 'SWE201c', semester: 'FA25', teacherIdx: 0 },
    { classCode: 'HIST-IOT102', courseCode: 'IOT102', semester: 'FA25', teacherIdx: 2 },
    { classCode: 'HIST-PRN231', courseCode: 'PRN231', semester: 'FA25', teacherIdx: 0 },
    { classCode: 'HIST-SWP391', courseCode: 'SWP391', semester: 'FA25', teacherIdx: 0 },
    { classCode: 'HIST-SWR302', courseCode: 'SWR302', semester: 'FA25', teacherIdx: 2 },
    { classCode: 'HIST-OJT401', courseCode: 'OJT401', semester: 'FA25', teacherIdx: 0 }
  ];

  const ongoingClassesSpec = [
    { classCode: 'SE1701-SWD392', courseCode: 'SWD392', semester: 'SP26', teacherIdx: 0, days: [2, 4, 6], shift: 1, room: 'BE-401' },
    { classCode: 'SE1701-PRM392', courseCode: 'PRM392', semester: 'SP26', teacherIdx: 1, days: [2, 4, 6], shift: 2, room: 'BE-402' },
    { classCode: 'SE1701-MLN122', courseCode: 'MLN122', semester: 'SP26', teacherIdx: 2, days: [3, 5, 7], shift: 1, room: 'AL-301' },
    { classCode: 'SE1801-PRN231', courseCode: 'PRN231', semester: 'SP26', teacherIdx: 0, days: [2, 4, 6], shift: 3, room: 'BE-301' },
    { classCode: 'SE1801-SWP391', courseCode: 'SWP391', semester: 'SP26', teacherIdx: 0, days: [3, 5, 7], shift: 2, room: 'BE-302' },
    { classCode: 'SE1801-SWR302', courseCode: 'SWR302', semester: 'SP26', teacherIdx: 2, days: [3, 5, 7], shift: 3, room: 'AL-204' },
    { classCode: 'SE1901-CSD201', courseCode: 'CSD201', semester: 'SP26', teacherIdx: 1, days: [2, 4, 6], shift: 4, room: 'AL-205' },
    { classCode: 'SE1901-DBI202', courseCode: 'DBI202', semester: 'SP26', teacherIdx: 2, days: [3, 5, 7], shift: 4, room: 'AL-206' },
    { classCode: 'SE1901-MAS291', courseCode: 'MAS291', semester: 'SP26', teacherIdx: 1, days: [2, 4, 6], shift: 5, room: 'BE-201' },
    { classCode: 'SE1902-MAD101', courseCode: 'MAD101', semester: 'SP26', teacherIdx: 1, days: [3, 5, 7], shift: 2, room: 'DE-201' },
    { classCode: 'SE1902-OSG201', courseCode: 'OSG201', semester: 'SP26', teacherIdx: 2, days: [2, 4, 6], shift: 3, room: 'DE-202' },
    { classCode: 'SE2001-PRF192', courseCode: 'PRF192', semester: 'SP26', teacherIdx: 1, days: [2, 4, 6], shift: 1, room: 'DE-101' },
    { classCode: 'SE2001-CEA201', courseCode: 'CEA201', semester: 'SP26', teacherIdx: 2, days: [3, 5, 7], shift: 2, room: 'DE-102' },
    { classCode: 'SE2001-MAE101', courseCode: 'MAE101', semester: 'SP26', teacherIdx: 0, days: [2, 4, 6], shift: 2, room: 'DE-103' }
  ];

  const upcomingClassesSpec = [
    { classCode: 'SE1702-PRU212', courseCode: 'PRU212', semester: 'SU26', teacherIdx: 0, days: [2, 4, 6], shift: 1, room: 'BE-405' },
    { classCode: 'SE1902-PRO192', courseCode: 'PRO192', semester: 'SU26', teacherIdx: 1, days: [3, 5, 7], shift: 3, room: 'AL-210' }
  ];

  const classByCode = {};
  const addClass = (c, status) => {
    const cls = {
      id: next('classes'),
      classCode: c.classCode,
      courseId: courseByCode[c.courseCode].id,
      teacherId: teachers[c.teacherIdx].id,
      semester: c.semester,
      maxStudents: 30,
      meetUrl: status === 'COMPLETED' ? null : `https://meet.google.com/ems-${c.classCode.toLowerCase()}`,
      status,
      createdAt: status === 'COMPLETED' ? new Date('2025-05-01T08:00:00Z') : new Date('2026-10-20T08:00:00Z')
    };
    data.classes.push(cls);
    classByCode[c.classCode] = cls;
  };
  historicalClassesSpec.forEach(c => addClass(c, 'COMPLETED'));
  ongoingClassesSpec.forEach(c => addClass(c, 'ONGOING'));
  upcomingClassesSpec.forEach(c => addClass(c, 'UPCOMING'));

  for (const spec of [...ongoingClassesSpec, ...upcomingClassesSpec]) {
    const cls = classByCode[spec.classCode];
    const slot = LEGACY_SLOT_TIMES[spec.shift];
    for (const day of spec.days) {
      data.schedules.push({
        id: next('schedules'),
        classId: cls.id,
        dayOfWeek: day,
        shift: spec.shift,
        startTime: slot.start,
        endTime: slot.end,
        room: spec.room
      });
    }
  }

  const term1Courses = ['PRF192', 'CEA201', 'CSI104', 'MAE101'];
  const term2Courses = ['PRO192', 'MAD101', 'OSG201', 'SSG104'];
  const term3Courses = ['CSD201', 'DBI202', 'MAS291', 'JPD113'];
  const term4Courses = ['PRJ301', 'SWE201c', 'IOT102'];
  const term5Courses = ['PRN231', 'SWP391', 'SWR302'];
  const term6Courses = ['OJT401'];

  const studentPastHistoryConfig = [
    { studentCode: 'HE170001', passed: [...term1Courses, ...term2Courses, ...term3Courses, ...term4Courses, ...term5Courses, ...term6Courses], failed: [], baseScore: 8.5 },
    { studentCode: 'HE170002', passed: [...term1Courses, ...term2Courses, ...term3Courses, ...term4Courses, ...term5Courses, ...term6Courses], failed: [], baseScore: 7.8 },
    { studentCode: 'HE170003', passed: [...term1Courses, ...term2Courses, ...term3Courses, ...term4Courses, ...term5Courses, ...term6Courses], failed: [], baseScore: 7.0 },
    { studentCode: 'HE170004', passed: [...term1Courses, ...term2Courses, ...term3Courses, ...term4Courses], failed: [], baseScore: 8.2 },
    { studentCode: 'HE170005', passed: [...term1Courses, ...term2Courses, ...term3Courses, ...term4Courses], failed: [], baseScore: 6.8 },
    { studentCode: 'HE170006', passed: [...term1Courses, ...term2Courses, ...term3Courses, 'PRJ301', 'IOT102'], failed: ['SWE201c'], baseScore: 7.4 },
    { studentCode: 'HE170007', passed: [...term1Courses, ...term2Courses], failed: [], baseScore: 7.6 },
    { studentCode: 'HE170008', passed: [...term1Courses, ...term2Courses], failed: [], baseScore: 8.1 },
    { studentCode: 'HE170009', passed: ['CEA201', 'CSI104', 'MAE101'], failed: ['PRF192'], baseScore: 6.5 },
    { studentCode: 'HE170010', passed: [], failed: [], baseScore: 8.0 }
  ];

  const ALL_PRESENT = ['PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT'];
  const ONE_EXCUSED = ['PRESENT', 'ABSENT_EXCUSED', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT'];
  const ONE_LATE = ['PRESENT', 'PRESENT', 'LATE', 'PRESENT', 'PRESENT', 'PRESENT'];
  const WARN_1_ABSENT = ['PRESENT', 'PRESENT', 'ABSENT_UNEXCUSED', 'PRESENT', 'PRESENT', 'PRESENT'];
  const BANNED_2_ABSENT = ['PRESENT', 'ABSENT_UNEXCUSED', 'ABSENT_UNEXCUSED', 'PRESENT', 'PRESENT', 'PRESENT'];

  const ongoingEnrollmentsPlan = [
    { studentCode: 'HE170001', classCode: 'SE1701-SWD392', statuses: ALL_PRESENT, midterm: 9.0, invoiceStatus: 'PAID' },
    { studentCode: 'HE170001', classCode: 'SE1701-PRM392', statuses: ALL_PRESENT, midterm: 8.5, invoiceStatus: 'PAID' },
    { studentCode: 'HE170001', classCode: 'SE1701-MLN122', statuses: ALL_PRESENT, midterm: 9.0, invoiceStatus: 'PAID' },
    { studentCode: 'HE170002', classCode: 'SE1701-SWD392', statuses: ONE_EXCUSED, midterm: 8.0, invoiceStatus: 'PAID', excusedNote: 'Nghỉ có phép (Đã duyệt đơn xin nghỉ ngày 04/11)' },
    { studentCode: 'HE170002', classCode: 'SE1701-PRM392', statuses: ALL_PRESENT, midterm: 7.5, invoiceStatus: 'PARTIAL' },
    { studentCode: 'HE170002', classCode: 'SE1701-MLN122', statuses: ALL_PRESENT, midterm: 8.5, invoiceStatus: 'PAID' },
    { studentCode: 'HE170003', classCode: 'SE1701-SWD392', statuses: ONE_LATE, midterm: 7.0, invoiceStatus: 'PAID' },
    { studentCode: 'HE170003', classCode: 'SE1701-PRM392', statuses: WARN_1_ABSENT, midterm: 6.5, invoiceStatus: 'UNPAID' },
    { studentCode: 'HE170003', classCode: 'SE1701-MLN122', statuses: ALL_PRESENT, midterm: 7.5, invoiceStatus: 'PARTIAL' },
    { studentCode: 'HE170004', classCode: 'SE1801-PRN231', statuses: ALL_PRESENT, midterm: 8.5, invoiceStatus: 'PAID' },
    { studentCode: 'HE170004', classCode: 'SE1801-SWP391', statuses: ALL_PRESENT, midterm: 9.0, invoiceStatus: 'PAID' },
    { studentCode: 'HE170004', classCode: 'SE1801-SWR302', statuses: ALL_PRESENT, midterm: 8.0, invoiceStatus: 'PAID' },
    { studentCode: 'HE170005', classCode: 'SE1801-PRN231', statuses: BANNED_2_ABSENT, midterm: 6.0, invoiceStatus: 'PARTIAL' },
    { studentCode: 'HE170005', classCode: 'SE1801-SWP391', statuses: WARN_1_ABSENT, midterm: 7.0, invoiceStatus: 'PAID' },
    { studentCode: 'HE170005', classCode: 'SE1801-SWR302', statuses: ALL_PRESENT, midterm: 7.5, invoiceStatus: 'UNPAID' },
    { studentCode: 'HE170006', classCode: 'SE1801-PRN231', statuses: ALL_PRESENT, midterm: 8.0, invoiceStatus: 'PAID' },
    { studentCode: 'HE170006', classCode: 'SE1801-SWP391', statuses: ONE_LATE, midterm: 7.5, invoiceStatus: 'PARTIAL' },
    { studentCode: 'HE170007', classCode: 'SE1901-CSD201', statuses: ALL_PRESENT, midterm: 8.0, invoiceStatus: 'PAID' },
    { studentCode: 'HE170007', classCode: 'SE1901-DBI202', statuses: ALL_PRESENT, midterm: 7.5, invoiceStatus: 'PAID' },
    { studentCode: 'HE170007', classCode: 'SE1901-MAS291', statuses: ALL_PRESENT, midterm: 8.5, invoiceStatus: 'PARTIAL' },
    { studentCode: 'HE170008', classCode: 'SE1901-CSD201', statuses: ONE_LATE, midterm: 8.5, invoiceStatus: 'PAID' },
    { studentCode: 'HE170008', classCode: 'SE1901-DBI202', statuses: ALL_PRESENT, midterm: 9.0, invoiceStatus: 'PAID' },
    { studentCode: 'HE170008', classCode: 'SE1901-MAS291', statuses: WARN_1_ABSENT, midterm: 7.0, invoiceStatus: 'UNPAID' },
    { studentCode: 'HE170009', classCode: 'SE1902-MAD101', statuses: ALL_PRESENT, midterm: 7.0, invoiceStatus: 'PAID' },
    { studentCode: 'HE170009', classCode: 'SE1902-OSG201', statuses: WARN_1_ABSENT, midterm: 6.5, invoiceStatus: 'PARTIAL' },
    { studentCode: 'HE170009', classCode: 'SE2001-PRF192', statuses: ALL_PRESENT, midterm: 7.5, invoiceStatus: 'PAID' },
    { studentCode: 'HE170010', classCode: 'SE2001-PRF192', statuses: ALL_PRESENT, midterm: 8.5, invoiceStatus: 'PAID' },
    { studentCode: 'HE170010', classCode: 'SE2001-CEA201', statuses: ALL_PRESENT, midterm: 8.0, invoiceStatus: 'PAID' },
    { studentCode: 'HE170010', classCode: 'SE2001-MAE101', statuses: ONE_LATE, midterm: 7.5, invoiceStatus: 'PARTIAL' }
  ];

  const enrollmentMap = new Map();
  for (const hist of studentPastHistoryConfig) {
    const stu = studentByCode[hist.studentCode];
    for (const cCode of [...hist.passed, ...hist.failed]) {
      const cls = classByCode[`HIST-${cCode}`];
      const enr = {
        id: next('enrollments'),
        classId: cls.id,
        studentId: stu.id,
        status: 'ACTIVE',
        enrolledAt: new Date('2025-05-10T08:00:00Z')
      };
      data.enrollments.push(enr);
      enrollmentMap.set(`${cls.id}_${stu.id}`, enr);
    }
  }
  for (const plan of ongoingEnrollmentsPlan) {
    const stu = studentByCode[plan.studentCode];
    const cls = classByCode[plan.classCode];
    const enr = {
      id: next('enrollments'),
      classId: cls.id,
      studentId: stu.id,
      status: 'ACTIVE',
      enrolledAt: new Date('2026-10-25T08:00:00Z')
    };
    data.enrollments.push(enr);
    enrollmentMap.set(`${cls.id}_${stu.id}`, enr);
  }

  for (const hist of studentPastHistoryConfig) {
    const stu = studentByCode[hist.studentCode];
    let idx = 0;
    for (const cCode of hist.passed) {
      idx += 1;
      const cls = classByCode[`HIST-${cCode}`];
      const enr = enrollmentMap.get(`${cls.id}_${stu.id}`);
      const course = courseByCode[cCode];

      const att = 10.0;
      const mid = parseFloat(Math.min(9.5, hist.baseScore + ((idx % 3) - 1) * 0.5).toFixed(1));
      const fin = parseFloat(Math.min(9.5, hist.baseScore + ((idx % 2) * 0.4)).toFixed(1));
      const total = parseFloat((att * 0.1 + mid * 0.3 + fin * 0.6).toFixed(1));

      data.grades.push({
        id: next('grades'),
        enrollmentId: enr.id,
        attendanceScore: att,
        midtermScore: mid,
        finalScore: fin,
        totalScore: total,
        isPassed: true,
        isBanned: false
      });

      data.tuition_invoices.push({
        id: next('tuition_invoices'),
        studentId: stu.id,
        enrollmentId: enr.id,
        amount: course.baseTuitionFee,
        paidAmount: course.baseTuitionFee,
        dueDate: new Date('2025-08-15'),
        status: 'PAID',
        paidAt: new Date('2025-08-05T10:00:00Z'),
        createdAt: new Date('2025-07-15T08:00:00Z')
      });
    }

    for (const cCode of hist.failed) {
      const cls = classByCode[`HIST-${cCode}`];
      const enr = enrollmentMap.get(`${cls.id}_${stu.id}`);
      const course = courseByCode[cCode];

      const att = 8.0;
      const mid = 4.0;
      const fin = 2.5;
      const total = parseFloat((att * 0.1 + mid * 0.3 + fin * 0.6).toFixed(1));

      data.grades.push({
        id: next('grades'),
        enrollmentId: enr.id,
        attendanceScore: att,
        midtermScore: mid,
        finalScore: fin,
        totalScore: total,
        isPassed: false,
        isBanned: false
      });

      data.tuition_invoices.push({
        id: next('tuition_invoices'),
        studentId: stu.id,
        enrollmentId: enr.id,
        amount: course.baseTuitionFee,
        paidAmount: course.baseTuitionFee,
        dueDate: new Date('2025-08-15'),
        status: 'PAID',
        paidAt: new Date('2025-08-05T10:00:00Z'),
        createdAt: new Date('2025-07-15T08:00:00Z')
      });
    }
  }

  const ongoingSpecByClassCode = {};
  ongoingClassesSpec.forEach(s => { ongoingSpecByClassCode[s.classCode] = s; });

  let receiptSeq = 0;
  for (const plan of ongoingEnrollmentsPlan) {
    const stu = studentByCode[plan.studentCode];
    const cls = classByCode[plan.classCode];
    const spec = ongoingSpecByClassCode[plan.classCode];
    const course = courseByCode[spec.courseCode];
    const enr = enrollmentMap.get(`${cls.id}_${stu.id}`);

    const sessionDates = getTwoWeekDatesForDays(spec.days);
    const attendedStatuses = [];

    sessionDates.forEach((dateObj, idx) => {
      const dateStr = dateObj.toISOString().split('T')[0];
      const isPastOrCurrentSession =
        dateStr < '2026-11-09' || (dateStr === '2026-11-09' && spec.shift <= 2);

      if (!isPastOrCurrentSession) return;

      const st = plan.statuses[idx] || 'PRESENT';
      attendedStatuses.push(st);

      let note = null;
      if (st === 'ABSENT_EXCUSED') note = plan.excusedNote || 'Nghỉ có phép (Đã duyệt đơn)';
      else if (st === 'ABSENT_UNEXCUSED') note = `Vắng mặt không phép buổi ${idx + 1}`;
      else if (st === 'LATE') note = 'Vào lớp muộn 10 phút';

      data.attendances.push({
        id: next('attendances'),
        classId: cls.id,
        studentId: stu.id,
        sessionDate: dateObj,
        status: st,
        note
      });
    });

    const { attendanceScore, isBanned } = calcAttendanceMetrics(attendedStatuses, 6);

    data.grades.push({
      id: next('grades'),
      enrollmentId: enr.id,
      attendanceScore,
      midtermScore: plan.midterm,
      finalScore: null,
      totalScore: null,
      isPassed: false,
      isBanned
    });

    const fee = Number(course.baseTuitionFee);
    const paidAmount = plan.invoiceStatus === 'PAID' ? fee : plan.invoiceStatus === 'PARTIAL' ? 2500000 : 0;

    const inv = {
      id: next('tuition_invoices'),
      studentId: stu.id,
      enrollmentId: enr.id,
      amount: fee,
      paidAmount,
      dueDate: new Date('2026-11-20'),
      status: plan.invoiceStatus,
      paidAt: plan.invoiceStatus === 'PAID' ? new Date('2026-11-01T10:00:00Z') : null,
      createdAt: new Date('2026-10-25T08:00:00Z')
    };
    data.tuition_invoices.push(inv);

    if (paidAmount > 0) {
      receiptSeq += 1;
      data.tuition_payments.push({
        id: next('tuition_payments'),
        invoiceId: inv.id,
        transactionId: null,
        receiptNo: `PT-202611-${String(receiptSeq).padStart(5, '0')}`,
        amount: paidAmount,
        method: receiptSeq % 2 === 0 ? 'VIETQR' : 'BANK_TRANSFER',
        note: inv.status === 'PAID' ? 'Thu đủ học phí kỳ SP26' : 'Thu học phí đợt 1 kỳ SP26',
        collectedById: accountant.id,
        paidAt: new Date('2026-11-01T09:30:00Z')
      });
    }
  }

  for (const spec of ongoingClassesSpec) {
    const cls = classByCode[spec.classCode];
    const course = courseByCode[spec.courseCode];
    data.assignments.push(
      {
        id: next('assignments'),
        classId: cls.id,
        title: `[Tuần 1] Lab 1 - Thực hành nền tảng môn ${course.courseCode}`,
        description: `Bài tập thực hành Tuần 1 (02/11 - 08/11/2026) môn ${course.name}. Sinh viên nộp file .zip gồm mã nguồn và báo cáo PDF.`,
        fileUrl: `https://fap.fpt.edu.vn/materials/${course.courseCode}_Week1_Lab1.pdf`,
        dueDate: new Date('2026-11-08T23:59:00Z'),
        createdAt: new Date('2026-11-02T08:00:00Z')
      },
      {
        id: next('assignments'),
        classId: cls.id,
        title: `[Tuần 2] Assignment 2 - Đồ án mini kết thúc kỳ 2 tuần môn ${course.courseCode}`,
        description: `Bài tập lớn Tuần 2 (09/11 - 15/11/2026) môn ${course.name}. Hoàn thiện toàn bộ yêu cầu theo rubric chấm điểm.`,
        fileUrl: `https://fap.fpt.edu.vn/materials/${course.courseCode}_Week2_Assignment2.pdf`,
        dueDate: new Date('2026-11-15T23:59:00Z'),
        createdAt: new Date('2026-11-09T08:00:00Z')
      }
    );
  }

  for (const plan of ongoingEnrollmentsPlan) {
    const stu = studentByCode[plan.studentCode];
    const cls = classByCode[plan.classCode];
    const classAssignments = data.assignments.filter(a => a.classId === cls.id);
    const week1Ass = classAssignments[0];
    const week2Ass = classAssignments[1];

    if (week1Ass) {
      const isLateStudent = plan.studentCode === 'HE170003' && plan.classCode === 'SE1701-PRM392';
      const isMissingStudent = plan.studentCode === 'HE170005' && plan.classCode === 'SE1801-PRN231';

      if (!isMissingStudent) {
        data.submissions.push({
          id: next('submissions'),
          assignmentId: week1Ass.id,
          studentId: stu.id,
          fileUrl: `/uploads/${stu.code}_${plan.classCode}_Lab1.zip`,
          submittedAt: isLateStudent ? new Date('2026-11-09T02:15:00Z') : new Date('2026-11-07T20:30:00Z'),
          status: isLateStudent ? 'LATE_SUBMITTED' : 'SUBMITTED',
          score: plan.midterm,
          teacherFeedback: isLateStudent
            ? 'Nộp bài muộn sau deadline, code chạy được nhưng cần bổ sung xử lý ngoại lệ.'
            : 'Bài làm tốt, cấu trúc rõ ràng, đáp ứng đầy đủ yêu cầu thực hành Tuần 1.'
        });
      }
    }

    if (week2Ass) {
      const submittedEarly =
        (plan.studentCode === 'HE170001' && plan.classCode !== 'SE1701-MLN122') ||
        (plan.studentCode === 'HE170004' && plan.classCode === 'SE1801-PRN231') ||
        (plan.studentCode === 'HE170007' && plan.classCode === 'SE1901-CSD201');

      if (submittedEarly) {
        data.submissions.push({
          id: next('submissions'),
          assignmentId: week2Ass.id,
          studentId: stu.id,
          fileUrl: `/uploads/${stu.code}_${plan.classCode}_Assignment2.zip`,
          submittedAt: new Date('2026-11-09T09:00:00Z'),
          status: 'SUBMITTED',
          score: null,
          teacherFeedback: null
        });
      }
    }
  }

  data.student_requests.push(
    {
      id: next('student_requests'),
      studentId: studentByCode['HE170002'].id,
      classId: classByCode['SE1701-SWD392'].id,
      requestType: 'ABSENCE',
      sessionDate: new Date('2026-11-04'),
      reason: 'Em bị sốt xuất huyết có giấy khám bệnh của bệnh viện, xin phép nghỉ buổi học ngày 04/11/2026 môn SWD392.',
      status: 'APPROVED',
      adminResponse: 'Phòng Đào tạo chấp thuận đơn xin nghỉ có phép. Đã cập nhật trạng thái điểm danh ngày 04/11 thành Nghỉ có phép.'
    },
    {
      id: next('student_requests'),
      studentId: studentByCode['HE170005'].id,
      classId: classByCode['SE1801-PRN231'].id,
      requestType: 'ABSENCE',
      sessionDate: new Date('2026-11-06'),
      reason: 'Gia đình em có việc đột xuất phải về quê ngày 06/11/2026, xin phép chuyển buổi vắng ngày 06/11 sang nghỉ có phép để không bị cấm thi.',
      status: 'PENDING',
      adminResponse: null
    },
    {
      id: next('student_requests'),
      studentId: studentByCode['HE170006'].id,
      classId: classByCode['HIST-SWE201c'].id,
      requestType: 'REMARK',
      sessionDate: null,
      reason: 'Em xin phúc khảo bài thi cuối kỳ môn SWE201c (hiện tại 2.5 điểm) để đủ điều kiện mở khóa môn SWR302.',
      status: 'PENDING',
      adminResponse: null
    },
    {
      id: next('student_requests'),
      studentId: studentByCode['HE170001'].id,
      classId: null,
      requestType: 'CONFIRMATION',
      sessionDate: null,
      reason: 'Xin cấp giấy xác nhận sinh viên năm cuối (Kỳ 7) để bổ sung hồ sơ học bổng doanh nghiệp FPT Software.',
      status: 'APPROVED',
      adminResponse: 'Đã cấp giấy xác nhận sinh viên. Mời em nhận bản cứng tại phòng Dịch vụ Sinh viên.'
    }
  );

  data.notifications.push(
    {
      id: next('notifications'),
      userId: null,
      title: 'Lịch học & Điểm danh Học kỳ SP26 (Kỳ học 2 tuần: 02/11/2026 – 15/11/2026)',
      message: 'Toàn bộ các lớp học phần kỳ SP26 học trong 2 tuần (6 buổi/môn). Sinh viên vắng không phép từ 2/6 buổi (>= 20%) sẽ bị cấm thi tự động.',
      type: 'SYSTEM'
    },
    {
      id: next('notifications'),
      userId: null,
      title: 'Thông báo hoàn thành học phí Học kỳ SP26 trước ngày 20/11/2026',
      message: 'Sinh viên kiểm tra công nợ học phí và thanh toán trực tuyến qua VietQR để đảm bảo điều kiện dự thi cuối kỳ.',
      type: 'TUITION'
    },
    {
      id: next('notifications'),
      userId: studentByCode['HE170001'].id,
      title: 'Đã chấm điểm Lab 1 Tuần 1 môn SWD392 & PRM392',
      message: 'Giảng viên đã chấm điểm bài tập Lab 1 Tuần 1 của bạn (9.0/10). Vui lòng hoàn thành Assignment 2 Tuần 2 trước ngày 15/11/2026.',
      type: 'GRADE'
    },
    {
      id: next('notifications'),
      userId: studentByCode['HE170005'].id,
      title: 'CẢNH BÁO CẤM THI: Môn PRN231 (Lớp SE1801-PRN231)',
      message: 'Bạn đã vắng không phép 2/6 buổi (33.3% >= 20%) ở lớp SE1801-PRN231 và bị khóa điều kiện dự thi cuối kỳ.',
      type: 'SYSTEM'
    }
  );

  return { data, counters: ids, currentSemester: 'SP26' };
}

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

  // 3. Tạo dữ liệu mới (Chuyển toàn bộ dữ liệu gốc từ TiDB sang MongoDB Atlas)
  const seed = buildLegacyTiDBSeed({ passwordHash: await bcrypt.hash('123456', 10) });
  for (const [collection, rows] of Object.entries(seed.data)) {
    if (rows.length && COLLECTION_MODELS[collection]) {
      await COLLECTION_MODELS[collection].insertMany(rows, { ordered: true });
    }
  }
  for (const [name, seq] of Object.entries(seed.counters)) await models.Counter.updateOne({ _id: name }, { $set: { seq } }, { upsert: true });

  console.log('Reset completed:', describe(seed));
  console.log('Accounts: admin@fpt.edu.vn, ketoan@fpt.edu.vn, thaynam@fpt.edu.vn, colinh@fpt.edu.vn, thaytuan@fpt.edu.vn, namnvhe170001@fpt.edu.vn ... haonvhe170010@fpt.edu.vn — password = 123456');
}

if (require.main === module) {
  main()
    .catch(e => { console.error('Seed failed:', e.message); process.exitCode = 1; })
    .finally(() => disconnectDB());
}

module.exports = { calendarTerm, currentCalendarIndex, buildSeed, buildLegacyTiDBSeed, describe };

