/**
 * Dữ liệu mẫu cho mô hình TRUNG TÂM BÁN KHÓA HỌC (thay cho dữ liệu đại học cũ).
 *
 *  Môn / Chứng chỉ (subjects)  ──<  Khóa học (courses: RECORDED | LIVE_ONLINE)  ──<  Lớp (classes)
 *
 * - Giữ nguyên toàn bộ 25 môn FPT theo kỳ 1–9 của khung chương trình (curriculumData.js).
 * - Thêm 5 chứng chỉ ngoài: CCNA, IELTS, TOEIC, AWS Cloud Practitioner, JLPT N3.
 * - Một môn / chứng chỉ có nhiều khóa học (video quay sẵn, lớp Live, lớp kèm nhóm nhỏ…).
 * - Không tạo bảng điểm (trung tâm không ràng buộc điểm số) và không tạo giao dịch SePay giả.
 * Hàm thuần (không chạm DB) để có thể kiểm thử.
 */
const models = require('../src/models');
const { SE_CURRICULUM } = require('../src/modules/curriculum/curriculumData');

const DAY = 86400000;
const SLOTS = {
  1: ['07:30', '09:50'], 2: ['10:00', '12:20'], 3: ['12:50', '15:10'],
  4: ['15:20', '17:40'], 5: ['18:00', '20:20'], 6: ['20:30', '22:50']
};
// Các nhóm ngày không giao nhau → lớp Live khác ô (nhóm ngày, ca) không bao giờ trùng lịch.
const DAY_PATTERNS = [[2, 4, 6], [3, 5], [7, 8]];
const WEEKS_PER_COHORT = 4;

const vnDate = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const utcDay = str => new Date(`${str}T00:00:00.000Z`);
const mondayOf = dateStr => { const d = utcDay(dateStr); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d; };
const iso = d => d.toISOString().slice(0, 10);
const dayOfWeekOf = d => (d.getUTCDay() === 0 ? 8 : d.getUTCDay() + 1);

const TEACHERS = [
  { code: 'GV001', email: 'thaynam@fpt.edu.vn', name: 'ThS. Nguyễn Hoài Nam', degree: 'Thạc sĩ', specialty: 'Lập trình C, Java, Cấu trúc dữ liệu', certificates: ['Oracle Certified Java Programmer'] },
  { code: 'GV002', email: 'colinh@fpt.edu.vn', name: 'TS. Trần Thùy Linh', degree: 'Tiến sĩ', specialty: 'Cơ sở dữ liệu, Java Web, Kiến trúc phần mềm', certificates: ['Microsoft Certified: Azure Developer'] },
  { code: 'GV003', email: 'thaytuan@fpt.edu.vn', name: 'ThS. Lê Anh Tuấn', degree: 'Thạc sĩ', specialty: 'Toán ứng dụng, Khoa học máy tính', certificates: [] },
  { code: 'GV004', email: 'thayhung@fpt.edu.vn', name: 'ThS. Phạm Quốc Hùng', degree: 'Thạc sĩ', specialty: 'Mạng máy tính, Hệ điều hành, IoT', certificates: ['Cisco CCNP Enterprise', 'AWS Solutions Architect – Associate'] },
  { code: 'GV005', email: 'cohuong@fpt.edu.vn', name: 'Cô Đặng Thu Hương', degree: 'Thạc sĩ', specialty: 'Tiếng Anh học thuật IELTS', certificates: ['IELTS 8.5 Overall'] },
  { code: 'GV006', email: 'comai@fpt.edu.vn', name: 'Cô Vũ Ngọc Mai', degree: 'Cử nhân', specialty: 'Tiếng Nhật', certificates: ['JLPT N1'] },
  { code: 'GV007', email: 'thayduc@fpt.edu.vn', name: 'ThS. Hoàng Minh Đức', degree: 'Thạc sĩ', specialty: 'Lập trình Web & Mobile, .NET, React', certificates: ['Meta Front-End Developer'] },
  { code: 'GV008', email: 'coha@fpt.edu.vn', name: 'TS. Bùi Thanh Hà', degree: 'Tiến sĩ', specialty: 'Kỹ nghệ phần mềm, Quản lý dự án', certificates: ['PMP', 'Professional Scrum Master I'] },
  { code: 'GV009', email: 'thaykhai@fpt.edu.vn', name: 'ThS. Đỗ Quang Khải', degree: 'Thạc sĩ', specialty: 'Lập trình C/C#, Java, Giải thuật', certificates: ['ICPC Coach'] },
  { code: 'GV010', email: 'congoc@fpt.edu.vn', name: 'Cô Ngô Bảo Ngọc', degree: 'Thạc sĩ', specialty: 'Tiếng Anh TOEIC & IELTS Speaking', certificates: ['TOEIC 990', 'IELTS 8.0 Overall'] },
  { code: 'GV011', email: 'thayphuc@fpt.edu.vn', name: 'ThS. Lý Văn Phúc', degree: 'Thạc sĩ', specialty: 'Điện toán đám mây AWS & Mạng', certificates: ['AWS Solutions Architect – Professional', 'Cisco CCNA'] },
  { code: 'GV012', email: 'cophuong@fpt.edu.vn', name: 'ThS. Trịnh Thu Phương', degree: 'Thạc sĩ', specialty: 'Toán rời rạc, Xác suất thống kê, SQL', certificates: [] },
  { code: 'GV013', email: 'thaytrong@fpt.edu.vn', name: 'ThS. Nguyễn Đình Trọng', degree: 'Thạc sĩ', specialty: 'Triết học, Kỹ năng mềm', certificates: [] }
];

/**
 * Giảng viên dạy từng môn / chứng chỉ: phần tử đầu là giảng viên phụ trách chính (khóa video + lớp K1),
 * các giảng viên sau dạy thêm lớp Live khác (học viên chọn lớp theo lịch và giảng viên).
 */
const SUBJECT_TEACHERS = {
  PRF192: ['GV001', 'GV009'], PRO192: ['GV001', 'GV009'], CSD201: ['GV001', 'GV009'], PRU212: ['GV009'],
  PRM392: ['GV007'], WDU203: ['GV007'], PRN231: ['GV007', 'GV002'],
  DBI202: ['GV002', 'GV012'], PRJ301: ['GV002', 'GV007'], SWD392: ['GV002'],
  SWE201C: ['GV008'], SWR302: ['GV008'], SWP391: ['GV008', 'GV002'], SEP490: ['GV008'], OJT401: ['GV008'],
  MAE101: ['GV003', 'GV012'], MAD101: ['GV003', 'GV012'], MAS291: ['GV012'], CSI104: ['GV003'],
  CEA201: ['GV004'], OSG201: ['GV004'], IOT102: ['GV004'],
  JPD113: ['GV006'], SSG104: ['GV013'], MLN122: ['GV013'],
  CCNA: ['GV004', 'GV011'], 'AWS-CCP': ['GV011', 'GV004'], IELTS: ['GV005', 'GV010'], TOEIC: ['GV010', 'GV005'], 'JLPT-N3': ['GV006']
};

const CERTIFICATES = [
  { code: 'CCNA', name: 'Cisco CCNA 200-301', description: 'Chứng chỉ mạng quốc tế của Cisco: định tuyến, chuyển mạch, bảo mật và tự động hóa mạng.' },
  { code: 'IELTS', name: 'IELTS Academic', description: 'Chứng chỉ tiếng Anh học thuật 4 kỹ năng, dùng cho du học, xét tốt nghiệp và tuyển dụng.' },
  { code: 'TOEIC', name: 'TOEIC Listening & Reading', description: 'Chứng chỉ tiếng Anh giao tiếp công sở, chuẩn đầu ra phổ biến của các trường và doanh nghiệp.' },
  { code: 'AWS-CCP', name: 'AWS Certified Cloud Practitioner', description: 'Chứng chỉ nền tảng điện toán đám mây AWS (CLF-C02) cho sinh viên IT.' },
  { code: 'JLPT-N3', name: 'Năng lực tiếng Nhật JLPT N3', description: 'Chứng chỉ tiếng Nhật trung cấp, lợi thế khi thực tập / làm việc tại doanh nghiệp Nhật.' }
];

/**
 * Danh sách khóa học. MỌI môn FPT đều có 1 khóa video + 1 khóa Live; 3 môn nhập môn có thêm lớp kèm nhóm nhỏ.
 * Chứng chỉ có 2–3 khóa. Môn có nhiều giảng viên sẽ mở nhiều lớp Live (mỗi lớp một giảng viên).
 */
const SMALL_GROUP_FPT = ['PRF192', 'PRO192', 'CSD201'];
const UPCOMING_COHORT = ['PRF192-LIVE', 'PRJ301-LIVE', 'CCNA-LIVE', 'IELTS-LIVE'];
const CERT_COURSES = {
  CCNA: [
    { suffix: 'VID', mode: 'RECORDED', name: 'CCNA 200-301 – Lý thuyết & Lab Packet Tracer', level: 'BEGINNER' },
    { suffix: 'LIVE', mode: 'LIVE_ONLINE', name: 'CCNA Live Lab cùng chuyên gia Cisco', level: 'INTERMEDIATE' }
  ],
  IELTS: [
    { suffix: 'VID', mode: 'RECORDED', name: 'IELTS Foundation 5.0 – Ngữ pháp & Từ vựng', level: 'BEGINNER' },
    { suffix: 'LIVE', mode: 'LIVE_ONLINE', name: 'IELTS Intensive 6.5+ (chấm Writing hằng tuần)', level: 'INTERMEDIATE' },
    { suffix: 'SPK', mode: 'LIVE_ONLINE', name: 'IELTS Speaking nhóm nhỏ (tối đa 8 học viên)', level: 'INTERMEDIATE', maxStudents: 8, teacherIndex: 1 }
  ],
  TOEIC: [
    { suffix: 'VID', mode: 'RECORDED', name: 'TOEIC 650+ Listening & Reading', level: 'BEGINNER' },
    { suffix: 'LIVE', mode: 'LIVE_ONLINE', name: 'TOEIC 750+ cấp tốc 4 tuần', level: 'INTERMEDIATE' }
  ],
  'AWS-CCP': [
    { suffix: 'VID', mode: 'RECORDED', name: 'AWS Cloud Practitioner (CLF-C02) trọn bộ', level: 'BEGINNER' },
    { suffix: 'LIVE', mode: 'LIVE_ONLINE', name: 'AWS CCP Bootcamp – Live & thi thử', level: 'BEGINNER' }
  ],
  'JLPT-N3': [
    { suffix: 'VID', mode: 'RECORDED', name: 'JLPT N3 – Ngữ pháp & Kanji qua video', level: 'INTERMEDIATE' },
    { suffix: 'LIVE', mode: 'LIVE_ONLINE', name: 'Luyện thi JLPT N3 cấp tốc', level: 'INTERMEDIATE' }
  ]
};

const STUDENTS = [
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

/**
 * Khóa học viên đã mua.
 *  status: PAID (đã mở khóa) | UNPAID (chờ thanh toán) | PARTIAL (đã chuyển một phần)
 *  lessons: số bài video đã hoàn thành; cohort: 'UPCOMING' để chọn lớp khai giảng sau.
 *  absent / late: chỉ số buổi (bắt đầu từ 0) vắng / muộn trong lớp Live.
 */
const PURCHASES = {
  HE170001: [{ course: 'SWD392-VID', status: 'PAID', lessons: 4 }, { course: 'CCNA-LIVE', status: 'PAID', late: [2] }, { course: 'AWS-CCP-VID', status: 'UNPAID' }, { course: 'SWD392-LIVE', status: 'PAID' }, { course: 'MLN122-LIVE', status: 'PAID', absent: [0] }],
  HE170002: [{ course: 'IELTS-LIVE', status: 'PAID' }, { course: 'IELTS-VID', status: 'PAID', lessons: 6 }, { course: 'PRM392-VID', status: 'PAID' }, { course: 'TOEIC-LIVE', status: 'PAID' }, { course: 'PRM392-LIVE', status: 'PAID', late: [1] }],
  HE170003: [{ course: 'PRN231-VID', status: 'PAID', lessons: 2 }, { course: 'TOEIC-LIVE', status: 'PAID', late: [1] }, { course: 'CCNA-VID', status: 'PARTIAL' }, { course: 'PRN231-LIVE', status: 'PAID' }, { course: 'SWD392-LIVE', status: 'PAID' }],
  HE170004: [{ course: 'SWP391-LIVE', status: 'PAID' }, { course: 'IELTS-VID', status: 'PAID', lessons: 3 }, { course: 'IELTS-SPK', status: 'PAID' }, { course: 'SWR302-LIVE', status: 'PAID' }],
  HE170005: [{ course: 'PRJ301-LIVE', status: 'PAID', absent: [1], late: [0] }, { course: 'DBI202-VID', status: 'PAID', lessons: 1 }, { course: 'PRN231-LIVE', status: 'PAID' }, { course: 'IOT102-LIVE', status: 'PAID' }],
  HE170006: [{ course: 'SWE201C-VID', status: 'PAID', lessons: 5 }, { course: 'JLPT-N3-LIVE', status: 'PAID' }, { course: 'IELTS-LIVE', status: 'PAID', cohort: 'UPCOMING' }, { course: 'SWR302-LIVE', status: 'PAID' }, { course: 'TOEIC-LIVE', status: 'PAID' }],
  HE170007: [{ course: 'CSD201-LIVE', status: 'PAID' }, { course: 'CSD201-VID', status: 'PAID', lessons: 2 }, { course: 'DBI202-LIVE', status: 'PAID' }, { course: 'MAS291-LIVE', status: 'PAID' }, { course: 'JPD113-LIVE', status: 'PAID' }],
  HE170008: [{ course: 'DBI202-LIVE', status: 'PAID', absent: [1] }, { course: 'MAS291-VID', status: 'PAID', lessons: 6 }, { course: 'MAD101-LIVE', status: 'PAID' }, { course: 'JPD113-LIVE', status: 'PAID' }],
  HE170009: [{ course: 'PRF192-LIVE', status: 'PAID' }, { course: 'PRF192-VID', status: 'PAID', lessons: 3 }, { course: 'MAD101-VID', status: 'PAID' }, { course: 'MAE101-LIVE', status: 'PAID' }, { course: 'CEA201-LIVE', status: 'PAID', late: [0] }],
  HE170010: [{ course: 'PRF192-LIVE2', status: 'PAID' }, { course: 'MAE101-VID', status: 'PAID', lessons: 0 }, { course: 'CSI104-LIVE', status: 'PAID' }, { course: 'SSG104-LIVE', status: 'PAID' }]
};

function lessonPlan(subjectName, isCertificate) {
  const s1 = isCertificate ? 'Chương 1: Tổng quan kỳ thi & kiến thức nền' : 'Chương 1: Kiến thức nền tảng';
  const s2 = isCertificate ? 'Chương 2: Chiến lược làm bài & đề thi thử' : 'Chương 2: Thực hành & luyện đề';
  return [
    [s1, `Giới thiệu khóa học & lộ trình ${subjectName}`, 8, true],
    [s1, 'Khái niệm cốt lõi (phần 1)', 18, false],
    [s1, 'Khái niệm cốt lõi (phần 2)', 20, false],
    [s2, 'Bài tập mẫu có lời giải', 22, false],
    [s2, 'Lỗi thường gặp & cách khắc phục', 15, false],
    [s2, 'Luyện đề tổng hợp', 25, false]
  ];
}

function buildCourseCenterSeed({ passwordHash, now = new Date() }) {
  const ids = {};
  const next = name => (ids[name] = (ids[name] || 0) + 1);
  const data = {
    users: [], subjects: [], courses: [], course_lessons: [], classes: [], schedules: [], enrollments: [],
    lesson_progress: [], attendances: [], assignments: [], submissions: [], tuition_invoices: [], tuition_payments: [],
    course_questions: [], student_requests: [], notifications: []
  };

  const today = vnDate(now);
  const cohortStart = new Date(mondayOf(today).getTime() - 7 * DAY);          // Thứ 2 tuần trước
  const nextCohortStart = new Date(cohortStart.getTime() + WEEKS_PER_COHORT * 7 * DAY); // Khai giảng đợt sau
  const ongoingSemester = `KG-${iso(cohortStart)}`;     // Nhãn đợt = ngày khai giảng, không trùng giữa các đợt
  const upcomingSemester = `KG-${iso(nextCohortStart)}`;

  // ---- Tài khoản ----
  data.users.push({ id: next('users'), code: 'ADM001', email: 'admin@fpt.edu.vn', passwordHash, fullName: 'Ban Quản lý Trung tâm', role: 'ADMIN', phone: '02473005588', status: 'ACTIVE' });
  const accountant = { id: next('users'), code: 'ACC001', email: 'ketoan@fpt.edu.vn', passwordHash, fullName: 'Phòng Kế toán – Tài chính', role: 'ACCOUNTANT', phone: '02473005599', status: 'ACTIVE' };
  data.users.push(accountant);
  const teacherByCode = {};
  for (const t of TEACHERS) {
    const u = { id: next('users'), code: t.code, email: t.email, passwordHash, fullName: t.name, role: 'TEACHER', phone: '0981234567', status: 'ACTIVE', teacherProfile: { degree: t.degree, specialty: t.specialty, bio: `Chứng chỉ: ${t.certificates.join(', ') || 'Giảng viên trung tâm'}.` } };
    data.users.push(u);
    teacherByCode[t.code] = u;
  }
  const studentByCode = {};
  for (const s of STUDENTS) {
    const u = { id: next('users'), code: s.code, email: s.email, passwordHash, fullName: s.name, role: 'STUDENT', phone: '0901234567', status: 'ACTIVE', studentProfile: { dob: new Date(s.dob), gender: s.gender, address: s.address, enrollmentYear: s.year } };
    data.users.push(u);
    studentByCode[s.code] = u;
  }

  // ---- Môn FPT (giữ kỳ) + Chứng chỉ ----
  const subjectByCode = {};
  for (const c of SE_CURRICULUM) {
    const subject = { id: next('subjects'), code: c.courseCode, name: c.name, category: 'FPT_SUBJECT', term: c.term, credits: c.credits, prerequisites: c.prerequisites || [], description: c.description, status: 'ACTIVE' };
    data.subjects.push(subject);
    subjectByCode[subject.code.toUpperCase()] = subject;
  }
  for (const c of CERTIFICATES) {
    const subject = { id: next('subjects'), code: c.code, name: c.name, category: 'CERTIFICATE', term: null, credits: null, prerequisites: [], description: c.description, status: 'ACTIVE' };
    data.subjects.push(subject);
    subjectByCode[c.code] = subject;
  }

  // ---- Khóa học ----
  const courseSpecs = [];
  for (const c of SE_CURRICULUM) {
    const code = c.courseCode.toUpperCase();
    courseSpecs.push({ subject: code, suffix: 'VID', mode: 'RECORDED', name: `${c.courseCode} – Nắm chắc kiến thức qua video`, level: 'BEGINNER' });
    courseSpecs.push({ subject: code, suffix: 'LIVE', mode: 'LIVE_ONLINE', name: `${c.courseCode} – Lớp Live ôn tập & luyện đề cùng giảng viên`, level: 'INTERMEDIATE' });
    if (SMALL_GROUP_FPT.includes(code)) courseSpecs.push({ subject: code, suffix: 'LIVE2', mode: 'LIVE_ONLINE', name: `${c.courseCode} – Kèm cặp nhóm nhỏ (tối đa 10 học viên)`, level: 'BEGINNER', maxStudents: 10, teacherIndex: 1 });
  }
  for (const c of CERTIFICATES) {
    for (const spec of CERT_COURSES[c.code]) courseSpecs.push({ subject: c.code, ...spec });
  }

  // Xếp lịch: mỗi giảng viên không dạy 2 lớp cùng (đợt, thứ, ca). Các nhóm ngày không giao nhau.
  const teacherBusy = new Set();
  const freeShift = (teacherId, semester, pattern, preferred) => {
    const order = [preferred, ...[6, 5, 4, 3, 2, 1].filter(s => s !== preferred)];
    return order.find(shift => pattern.every(d => !teacherBusy.has(`${teacherId}|${semester}|${d}|${shift}`)));
  };

  const courseByCode = {};
  const lessonsByCourse = {};
  const ongoingClassesByCourse = {}, upcomingClassByCourse = {};
  let liveIndex = 0;
  for (const spec of courseSpecs) {
    const subject = subjectByCode[spec.subject];
    const teacherCodes = SUBJECT_TEACHERS[spec.subject];
    if (!teacherCodes) throw new Error(`Chưa phân công giảng viên cho ${spec.subject}`);
    const instructor = teacherByCode[teacherCodes[Math.min(spec.teacherIndex || 0, teacherCodes.length - 1)]];
    const isLive = spec.mode === 'LIVE_ONLINE';
    const pattern = isLive ? DAY_PATTERNS[liveIndex % DAY_PATTERNS.length] : null;
    const preferredShift = isLive ? 6 - (Math.floor(liveIndex / DAY_PATTERNS.length) % 6) : null;
    if (isLive) liveIndex++;
    const lessons = isLive ? [] : lessonPlan(subject.name, subject.category === 'CERTIFICATE');
    const course = {
      id: next('courses'),
      courseCode: `${subject.code}-${spec.suffix}`,
      name: spec.name,
      subjectId: subject.id,
      category: subject.category,
      deliveryMode: spec.mode,
      level: spec.level,
      instructorId: instructor.id,
      credits: subject.credits || 0,
      totalSessions: isLive ? pattern.length * WEEKS_PER_COHORT : lessons.length,
      baseTuitionFee: isLive ? 3000 : 2000,
      description: isLive
        ? `Học trực tuyến qua Google Meet theo lịch cố định, ${pattern.length} buổi/tuần trong ${WEEKS_PER_COHORT} tuần. Giảng viên giao bài, chấm điểm và giải đáp thắc mắc trực tiếp.`
        : `Học mọi lúc mọi nơi qua ${lessons.length} video bài giảng, có tài liệu kèm theo. Mua xong học ngay, theo dõi tiến độ từng bài.`,
      thumbnailUrl: null, syllabusUrl: null, status: 'ACTIVE',
      createdAt: new Date(cohortStart.getTime() - 30 * DAY)
    };
    data.courses.push(course);
    const key = course.courseCode.toUpperCase(); // tra cứu không phân biệt hoa thường (SWE201c)
    courseByCode[key] = course;

    if (!isLive) {
      lessonsByCourse[course.id] = lessons.map(([sectionTitle, title, durationMinutes, isPreview], i) => {
        const lesson = { id: next('course_lessons'), courseId: course.id, sectionTitle, orderIndex: i + 1, title, videoUrl: null, materialUrl: null, durationMinutes, isPreview };
        data.course_lessons.push(lesson);
        return lesson;
      });
      // Khóa video dùng một "lớp tự học" mặc định, đúng quy ước của API mua khóa (VIDEO-<courseId>).
      const videoClass = { id: next('classes'), classCode: `VIDEO-${course.id}`, courseId: course.id, teacherId: instructor.id, semester: 'SELF_PACED', maxStudents: 2147483647, status: 'ONGOING', meetUrl: null, createdAt: course.createdAt };
      data.classes.push(videoClass);
      ongoingClassesByCourse[key] = [videoClass];
      continue;
    }

    const addCohort = (teacher, semester, status, suffix) => {
      const shift = freeShift(teacher.id, semester, pattern, preferredShift);
      if (!shift) throw new Error(`Giảng viên ${teacher.code} hết ca trống cho ${course.courseCode}`);
      pattern.forEach(d => teacherBusy.add(`${teacher.id}|${semester}|${d}|${shift}`));
      const cls = { id: next('classes'), classCode: `${course.courseCode}-${suffix}`, courseId: course.id, teacherId: teacher.id, semester, maxStudents: spec.maxStudents || 25, status, meetUrl: `https://meet.google.com/ems-${course.id}-${suffix.toLowerCase()}`, createdAt: course.createdAt, pattern, shift };
      data.classes.push(cls);
      for (const dayOfWeek of pattern) {
        data.schedules.push({ id: next('schedules'), classId: cls.id, dayOfWeek, shift, startTime: SLOTS[shift][0], endTime: SLOTS[shift][1], room: `ONLINE-${cls.classCode}` });
      }
      return cls;
    };
    // Lớp K1 do giảng viên phụ trách; khóa Live chính của môn có nhiều giảng viên mở thêm lớp K2 với giảng viên khác.
    const cohortTeachers = spec.teacherIndex ? [instructor] : teacherCodes.map(code => teacherByCode[code]);
    ongoingClassesByCourse[key] = cohortTeachers.map((t, i) => addCohort(t, ongoingSemester, 'ONGOING', `K${i + 1}`));
    if (UPCOMING_COHORT.includes(key)) upcomingClassByCourse[key] = addCohort(instructor, upcomingSemester, 'UPCOMING', `K${cohortTeachers.length + 1}`);
  }

  // Ngày học thực tế của một lớp Live trong đợt.
  const sessionDates = (cls, start) => {
    const out = [];
    for (let w = 0; w < WEEKS_PER_COHORT; w++) {
      for (const d of cls.pattern) out.push(new Date(start.getTime() + (w * 7 + (d - 2)) * DAY));
    }
    return out.sort((a, b) => a - b);
  };

  // ---- Bài tập cho lớp Live đang học ----
  const assignmentsByClass = {};
  for (const cls of data.classes.filter(c => c.status === 'ONGOING' && c.pattern)) {
    const course = data.courses.find(c => c.id === cls.courseId);
    const a1 = { id: next('assignments'), classId: cls.id, title: `Bài tập tuần 1 – ${course.courseCode}`, description: 'Hoàn thành bài thực hành theo hướng dẫn trong buổi học. Nộp link GitHub / Google Drive.', fileUrl: null, dueDate: new Date(cohortStart.getTime() + 6 * DAY + 16 * 3600000), createdAt: cohortStart };
    const a2 = { id: next('assignments'), classId: cls.id, title: `Bài tập tuần 2 – ${course.courseCode}`, description: 'Bài tổng hợp kiến thức 2 tuần đầu. Giảng viên chấm điểm và nhận xét chi tiết.', fileUrl: null, dueDate: new Date(utcDay(today).getTime() + 4 * DAY + 16 * 3600000), createdAt: new Date(cohortStart.getTime() + 7 * DAY) };
    data.assignments.push(a1, a2);
    assignmentsByClass[cls.id] = [a1, a2];
  }

  // ---- Học viên mua khóa học ----
  const studentSlots = {}; // phát hiện trùng lịch Live của học viên (cùng đợt)
  let receiptSeq = 0;
  for (const [studentCode, purchases] of Object.entries(PURCHASES)) {
    const stu = studentByCode[studentCode];
    studentSlots[stu.id] = new Set();
    purchases.forEach((p, pi) => {
      const course = courseByCode[p.course.toUpperCase()];
      if (!course) throw new Error(`Khóa học mẫu không tồn tại: ${p.course}`);
      // Chọn lớp không trùng lịch với các lớp Live học viên đã đăng ký (giống quy tắc API mua khóa).
      const candidates = p.cohort === 'UPCOMING' ? [upcomingClassByCourse[p.course.toUpperCase()]].filter(Boolean) : ongoingClassesByCourse[p.course.toUpperCase()] || [];
      const slotKeys = c => (c.pattern || []).map(d => `${c.semester}|${d}|${c.shift}`);
      const cls = candidates.find(c => slotKeys(c).every(k => !studentSlots[stu.id].has(k)));
      if (!cls) throw new Error(`Dữ liệu mẫu: ${studentCode} không có lớp ${p.course} nào không trùng lịch`);
      slotKeys(cls).forEach(k => studentSlots[stu.id].add(k));
      const paid = p.status === 'PAID';
      const enrolledAt = new Date(cohortStart.getTime() - (5 - pi) * DAY);
      const lessons = lessonsByCourse[course.id] || [];
      const done = paid ? Math.min(p.lessons || 0, lessons.length) : 0;
      const enrollment = {
        id: next('enrollments'), classId: cls.id, studentId: stu.id, enrolledAt,
        status: paid ? 'ACTIVE' : 'PENDING_PAYMENT',
        progressPercent: lessons.length ? Math.round((done / lessons.length) * 100) : 0,
        completedLessonsCount: done
      };
      data.enrollments.push(enrollment);
      lessons.slice(0, done).forEach((lesson, i) => data.lesson_progress.push({
        id: next('lesson_progress'), enrollmentId: enrollment.id, lessonId: lesson.id, studentId: stu.id, courseId: course.id,
        isCompleted: true, completedAt: new Date(enrolledAt.getTime() + (i + 1) * DAY), lastWatchedSecond: lesson.durationMinutes * 60
      }));

      // Hóa đơn + phiếu thu mẫu (không tạo giao dịch SePay giả)
      const amount = course.baseTuitionFee;
      const paidAmount = paid ? amount : p.status === 'PARTIAL' ? Math.round(amount / 2) : 0;
      const invoice = {
        id: next('tuition_invoices'), studentId: stu.id, enrollmentId: enrollment.id, amount, paidAmount,
        status: paid ? 'PAID' : paidAmount ? 'PARTIAL' : 'UNPAID',
        paidAt: paid ? new Date(enrolledAt.getTime() + 3600000) : null,
        dueDate: paid ? new Date(enrolledAt.getTime() + 7 * DAY) : new Date(utcDay(today).getTime() + 5 * DAY),
        createdAt: enrolledAt
      };
      data.tuition_invoices.push(invoice);
      if (paidAmount) {
        receiptSeq++;
        data.tuition_payments.push({
          id: next('tuition_payments'), invoiceId: invoice.id, transactionId: null, receiptNo: `SAMPLE-${String(receiptSeq).padStart(4, '0')}`,
          amount: paidAmount, method: 'BANK_TRANSFER', note: 'Dữ liệu mẫu khởi tạo (không phải giao dịch SePay)', collectedById: accountant.id,
          paidAt: new Date(enrolledAt.getTime() + 3600000)
        });
      }
      if (!paid) {
        data.notifications.push({ id: next('notifications'), userId: stu.id, title: 'Hoàn tất thanh toán để mở khóa học', message: `Khóa "${course.name}" còn ${(amount - paidAmount).toLocaleString('vi-VN')} đ chưa thanh toán. Mở VietQR trong mục Đơn mua khóa học để vào học.`, type: 'TUITION', isRead: false, createdAt: enrolledAt });
      }

      // Điểm danh lớp Live: chỉ các buổi đã diễn ra (trước hôm nay)
      if (paid && cls.pattern && cls.status === 'ONGOING') {
        sessionDates(cls, cohortStart).filter(d => iso(d) < today).forEach((d, idx) => {
          const status = (p.absent || []).includes(idx) ? 'ABSENT_UNEXCUSED' : (p.late || []).includes(idx) ? 'LATE' : 'PRESENT';
          data.attendances.push({ id: next('attendances'), classId: cls.id, studentId: stu.id, sessionDate: d, status, note: status === 'LATE' ? 'Vào lớp muộn khoảng 10 phút' : status === 'ABSENT_UNEXCUSED' ? 'Vắng buổi học' : null });
        });
        // Bài tập: tuần 1 đã nộp & được chấm điểm + nhận xét; tuần 2 một số bạn nộp sớm (chưa chấm)
        const [a1, a2] = assignmentsByClass[cls.id];
        const score = Number((6.5 + ((stu.id * 7 + cls.id) % 7) * 0.5).toFixed(1));
        const late = (p.absent || []).length > 0;
        data.submissions.push({
          id: next('submissions'), assignmentId: a1.id, studentId: stu.id, content: 'Em nộp bài tuần 1 ạ.',
          fileUrl: `https://github.com/${stu.code.toLowerCase()}/${course.courseCode.toLowerCase()}-tuan1`,
          submittedAt: new Date(a1.dueDate.getTime() + (late ? 10 : -20) * 3600000), status: late ? 'LATE_SUBMITTED' : 'SUBMITTED',
          score, teacherFeedback: score >= 8.5 ? 'Bài làm tốt, trình bày rõ ràng. Tiếp tục phát huy!' : score >= 7.5 ? 'Đạt yêu cầu, cần chú ý thêm phần xử lý trường hợp đặc biệt.' : 'Cần xem lại phần lý thuyết buổi 2 và làm lại các bước còn thiếu.'
        });
        if (stu.id % 2 === 0) {
          data.submissions.push({ id: next('submissions'), assignmentId: a2.id, studentId: stu.id, content: 'Em nộp sớm bài tuần 2.', fileUrl: `https://github.com/${stu.code.toLowerCase()}/${course.courseCode.toLowerCase()}-tuan2`, submittedAt: new Date(utcDay(today).getTime() - DAY), status: 'SUBMITTED', score: null, teacherFeedback: null });
        }
      }
    });
  }

  // Lớp mà học viên thực sự đang học của một khóa (một khóa Live có thể có nhiều lớp / giảng viên).
  const classOf = (studentCode, courseCode) => {
    const stu = studentByCode[studentCode];
    const ids = new Set((ongoingClassesByCourse[courseCode.toUpperCase()] || []).map(c => c.id));
    const enrollment = data.enrollments.find(e => e.studentId === stu.id && ids.has(e.classId) && e.status === 'ACTIVE');
    if (!enrollment) throw new Error(`Dữ liệu mẫu không hợp lệ: ${studentCode} chưa học ${courseCode}`);
    return { stu, cls: data.classes.find(c => c.id === enrollment.classId) };
  };

  // ---- Hỏi đáp: chỉ hỏi giảng viên đang dạy khóa đã mua ----
  const ask = (studentCode, courseCode, title, content, answer) => {
    const { stu, cls } = classOf(studentCode, courseCode);
    const createdAt = new Date(utcDay(today).getTime() - 2 * DAY);
    data.course_questions.push({
      id: next('course_questions'), studentId: stu.id, classId: cls.id, teacherId: cls.teacherId, lessonId: null,
      questionTitle: title, questionContent: content, attachmentUrl: null,
      status: answer ? 'ANSWERED' : 'PENDING', teacherAnswer: answer || null,
      answeredById: answer ? cls.teacherId : null, answeredAt: answer ? new Date(createdAt.getTime() + 5 * 3600000) : null, createdAt
    });
    if (answer) data.notifications.push({ id: next('notifications'), userId: stu.id, title: 'Giảng viên đã trả lời câu hỏi', message: title, type: 'SYSTEM', isRead: false, createdAt: new Date(createdAt.getTime() + 5 * 3600000) });
  };
  ask('HE170009', 'PRF192-LIVE', 'Con trỏ và mảng khác nhau thế nào?', 'Thầy ơi, khi truyền mảng vào hàm thì sao lại thay đổi được giá trị gốc ạ?', 'Khi truyền mảng, C thực chất truyền địa chỉ phần tử đầu tiên (con trỏ), nên hàm thao tác trực tiếp trên vùng nhớ gốc. Em xem lại ví dụ ở buổi 3 nhé.');
  ask('HE170001', 'SWD392-VID', 'Khi nào nên dùng Microservices?', 'Em đang làm đồ án nhóm 5 người, có nên tách microservices ngay từ đầu không ạ?', null);
  ask('HE170002', 'IELTS-LIVE', 'Writing Task 2 nên viết bao nhiêu đoạn?', 'Cô ơi bài Task 2 em nên chia 4 hay 5 đoạn để đạt band 6.5 ạ?', '4 đoạn là đủ: mở bài, 2 đoạn thân bài, kết luận. Quan trọng là mỗi đoạn thân bài có 1 ý chính rõ ràng và ví dụ cụ thể.');
  ask('HE170007', 'CSD201-VID', 'Độ phức tạp của Quick Sort', 'Tại sao trường hợp xấu nhất của Quick Sort là O(n²) ạ?', null);

  // ---- Đơn từ học vụ (vẫn giữ) ----
  const { cls: prj } = classOf('HE170005', 'PRJ301-LIVE');
  const { cls: toeic } = classOf('HE170006', 'TOEIC-LIVE');
  const { cls: ielts } = classOf('HE170002', 'IELTS-LIVE');
  const ccnaVideo = data.classes.find(c => c.classCode === `VIDEO-${courseByCode['CCNA-VID'].id}`);
  const daysAgo = n => new Date(utcDay(today).getTime() - n * DAY);
  data.student_requests.push(
    { id: next('student_requests'), studentId: studentByCode.HE170005.id, classId: prj.id, requestType: 'ABSENCE', sessionDate: sessionDates(prj, cohortStart)[1], reason: 'Em bị ốm có giấy khám, xin phép nghỉ buổi học Live này và sẽ xem lại tài liệu.', attachmentUrl: null, status: 'PENDING', adminResponse: null, createdAt: daysAgo(3) },
    { id: next('student_requests'), studentId: studentByCode.HE170006.id, classId: toeic.id, requestType: 'CLASS_TRANSFER', sessionDate: null, reason: 'Em mới đổi ca làm thêm, xin chuyển sang lớp TOEIC buổi tối khác (nếu còn chỗ).', attachmentUrl: null, status: 'PENDING', adminResponse: null, createdAt: daysAgo(1) },
    { id: next('student_requests'), studentId: studentByCode.HE170003.id, classId: ccnaVideo.id, requestType: 'PAYMENT_ISSUE', sessionDate: null, reason: 'Em đã chuyển khoản lần 2 cho khóa CCNA video nhưng hệ thống vẫn báo thanh toán một phần.', attachmentUrl: null, status: 'PENDING', adminResponse: null, createdAt: daysAgo(1) },
    { id: next('student_requests'), studentId: studentByCode.HE170002.id, classId: ielts.id, requestType: 'CONFIRMATION', sessionDate: null, reason: 'Xin giấy xác nhận đang theo học khóa IELTS Intensive tại trung tâm để bổ sung hồ sơ.', attachmentUrl: null, status: 'APPROVED', adminResponse: 'Đã cấp giấy xác nhận, mời bạn nhận tại quầy lễ tân.', createdAt: daysAgo(4) },
    { id: next('student_requests'), studentId: studentByCode.HE170008.id, classId: null, requestType: 'FEEDBACK', sessionDate: null, reason: 'Góp ý: mong trung tâm gửi lại link record sau mỗi buổi Live để học viên ôn tập.', attachmentUrl: null, status: 'APPROVED', adminResponse: 'Cảm ơn bạn, trung tâm sẽ đăng video record trong vòng 24h sau mỗi buổi.', createdAt: daysAgo(5) }
  );

  data.notifications.push({ id: next('notifications'), userId: null, title: `Khai giảng đợt ${upcomingSemester}`, message: 'Trung tâm mở đăng ký các lớp Live đợt mới: PRF192, PRJ301, CCNA, IELTS. Đăng ký sớm để giữ chỗ!', type: 'SYSTEM', isRead: false, createdAt: utcDay(today) });

  // Bỏ trường nội bộ dùng để xếp lịch
  for (const c of data.classes) { delete c.pattern; delete c.shift; }
  return { data, counters: ids, currentSemester: ongoingSemester };
}

const COLLECTION_MODELS = {
  users: models.User, subjects: models.Subject, courses: models.Course, course_lessons: models.CourseLesson,
  classes: models.Class, schedules: models.Schedule, enrollments: models.Enrollment, lesson_progress: models.LessonProgress,
  attendances: models.Attendance, assignments: models.Assignment, submissions: models.Submission,
  tuition_invoices: models.TuitionInvoice, tuition_payments: models.TuitionPayment,
  course_questions: models.CourseQuestion, student_requests: models.StudentRequest, notifications: models.Notification
};

async function insertSeed(seed) {
  for (const [collection, rows] of Object.entries(seed.data)) {
    if (!COLLECTION_MODELS[collection]) throw new Error(`Thiếu model cho collection ${collection}`);
    if (rows.length) await COLLECTION_MODELS[collection].insertMany(rows, { ordered: true });
  }
  for (const [name, seq] of Object.entries(seed.counters)) await models.Counter.updateOne({ _id: name }, { $set: { seq } }, { upsert: true });
}

function describeCourseCenter(seed) {
  const d = seed.data;
  return {
    cohort: seed.currentSemester,
    fptSubjects: d.subjects.filter(s => s.category === 'FPT_SUBJECT').length,
    certificates: d.subjects.filter(s => s.category === 'CERTIFICATE').length,
    courses: d.courses.length,
    recordedCourses: d.courses.filter(c => c.deliveryMode === 'RECORDED').length,
    liveCourses: d.courses.filter(c => c.deliveryMode === 'LIVE_ONLINE').length,
    liveClasses: d.classes.filter(c => c.semester !== 'SELF_PACED').length,
    lessons: d.course_lessons.length,
    teachers: d.users.filter(u => u.role === 'TEACHER').length,
    students: d.users.filter(u => u.role === 'STUDENT').length,
    enrollments: d.enrollments.length,
    pendingPayment: d.enrollments.filter(e => e.status === 'PENDING_PAYMENT').length,
    attendances: d.attendances.length,
    questions: d.course_questions.length
  };
}

module.exports = { buildCourseCenterSeed, insertSeed, describeCourseCenter, COLLECTION_MODELS };
