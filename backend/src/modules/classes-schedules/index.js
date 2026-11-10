const express = require('express');
const router = express.Router();
const authenticateJWT = require('../../middlewares/auth.middleware');
const authorizeRoles = require('../../middlewares/role.middleware');
const { withTransaction } = require('../../config/db');
const {
  Class, Course, User, Enrollment, Schedule, Grade, TuitionInvoice, Attendance,
  PaymentOrder, PaymentTransaction, TuitionPayment, Assignment, Submission
} = require('../../models');
const { plain } = require('../../utils/query');
const { successResponse, errorResponse } = require('../../utils/formatResponse');
const { enrollStudent } = require('../curriculum/enrollmentPolicy');
const { studyWeek } = require('../../utils/studyWeek');

// Khung giờ 6 Slot chuẩn FAP
const SLOT_HOURS = {
  1: { start: '07:30', end: '09:50' },
  2: { start: '10:00', end: '12:20' },
  3: { start: '12:50', end: '15:10' },
  4: { start: '15:20', end: '17:40' },
  5: { start: '18:00', end: '20:20' },
  6: { start: '20:30', end: '22:50' }
};

const TEACHER_FIELDS = 'id code fullName email';

// ==========================================
// 1. CLASSES MANAGEMENT (UC4.1 - UC4.2)
// ==========================================

// Teacher dashboard for all classes assigned to the current teacher.
router.get('/teacher/dashboard', authenticateJWT, authorizeRoles('TEACHER'), async (req, res) => {
  try {
    const classes = (await Class.find({ teacherId: req.user.id })
      .sort({ semester: -1, classCode: 1 })
      .populate(['course', 'schedules'])).map(plain);
    const classIds = classes.map(item => item.id);
    const enrollments = await Enrollment.find({ classId: { $in: classIds }, status: 'ACTIVE' })
      .populate({ path: 'student', select: 'id code fullName' });
    const attendance = await Attendance.find({
      classId: { $in: classIds },
      status: 'ABSENT_UNEXCUSED'
    });
    const assignments = await Assignment.find({ classId: { $in: classIds } }).select('id classId');
    const submissionCounts = await Submission.aggregate([
      { $match: { assignmentId: { $in: assignments.map(item => item.id) } } },
      { $group: { _id: null, count: { $sum: 1 } } }
    ]);

    const enrollmentCounts = new Map();
    enrollments.forEach(enrollment => {
      enrollmentCounts.set(enrollment.classId, (enrollmentCounts.get(enrollment.classId) || 0) + 1);
    });
    const assignmentCounts = new Map();
    assignments.forEach(assignment => {
      assignmentCounts.set(assignment.classId, (assignmentCounts.get(assignment.classId) || 0) + 1);
    });
    const absencesByStudent = new Map();
    attendance.forEach(record => {
      const key = `${record.classId}:${record.studentId}`;
      absencesByStudent.set(key, (absencesByStudent.get(key) || 0) + 1);
    });

    const attendanceWarnings = enrollments.flatMap(enrollment => {
      const classItem = classes.find(item => item.id === enrollment.classId);
      if (!classItem || !enrollment.student) return [];
      const totalSessions = classItem.course?.totalSessions || 30;
      const absentUnexcused = absencesByStudent.get(`${enrollment.classId}:${enrollment.studentId}`) || 0;
      const rawAbsentRate = (absentUnexcused / totalSessions) * 100;
      const absentRate = Number(rawAbsentRate.toFixed(1));
      if (rawAbsentRate <= 20) return [];
      return [{
        classId: enrollment.classId,
        classCode: classItem.classCode,
        courseCode: classItem.course?.courseCode,
        studentId: enrollment.student.id,
        code: enrollment.student.code,
        fullName: enrollment.student.fullName,
        absentUnexcused,
        totalSessions,
        absentRate
      }];
    }).sort((a, b) => b.absentRate - a.absentRate);

    const schedules = classes.flatMap(classItem => (classItem.schedules || []).map(schedule => ({
      id: schedule.id,
      classId: classItem.id,
      classCode: classItem.classCode,
      courseCode: classItem.course?.courseCode,
      courseName: classItem.course?.name,
      semester: classItem.semester,
      dayOfWeek: schedule.dayOfWeek,
      shift: schedule.shift,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      room: schedule.room
    }))).sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.shift - b.shift);

    const classData = classes.map(classItem => ({
      id: classItem.id,
      classCode: classItem.classCode,
      courseCode: classItem.course?.courseCode,
      courseName: classItem.course?.name,
      semester: classItem.semester,
      status: classItem.status,
      studentCount: enrollmentCounts.get(classItem.id) || 0,
      assignmentCount: assignmentCounts.get(classItem.id) || 0
    }));

    return successResponse(res, {
      classes: classData,
      schedules,
      attendanceWarnings,
      summary: {
        classCount: classData.length,
        weeklySessionCount: schedules.length,
        assignmentCount: assignments.length,
        submissionCount: submissionCounts[0]?.count || 0,
        warningCount: attendanceWarnings.length
      }
    }, 'Lấy Teacher Dashboard thành công');
  } catch (error) {
    console.error('Error fetching teacher dashboard:', error);
    return errorResponse(res, 'Lỗi lấy Teacher Dashboard', 500);
  }
});

// UC4.1: Danh sách lớp học phần
router.get('/classes', authenticateJWT, async (req, res) => {
  try {
    const { semester, courseId, teacherId, status } = req.query;
    const role = req.user.role;
    const userId = req.user.id;

    const where = {
      ...(semester ? { semester: String(semester) } : {}),
      ...(courseId ? { courseId: parseInt(courseId) } : {}),
      ...(req.user.role === 'TEACHER' ? { teacherId: req.user.id } : (teacherId ? { teacherId: parseInt(teacherId) } : {})),
      ...(status ? { status: String(status) } : {})
    };

    if (role === 'STUDENT') {
      const enrolled = await Enrollment.find({ studentId: userId, status: 'ACTIVE' }).select('classId');
      where.id = { $in: enrolled.map(e => e.classId) };
      if (!status) {
        where.status = 'ONGOING';
      }
    } else if (role === 'TEACHER' && !teacherId) {
      where.teacherId = userId;
    }

    const classes = (await Class.find(where)
      .sort({ createdAt: -1, id: -1 })
      .populate(['course', { path: 'teacher', select: TEACHER_FIELDS }, 'schedules'])).map(plain);

    const counts = await Enrollment.aggregate([
      { $match: { classId: { $in: classes.map(c => c.id) } } },
      { $group: { _id: '$classId', n: { $sum: 1 } } }
    ]);
    const countMap = new Map(counts.map(c => [c._id, c.n]));

    const statusOrder = { ONGOING: 1, UPCOMING: 2, COMPLETED: 3 };
    classes.sort((a, b) => (statusOrder[a.status] || 9) - (statusOrder[b.status] || 9));

    return successResponse(
      res,
      classes.map(c => ({
        id: c.id,
        classCode: c.classCode,
        semester: c.semester,
        maxStudents: c.maxStudents,
        currentStudents: countMap.get(c.id) || 0,
        status: c.status,
        course: c.course,
        teacher: c.teacher || null,
        schedules: c.schedules,
        createdAt: c.createdAt
      })),
      'Lấy danh sách lớp học thành công'
    );
  } catch (error) {
    console.error('Error fetching classes:', error);
    return errorResponse(res, 'Lỗi lấy danh sách lớp học', 500);
  }
});

// UC4.1: Chi tiết 1 lớp học phần
router.get('/classes/:id', authenticateJWT, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (req.user.role === 'STUDENT' && !await Enrollment.exists({ classId: id, studentId: req.user.id, status: 'ACTIVE' })) {
      return errorResponse(res, 'Bạn không có quyền xem lớp này', 403);
    }
    if (req.user.role === 'TEACHER' && !await Class.exists({ id, teacherId: req.user.id })) {
      return errorResponse(res, 'Bạn không có quyền xem lớp này', 403);
    }
    if (!['ADMIN', 'TEACHER', 'STUDENT'].includes(req.user.role)) return errorResponse(res, 'Không có quyền xem lớp', 403);

    const doc = await Class.findOne({ id }).populate([
      'course',
      { path: 'teacher', select: 'id code fullName email phone' },
      'schedules',
      {
        path: 'enrollments',
        populate: [
          { path: 'student', select: 'id code fullName email phone studentProfile' },
          'grade',
          'tuitionInvoice'
        ]
      }
    ]);

    if (!doc) {
      return errorResponse(res, 'Không tìm thấy lớp học phần', 404);
    }

    const classItem = plain(doc);
    if (req.user.role === 'STUDENT') classItem.enrollments = classItem.enrollments.filter(e => e.studentId === req.user.id);
    classItem.teacher = classItem.teacher || null;
    classItem.enrollments = classItem.enrollments
      .map(e => ({ ...e, student: e.student ? { ...e.student, studentProfile: e.student.studentProfile || null } : null, grade: e.grade || null, tuitionInvoice: e.tuitionInvoice || null }))
      .sort((a, b) => String(a.student?.code || '').localeCompare(String(b.student?.code || '')));

    return successResponse(res, classItem, 'Lấy chi tiết lớp học thành công');
  } catch (error) {
    console.error('Error fetching class details:', error);
    return errorResponse(res, 'Lỗi lấy thông tin chi tiết lớp học', 500);
  }
});

// UC4.1: Mở lớp học phần mới
router.post('/classes', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { classCode, courseId, teacherId, semester, maxStudents } = req.body;

    if (!classCode || !courseId || !semester) {
      return errorResponse(res, 'Mã lớp, Môn học và Học kỳ là bắt buộc', 400);
    }

    // Kiểm tra trùng mã lớp
    const existing = await Class.findOne({ classCode: String(classCode).trim().toUpperCase() });
    if (existing) {
      return errorResponse(res, `Lớp học mã ${classCode} đã tồn tại`, 400);
    }
    if (!(await Course.exists({ id: parseInt(courseId) }))) {
      return errorResponse(res, 'Môn học không tồn tại', 400);
    }
    if (teacherId && !(await User.exists({ id: parseInt(teacherId), role: 'TEACHER' }))) {
      return errorResponse(res, 'Giảng viên không tồn tại', 400);
    }

    const created = await Class.create({
      classCode: classCode.trim().toUpperCase(),
      courseId: parseInt(courseId),
      teacherId: teacherId ? parseInt(teacherId) : null,
      semester: semester.trim().toUpperCase(),
      maxStudents: maxStudents ? parseInt(maxStudents) : 30,
      meetUrl: req.body.meetUrl || null,
      status: 'UPCOMING'
    });
    const newClass = await Class.findOne({ id: created.id }).populate(['course', { path: 'teacher', select: 'fullName code' }]);

    return successResponse(res, plain(newClass), 'Mở lớp học phần thành công', 201);
  } catch (error) {
    console.error('Error creating class:', error);
    return errorResponse(res, 'Lỗi khi tạo lớp học phần mới', 500);
  }
});

// Cập nhật thông tin lớp (Đổi GV, Trạng thái)
router.put('/classes/:id', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { teacherId, status, maxStudents, semester } = req.body;

    const updated = await Class.findOneAndUpdate(
      { id },
      {
        $set: {
          ...(teacherId !== undefined ? { teacherId: teacherId ? parseInt(teacherId) : null } : {}),
          ...(req.body.meetUrl !== undefined ? { meetUrl: req.body.meetUrl || null } : {}),
          ...(status ? { status } : {}),
          ...(maxStudents ? { maxStudents: parseInt(maxStudents) } : {}),
          ...(semester ? { semester: semester.trim().toUpperCase() } : {})
        }
      },
      { new: true, runValidators: true }
    ).populate(['course', { path: 'teacher', select: 'fullName code' }]);
    if (!updated) return errorResponse(res, 'Không tìm thấy lớp học phần', 404);

    return successResponse(res, plain(updated), 'Cập nhật thông tin lớp học thành công');
  } catch (error) {
    console.error('Error updating class:', error);
    return errorResponse(res, 'Lỗi cập nhật lớp học', 500);
  }
});

// ==========================================
// 2. ENROLLMENT (UC4.2 - Ghi danh & Trigger nghiệp vụ)
// ==========================================

// UC4.2: Thêm học viên vào lớp (kèm trigger Grade và TuitionInvoice)
router.post('/classes/:id/enrollments', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const { studentId, forceEnroll } = req.body;

    if (!studentId || !Number.isSafeInteger(Number(studentId))) {
      return errorResponse(res, 'Vui lòng chọn học viên cần ghi danh', 400);
    }

    // Kiểm tra sĩ số, trùng ghi danh, đã qua môn, đang học môn, tiên quyết, vượt kỳ, trùng lịch
    // và tạo Enrollment + Grade + TuitionInvoice trong cùng transaction.
    const result = await enrollStudent(classId, Number(studentId), { force: forceEnroll === true });

    return successResponse(res, result, 'Ghi danh học viên vào lớp thành công (Đã tự động khởi tạo bảng điểm và học phí)', 201);
  } catch (error) {
    if (error.code === 11000) return errorResponse(res, 'Học viên này đã có trong danh sách lớp học', 400);
    if (!error.status) console.error('Error enrolling student:', error);
    if (error.data) {
      return res.status(error.status).json({ success: false, message: error.message, errors: error.data, data: error.data });
    }
    return errorResponse(res, error.status ? error.message : 'Lỗi ghi danh sinh viên', error.status || 500);
  }
});

// Xóa học viên khỏi lớp
router.delete('/classes/:id/enrollments/:studentId', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const studentId = parseInt(req.params.studentId);

    await withTransaction(async session => {
      const enrollment = await Enrollment.findOne({ classId, studentId }).session(session);
      if (!enrollment) throw Object.assign(new Error('Học viên không có trong lớp này'), { status: 404 });

      const inv = await TuitionInvoice.findOneAndUpdate({ enrollmentId: enrollment.id }, { $inc: { lockVersion: 1 } }, { new: true, session });
      if (inv) {
        const [orders, transactions, payments] = await Promise.all([
          PaymentOrder.countDocuments({ invoiceId: inv.id }).session(session),
          PaymentTransaction.countDocuments({ invoiceId: inv.id }).session(session),
          TuitionPayment.countDocuments({ invoiceId: inv.id }).session(session)
        ]);
        if (Number(inv.paidAmount) > 0 || orders || transactions || payments) {
          throw Object.assign(new Error('Không thể xóa ghi danh có lịch sử thanh toán; cần xử lý hoàn tiền theo quy định'), { status: 409 });
        }
      }
      // Xóa cascade grade và tuitionInvoice liên kết
      await Grade.deleteMany({ enrollmentId: enrollment.id }, { session });
      await TuitionInvoice.deleteMany({ enrollmentId: enrollment.id }, { session });
      await Attendance.deleteMany({ classId, studentId }, { session });
      await Enrollment.deleteOne({ id: enrollment.id }, { session });
    });

    return successResponse(res, null, 'Hủy ghi danh học viên thành công');
  } catch (error) {
    if (!error.status) console.error('Error removing enrollment:', error);
    return errorResponse(res, error.status ? error.message : 'Lỗi khi hủy ghi danh học viên', error.status || 500);
  }
});

// ==========================================
// 3. SCHEDULES & CONFLICT DETECTION (UC5.1 - UC5.4)
// ==========================================

// UC5.2 & UC5.3: Xếp lịch học kèm Thuật toán Kiểm tra Xung đột Lịch
router.post('/classes/:id/schedules', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const { dayOfWeek, shift, room } = req.body;

    const shiftNum = parseInt(shift);
    const dayNum = parseInt(dayOfWeek); // 2: Thứ 2 ... 8: Chủ nhật

    if (!dayNum || !shiftNum || !room) {
      return errorResponse(res, 'Vui lòng cung cấp đầy đủ Thứ (2-8), Ca học (Slot 1-6) và Phòng học', 400);
    }

    if (shiftNum < 1 || shiftNum > 6) {
      return errorResponse(res, 'Ca học phải từ Slot 1 đến Slot 6', 400);
    }

    const currentClass = await Class.findOne({ id: classId }).populate('teacher');

    if (!currentClass) {
      return errorResponse(res, 'Không tìm thấy lớp học phần', 404);
    }

    const timeSlot = SLOT_HOURS[shiftNum];
    const roomClean = String(room).trim().toUpperCase();

    // === THUẬT TOÁN KIỂM TRA XUNG ĐỘT (CONFLICT DETECTION) ===
    const sameSemesterClasses = await Class.find({ semester: currentClass.semester, id: { $ne: classId } }).select('id classCode teacherId');
    const classById = new Map(sameSemesterClasses.map(c => [c.id, c]));

    // 1. Kiểm tra Trùng phòng học:
    // Cùng học kỳ, cùng thứ, cùng ca học, cùng phòng học với lớp khác
    const roomConflict = await Schedule.findOne({
      dayOfWeek: dayNum,
      shift: shiftNum,
      room: roomClean,
      classId: { $in: [...classById.keys()] }
    });

    if (roomConflict) {
      return errorResponse(
        res,
        `[Xung đột lịch] Lỗi trùng phòng ${roomClean}! Phòng này đã được lớp ${classById.get(roomConflict.classId).classCode} sử dụng vào Thứ ${dayNum}, Slot ${shiftNum} (Học kỳ ${currentClass.semester}).`,
        409
      );
    }

    // 2. Kiểm tra Trùng giảng viên:
    // Nếu lớp có giảng viên phân công, kiểm tra xem giảng viên có dạy lớp nào khác cùng Thứ và Ca trong học kỳ đó không
    if (currentClass.teacherId) {
      const teacherClassIds = sameSemesterClasses.filter(c => c.teacherId === currentClass.teacherId).map(c => c.id);
      const teacherConflict = await Schedule.findOne({
        dayOfWeek: dayNum,
        shift: shiftNum,
        classId: { $in: teacherClassIds }
      });

      if (teacherConflict) {
        return errorResponse(
          res,
          `[Xung đột lịch] Lỗi trùng giảng viên ${currentClass.teacher?.fullName || ''} (Mã: ${currentClass.teacher?.code || ''})! Giảng viên đang có lịch dạy lớp ${classById.get(teacherConflict.classId).classCode} vào Thứ ${dayNum}, Slot ${shiftNum}.`,
          409
        );
      }
    }

    // Lưu lịch học mới
    const schedule = await Schedule.create({
      classId,
      dayOfWeek: dayNum,
      shift: shiftNum,
      startTime: timeSlot.start,
      endTime: timeSlot.end,
      room: roomClean
    });

    return successResponse(res, plain(schedule), 'Xếp lịch học thành công', 201);
  } catch (error) {
    console.error('Error adding schedule:', error);
    return errorResponse(res, 'Lỗi khi xếp lịch học', 500);
  }
});

// Xóa 1 buổi lịch học
router.delete('/classes/:id/schedules/:scheduleId', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const scheduleId = parseInt(req.params.scheduleId);
    const result = await Schedule.deleteOne({ id: scheduleId });
    if (!result.deletedCount) return errorResponse(res, 'Không tìm thấy lịch học', 404);
    return successResponse(res, null, 'Xóa lịch học thành công');
  } catch (error) {
    console.error('Error deleting schedule:', error);
    return errorResponse(res, 'Lỗi khi xóa lịch học', 500);
  }
});

// UC5.4: Lấy thời khóa biểu tuần của người dùng (TEACHER / STUDENT / ADMIN) - Hỗ trợ kỳ học 2 tuần
router.get('/schedules/my-schedule', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { semester } = req.query;
    const sessionDate = studyWeek(req.query.weekStart);

    const classWhere = {
      ...(semester ? { semester: String(semester) } : { status: 'ONGOING' })
    };

    if (role === 'TEACHER') {
      classWhere.teacherId = userId;
    } else if (role === 'STUDENT') {
      const activeEnrollments = await Enrollment.find({ studentId: userId, status: 'ACTIVE' }).select('classId');
      classWhere.id = { $in: activeEnrollments.map(e => e.classId) };
    }

    const classIds = (await Class.find(classWhere).select('id')).map(c => c.id);
    const schedules = (await Schedule.find({ classId: { $in: classIds } })
      .sort({ dayOfWeek: 1, shift: 1 })
      .populate({ path: 'class', populate: ['course', { path: 'teacher', select: 'fullName code' }] })).map(plain);

    const studentAttendances = role === 'STUDENT' && classIds.length > 0
      ? (await Attendance.find({ studentId: userId, classId: { $in: classIds } })).map(plain)
      : [];

    return successResponse(
      res,
      schedules.map(s => {
        const slotTime = SLOT_HOURS[s.shift] || { start: '07:30', end: '09:50' };
        const w1Date = sessionDate(s.dayOfWeek);
        const w2Date = sessionDate(s.dayOfWeek, 1);

        const attendances = studentAttendances.filter(a => a.classId === s.classId);
        const findAttByDate = (dateStr) =>
          attendances.find(a => a.sessionDate && new Date(a.sessionDate).toISOString().split('T')[0] === dateStr);

        const attW1 = role === 'STUDENT' ? findAttByDate(w1Date) : null;
        const attW2 = role === 'STUDENT' ? findAttByDate(w2Date) : null;

        return {
          id: s.id,
          classId: s.classId,
          classCode: s.class?.classCode,
          courseCode: s.class?.course?.courseCode,
          courseName: s.class?.course?.name,
          teacherName: s.class?.teacher?.fullName || 'Chưa phân công',
          dayOfWeek: s.dayOfWeek,
          shift: s.shift,
          startTime: s.startTime || slotTime.start,
          endTime: s.endTime || slotTime.end,
          room: s.room,
          semester: s.class?.semester,
          meetUrl: s.class?.meetUrl || null,
          week1Session: {
            week: 1,
            date: w1Date,
            status: attW1 ? attW1.status : null,
            note: attW1 ? attW1.note : null
          },
          week2Session: {
            week: 2,
            date: w2Date,
            status: attW2 ? attW2.status : null,
            note: attW2 ? attW2.note : null
          }
        };
      }),
      'Lấy thời khóa biểu thành công'
    );
  } catch (error) {
    console.error('Error getting my-schedule:', error);
    return errorResponse(res, error.status ? error.message : 'Lỗi lấy thời khóa biểu tuần', error.status || 500);
  }
});

module.exports = router;
