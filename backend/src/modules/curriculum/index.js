const express = require('express');
const router = express.Router();
const authenticateJWT = require('../../middlewares/auth.middleware');
const authorizeRoles = require('../../middlewares/role.middleware');
const prisma = require('../../config/prisma');
const { successResponse, errorResponse } = require('../../utils/formatResponse');
const { SE_CURRICULUM, calculateStudentTerm, checkPrerequisites } = require('./curriculumData');

/**
 * Helper: Lấy lịch sử học tập & điểm số của 1 học viên
 */
async function getStudentAcademicHistory(studentId) {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: parseInt(studentId) },
    include: {
      class: {
        include: {
          course: true,
          schedules: true
        }
      },
      grade: true
    },
    orderBy: { enrolledAt: 'desc' }
  });

  // Map theo courseCode
  const passedCoursesMap = new Map();
  const studyingCoursesMap = new Map();
  const failedCoursesMap = new Map();

  let totalPassedCredits = 0;

  for (const enr of enrollments) {
    const courseCode = enr.class.course?.courseCode?.toUpperCase();
    if (!courseCode) continue;

    const grade = enr.grade;
    const isClassOngoing = enr.class.status === 'ONGOING' || enr.class.status === 'UPCOMING';

    if (grade && grade.isPassed) {
      if (!passedCoursesMap.has(courseCode)) {
        passedCoursesMap.set(courseCode, {
          courseCode,
          courseName: enr.class.course.name,
          credits: enr.class.course.credits,
          classCode: enr.class.classCode,
          semester: enr.class.semester,
          totalScore: grade.totalScore ? Number(grade.totalScore) : null
        });
        totalPassedCredits += enr.class.course.credits;
      }
    } else if (isClassOngoing && (!grade || grade.totalScore === null)) {
      if (!studyingCoursesMap.has(courseCode)) {
        studyingCoursesMap.set(courseCode, {
          courseCode,
          classCode: enr.class.classCode,
          semester: enr.class.semester
        });
      }
    } else if (grade && grade.totalScore !== null && !grade.isPassed) {
      if (!failedCoursesMap.has(courseCode)) {
        failedCoursesMap.set(courseCode, {
          courseCode,
          classCode: enr.class.classCode,
          semester: enr.class.semester,
          totalScore: grade.totalScore ? Number(grade.totalScore) : null,
          isBanned: grade.isBanned
        });
      }
    }
  }

  const passedCodes = Array.from(passedCoursesMap.keys());
  const currentTerm = calculateStudentTerm(totalPassedCredits);

  return {
    studentId,
    passedCoursesMap,
    studyingCoursesMap,
    failedCoursesMap,
    passedCodes,
    totalPassedCredits,
    currentTerm,
    rawEnrollments: enrollments
  };
}

/**
 * Helper: Tạo tiến độ Khung chương trình cho 1 học viên
 */
function buildCurriculumProgress(history) {
  const { passedCoursesMap, studyingCoursesMap, failedCoursesMap, passedCodes, totalPassedCredits, currentTerm } = history;

  const totalProgramCredits = SE_CURRICULUM.reduce((sum, c) => sum + c.credits, 0);

  const coursesWithStatus = SE_CURRICULUM.map(c => {
    const code = c.courseCode.toUpperCase();
    let status = 'LOCKED'; // Mặc định chưa đủ điều kiện
    let details = null;
    let missingPrerequisites = [];

    if (passedCoursesMap.has(code)) {
      status = 'PASSED';
      details = passedCoursesMap.get(code);
    } else if (studyingCoursesMap.has(code)) {
      status = 'STUDYING';
      details = studyingCoursesMap.get(code);
    } else if (failedCoursesMap.has(code)) {
      status = 'FAILED';
      details = failedCoursesMap.get(code);
    } else {
      // Kiểm tra môn tiên quyết
      const check = checkPrerequisites(code, passedCodes);
      if (check.isEligible) {
        status = 'ELIGIBLE'; // Đủ điều kiện đăng ký kỳ tới
      } else {
        status = 'LOCKED'; // Chưa đủ điều kiện
        missingPrerequisites = check.missingPrerequisites;
      }
    }

    return {
      ...c,
      status,
      details,
      missingPrerequisites
    };
  });

  // Gom theo từng học kỳ
  const termsMap = new Map();
  for (let t = 1; t <= 9; t++) {
    termsMap.set(t, {
      term: t,
      title: `Học kỳ ${t} (Term ${t})`,
      courses: [],
      termCredits: 0,
      passedCredits: 0
    });
  }

  for (const item of coursesWithStatus) {
    const termObj = termsMap.get(item.term) || {
      term: item.term,
      title: `Học kỳ ${item.term}`,
      courses: [],
      termCredits: 0,
      passedCredits: 0
    };
    termObj.courses.push(item);
    termObj.termCredits += item.credits;
    if (item.status === 'PASSED') {
      termObj.passedCredits += item.credits;
    }
  }

  return {
    major: 'Kỹ thuật phần mềm (Software Engineering - SE)',
    totalProgramCredits,
    accumulatedCredits: totalPassedCredits,
    completionRate: Number(((totalPassedCredits / totalProgramCredits) * 100).toFixed(1)),
    currentTerm,
    terms: Array.from(termsMap.values()),
    allCourses: coursesWithStatus
  };
}

// =========================================================================
// 1. GET /curriculum - Khung chương trình chuẩn (Public / All Roles)
// =========================================================================
router.get('/curriculum', authenticateJWT, (req, res) => {
  const termsMap = new Map();
  for (let t = 1; t <= 9; t++) {
    termsMap.set(t, {
      term: t,
      title: `Học kỳ ${t} (Term ${t})`,
      courses: [],
      termCredits: 0
    });
  }

  for (const item of SE_CURRICULUM) {
    const termObj = termsMap.get(item.term);
    if (termObj) {
      termObj.courses.push(item);
      termObj.termCredits += item.credits;
    }
  }

  return successResponse(
    res,
    {
      major: 'Kỹ thuật phần mềm (Software Engineering - SE)',
      totalCredits: SE_CURRICULUM.reduce((sum, c) => sum + c.credits, 0),
      totalTerms: 9,
      terms: Array.from(termsMap.values())
    },
    'Lấy khung chương trình đào tạo thành công'
  );
});

// =========================================================================
// 2. GET /curriculum/my-progress - Tiến độ khung chương trình của chính học viên (STUDENT)
// =========================================================================
router.get('/curriculum/my-progress', authenticateJWT, authorizeRoles('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const history = await getStudentAcademicHistory(studentId);
    const progress = buildCurriculumProgress(history);

    const studentInfo = await prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        code: true,
        fullName: true,
        email: true,
        studentProfile: true
      }
    });

    return successResponse(
      res,
      {
        student: {
          id: studentInfo.id,
          code: studentInfo.code,
          fullName: studentInfo.fullName,
          email: studentInfo.email,
          enrollmentYear: studentInfo.studentProfile?.enrollmentYear || 2024,
          cohort: `K${(studentInfo.studentProfile?.enrollmentYear || 2024) - 2006}` // K18, K19, K20...
        },
        ...progress
      },
      'Lấy tiến độ khung chương trình học viên thành công'
    );
  } catch (error) {
    console.error('Error fetching student curriculum progress:', error);
    return errorResponse(res, 'Lỗi lấy tiến độ khung chương trình', 500);
  }
});

// =========================================================================
// 3. GET /curriculum/student/:studentId - Xem tiến độ của 1 học viên (ADMIN / ACADEMIC STAFF)
// =========================================================================
router.get('/curriculum/student/:studentId', authenticateJWT, authorizeRoles('ADMIN', 'TEACHER'), async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const studentInfo = await prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        code: true,
        fullName: true,
        email: true,
        role: true,
        studentProfile: true
      }
    });

    if (!studentInfo || studentInfo.role !== 'STUDENT') {
      return errorResponse(res, 'Không tìm thấy học viên', 404);
    }

    const history = await getStudentAcademicHistory(studentId);
    const progress = buildCurriculumProgress(history);

    return successResponse(
      res,
      {
        student: {
          id: studentInfo.id,
          code: studentInfo.code,
          fullName: studentInfo.fullName,
          email: studentInfo.email,
          enrollmentYear: studentInfo.studentProfile?.enrollmentYear || 2024,
          cohort: `K${(studentInfo.studentProfile?.enrollmentYear || 2024) - 2006}`
        },
        ...progress
      },
      'Lấy tiến độ khung chương trình của học viên thành công'
    );
  } catch (error) {
    console.error('Error fetching student curriculum progress:', error);
    return errorResponse(res, 'Lỗi lấy tiến độ khung chương trình của học viên', 500);
  }
});

// =========================================================================
// 4. GET /curriculum/eligible-students/:classId - Phân loại học viên đủ/không đủ điều kiện vào lớp (ACADEMIC STAFF)
// =========================================================================
router.get('/curriculum/eligible-students/:classId', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const classId = parseInt(req.params.classId);

    const targetClass = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        course: true,
        schedules: true,
        enrollments: {
          select: { studentId: true }
        }
      }
    });

    if (!targetClass) {
      return errorResponse(res, 'Không tìm thấy lớp học phần', 404);
    }

    const courseCode = targetClass.course.courseCode.toUpperCase();
    const enrolledStudentIds = new Set(targetClass.enrollments.map(e => e.studentId));

    // Lấy thông tin môn học trong khung chương trình để biết điều kiện tiên quyết
    const curriculumCourse = SE_CURRICULUM.find(c => c.courseCode.toUpperCase() === courseCode) || {
      courseCode,
      name: targetClass.course.name,
      prerequisites: []
    };

    // Lấy tất cả sinh viên ACTIVE
    const allStudents = await prisma.user.findMany({
      where: { role: 'STUDENT', status: 'ACTIVE' },
      include: {
        studentProfile: true,
        enrollments: {
          where: { status: 'ACTIVE' },
          include: {
            class: {
              include: { course: true, schedules: true }
            },
            grade: true
          }
        }
      },
      orderBy: { code: 'asc' }
    });

    const eligibleStudents = [];
    const ineligibleStudents = [];

    for (const student of allStudents) {
      // 1. Kiểm tra nếu đã có trong lớp này rồi
      if (enrolledStudentIds.has(student.id)) {
        continue; // Đã trong lớp, bỏ qua không liệt kê vào danh sách chờ xếp
      }

      const reasons = [];
      let isEligible = true;

      // Danh sách môn sinh viên đã PASS
      const passedCourseCodes = [];
      let totalPassedCredits = 0;
      let alreadyPassedThisCourse = false;
      let alreadyEnrolledThisCourseInSemester = false;
      let hasScheduleConflict = false;
      let conflictScheduleInfo = null;

      for (const enr of student.enrollments) {
        const enrCourseCode = enr.class.course?.courseCode?.toUpperCase();
        if (enr.grade && enr.grade.isPassed) {
          passedCourseCodes.push(enrCourseCode);
          totalPassedCredits += enr.class.course?.credits || 3;
          if (enrCourseCode === courseCode) {
            alreadyPassedThisCourse = true;
          }
        }

        // Kiểm tra đang học môn này ở lớp khác trong cùng kỳ
        if (enr.class.semester === targetClass.semester && enrCourseCode === courseCode && enr.class.id !== classId) {
          alreadyEnrolledThisCourseInSemester = true;
        }

        // Kiểm tra trùng lịch học trong cùng kỳ
        if (enr.class.semester === targetClass.semester && targetClass.schedules && targetClass.schedules.length > 0) {
          for (const targetSched of targetClass.schedules) {
            for (const existSched of enr.class.schedules) {
              if (existSched.dayOfWeek === targetSched.dayOfWeek && existSched.shift === targetSched.shift) {
                hasScheduleConflict = true;
                conflictScheduleInfo = `Lớp ${enr.class.classCode} (Thứ ${targetSched.dayOfWeek}, Slot ${targetSched.shift})`;
              }
            }
          }
        }
      }

      // Kiểm tra 1: Đã pass môn này chưa?
      if (alreadyPassedThisCourse) {
        isEligible = false;
        reasons.push(`Đã hoàn thành môn ${courseCode} trước đó (Đã qua môn)`);
      }

      // Kiểm tra 2: Đang học môn này ở lớp khác trong cùng kỳ
      if (alreadyEnrolledThisCourseInSemester) {
        isEligible = false;
        reasons.push(`Đã đăng ký môn ${courseCode} ở lớp khác trong học kỳ ${targetClass.semester}`);
      }

      // Kiểm tra 3: Trùng lịch học
      if (hasScheduleConflict) {
        isEligible = false;
        reasons.push(`Trùng lịch học với ${conflictScheduleInfo}`);
      }

      // Kiểm tra 4: Điều kiện tiên quyết (Prerequisite Check)
      const prereqCheck = checkPrerequisites(courseCode, passedCourseCodes);
      if (!prereqCheck.isEligible) {
        isEligible = false;
        reasons.push(`Chưa hoàn thành môn tiên quyết: ${prereqCheck.missingPrerequisites.join(', ')}`);
      }

      const studentSummary = {
        id: student.id,
        code: student.code,
        fullName: student.fullName,
        email: student.email,
        phone: student.phone,
        enrollmentYear: student.studentProfile?.enrollmentYear || 2024,
        cohort: `K${(student.studentProfile?.enrollmentYear || 2024) - 2006}`,
        passedCredits: totalPassedCredits,
        calculatedTerm: calculateStudentTerm(totalPassedCredits)
      };

      if (isEligible) {
        eligibleStudents.push({
          ...studentSummary,
          isEligible: true
        });
      } else {
        ineligibleStudents.push({
          ...studentSummary,
          isEligible: false,
          reasons
        });
      }
    }

    return successResponse(
      res,
      {
        targetClass: {
          id: targetClass.id,
          classCode: targetClass.classCode,
          semester: targetClass.semester,
          maxStudents: targetClass.maxStudents,
          currentStudents: targetClass.enrollments.length,
          availableSlots: Math.max(0, targetClass.maxStudents - targetClass.enrollments.length),
          course: {
            id: targetClass.course.id,
            courseCode: targetClass.course.courseCode,
            name: targetClass.course.name,
            credits: targetClass.course.credits,
            prerequisites: curriculumCourse.prerequisites
          }
        },
        eligibleStudents,
        ineligibleStudents,
        summary: {
          totalEligible: eligibleStudents.length,
          totalIneligible: ineligibleStudents.length,
          availableSlots: Math.max(0, targetClass.maxStudents - targetClass.enrollments.length)
        }
      },
      'Phân tích điều kiện xếp lớp học viên thành công'
    );
  } catch (error) {
    console.error('Error analyzing eligible students for class:', error);
    return errorResponse(res, 'Lỗi phân tích điều kiện xếp lớp', 500);
  }
});

// =========================================================================
// 5. POST /curriculum/batch-enroll/:classId - Xếp nhanh hàng loạt sinh viên đủ điều kiện
// =========================================================================
router.post('/curriculum/batch-enroll/:classId', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const classId = parseInt(req.params.classId);
    const { studentIds } = req.body; // Mảng các ID sinh viên cần ghi danh

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return errorResponse(res, 'Vui lòng cung cấp danh sách ID sinh viên cần xếp vào lớp', 400);
    }

    const targetClass = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        course: true,
        enrollments: true,
        schedules: true
      }
    });

    if (!targetClass) {
      return errorResponse(res, 'Không tìm thấy lớp học phần', 404);
    }

    const availableSlots = targetClass.maxStudents - targetClass.enrollments.length;
    if (availableSlots <= 0) {
      return errorResponse(res, `Lớp đã đủ sĩ số tối đa (${targetClass.maxStudents} sinh viên).`, 400);
    }

    const toEnroll = studentIds.slice(0, availableSlots);
    const enrolled = [];
    const errors = [];

    const tuitionFee = targetClass.course?.baseTuitionFee || 5000000;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    for (const sid of toEnroll) {
      try {
        await prisma.$transaction(async (tx) => {
          // 1. Tạo Enrollment
          const enrollment = await tx.enrollment.create({
            data: {
              classId,
              studentId: parseInt(sid),
              status: 'ACTIVE'
            }
          });

          // 2. Tạo Grade trống
          await tx.grade.create({
            data: {
              enrollmentId: enrollment.id,
              attendanceScore: null,
              midtermScore: null,
              finalScore: null,
              totalScore: null,
              isPassed: false,
              isBanned: false
            }
          });

          // 3. Tạo TuitionInvoice
          await tx.tuitionInvoice.create({
            data: {
              studentId: parseInt(sid),
              enrollmentId: enrollment.id,
              amount: tuitionFee,
              paidAmount: 0,
              dueDate,
              status: 'UNPAID'
            }
          });

          enrolled.push(sid);
        });
      } catch (err) {
        errors.push({ studentId: sid, message: err.message });
      }
    }

    return successResponse(
      res,
      {
        enrolledCount: enrolled.length,
        requestedCount: studentIds.length,
        classCode: targetClass.classCode,
        errors
      },
      `Đã xếp thành công ${enrolled.length} sinh viên vào lớp ${targetClass.classCode}`
    );
  } catch (error) {
    console.error('Error batch enrolling students:', error);
    return errorResponse(res, 'Lỗi khi xếp lớp hàng loạt', 500);
  }
});

module.exports = router;

