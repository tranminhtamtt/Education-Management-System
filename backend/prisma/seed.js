const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { SE_CURRICULUM } = require('../src/modules/curriculum/curriculumData');

const prisma = new PrismaClient();

// Khung giờ chuẩn 6 Slot FAP FPT
const SLOT_TIMES = {
  1: { start: '1970-01-01T07:30:00Z', end: '1970-01-01T09:50:00Z' },
  2: { start: '1970-01-01T10:00:00Z', end: '1970-01-01T12:20:00Z' },
  3: { start: '1970-01-01T12:50:00Z', end: '1970-01-01T15:10:00Z' },
  4: { start: '1970-01-01T15:20:00Z', end: '1970-01-01T17:40:00Z' },
  5: { start: '1970-01-01T18:00:00Z', end: '1970-01-01T20:20:00Z' },
  6: { start: '1970-01-01T20:30:00Z', end: '1970-01-01T22:50:00Z' }
};

// Tính 6 ngày học trong kỳ học 2 tuần (Tuần 1: 02/11/2026 - 08/11/2026, Tuần 2: 09/11/2026 - 15/11/2026)
function getTwoWeekDatesForDays(daysOfWeek) {
  const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
  const week1 = sortedDays.map(d => new Date(`2026-11-${String(2 + (d - 2)).padStart(2, '0')}T00:00:00.000Z`));
  const week2 = sortedDays.map(d => new Date(`2026-11-${String(9 + (d - 2)).padStart(2, '0')}T00:00:00.000Z`));
  return [...week1, ...week2]; // 6 buổi học theo thứ tự thời gian
}

// Tính điểm chuyên cần và trạng thái cấm thi khớp 100% với gradeHelper.js
function calcAttendanceMetrics(statuses, totalSessions = 6) {
  const present = statuses.filter(s => s === 'PRESENT').length;
  const late = statuses.filter(s => s === 'LATE').length;
  const absentExcused = statuses.filter(s => s === 'ABSENT_EXCUSED').length;
  const absentUnexcused = statuses.filter(s => s === 'ABSENT_UNEXCUSED').length;

  const absentRate = (absentUnexcused / totalSessions) * 100;
  const isBanned = absentRate >= 20.0;
  const earned = present * 1.0 + late * 0.8 + absentExcused * 0.9;
  const attendanceScore = parseFloat(Math.max(0, Math.min(10, (earned / statuses.length) * 10)).toFixed(1));

  return { attendanceScore, isBanned, absentRate };
}

async function main() {
  console.log('🌱 Starting comprehensive seed data for EMS (9-Term Curriculum & 2-Week Semester)...');

  const passwordHash = await bcrypt.hash('123456', 10);

  // 1. Dọn sạch dữ liệu cũ theo thứ tự quan hệ
  await prisma.studentRequest.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.tuitionPayment.deleteMany();
  await prisma.tuitionInvoice.deleteMany();
  await prisma.grade.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.class.deleteMany();
  await prisma.course.deleteMany();
  await prisma.teacherProfile.deleteMany();
  await prisma.studentProfile.deleteMany();
  await prisma.user.deleteMany();

  // 2. Tạo Admin & Accountant
  const admin = await prisma.user.create({
    data: {
      code: 'ADM001',
      email: 'admin@fpt.edu.vn',
      passwordHash,
      fullName: 'Phòng Quản lý Đào tạo FAP',
      role: 'ADMIN',
      phone: '02473005588',
      status: 'ACTIVE'
    }
  });

  const accountant = await prisma.user.create({
    data: {
      code: 'ACC001',
      email: 'ketoan@fpt.edu.vn',
      passwordHash,
      fullName: 'Phòng Kế toán - Tài chính',
      role: 'ACCOUNTANT',
      phone: '02473005599',
      status: 'ACTIVE'
    }
  });

  // 3. Tạo 3 Giảng viên
  const teachersData = [
    { code: 'GV001', email: 'thaynam@fpt.edu.vn', name: 'ThS. Nguyễn Hoài Nam', specialty: 'Kỹ thuật Phần mềm (SE)', degree: 'Thạc sĩ' },
    { code: 'GV002', email: 'colinh@fpt.edu.vn', name: 'TS. Trần Thùy Linh', specialty: 'Khoa học Máy tính & AI (CS)', degree: 'Tiến sĩ' },
    { code: 'GV003', email: 'thaytuan@fpt.edu.vn', name: 'ThS. Lê Anh Tuấn', specialty: 'Hệ thống Thông tin & CSDL (IS)', degree: 'Thạc sĩ' }
  ];

  const teachers = [];
  for (const t of teachersData) {
    const user = await prisma.user.create({
      data: {
        code: t.code,
        email: t.email,
        passwordHash,
        fullName: t.name,
        role: 'TEACHER',
        phone: '0981234567',
        status: 'ACTIVE',
        teacherProfile: {
          create: {
            degree: t.degree,
            specialty: t.specialty,
            bio: `Giảng viên cơ hữu bộ môn ${t.specialty} tại Đại học FPT.`
          }
        }
      }
    });
    teachers.push(user);
  }

  // 4. Tạo 10 Sinh viên đa dạng từ Kỳ 1 đến Kỳ 7
  const studentsData = [
    // Nhóm 1: Sinh viên Kỳ 7 (K17 - Nhập học 2023) - Đã qua 19 môn Kỳ 1..6 (64 TC)
    { code: 'HE170001', email: 'namnvhe170001@fpt.edu.vn', name: 'Nguyễn Văn Nam', gender: 'MALE', year: 2023, dob: '2003-04-12', address: 'Cầu Giấy, Hà Nội' },
    { code: 'HE170002', email: 'trangtthe170002@fpt.edu.vn', name: 'Trần Thu Trang', gender: 'FEMALE', year: 2023, dob: '2003-08-25', address: 'Đống Đa, Hà Nội' },
    { code: 'HE170003', email: 'longldhe170003@fpt.edu.vn', name: 'Lê Đức Long', gender: 'MALE', year: 2023, dob: '2003-11-05', address: 'Nam Từ Liêm, Hà Nội' },

    // Nhóm 2: Sinh viên Kỳ 5 (K18 - Nhập học 2024) - Đã học Kỳ 1..4 (45 TC; riêng HE170006 nợ SWE201c)
    { code: 'HE170004', email: 'linhpthe170004@fpt.edu.vn', name: 'Phạm Thùy Linh', gender: 'FEMALE', year: 2024, dob: '2004-02-19', address: 'Thanh Xuân, Hà Nội' },
    { code: 'HE170005', email: 'hoangnmhe170005@fpt.edu.vn', name: 'Ngô Minh Hoàng', gender: 'MALE', year: 2024, dob: '2004-06-30', address: 'Hai Bà Trưng, Hà Nội' },
    { code: 'HE170006', email: 'quynhntkhe170006@fpt.edu.vn', name: 'Nguyễn Thị Kim Quỳnh', gender: 'FEMALE', year: 2024, dob: '2004-09-14', address: 'Tây Hồ, Hà Nội' },

    // Nhóm 3: Sinh viên Kỳ 3 (K19 - Nhập học 2025) - Đã qua 8 môn Kỳ 1..2 (24 TC)
    { code: 'HE170007', email: 'dungdvhe170007@fpt.edu.vn', name: 'Đỗ Việt Dũng', gender: 'MALE', year: 2025, dob: '2005-01-22', address: 'Hoàn Kiếm, Hà Nội' },
    { code: 'HE170008', email: 'maipmhe170008@fpt.edu.vn', name: 'Phan Phương Mai', gender: 'FEMALE', year: 2025, dob: '2005-05-18', address: 'Ba Đình, Hà Nội' },

    // Nhóm 4: Sinh viên Kỳ 2 (K19 - Nhập học 2025) - Đã qua 3 môn Kỳ 1 (9 TC), trượt PRF192 nên đang học lại PRF192 + học Kỳ 2
    { code: 'HE170009', email: 'bachnvhe170009@fpt.edu.vn', name: 'Nguyễn Vũ Bách', gender: 'MALE', year: 2025, dob: '2005-07-09', address: 'Long Biên, Hà Nội' },

    // Nhóm 5: Tân sinh viên Kỳ 1 (K20 - Nhập học 2026) - Đang học Kỳ 1 (0 TC tích lũy)
    { code: 'HE170010', email: 'haonvhe170010@fpt.edu.vn', name: 'Nguyễn Văn Hào', gender: 'MALE', year: 2026, dob: '2006-03-15', address: 'Thạch Thất, Hà Nội' }
  ];

  const students = [];
  const studentByCode = {};
  for (const s of studentsData) {
    const user = await prisma.user.create({
      data: {
        code: s.code,
        email: s.email,
        passwordHash,
        fullName: s.name,
        role: 'STUDENT',
        phone: '0901234567',
        status: 'ACTIVE',
        studentProfile: {
          create: {
            dob: new Date(s.dob),
            gender: s.gender,
            address: s.address,
            enrollmentYear: s.year
          }
        }
      }
    });
    students.push(user);
    studentByCode[s.code] = user;
  }

  // 5. Tạo đầy đủ 25 Môn học trong Khung chương trình 9 kỳ (totalSessions = 6 buổi cho kỳ học 2 tuần)
  await prisma.course.createMany({
    data: SE_CURRICULUM.map(c => ({
      courseCode: c.courseCode,
      name: c.name,
      credits: c.credits,
      totalSessions: 6, // 3 buổi/tuần x 2 tuần = 6 buổi/kỳ
      baseTuitionFee: c.credits >= 10 ? 8500000 : c.term >= 5 ? 5000000 : 4500000,
      description: c.description,
      syllabusUrl: `https://fap.fpt.edu.vn/syllabus/${c.courseCode}.pdf`,
      status: 'ACTIVE'
    }))
  });

  const allCourses = await prisma.course.findMany();
  const courseByCode = {};
  allCourses.forEach(c => {
    courseByCode[c.courseCode] = c;
  });

  // 6. Tạo các Lớp học phần:
  // 6a. 19 Lớp lịch sử (COMPLETED) của các học kỳ trước để lưu kết quả đã qua môn từ Kỳ 1 -> Kỳ 6
  const historicalClassesSpec = [
    // Term 1 history
    { classCode: 'HIST-PRF192', courseCode: 'PRF192', semester: 'FA24', teacherIdx: 1 },
    { classCode: 'HIST-CEA201', courseCode: 'CEA201', semester: 'FA24', teacherIdx: 2 },
    { classCode: 'HIST-CSI104', courseCode: 'CSI104', semester: 'FA24', teacherIdx: 0 },
    { classCode: 'HIST-MAE101', courseCode: 'MAE101', semester: 'FA24', teacherIdx: 0 },
    // Term 2 history
    { classCode: 'HIST-PRO192', courseCode: 'PRO192', semester: 'SP25', teacherIdx: 0 },
    { classCode: 'HIST-MAD101', courseCode: 'MAD101', semester: 'SP25', teacherIdx: 1 },
    { classCode: 'HIST-OSG201', courseCode: 'OSG201', semester: 'SP25', teacherIdx: 2 },
    { classCode: 'HIST-SSG104', courseCode: 'SSG104', semester: 'SP25', teacherIdx: 2 },
    // Term 3 history
    { classCode: 'HIST-CSD201', courseCode: 'CSD201', semester: 'SU25', teacherIdx: 1 },
    { classCode: 'HIST-DBI202', courseCode: 'DBI202', semester: 'SU25', teacherIdx: 2 },
    { classCode: 'HIST-MAS291', courseCode: 'MAS291', semester: 'SU25', teacherIdx: 1 },
    { classCode: 'HIST-JPD113', courseCode: 'JPD113', semester: 'SU25', teacherIdx: 0 },
    // Term 4 history
    { classCode: 'HIST-PRJ301', courseCode: 'PRJ301', semester: 'FA25', teacherIdx: 0 },
    { classCode: 'HIST-SWE201c', courseCode: 'SWE201c', semester: 'FA25', teacherIdx: 0 },
    { classCode: 'HIST-IOT102', courseCode: 'IOT102', semester: 'FA25', teacherIdx: 2 },
    // Term 5 history (for Term 7 students)
    { classCode: 'HIST-PRN231', courseCode: 'PRN231', semester: 'FA25', teacherIdx: 0 },
    { classCode: 'HIST-SWP391', courseCode: 'SWP391', semester: 'FA25', teacherIdx: 0 },
    { classCode: 'HIST-SWR302', courseCode: 'SWR302', semester: 'FA25', teacherIdx: 2 },
    // Term 6 history (for Term 7 students)
    { classCode: 'HIST-OJT401', courseCode: 'OJT401', semester: 'FA25', teacherIdx: 0 }
  ];

  // 6b. 14 Lớp đang học (ONGOING) trong học kỳ hiện tại SP26 (Kỳ học 2 tuần: 02/11/2026 - 15/11/2026)
  // Không trùng phòng, không trùng lịch giảng viên, không trùng lịch sinh viên!
  const ongoingClassesSpec = [
    // Kỳ 7 (Cho HE170001, HE170002, HE170003)
    { classCode: 'SE1701-SWD392', courseCode: 'SWD392', semester: 'SP26', teacherIdx: 0, days: [2, 4, 6], shift: 1, room: 'BE-401' },
    { classCode: 'SE1701-PRM392', courseCode: 'PRM392', semester: 'SP26', teacherIdx: 1, days: [2, 4, 6], shift: 2, room: 'BE-402' },
    { classCode: 'SE1701-MLN122', courseCode: 'MLN122', semester: 'SP26', teacherIdx: 2, days: [3, 5, 7], shift: 1, room: 'AL-301' },

    // Kỳ 5 (Cho HE170004, HE170005, HE170006)
    { classCode: 'SE1801-PRN231', courseCode: 'PRN231', semester: 'SP26', teacherIdx: 0, days: [2, 4, 6], shift: 3, room: 'BE-301' },
    { classCode: 'SE1801-SWP391', courseCode: 'SWP391', semester: 'SP26', teacherIdx: 0, days: [3, 5, 7], shift: 2, room: 'BE-302' },
    { classCode: 'SE1801-SWR302', courseCode: 'SWR302', semester: 'SP26', teacherIdx: 2, days: [3, 5, 7], shift: 3, room: 'AL-204' },

    // Kỳ 3 (Cho HE170007, HE170008)
    { classCode: 'SE1901-CSD201', courseCode: 'CSD201', semester: 'SP26', teacherIdx: 1, days: [2, 4, 6], shift: 4, room: 'AL-205' },
    { classCode: 'SE1901-DBI202', courseCode: 'DBI202', semester: 'SP26', teacherIdx: 2, days: [3, 5, 7], shift: 4, room: 'AL-206' },
    { classCode: 'SE1901-MAS291', courseCode: 'MAS291', semester: 'SP26', teacherIdx: 1, days: [2, 4, 6], shift: 5, room: 'BE-201' },

    // Kỳ 2 (Cho HE170009)
    { classCode: 'SE1902-MAD101', courseCode: 'MAD101', semester: 'SP26', teacherIdx: 1, days: [3, 5, 7], shift: 2, room: 'DE-201' },
    { classCode: 'SE1902-OSG201', courseCode: 'OSG201', semester: 'SP26', teacherIdx: 2, days: [2, 4, 6], shift: 3, room: 'DE-202' },

    // Kỳ 1 (Cho HE170010 và HE170009 học lại PRF192)
    { classCode: 'SE2001-PRF192', courseCode: 'PRF192', semester: 'SP26', teacherIdx: 1, days: [2, 4, 6], shift: 1, room: 'DE-101' },
    { classCode: 'SE2001-CEA201', courseCode: 'CEA201', semester: 'SP26', teacherIdx: 2, days: [3, 5, 7], shift: 2, room: 'DE-102' },
    { classCode: 'SE2001-MAE101', courseCode: 'MAE101', semester: 'SP26', teacherIdx: 0, days: [2, 4, 6], shift: 2, room: 'DE-103' }
  ];

  // 6c. 2 Lớp dự kiến mở kỳ tới (UPCOMING) để Giáo vụ test tính năng Gợi ý Xếp lớp theo Điều kiện tiên quyết
  const upcomingClassesSpec = [
    { classCode: 'SE1702-PRU212', courseCode: 'PRU212', semester: 'SU26', teacherIdx: 0, days: [2, 4, 6], shift: 1, room: 'BE-405' },
    { classCode: 'SE1902-PRO192', courseCode: 'PRO192', semester: 'SU26', teacherIdx: 1, days: [3, 5, 7], shift: 3, room: 'AL-210' }
  ];

  await prisma.class.createMany({
    data: [
      ...historicalClassesSpec.map(c => ({
        classCode: c.classCode,
        courseId: courseByCode[c.courseCode].id,
        teacherId: teachers[c.teacherIdx].id,
        semester: c.semester,
        maxStudents: 30,
        status: 'COMPLETED'
      })),
      ...ongoingClassesSpec.map(c => ({
        classCode: c.classCode,
        courseId: courseByCode[c.courseCode].id,
        teacherId: teachers[c.teacherIdx].id,
        semester: c.semester,
        maxStudents: 30,
        status: 'ONGOING'
      })),
      ...upcomingClassesSpec.map(c => ({
        classCode: c.classCode,
        courseId: courseByCode[c.courseCode].id,
        teacherId: teachers[c.teacherIdx].id,
        semester: c.semester,
        maxStudents: 30,
        status: 'UPCOMING'
      }))
    ]
  });

  const allClasses = await prisma.class.findMany();
  const classByCode = {};
  allClasses.forEach(c => {
    classByCode[c.classCode] = c;
  });

  // 7. Tạo Thời khóa biểu (Schedules) cho toàn bộ lớp ONGOING và UPCOMING
  const schedulesToCreate = [];
  for (const spec of [...ongoingClassesSpec, ...upcomingClassesSpec]) {
    const cls = classByCode[spec.classCode];
    const slot = SLOT_TIMES[spec.shift];
    for (const day of spec.days) {
      schedulesToCreate.push({
        classId: cls.id,
        dayOfWeek: day,
        shift: spec.shift,
        startTime: new Date(slot.start),
        endTime: new Date(slot.end),
        room: spec.room
      });
    }
  }
  await prisma.schedule.createMany({ data: schedulesToCreate });

  // 8. Định nghĩa Lịch sử các môn đã học (COMPLETED) của từng sinh viên khớp chặt chẽ với Khung chương trình
  const term1Courses = ['PRF192', 'CEA201', 'CSI104', 'MAE101'];
  const term2Courses = ['PRO192', 'MAD101', 'OSG201', 'SSG104'];
  const term3Courses = ['CSD201', 'DBI202', 'MAS291', 'JPD113'];
  const term4Courses = ['PRJ301', 'SWE201c', 'IOT102'];
  const term5Courses = ['PRN231', 'SWP391', 'SWR302'];
  const term6Courses = ['OJT401'];

  const studentPastHistoryConfig = [
    // Kỳ 7: Đã PASS toàn bộ 19 môn từ Kỳ 1 -> Kỳ 6 (64 tín chỉ)
    { studentCode: 'HE170001', passed: [...term1Courses, ...term2Courses, ...term3Courses, ...term4Courses, ...term5Courses, ...term6Courses], failed: [], baseScore: 8.5 },
    { studentCode: 'HE170002', passed: [...term1Courses, ...term2Courses, ...term3Courses, ...term4Courses, ...term5Courses, ...term6Courses], failed: [], baseScore: 7.8 },
    { studentCode: 'HE170003', passed: [...term1Courses, ...term2Courses, ...term3Courses, ...term4Courses, ...term5Courses, ...term6Courses], failed: [], baseScore: 7.0 },

    // Kỳ 5: Đã học Kỳ 1 -> Kỳ 4 (45 tín chỉ; riêng HE170006 trượt SWE201c ở Kỳ 4 nên bị khóa SWR302 ở Kỳ 5)
    { studentCode: 'HE170004', passed: [...term1Courses, ...term2Courses, ...term3Courses, ...term4Courses], failed: [], baseScore: 8.2 },
    { studentCode: 'HE170005', passed: [...term1Courses, ...term2Courses, ...term3Courses, ...term4Courses], failed: [], baseScore: 6.8 },
    { studentCode: 'HE170006', passed: [...term1Courses, ...term2Courses, ...term3Courses, 'PRJ301', 'IOT102'], failed: ['SWE201c'], baseScore: 7.4 },

    // Kỳ 3: Đã PASS toàn bộ 8 môn Kỳ 1 -> Kỳ 2 (24 tín chỉ)
    { studentCode: 'HE170007', passed: [...term1Courses, ...term2Courses], failed: [], baseScore: 7.6 },
    { studentCode: 'HE170008', passed: [...term1Courses, ...term2Courses], failed: [], baseScore: 8.1 },

    // Kỳ 2: Đã PASS 3 môn Kỳ 1 (9 tín chỉ), trượt PRF192 (nên bị khóa PRO192, CSD201)
    { studentCode: 'HE170009', passed: ['CEA201', 'CSI104', 'MAE101'], failed: ['PRF192'], baseScore: 6.5 },

    // Kỳ 1: Tân sinh viên mới nhập học
    { studentCode: 'HE170010', passed: [], failed: [], baseScore: 8.0 }
  ];

  // 9. Định nghĩa Ghi danh kỳ hiện tại SP26 (ONGOING) kèm Điểm danh 6 buổi (2 tuần) & Điểm giữa kỳ logic
  const ALL_PRESENT = ['PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT'];
  const ONE_EXCUSED = ['PRESENT', 'ABSENT_EXCUSED', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT']; // Buổi 2 (04/11) nghỉ có phép
  const ONE_LATE = ['PRESENT', 'PRESENT', 'LATE', 'PRESENT', 'PRESENT', 'PRESENT']; // Buổi 3 (06/11) đi muộn
  const WARN_1_ABSENT = ['PRESENT', 'PRESENT', 'ABSENT_UNEXCUSED', 'PRESENT', 'PRESENT', 'PRESENT']; // Vắng 1/6 = 16.7% (Cảnh báo)
  const BANNED_2_ABSENT = ['PRESENT', 'ABSENT_UNEXCUSED', 'ABSENT_UNEXCUSED', 'PRESENT', 'PRESENT', 'PRESENT']; // Vắng 2/6 = 33.3% (Cấm thi)

  const ongoingEnrollmentsPlan = [
    // === Nhóm Kỳ 7 (HE170001, HE170002, HE170003) ===
    { studentCode: 'HE170001', classCode: 'SE1701-SWD392', statuses: ALL_PRESENT, midterm: 9.0, invoiceStatus: 'PAID' },
    { studentCode: 'HE170001', classCode: 'SE1701-PRM392', statuses: ALL_PRESENT, midterm: 8.5, invoiceStatus: 'PAID' },
    { studentCode: 'HE170001', classCode: 'SE1701-MLN122', statuses: ALL_PRESENT, midterm: 9.0, invoiceStatus: 'PAID' },

    { studentCode: 'HE170002', classCode: 'SE1701-SWD392', statuses: ONE_EXCUSED, midterm: 8.0, invoiceStatus: 'PAID', excusedNote: 'Nghỉ có phép (Đã duyệt đơn xin nghỉ ngày 04/11)' },
    { studentCode: 'HE170002', classCode: 'SE1701-PRM392', statuses: ALL_PRESENT, midterm: 7.5, invoiceStatus: 'PARTIAL' },
    { studentCode: 'HE170002', classCode: 'SE1701-MLN122', statuses: ALL_PRESENT, midterm: 8.5, invoiceStatus: 'PAID' },

    { studentCode: 'HE170003', classCode: 'SE1701-SWD392', statuses: ONE_LATE, midterm: 7.0, invoiceStatus: 'PAID' },
    { studentCode: 'HE170003', classCode: 'SE1701-PRM392', statuses: WARN_1_ABSENT, midterm: 6.5, invoiceStatus: 'UNPAID' },
    { studentCode: 'HE170003', classCode: 'SE1701-MLN122', statuses: ALL_PRESENT, midterm: 7.5, invoiceStatus: 'PARTIAL' },

    // === Nhóm Kỳ 5 (HE170004, HE170005, HE170006) ===
    { studentCode: 'HE170004', classCode: 'SE1801-PRN231', statuses: ALL_PRESENT, midterm: 8.5, invoiceStatus: 'PAID' },
    { studentCode: 'HE170004', classCode: 'SE1801-SWP391', statuses: ALL_PRESENT, midterm: 9.0, invoiceStatus: 'PAID' },
    { studentCode: 'HE170004', classCode: 'SE1801-SWR302', statuses: ALL_PRESENT, midterm: 8.0, invoiceStatus: 'PAID' },

    { studentCode: 'HE170005', classCode: 'SE1801-PRN231', statuses: BANNED_2_ABSENT, midterm: 6.0, invoiceStatus: 'PARTIAL' }, // Cấm thi (vắng 2/6 buổi = 33.3%)
    { studentCode: 'HE170005', classCode: 'SE1801-SWP391', statuses: WARN_1_ABSENT, midterm: 7.0, invoiceStatus: 'PAID' },
    { studentCode: 'HE170005', classCode: 'SE1801-SWR302', statuses: ALL_PRESENT, midterm: 7.5, invoiceStatus: 'UNPAID' },

    // HE170006 chỉ học PRN231 và SWP391 vì bị khóa SWR302 (do trượt SWE201c ở Kỳ 4)
    { studentCode: 'HE170006', classCode: 'SE1801-PRN231', statuses: ALL_PRESENT, midterm: 8.0, invoiceStatus: 'PAID' },
    { studentCode: 'HE170006', classCode: 'SE1801-SWP391', statuses: ONE_LATE, midterm: 7.5, invoiceStatus: 'PARTIAL' },

    // === Nhóm Kỳ 3 (HE170007, HE170008) ===
    { studentCode: 'HE170007', classCode: 'SE1901-CSD201', statuses: ALL_PRESENT, midterm: 8.0, invoiceStatus: 'PAID' },
    { studentCode: 'HE170007', classCode: 'SE1901-DBI202', statuses: ALL_PRESENT, midterm: 7.5, invoiceStatus: 'PAID' },
    { studentCode: 'HE170007', classCode: 'SE1901-MAS291', statuses: ALL_PRESENT, midterm: 8.5, invoiceStatus: 'PARTIAL' },

    { studentCode: 'HE170008', classCode: 'SE1901-CSD201', statuses: ONE_LATE, midterm: 8.5, invoiceStatus: 'PAID' },
    { studentCode: 'HE170008', classCode: 'SE1901-DBI202', statuses: ALL_PRESENT, midterm: 9.0, invoiceStatus: 'PAID' },
    { studentCode: 'HE170008', classCode: 'SE1901-MAS291', statuses: WARN_1_ABSENT, midterm: 7.0, invoiceStatus: 'UNPAID' },

    // === Nhóm Kỳ 2 (HE170009 - Học MAD101, OSG201 và học lại PRF192) ===
    { studentCode: 'HE170009', classCode: 'SE1902-MAD101', statuses: ALL_PRESENT, midterm: 7.0, invoiceStatus: 'PAID' },
    { studentCode: 'HE170009', classCode: 'SE1902-OSG201', statuses: WARN_1_ABSENT, midterm: 6.5, invoiceStatus: 'PARTIAL' },
    { studentCode: 'HE170009', classCode: 'SE2001-PRF192', statuses: ALL_PRESENT, midterm: 7.5, invoiceStatus: 'PAID' },

    // === Nhóm Kỳ 1 (HE170010 - Tân sinh viên Kỳ 1) ===
    { studentCode: 'HE170010', classCode: 'SE2001-PRF192', statuses: ALL_PRESENT, midterm: 8.5, invoiceStatus: 'PAID' },
    { studentCode: 'HE170010', classCode: 'SE2001-CEA201', statuses: ALL_PRESENT, midterm: 8.0, invoiceStatus: 'PAID' },
    { studentCode: 'HE170010', classCode: 'SE2001-MAE101', statuses: ONE_LATE, midterm: 7.5, invoiceStatus: 'PARTIAL' }
  ];

  // Tạo toàn bộ Enrollments (Lịch sử + Hiện tại)
  const enrollmentsToCreate = [];
  for (const hist of studentPastHistoryConfig) {
    const stu = studentByCode[hist.studentCode];
    for (const cCode of [...hist.passed, ...hist.failed]) {
      const cls = classByCode[`HIST-${cCode}`];
      enrollmentsToCreate.push({
        classId: cls.id,
        studentId: stu.id,
        status: 'ACTIVE',
        enrolledAt: new Date('2025-05-10T08:00:00Z')
      });
    }
  }
  for (const plan of ongoingEnrollmentsPlan) {
    const stu = studentByCode[plan.studentCode];
    const cls = classByCode[plan.classCode];
    enrollmentsToCreate.push({
      classId: cls.id,
      studentId: stu.id,
      status: 'ACTIVE',
      enrolledAt: new Date('2026-10-25T08:00:00Z')
    });
  }

  await prisma.enrollment.createMany({ data: enrollmentsToCreate });
  const allEnrollments = await prisma.enrollment.findMany();
  const enrollmentMap = new Map();
  allEnrollments.forEach(e => {
    enrollmentMap.set(`${e.classId}_${e.studentId}`, e);
  });

  // 10. Tạo Grades & Attendances & TuitionInvoices
  const gradesToCreate = [];
  const attendancesToCreate = [];
  const invoicesToCreate = [];

  // 10a. Grades & Invoices cho các môn lịch sử (COMPLETED)
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

      gradesToCreate.push({
        enrollmentId: enr.id,
        attendanceScore: att,
        midtermScore: mid,
        finalScore: fin,
        totalScore: total,
        isPassed: true,
        isBanned: false
      });

      invoicesToCreate.push({
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
      const fin = 2.5; // Điểm cuối kỳ < 3.5 -> Trượt môn
      const total = parseFloat((att * 0.1 + mid * 0.3 + fin * 0.6).toFixed(1)); // 3.5

      gradesToCreate.push({
        enrollmentId: enr.id,
        attendanceScore: att,
        midtermScore: mid,
        finalScore: fin,
        totalScore: total,
        isPassed: false,
        isBanned: false
      });

      invoicesToCreate.push({
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

  // 10b. Grades, Attendances (6 buổi trong 2 tuần) & Invoices cho các môn đang học (ONGOING SP26)
  const ongoingSpecByClassCode = {};
  ongoingClassesSpec.forEach(s => {
    ongoingSpecByClassCode[s.classCode] = s;
  });

  for (const plan of ongoingEnrollmentsPlan) {
    const stu = studentByCode[plan.studentCode];
    const cls = classByCode[plan.classCode];
    const spec = ongoingSpecByClassCode[plan.classCode];
    const course = courseByCode[spec.courseCode];
    const enr = enrollmentMap.get(`${cls.id}_${stu.id}`);

    // Tính 6 ngày học trong 2 tuần của lớp
    // Chỉ tạo dữ liệu điểm danh cho các buổi đã diễn ra tính đến sáng Thứ Hai 09/11/2026 (Tuần 1: 02/11-07/11 và sáng 09/11 Slot 1-2)
    // Các buổi sau ngày 09/11 (10/11 - 14/11) chưa diễn ra nên để trống (Chưa học / Chưa điểm danh)
    const sessionDates = getTwoWeekDatesForDays(spec.days);
    const attendedStatuses = [];

    sessionDates.forEach((dateObj, idx) => {
      const dateStr = dateObj.toISOString().split('T')[0];
      const isPastOrCurrentSession =
        dateStr < '2026-11-09' || (dateStr === '2026-11-09' && spec.shift <= 2);

      if (!isPastOrCurrentSession) {
        return; // Chưa đến ngày/ca học -> chưa điểm danh
      }

      const st = plan.statuses[idx] || 'PRESENT';
      attendedStatuses.push(st);

      let note = null;
      if (st === 'ABSENT_EXCUSED') note = plan.excusedNote || 'Nghỉ có phép (Đã duyệt đơn)';
      else if (st === 'ABSENT_UNEXCUSED') note = `Vắng mặt không phép buổi ${idx + 1}`;
      else if (st === 'LATE') note = 'Vào lớp muộn 10 phút';

      attendancesToCreate.push({
        classId: cls.id,
        studentId: stu.id,
        sessionDate: dateObj,
        status: st,
        note
      });
    });

    // Tính điểm chuyên cần và cờ cấm thi khớp với các buổi đã học trên tổng 6 buổi của kỳ 2 tuần
    const { attendanceScore, isBanned } = calcAttendanceMetrics(attendedStatuses, 6);

    gradesToCreate.push({
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

    invoicesToCreate.push({
      studentId: stu.id,
      enrollmentId: enr.id,
      amount: fee,
      paidAmount,
      dueDate: new Date('2026-11-20'),
      status: plan.invoiceStatus,
      paidAt: plan.invoiceStatus === 'PAID' ? new Date('2026-11-01T10:00:00Z') : null,
      createdAt: new Date('2026-10-25T08:00:00Z')
    });
  }

  await prisma.grade.createMany({ data: gradesToCreate });
  await prisma.attendance.createMany({ data: attendancesToCreate });
  await prisma.tuitionInvoice.createMany({ data: invoicesToCreate });

  // Tạo Phiếu thu (TuitionPayments) cho các hóa đơn kỳ SP26 đã đóng hoặc đóng 1 phần
  const ongoingClassIds = new Set(ongoingClassesSpec.map(s => classByCode[s.classCode].id));
  const allInvoices = await prisma.tuitionInvoice.findMany({
    include: { enrollment: true }
  });

  const paymentsToCreate = [];
  let receiptSeq = 0;
  for (const inv of allInvoices) {
    if (ongoingClassIds.has(inv.enrollment.classId) && Number(inv.paidAmount) > 0) {
      receiptSeq += 1;
      paymentsToCreate.push({
        invoiceId: inv.id,
        receiptNo: `PT-202611-${String(receiptSeq).padStart(5, '0')}`,
        amount: inv.paidAmount,
        method: receiptSeq % 2 === 0 ? 'VIETQR' : 'BANK_TRANSFER',
        note: inv.status === 'PAID' ? 'Thu đủ học phí kỳ SP26' : 'Thu học phí đợt 1 kỳ SP26',
        collectedById: accountant.id,
        paidAt: new Date('2026-11-01T09:30:00Z')
      });
    }
  }
  await prisma.tuitionPayment.createMany({ data: paymentsToCreate });

  // 11. Tạo Bài tập (Assignments) & Bài nộp (Submissions) cho tất cả 14 lớp ONGOING kỳ SP26
  // Mỗi lớp có 2 bài tập:
  // - Bài tập Tuần 1 (Hạn 08/11/2026 - Đã kết thúc Tuần 1, sinh viên đã nộp & có điểm + nhận xét)
  // - Bài tập Tuần 2 (Hạn 15/11/2026 - Đang diễn ra trong Tuần 2)
  const assignmentsToCreate = [];
  for (const spec of ongoingClassesSpec) {
    const cls = classByCode[spec.classCode];
    const course = courseByCode[spec.courseCode];
    assignmentsToCreate.push(
      {
        classId: cls.id,
        title: `[Tuần 1] Lab 1 - Thực hành nền tảng môn ${course.courseCode}`,
        description: `Bài tập thực hành Tuần 1 (02/11 - 08/11/2026) môn ${course.name}. Sinh viên nộp file .zip gồm mã nguồn và báo cáo PDF.`,
        fileUrl: `https://fap.fpt.edu.vn/materials/${course.courseCode}_Week1_Lab1.pdf`,
        dueDate: new Date('2026-11-08T23:59:00Z'),
        createdAt: new Date('2026-11-02T08:00:00Z')
      },
      {
        classId: cls.id,
        title: `[Tuần 2] Assignment 2 - Đồ án mini kết thúc kỳ 2 tuần môn ${course.courseCode}`,
        description: `Bài tập lớn Tuần 2 (09/11 - 15/11/2026) môn ${course.name}. Hoàn thiện toàn bộ yêu cầu theo rubric chấm điểm.`,
        fileUrl: `https://fap.fpt.edu.vn/materials/${course.courseCode}_Week2_Assignment2.pdf`,
        dueDate: new Date('2026-11-15T23:59:00Z'),
        createdAt: new Date('2026-11-09T08:00:00Z')
      }
    );
  }

  await prisma.assignment.createMany({ data: assignmentsToCreate });
  const allAssignments = await prisma.assignment.findMany({ orderBy: { id: 'asc' } });

  const submissionsToCreate = [];
  for (const plan of ongoingEnrollmentsPlan) {
    const stu = studentByCode[plan.studentCode];
    const cls = classByCode[plan.classCode];
    const classAssignments = allAssignments.filter(a => a.classId === cls.id);
    const week1Ass = classAssignments[0];
    const week2Ass = classAssignments[1];

    // Bài tập Tuần 1: Hầu hết sinh viên đã nộp và được giảng viên chấm điểm khớp với điểm giữa kỳ
    if (week1Ass) {
      const isLateStudent = plan.studentCode === 'HE170003' && plan.classCode === 'SE1701-PRM392';
      const isMissingStudent = plan.studentCode === 'HE170005' && plan.classCode === 'SE1801-PRN231';

      if (!isMissingStudent) {
        submissionsToCreate.push({
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

    // Bài tập Tuần 2: Các sinh viên đầu nhóm đã nộp sớm 1-2 môn, các môn còn lại đang chờ nộp
    if (week2Ass) {
      const submittedEarly =
        (plan.studentCode === 'HE170001' && plan.classCode !== 'SE1701-MLN122') ||
        (plan.studentCode === 'HE170004' && plan.classCode === 'SE1801-PRN231') ||
        (plan.studentCode === 'HE170007' && plan.classCode === 'SE1901-CSD201');

      if (submittedEarly) {
        submissionsToCreate.push({
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
  await prisma.submission.createMany({ data: submissionsToCreate });

  // 12. Tạo Đơn từ Học vụ (StudentRequests) khớp logic với Điểm danh & Điểm số
  await prisma.studentRequest.createMany({
    data: [
      {
        studentId: studentByCode['HE170002'].id,
        classId: classByCode['SE1701-SWD392'].id,
        requestType: 'ABSENCE',
        sessionDate: new Date('2026-11-04'),
        reason: 'Em bị sốt xuất huyết có giấy khám bệnh của bệnh viện, xin phép nghỉ buổi học ngày 04/11/2026 môn SWD392.',
        status: 'APPROVED',
        adminResponse: 'Phòng Đào tạo chấp thuận đơn xin nghỉ có phép. Đã cập nhật trạng thái điểm danh ngày 04/11 thành Nghỉ có phép.'
      },
      {
        studentId: studentByCode['HE170005'].id,
        classId: classByCode['SE1801-PRN231'].id,
        requestType: 'ABSENCE',
        sessionDate: new Date('2026-11-06'),
        reason: 'Gia đình em có việc đột xuất phải về quê ngày 06/11/2026, xin phép chuyển buổi vắng ngày 06/11 sang nghỉ có phép để không bị cấm thi.',
        status: 'PENDING',
        adminResponse: null
      },
      {
        studentId: studentByCode['HE170006'].id,
        classId: classByCode['HIST-SWE201c'].id,
        requestType: 'REMARK',
        sessionDate: null,
        reason: 'Em xin phúc khảo bài thi cuối kỳ môn SWE201c (hiện tại 2.5 điểm) để đủ điều kiện mở khóa môn SWR302.',
        status: 'PENDING',
        adminResponse: null
      },
      {
        studentId: studentByCode['HE170001'].id,
        classId: null,
        requestType: 'CONFIRMATION',
        sessionDate: null,
        reason: 'Xin cấp giấy xác nhận sinh viên năm cuối (Kỳ 7) để bổ sung hồ sơ học bổng doanh nghiệp FPT Software.',
        status: 'APPROVED',
        adminResponse: 'Đã cấp giấy xác nhận sinh viên. Mời em nhận bản cứng tại phòng Dịch vụ Sinh viên.'
      }
    ]
  });

  // 13. Tạo Thông báo hệ thống & cá nhân (Notifications)
  await prisma.notification.createMany({
    data: [
      {
        userId: null,
        title: 'Lịch học & Điểm danh Học kỳ SP26 (Kỳ học 2 tuần: 02/11/2026 – 15/11/2026)',
        message: 'Toàn bộ các lớp học phần kỳ SP26 học trong 2 tuần (6 buổi/môn). Sinh viên vắng không phép từ 2/6 buổi (>= 20%) sẽ bị cấm thi tự động.',
        type: 'SYSTEM'
      },
      {
        userId: null,
        title: 'Thông báo hoàn thành học phí Học kỳ SP26 trước ngày 20/11/2026',
        message: 'Sinh viên kiểm tra công nợ học phí và thanh toán trực tuyến qua VietQR để đảm bảo điều kiện dự thi cuối kỳ.',
        type: 'TUITION'
      },
      {
        userId: studentByCode['HE170001'].id,
        title: 'Đã chấm điểm Lab 1 Tuần 1 môn SWD392 & PRM392',
        message: 'Giảng viên đã chấm điểm bài tập Lab 1 Tuần 1 của bạn (9.0/10). Vui lòng hoàn thành Assignment 2 Tuần 2 trước ngày 15/11/2026.',
        type: 'GRADE'
      },
      {
        userId: studentByCode['HE170005'].id,
        title: 'CẢNH BÁO CẤM THI: Môn PRN231 (Lớp SE1801-PRN231)',
        message: 'Bạn đã vắng không phép 2/6 buổi (33.3% >= 20%) ở lớp SE1801-PRN231 và bị khóa điều kiện dự thi cuối kỳ.',
        type: 'SYSTEM'
      }
    ]
  });

  console.log('✅ Seed data created successfully!');
  console.log('   - 1 Admin: admin@fpt.edu.vn | Pass: 123456');
  console.log('   - 1 Accountant: ketoan@fpt.edu.vn | Pass: 123456');
  console.log('   - 3 Teachers: thaynam@fpt.edu.vn, colinh@fpt.edu.vn, thaytuan@fpt.edu.vn | Pass: 123456');
  console.log('   - 10 Students across Terms 1, 2, 3, 5, 7:');
  console.log('     * Kỳ 7 (64 TC): namnvhe170001@fpt.edu.vn, trangtthe170002@fpt.edu.vn, longldhe170003@fpt.edu.vn');
  console.log('     * Kỳ 5 (45 TC): linhpthe170004@fpt.edu.vn, hoangnmhe170005@fpt.edu.vn (Cấm thi PRN231), quynhntkhe170006@fpt.edu.vn (Nợ SWE201c)');
  console.log('     * Kỳ 3 (24 TC): dungdvhe170007@fpt.edu.vn, maipmhe170008@fpt.edu.vn');
  console.log('     * Kỳ 2 (9 TC, nợ PRF192): bachnvhe170009@fpt.edu.vn');
  console.log('     * Kỳ 1 (0 TC): haonvhe170010@fpt.edu.vn');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
