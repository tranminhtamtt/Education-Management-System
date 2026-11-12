const express = require('express');
const router = express.Router();
const authenticateJWT = require('../../middlewares/auth.middleware');
const authorizeRoles = require('../../middlewares/role.middleware');
const { withTransaction } = require('../../config/db');
const { Class, Enrollment, Grade } = require('../../models');
const { plain } = require('../../utils/query');
const { successResponse, errorResponse } = require('../../utils/formatResponse');

/**
 * Hàm tính điểm tổng kết và xét điều kiện qua môn chuẩn FAP:
 * 1. total_score = attendance * 0.1 + midterm * 0.3 + final * 0.6
 * 2. is_passed = (!is_banned) && (final >= 3.5) && (total >= 4.0)
 */
const calculateGrade = (attendanceScore, midtermScore, finalScore, isBanned) => {
  if (attendanceScore === null || midtermScore === null || finalScore === null) {
    return {
      totalScore: null,
      isPassed: false,
      isBanned: !!isBanned
    };
  }

  const att = parseFloat(attendanceScore);
  const mid = parseFloat(midtermScore);
  const fin = parseFloat(finalScore);

  const total = parseFloat((att * 0.1 + mid * 0.3 + fin * 0.6).toFixed(1));
  const isPassed = !isBanned && fin >= 3.5 && total >= 4.0;

  return {
    totalScore: total,
    isPassed,
    isBanned: !!isBanned
  };
};

const num = v => (v !== null && v !== undefined ? Number(v) : null);

// ==========================================
// 1. EXAM & GRADE MANAGEMENT (UC8.1 - UC8.4)
// ==========================================

// UC8.1: Lấy bảng điểm đầy đủ của lớp học phần
router.get('/classes/:id/grades', authenticateJWT, authorizeRoles('ADMIN', 'TEACHER'), async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const classFilter = { id: classId };
    if (req.user.role === 'TEACHER') classFilter.teacherId = req.user.id;

    const classDoc = await Class.findOne(classFilter).populate(['course', {
      path: 'enrollments',
      match: { status: 'ACTIVE' },
      populate: [{ path: 'student', select: 'id code fullName email' }, 'grade']
    }]);

    if (!classDoc) {
      return errorResponse(res, 'Không tìm thấy lớp học phần', 404);
    }
    const classInfo = plain(classDoc);

    const grades = classInfo.enrollments
      .filter(e => e.student)
      .sort((a, b) => String(a.student.code).localeCompare(String(b.student.code)))
      .map(e => ({
        enrollmentId: e.id,
        studentId: e.student.id,
        studentCode: e.student.code,
        studentName: e.student.fullName,
        studentEmail: e.student.email,
        attendanceScore: num(e.grade?.attendanceScore),
        midtermScore: num(e.grade?.midtermScore),
        finalScore: num(e.grade?.finalScore),
        totalScore: num(e.grade?.totalScore),
        isPassed: e.grade?.isPassed || false,
        isBanned: e.grade?.isBanned || false
      }));

    return successResponse(
      res,
      {
        classId: classInfo.id,
        classCode: classInfo.classCode,
        courseName: classInfo.course?.name,
        courseCode: classInfo.course?.courseCode,
        grades
      },
      'Lấy bảng điểm thành công'
    );
  } catch (error) {
    console.error('Error getting class grades:', error);
    return errorResponse(res, 'Lỗi lấy bảng điểm lớp', 500);
  }
});

// UC8.2: Cập nhật điểm thành phần hàng loạt & Tự động xét qua môn
router.put('/classes/:id/grades', authenticateJWT, authorizeRoles('ADMIN', 'TEACHER'), async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const { gradesList } = req.body;

    if (!Array.isArray(gradesList)) {
      return errorResponse(res, 'Dữ liệu gradesList phải là một mảng', 400);
    }
    const classFilter = { id: classId };
    if (req.user.role === 'TEACHER') classFilter.teacherId = req.user.id;
    if (!await Class.exists(classFilter)) {
      return errorResponse(res, 'Không tìm thấy lớp được phân công', 404);
    }

    const enrollmentIds = gradesList.map(item => Number(item.enrollmentId));
    if (enrollmentIds.some(id => !Number.isSafeInteger(id)) || new Set(enrollmentIds).size !== enrollmentIds.length) {
      return errorResponse(res, 'Danh sách ghi danh không hợp lệ', 400);
    }
    const ownedEnrollmentCount = await Enrollment.countDocuments({
      classId,
      id: { $in: enrollmentIds }
    });
    if (ownedEnrollmentCount !== enrollmentIds.length) {
      return errorResponse(res, 'Có học viên không thuộc lớp này', 400);
    }
    const scoreFields = ['attendanceScore', 'midtermScore', 'finalScore'];
    for (const item of gradesList) {
      for (const field of scoreFields) {
        const value = item[field];
        if (value !== null && value !== undefined && value !== '' &&
          (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 10)) {
          return errorResponse(res, `${field} phải nằm trong khoảng 0 đến 10`, 400);
        }
      }
    }

    const updatedResults = await withTransaction(async session => {
      const results = [];
      for (const item of gradesList) {
        const enrollmentId = parseInt(item.enrollmentId);
        const currentGrade = await Grade.findOne({ enrollmentId }).session(session);
        const isBanned = currentGrade?.isBanned || false;
        const att = item.attendanceScore !== undefined && item.attendanceScore !== null && item.attendanceScore !== '' ? parseFloat(item.attendanceScore) : null;
        const mid = item.midtermScore !== undefined && item.midtermScore !== null && item.midtermScore !== '' ? parseFloat(item.midtermScore) : null;
        const fin = item.finalScore !== undefined && item.finalScore !== null && item.finalScore !== '' ? parseFloat(item.finalScore) : null;

        const { totalScore, isPassed } = calculateGrade(att, mid, fin, isBanned);
        const data = { attendanceScore: att, midtermScore: mid, finalScore: fin, totalScore, isPassed, isBanned };

        let updated;
        if (currentGrade) {
          Object.assign(currentGrade, data);
          updated = await currentGrade.save({ session });
        } else {
          [updated] = await Grade.create([{ enrollmentId, ...data }], { session });
        }
        results.push(plain(updated));
      }
      return results;
    });

    return successResponse(res, updatedResults, 'Cập nhật điểm và tính kết quả qua môn thành công');
  } catch (error) {
    console.error('Error updating grades:', error);
    if (error.status) return errorResponse(res, error.message, error.status);
    return errorResponse(res, 'Lỗi cập nhật bảng điểm', 500);
  }
});

// UC8.4: Học viên xem bảng điểm cá nhân và tính GPA
router.get('/students/my-grades', authenticateJWT, async (req, res) => {
  try {
    const studentId = req.user.id;

    const enrollments = (await Enrollment.find({ studentId })
      .populate([{ path: 'class', populate: ['course', { path: 'teacher', select: 'fullName' }] }, 'grade']))
      .map(plain)
      .filter(e => e.class)
      .sort((a, b) => String(b.class.semester).localeCompare(String(a.class.semester)));

    const grades = enrollments.map(e => ({
      enrollmentId: e.id,
      classCode: e.class.classCode,
      courseCode: e.class.course?.courseCode,
      courseName: e.class.course?.name,
      credits: e.class.course?.credits || 0,
      semester: e.class.semester,
      teacherName: e.class.teacher?.fullName || 'Chưa phân công',
      grade: e.grade ? {
        attendanceScore: num(e.grade.attendanceScore),
        midtermScore: num(e.grade.midtermScore),
        finalScore: num(e.grade.finalScore),
        totalScore: num(e.grade.totalScore),
        isPassed: e.grade.isPassed,
        isBanned: e.grade.isBanned
      } : null
    }));

    // Tính điểm trung bình tích lũy (GPA thang 10)
    const validGrades = grades.filter(g => g.grade && g.grade.totalScore !== null);
    const totalCredits = validGrades.reduce((sum, g) => sum + g.credits, 0);
    const weightedTotal = validGrades.reduce((sum, g) => sum + (g.grade.totalScore * g.credits), 0);
    const gpa = totalCredits > 0 ? (weightedTotal / totalCredits).toFixed(2) : '0.00';

    return successResponse(
      res,
      {
        gpa: parseFloat(gpa),
        totalCredits,
        totalCourses: enrollments.length,
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
// 2. TUITION MANAGEMENT (UC9.1 - UC9.4*, UC10.2, UC11.1b*)
// Toàn bộ API của Kế toán (Người 3) được tách sang tuition.routes.js
// ==========================================
router.use(require('./tuition.routes'));

module.exports = router;
module.exports.calculateGrade = calculateGrade;
