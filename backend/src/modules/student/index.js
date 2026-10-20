/**
 * ==========================================================================
 * CỔNG HỌC VIÊN (Người 5 - STUDENT)
 * --------------------------------------------------------------------------
 * BF-STU-1  UC11.2   GET /analytics/dashboard        Student Dashboard (DF31)
 * BF-STU-2  UC6.2/6.3* GET /students/my-attendances  Lịch sử điểm danh & chuyên cần (DF26)
 * BF-STU-4..7 UC7.2/7.4* GET /students/my-assignments Đề bài, trạng thái nộp, điểm & lời phê (DF27)
 * BF-STU-8  UC8.4    GET /students/my-grades         Bảng điểm từng môn & GPA tích lũy (DF28)
 * BF-STU-9  UC9.4*   GET /students/my-tuition        Công nợ học phí cá nhân (DF30)
 * (Nộp bài UC7.2 nằm ở module attendance-assignments, VietQR UC9.3 ở module grades-tuition)
 * ==========================================================================
 */
const express = require('express');
const router = express.Router();
const authenticateJWT = require('../../middlewares/auth.middleware');
const authorizeRoles = require('../../middlewares/role.middleware');
const prisma = require('../../config/prisma');
const { successResponse, errorResponse } = require('../../utils/formatResponse');

const BAN_THRESHOLD = 20; // Vắng không phép >= 20% tổng số buổi -> cấm thi (khớp gradeHelper)
const DEADLINE_WINDOW_DAYS = 7;

const toNumber = (v) => (v === null || v === undefined ? null : Number(v));

// Cột TIME của MySQL được Prisma trả về dạng 1970-01-01THH:mm:00Z -> "HH:mm"
const formatTime = (t) => {
  if (!t) return null;
  const d = new Date(t);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

// dayjs/JS: 0 = Chủ nhật ... 6 = Thứ 7 -> quy ước hệ thống 2 = Thứ 2 ... 8 = Chủ nhật
const todayDayOfWeek = () => {
  const d = new Date().getDay();
  return d === 0 ? 8 : d + 1;
};

const getActiveEnrollments = (studentId, include = {}) =>
  prisma.enrollment.findMany({
    where: { studentId, status: 'ACTIVE' },
    include: { class: { include: { course: true, ...include } } }
  });

// GPA thang 10 có trọng số tín chỉ, chỉ tính môn đã có điểm tổng kết
const calcGpa = (rows) => {
  const valid = rows.filter((r) => r.totalScore !== null);
  const credits = valid.reduce((s, r) => s + r.credits, 0);
  const weighted = valid.reduce((s, r) => s + r.totalScore * r.credits, 0);
  return { gpa: credits > 0 ? Number((weighted / credits).toFixed(2)) : 0, credits };
};

const gpaBySemester = (rows) => {
  const map = new Map();
  rows.forEach((r) => {
    if (!map.has(r.semester)) map.set(r.semester, []);
    map.get(r.semester).push(r);
  });
  return [...map.entries()]
    .map(([semester, list]) => ({ semester, ...calcGpa(list) }))
    .filter((s) => s.credits > 0)
    .sort((a, b) => a.semester.localeCompare(b.semester));
};

const summarizeAttendance = (records, totalSessions) => {
  const count = (st) => records.filter((r) => r.status === st).length;
  const present = count('PRESENT');
  const late = count('LATE');
  const absentExcused = count('ABSENT_EXCUSED');
  const absentUnexcused = count('ABSENT_UNEXCUSED');
  const absentRate = Number(((absentUnexcused / totalSessions) * 100).toFixed(1));
  const attendedRate = records.length > 0 ? Number((((present + late) / records.length) * 100).toFixed(1)) : 100;
  let warningLevel = 'SAFE';
  if (absentRate >= BAN_THRESHOLD) warningLevel = 'BANNED';
  else if (absentRate > BAN_THRESHOLD / 2) warningLevel = 'WARNING';
  return {
    totalSessions,
    recordedSessions: records.length,
    present,
    late,
    absentExcused,
    absentUnexcused,
    absentRate,
    attendedRate,
    warningLevel,
    isBanned: absentRate >= BAN_THRESHOLD
  };
};

// Trạng thái bài tập phía học viên
const submissionState = (assignment, submission) => {
  if (submission) {
    if (submission.score !== null) return 'GRADED';
    return submission.status === 'LATE_SUBMITTED' ? 'LATE_SUBMITTED' : 'SUBMITTED';
  }
  return new Date() > new Date(assignment.dueDate) ? 'MISSING' : 'PENDING';
};

const mapSubmission = (s) =>
  s
    ? {
        id: s.id,
        fileUrl: s.fileUrl,
        submittedAt: s.submittedAt,
        status: s.status,
        isLate: s.status === 'LATE_SUBMITTED',
        score: toNumber(s.score),
        teacherFeedback: s.teacherFeedback
      }
    : null;

const loadMyGradeRows = async (studentId) => {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId, status: 'ACTIVE' },
    include: {
      class: { include: { course: true, teacher: { select: { fullName: true } } } },
      grade: true
    },
    orderBy: { class: { semester: 'desc' } }
  });

  return enrollments.map((e) => ({
    enrollmentId: e.id,
    classId: e.classId,
    classCode: e.class.classCode,
    courseCode: e.class.course.courseCode,
    courseName: e.class.course.name,
    credits: e.class.course.credits,
    semester: e.class.semester,
    classStatus: e.class.status,
    teacherName: e.class.teacher?.fullName || 'Chưa phân công',
    attendanceScore: toNumber(e.grade?.attendanceScore),
    midtermScore: toNumber(e.grade?.midtermScore),
    finalScore: toNumber(e.grade?.finalScore),
    totalScore: toNumber(e.grade?.totalScore),
    isPassed: e.grade?.isPassed || false,
    isBanned: e.grade?.isBanned || false
  }));
};

const loadMyInvoices = async (studentId) => {
  const invoices = await prisma.tuitionInvoice.findMany({
    where: { studentId },
    include: { enrollment: { include: { class: { include: { course: true } } } } },
    orderBy: [{ dueDate: 'asc' }, { id: 'desc' }]
  });
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const list = invoices.map((inv) => {
    const amount = Number(inv.amount);
    const paidAmount = Number(inv.paidAmount);
    return {
      id: inv.id,
      classCode: inv.enrollment.class.classCode,
      courseCode: inv.enrollment.class.course.courseCode,
      courseName: inv.enrollment.class.course.name,
      semester: inv.enrollment.class.semester,
      amount,
      paidAmount,
      remainingAmount: Math.max(0, amount - paidAmount),
      status: inv.status,
      dueDate: inv.dueDate,
      paidAt: inv.paidAt,
      isOverdue: inv.status !== 'PAID' && new Date(inv.dueDate) < startOfToday
    };
  });

  const summary = list.reduce(
    (acc, i) => {
      acc.totalAmount += i.amount;
      acc.paidAmount += i.paidAmount;
      acc.remainingAmount += i.remainingAmount;
      acc[i.status] += 1;
      if (i.isOverdue) acc.overdueCount += 1;
      return acc;
    },
    { totalAmount: 0, paidAmount: 0, remainingAmount: 0, UNPAID: 0, PARTIAL: 0, PAID: 0, overdueCount: 0 }
  );

  return { summary, invoices: list };
};

// ==========================================
// BF-STU-1 / UC11.2: Student Dashboard (DF31)
// ==========================================
router.get('/analytics/dashboard', authenticateJWT, authorizeRoles('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const enrollments = await getActiveEnrollments(studentId, {
      schedules: true,
      teacher: { select: { fullName: true } },
      attendances: { where: { studentId } }
    });
    const classIds = enrollments.map((e) => e.classId);

    // Lịch học hôm nay
    const today = todayDayOfWeek();
    const todaySchedules = enrollments
      .flatMap((e) =>
        e.class.schedules
          .filter((s) => s.dayOfWeek === today)
          .map((s) => ({
            id: s.id,
            classCode: e.class.classCode,
            courseCode: e.class.course.courseCode,
            courseName: e.class.course.name,
            teacherName: e.class.teacher?.fullName || 'Chưa phân công',
            shift: s.shift,
            startTime: formatTime(s.startTime),
            endTime: formatTime(s.endTime),
            room: s.room
          }))
      )
      .sort((a, b) => a.shift - b.shift);

    // Deadline sắp tới (7 ngày) & bài quá hạn chưa nộp
    const now = new Date();
    const windowEnd = new Date(now.getTime() + DEADLINE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const assignments = await prisma.assignment.findMany({
      where: { classId: { in: classIds } },
      include: { class: { include: { course: true } }, submissions: { where: { studentId } } },
      orderBy: { dueDate: 'asc' }
    });
    const upcomingDeadlines = assignments
      .filter((a) => new Date(a.dueDate) >= now && new Date(a.dueDate) <= windowEnd)
      .map((a) => ({
        id: a.id,
        title: a.title,
        classCode: a.class.classCode,
        courseName: a.class.course.name,
        dueDate: a.dueDate,
        isSubmitted: a.submissions.length > 0
      }));
    const pendingAssignments = assignments.filter((a) => a.submissions.length === 0 && new Date(a.dueDate) >= now).length;
    const missingAssignments = assignments.filter((a) => a.submissions.length === 0 && new Date(a.dueDate) < now).length;

    // GPA & biểu đồ theo học kỳ
    const gradeRows = await loadMyGradeRows(studentId);
    const { gpa, credits } = calcGpa(gradeRows);

    // Cảnh báo chuyên cần
    const attendanceWarnings = enrollments
      .map((e) => ({
        classCode: e.class.classCode,
        courseName: e.class.course.name,
        ...summarizeAttendance(e.class.attendances, e.class.course.totalSessions || 30)
      }))
      .filter((a) => a.warningLevel !== 'SAFE');

    // Công nợ & thông báo chưa đọc
    const { summary: tuition } = await loadMyInvoices(studentId);
    const unreadNotifications = await prisma.notification.count({ where: { userId: studentId, isRead: false } });

    return successResponse(
      res,
      {
        enrolledClassesCount: enrollments.length,
        gpa,
        totalCredits: credits,
        passedCourses: gradeRows.filter((g) => g.isPassed).length,
        gpaBySemester: gpaBySemester(gradeRows),
        todaySchedules,
        upcomingDeadlines,
        pendingAssignments,
        missingAssignments,
        attendanceWarnings,
        tuition,
        unreadNotifications
      },
      'Lấy dashboard học viên thành công'
    );
  } catch (error) {
    console.error('Error fetching student dashboard:', error);
    return errorResponse(res, 'Lỗi lấy dữ liệu dashboard học viên', 500);
  }
});

// ==========================================
// BF-STU-2 / UC6.3* & UC6.2: Lịch sử điểm danh & tỷ lệ chuyên cần (DF26)
// ==========================================
router.get('/students/my-attendances', authenticateJWT, authorizeRoles('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const enrollments = await getActiveEnrollments(studentId, {
      teacher: { select: { fullName: true } },
      attendances: { where: { studentId }, orderBy: { sessionDate: 'desc' } }
    });

    const classes = enrollments.map((e) => ({
      classId: e.classId,
      classCode: e.class.classCode,
      courseCode: e.class.course.courseCode,
      courseName: e.class.course.name,
      semester: e.class.semester,
      teacherName: e.class.teacher?.fullName || 'Chưa phân công',
      ...summarizeAttendance(e.class.attendances, e.class.course.totalSessions || 30),
      sessions: e.class.attendances.map((a) => ({
        id: a.id,
        sessionDate: a.sessionDate,
        status: a.status,
        note: a.note
      }))
    }));

    return successResponse(
      res,
      { banThreshold: BAN_THRESHOLD, classes },
      'Lấy lịch sử điểm danh cá nhân thành công'
    );
  } catch (error) {
    console.error('Error fetching my attendances:', error);
    return errorResponse(res, 'Lỗi lấy lịch sử điểm danh', 500);
  }
});

// ==========================================
// BF-STU-4..7 / UC7.2 & UC7.4*: Bài tập của tất cả lớp đang học (DF27)
// ==========================================
router.get('/students/my-assignments', authenticateJWT, authorizeRoles('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId, status: 'ACTIVE' },
      select: { classId: true }
    });

    const assignments = await prisma.assignment.findMany({
      where: { classId: { in: enrollments.map((e) => e.classId) } },
      include: {
        class: { include: { course: true, teacher: { select: { fullName: true } } } },
        submissions: { where: { studentId } }
      },
      orderBy: { dueDate: 'desc' }
    });

    const data = assignments.map((a) => {
      const sub = a.submissions[0] || null;
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        fileUrl: a.fileUrl,
        dueDate: a.dueDate,
        createdAt: a.createdAt,
        classId: a.classId,
        classCode: a.class.classCode,
        courseCode: a.class.course.courseCode,
        courseName: a.class.course.name,
        teacherName: a.class.teacher?.fullName || 'Chưa phân công',
        state: submissionState(a, sub),
        mySubmission: mapSubmission(sub)
      };
    });

    const stats = data.reduce(
      (acc, a) => {
        acc[a.state] = (acc[a.state] || 0) + 1;
        return acc;
      },
      { PENDING: 0, MISSING: 0, SUBMITTED: 0, LATE_SUBMITTED: 0, GRADED: 0 }
    );

    return successResponse(res, { stats, assignments: data }, 'Lấy danh sách bài tập cá nhân thành công');
  } catch (error) {
    console.error('Error fetching my assignments:', error);
    return errorResponse(res, 'Lỗi lấy danh sách bài tập', 500);
  }
});

// ==========================================
// BF-STU-8 / UC8.4: Bảng điểm từng môn & GPA tích lũy (DF28)
// ==========================================
router.get('/students/my-grades', authenticateJWT, authorizeRoles('STUDENT'), async (req, res) => {
  try {
    const rows = await loadMyGradeRows(req.user.id);
    const { gpa, credits } = calcGpa(rows);

    // Giữ cấu trúc `grade` lồng nhau để tương thích các màn hình cũ
    const grades = rows.map((r) => ({
      ...r,
      grade: {
        attendanceScore: r.attendanceScore,
        midtermScore: r.midtermScore,
        finalScore: r.finalScore,
        totalScore: r.totalScore,
        isPassed: r.isPassed,
        isBanned: r.isBanned
      }
    }));

    return successResponse(
      res,
      {
        gpa,
        totalCredits: credits,
        totalCourses: rows.length,
        passedCourses: rows.filter((r) => r.isPassed).length,
        failedCourses: rows.filter((r) => r.totalScore !== null && !r.isPassed).length,
        gpaBySemester: gpaBySemester(rows),
        grades
      },
      'Lấy bảng điểm cá nhân thành công'
    );
  } catch (error) {
    console.error('Error fetching my grades:', error);
    return errorResponse(res, 'Lỗi lấy bảng điểm', 500);
  }
});

// ==========================================
// BF-STU-9 / UC9.4*: Công nợ học phí cá nhân (DF30)
// Mã VietQR lấy qua GET /tuition-invoices/:id/vietqr (UC9.3 - Người 3)
// ==========================================
router.get('/students/my-tuition', authenticateJWT, authorizeRoles('STUDENT'), async (req, res) => {
  try {
    const data = await loadMyInvoices(req.user.id);
    return successResponse(res, data, 'Lấy công nợ học phí cá nhân thành công');
  } catch (error) {
    console.error('Error fetching my tuition:', error);
    return errorResponse(res, 'Lỗi lấy công nợ học phí', 500);
  }
});

module.exports = router;
