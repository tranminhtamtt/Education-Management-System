const express = require('express');
const router = express.Router();
const authenticateJWT = require('../../middlewares/auth.middleware');
const authorizeRoles = require('../../middlewares/role.middleware');
const { User, Class, Enrollment } = require('../../models');
const { plain } = require('../../utils/query');
const { successResponse, errorResponse } = require('../../utils/formatResponse');
const { SE_CURRICULUM, TOTAL_TERMS, checkPrerequisites, summarizeEnrollments, findCurriculumCourse } = require('./curriculumData');
const { enrollStudent, loadStudentEnrollments } = require('./enrollmentPolicy');

const MAJOR = 'Kỹ thuật phần mềm (Software Engineering - SE)';
const cohortOf = year => `K${(year || 2024) - 2006}`; // K18, K19, K20...

/**
 * Helper: Lấy lịch sử học tập & điểm số của 1 học viên
 */
async function getStudentAcademicHistory(studentId) {
  const enrollments = (await loadStudentEnrollments(parseInt(studentId)))
    .sort((a, b) => new Date(b.enrolledAt) - new Date(a.enrolledAt));

  // Map theo courseCode (ưu tiên lượt học mới nhất)
  const passedCoursesMap = new Map();
  const studyingCoursesMap = new Map();
  const failedCoursesMap = new Map();

  for (const enr of enrollments) {
    const courseCode = enr.class?.course?.courseCode?.toUpperCase();
    const curriculumCourse = findCurriculumCourse(courseCode);
    if (!curriculumCourse) continue;

    const grade = enr.grade;
    const hasTotal = grade && grade.totalScore !== null && grade.totalScore !== undefined;

    if (grade && grade.isPassed) {
      if (!passedCoursesMap.has(courseCode)) {
        passedCoursesMap.set(courseCode, {
          courseCode,
          courseName: enr.class.course.name,
          credits: curriculumCourse.credits,
          classCode: enr.class.classCode,
          semester: enr.class.semester,
          totalScore: hasTotal ? Number(grade.totalScore) : null
        });
      }
    } else if (!hasTotal && enr.class.status !== 'COMPLETED') {
      if (!studyingCoursesMap.has(courseCode)) {
        studyingCoursesMap.set(courseCode, {
          courseCode,
          classCode: enr.class.classCode,
          semester: enr.class.semester
        });
      }
    } else if (!failedCoursesMap.has(courseCode)) {
      failedCoursesMap.set(courseCode, {
        courseCode,
        classCode: enr.class.classCode,
        semester: enr.class.semester,
        totalScore: hasTotal ? Number(grade.totalScore) : null,
        isBanned: !!grade?.isBanned
      });
    }
  }

  const summary = summarizeEnrollments(enrollments);

  return {
    studentId,
    passedCoursesMap,
    studyingCoursesMap,
    failedCoursesMap,
    passedCodes: summary.passedCodes,
    totalPassedCredits: summary.passedCredits,
    currentTerm: summary.currentTerm,
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
      status = 'FAILED'; // cần học lại
      details = failedCoursesMap.get(code);
    } else {
      // Kiểm tra môn tiên quyết + không vượt kỳ hiện tại
      const check = checkPrerequisites(code, passedCodes);
      if (check.isEligible && c.term <= currentTerm) {
        status = 'ELIGIBLE'; // Đủ điều kiện đăng ký
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
  for (let t = 1; t <= TOTAL_TERMS; t++) {
    termsMap.set(t, {
      term: t,
      title: `Học kỳ ${t} (Term ${t})`,
      courses: [],
      termCredits: 0,
      passedCredits: 0
    });
  }

  for (const item of coursesWithStatus) {
    const termObj = termsMap.get(item.term);
    termObj.courses.push(item);
    termObj.termCredits += item.credits;
    if (item.status === 'PASSED') {
      termObj.passedCredits += item.credits;
    }
  }

  for (const t of termsMap.values()) {
    t.status = t.passedCredits === t.termCredits ? 'COMPLETED' : t.term === currentTerm ? 'CURRENT' : t.term < currentTerm ? 'HAS_DEBT' : 'UPCOMING';
  }

  return {
    major: MAJOR,
    totalProgramCredits,
    accumulatedCredits: totalPassedCredits,
    completionRate: Number(((totalPassedCredits / totalProgramCredits) * 100).toFixed(1)),
    currentTerm,
    retakeCourses: coursesWithStatus.filter(c => c.status === 'FAILED').map(c => c.courseCode),
    terms: Array.from(termsMap.values()),
    allCourses: coursesWithStatus
  };
}

const studentHeader = s => ({
  id: s.id,
  code: s.code,
  fullName: s.fullName,
  email: s.email,
  enrollmentYear: s.studentProfile?.enrollmentYear || 2024,
  cohort: cohortOf(s.studentProfile?.enrollmentYear)
});

// =========================================================================
// 1. GET /curriculum - Khung chương trình chuẩn (Public / All Roles)
// =========================================================================
router.get('/curriculum', authenticateJWT, (req, res) => {
  const termsMap = new Map();
  for (let t = 1; t <= TOTAL_TERMS; t++) {
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
      major: MAJOR,
      totalCredits: SE_CURRICULUM.reduce((sum, c) => sum + c.credits, 0),
      totalTerms: TOTAL_TERMS,
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
    const studentInfo = await User.findOne({ id: studentId });
    if (!studentInfo) return errorResponse(res, 'Không tìm thấy học viên', 404);
    const history = await getStudentAcademicHistory(studentId);
    const progress = buildCurriculumProgress(history);

    return successResponse(
      res,
      { student: studentHeader(plain(studentInfo)), ...progress },
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
    const studentInfo = await User.findOne({ id: studentId });

    if (!studentInfo || studentInfo.role !== 'STUDENT') {
      return errorResponse(res, 'Không tìm thấy học viên', 404);
    }

    const history = await getStudentAcademicHistory(studentId);
    const progress = buildCurriculumProgress(history);

    return successResponse(
      res,
      { student: studentHeader(plain(studentInfo)), ...progress },
      'Lấy tiến độ khung chương trình của học viên thành công'
    );
  } catch (error) {
    console.error('Error fetching student curriculum progress:', error);
    return errorResponse(res, 'Lỗi lấy tiến độ khung chương trình của học viên', 500);
  }
});

// =========================================================================
// 3b. GET /curriculum/term-overview - Thống kê sinh viên theo kỳ khung (ADMIN / ACADEMIC STAFF)
// =========================================================================
router.get('/curriculum/term-overview', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const students = (await User.find({ role: 'STUDENT', status: 'ACTIVE' }).sort({ code: 1 })).map(plain);
    const enrollments = (await Enrollment.find({ studentId: { $in: students.map(s => s.id) }, status: 'ACTIVE' })
      .populate([{ path: 'class', populate: 'course' }, 'grade'])).map(plain);
    const byStudent = new Map();
    for (const e of enrollments) {
      if (!byStudent.has(e.studentId)) byStudent.set(e.studentId, []);
      byStudent.get(e.studentId).push(e);
    }
    const terms = Array.from({ length: TOTAL_TERMS }, (_, i) => ({ term: i + 1, studentCount: 0, students: [] }));
    for (const s of students) {
      const summary = summarizeEnrollments(byStudent.get(s.id) || []);
      const retakes = summary.finishedCodes.filter(c => !summary.passedCodes.includes(c));
      terms[summary.currentTerm - 1].studentCount += 1;
      terms[summary.currentTerm - 1].students.push({ ...studentHeader(s), passedCredits: summary.passedCredits, studying: summary.inProgressCodes, retakeCourses: retakes });
    }
    return successResponse(res, { totalStudents: students.length, terms }, 'Lấy thống kê sinh viên theo kỳ thành công');
  } catch (error) {
    console.error('Error building term overview:', error);
    return errorResponse(res, 'Lỗi thống kê sinh viên theo kỳ', 500);
  }
});

// =========================================================================
// 4. GET /curriculum/eligible-students/:classId - Phân loại học viên đủ/không đủ điều kiện vào lớp (ACADEMIC STAFF)
// =========================================================================
router.get('/curriculum/eligible-students/:classId', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const classId = parseInt(req.params.classId);

    const targetDoc = await Class.findOne({ id: classId }).populate(['course', 'schedules']);
    if (!targetDoc) {
      return errorResponse(res, 'Không tìm thấy lớp học phần', 404);
    }
    const targetClass = plain(targetDoc);
    const classEnrollments = await Enrollment.find({ classId, status: 'ACTIVE' }).select('studentId');

    const courseCode = targetClass.course.courseCode.toUpperCase();
    const enrolledStudentIds = new Set(classEnrollments.map(e => e.studentId));
    const currentStudents = classEnrollments.length;

    // Lấy thông tin môn học trong khung chương trình để biết điều kiện tiên quyết
    const curriculumCourse = findCurriculumCourse(courseCode) || {
      courseCode,
      name: targetClass.course.name,
      prerequisites: []
    };

    // Lấy tất cả sinh viên ACTIVE + lịch sử ghi danh
    const allStudents = (await User.find({ role: 'STUDENT', status: 'ACTIVE' }).sort({ code: 1 })).map(plain);
    const allEnrollments = (await Enrollment.find({ studentId: { $in: allStudents.map(s => s.id) }, status: 'ACTIVE' })
      .populate([{ path: 'class', populate: ['course', 'schedules'] }, 'grade'])).map(plain);
    const enrollmentsByStudent = new Map();
    for (const e of allEnrollments) {
      if (!enrollmentsByStudent.has(e.studentId)) enrollmentsByStudent.set(e.studentId, []);
      enrollmentsByStudent.get(e.studentId).push(e);
    }

    const eligibleStudents = [];
    const ineligibleStudents = [];

    for (const student of allStudents) {
      // 1. Kiểm tra nếu đã có trong lớp này rồi
      if (enrolledStudentIds.has(student.id)) {
        continue; // Đã trong lớp, bỏ qua không liệt kê vào danh sách chờ xếp
      }

      const enrollments = enrollmentsByStudent.get(student.id) || [];
      const summary = summarizeEnrollments(enrollments);
      const reasons = [];
      let isEligible = true;
      if (targetClass.status === 'COMPLETED' || currentStudents >= targetClass.maxStudents) {
        isEligible = false;
        reasons.push('Lớp đã kết thúc hoặc đã đủ sĩ số');
      }

      let alreadyStudyingThisCourse = null;
      let conflictScheduleInfo = null;

      for (const enr of enrollments) {
        const enrCourseCode = enr.class?.course?.courseCode?.toUpperCase();
        if (!enrCourseCode) continue;
        const hasResult = enr.grade?.isPassed || (enr.grade?.totalScore !== null && enr.grade?.totalScore !== undefined) || enr.class.status === 'COMPLETED';

        // Đang học môn này ở lớp khác (bất kỳ kỳ nào) và chưa có kết quả
        if (enrCourseCode === courseCode && enr.class.id !== classId && !hasResult) {
          alreadyStudyingThisCourse = `${enr.class.classCode} (${enr.class.semester})`;
        }

        // Kiểm tra trùng lịch học trong cùng kỳ
        if (enr.class.semester === targetClass.semester && enr.class.status !== 'COMPLETED' && (targetClass.schedules || []).length > 0) {
          for (const targetSched of targetClass.schedules) {
            for (const existSched of enr.class.schedules || []) {
              if (existSched.dayOfWeek === targetSched.dayOfWeek && existSched.shift === targetSched.shift) {
                conflictScheduleInfo = `Lớp ${enr.class.classCode} (Thứ ${targetSched.dayOfWeek}, Slot ${targetSched.shift})`;
              }
            }
          }
        }
      }

      // Kiểm tra 1: Đã pass môn này chưa?
      if (summary.passedCodes.includes(courseCode)) {
        isEligible = false;
        reasons.push(`Đã hoàn thành môn ${courseCode} trước đó (Đã qua môn)`);
      }

      // Kiểm tra 2: Đang học môn này ở lớp khác
      if (alreadyStudyingThisCourse) {
        isEligible = false;
        reasons.push(`Đang học môn ${courseCode} ở lớp ${alreadyStudyingThisCourse}`);
      }

      // Kiểm tra 3: Trùng lịch học
      if (conflictScheduleInfo) {
        isEligible = false;
        reasons.push(`Trùng lịch học với ${conflictScheduleInfo}`);
      }

      // Kiểm tra 4: Điều kiện tiên quyết (Prerequisite Check)
      const prereqCheck = checkPrerequisites(courseCode, summary.passedCodes);
      if (!prereqCheck.isEligible) {
        isEligible = false;
        reasons.push(`Chưa hoàn thành môn tiên quyết: ${prereqCheck.missingPrerequisites.join(', ')}`);
      }

      // Kiểm tra 5: Không vượt kỳ hiện tại trong khung
      if (curriculumCourse.term && curriculumCourse.term > summary.currentTerm) {
        isEligible = false;
        reasons.push(`Môn thuộc kỳ ${curriculumCourse.term}, vượt kỳ hiện tại (kỳ ${summary.currentTerm})`);
      }

      const studentSummary = {
        id: student.id,
        code: student.code,
        fullName: student.fullName,
        email: student.email,
        phone: student.phone,
        enrollmentYear: student.studentProfile?.enrollmentYear || 2024,
        cohort: cohortOf(student.studentProfile?.enrollmentYear),
        passedCredits: summary.passedCredits,
        calculatedTerm: summary.currentTerm,
        isRetake: summary.finishedCodes.includes(courseCode) && !summary.passedCodes.includes(courseCode)
      };

      if (isEligible) {
        eligibleStudents.push({ ...studentSummary, isEligible: true });
      } else {
        ineligibleStudents.push({ ...studentSummary, isEligible: false, reasons });
      }
    }

    const availableSlots = Math.max(0, targetClass.maxStudents - currentStudents);
    return successResponse(
      res,
      {
        targetClass: {
          id: targetClass.id,
          classCode: targetClass.classCode,
          semester: targetClass.semester,
          maxStudents: targetClass.maxStudents,
          currentStudents,
          availableSlots,
          course: {
            id: targetClass.course.id,
            courseCode: targetClass.course.courseCode,
            name: targetClass.course.name,
            credits: targetClass.course.credits,
            term: curriculumCourse.term || null,
            prerequisites: curriculumCourse.prerequisites
          }
        },
        eligibleStudents,
        ineligibleStudents,
        summary: {
          totalEligible: eligibleStudents.length,
          totalIneligible: ineligibleStudents.length,
          availableSlots
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
    if (!studentIds.every(s => Number.isSafeInteger(Number(s)) && Number(s) > 0)) return errorResponse(res, 'ID sinh viên không hợp lệ', 400);

    const targetClass = await Class.findOne({ id: classId });
    if (!targetClass) {
      return errorResponse(res, 'Không tìm thấy lớp học phần', 404);
    }

    const toEnroll = [...new Set(studentIds.map(Number))];
    const enrolled = [];
    const errors = [];

    // Mỗi sinh viên một transaction riêng: lỗi của một người không chặn người khác,
    // sĩ số được kiểm tra lại trong từng transaction (không cắt danh sách âm thầm).
    for (const sid of toEnroll) {
      try {
        await enrollStudent(classId, sid);
        enrolled.push(sid);
      } catch (err) {
        errors.push({ studentId: sid, message: err.code === 11000 ? 'Đã có trong lớp' : err.message });
      }
    }

    return successResponse(
      res,
      {
        enrolledCount: enrolled.length,
        requestedCount: toEnroll.length,
        classCode: targetClass.classCode,
        errors
      },
      `Đã xếp thành công ${enrolled.length}/${toEnroll.length} sinh viên vào lớp ${targetClass.classCode}` + (errors.length ? ` (${errors.length} sinh viên không đủ điều kiện)` : '')
    );
  } catch (error) {
    console.error('Error batch enrolling students:', error);
    return errorResponse(res, 'Lỗi khi xếp lớp hàng loạt', 500);
  }
});

module.exports = router;
module.exports.buildCurriculumProgress = buildCurriculumProgress;
