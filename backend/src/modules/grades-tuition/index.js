const express = require('express');
const router = express.Router();
const authenticateJWT = require('../../middlewares/auth.middleware');
const authorizeRoles = require('../../middlewares/role.middleware');
const prisma = require('../../config/prisma');
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

// ==========================================
// 1. EXAM & GRADE MANAGEMENT (UC8.1 - UC8.4)
// ==========================================

// UC8.1: Lấy bảng điểm đầy đủ của lớp học phần
router.get('/classes/:id/grades', authenticateJWT, authorizeRoles('ADMIN', 'TEACHER'), async (req, res) => {
  try {
    const classId = parseInt(req.params.id);

    const classInfo = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        course: true,
        enrollments: {
          where: { status: 'ACTIVE' },
          include: {
            student: {
              select: { id: true, code: true, fullName: true, email: true }
            },
            grade: true
          },
          orderBy: { student: { code: 'asc' } }
        }
      }
    });

    if (!classInfo) {
      return errorResponse(res, 'Không tìm thấy lớp học phần', 404);
    }

    const grades = classInfo.enrollments.map(e => ({
      enrollmentId: e.id,
      studentId: e.student.id,
      studentCode: e.student.code,
      studentName: e.student.fullName,
      studentEmail: e.student.email,
      attendanceScore: e.grade?.attendanceScore !== null && e.grade?.attendanceScore !== undefined ? Number(e.grade.attendanceScore) : null,
      midtermScore: e.grade?.midtermScore !== null && e.grade?.midtermScore !== undefined ? Number(e.grade.midtermScore) : null,
      finalScore: e.grade?.finalScore !== null && e.grade?.finalScore !== undefined ? Number(e.grade.finalScore) : null,
      totalScore: e.grade?.totalScore !== null && e.grade?.totalScore !== undefined ? Number(e.grade.totalScore) : null,
      isPassed: e.grade?.isPassed || false,
      isBanned: e.grade?.isBanned || false
    }));

    return successResponse(
      res,
      {
        classId: classInfo.id,
        classCode: classInfo.classCode,
        courseName: classInfo.course.name,
        courseCode: classInfo.course.courseCode,
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

    const updatedResults = [];

    await prisma.$transaction(async (tx) => {
      for (const item of gradesList) {
        const enrollmentId = parseInt(item.enrollmentId);

        // Lấy grade hiện tại để giữ trạng thái isBanned nếu có
        const currentGrade = await tx.grade.findUnique({
          where: { enrollmentId }
        });

        const isBanned = item.isBanned !== undefined ? !!item.isBanned : (currentGrade?.isBanned || false);
        const att = item.attendanceScore !== undefined && item.attendanceScore !== null && item.attendanceScore !== '' ? parseFloat(item.attendanceScore) : null;
        const mid = item.midtermScore !== undefined && item.midtermScore !== null && item.midtermScore !== '' ? parseFloat(item.midtermScore) : null;
        const fin = item.finalScore !== undefined && item.finalScore !== null && item.finalScore !== '' ? parseFloat(item.finalScore) : null;

        const { totalScore, isPassed } = calculateGrade(att, mid, fin, isBanned);

        const updated = await tx.grade.upsert({
          where: { enrollmentId },
          create: {
            enrollmentId,
            attendanceScore: att,
            midtermScore: mid,
            finalScore: fin,
            totalScore,
            isPassed,
            isBanned
          },
          update: {
            attendanceScore: att,
            midtermScore: mid,
            finalScore: fin,
            totalScore,
            isPassed,
            isBanned
          }
        });

        updatedResults.push(updated);
      }
    });

    return successResponse(res, updatedResults, 'Cập nhật điểm và tính kết quả qua môn thành công');
  } catch (error) {
    console.error('Error updating grades:', error);
    return errorResponse(res, 'Lỗi cập nhật bảng điểm', 500);
  }
});

// UC8.4: Học viên xem bảng điểm cá nhân & GPA -> chuyển sang module student (GET /students/my-grades)

// ==========================================
// 2. TUITION MANAGEMENT (UC9.1 - UC9.4*, UC10.2, UC11.1b*)
// Toàn bộ API của Kế toán (Người 3) được tách sang tuition.routes.js
// ==========================================
router.use(require('./tuition.routes'));

module.exports = router;
