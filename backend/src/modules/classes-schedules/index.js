const express = require('express');
const router = express.Router();
const authenticateJWT = require('../../middlewares/auth.middleware');
const authorizeRoles = require('../../middlewares/role.middleware');
const prisma = require('../../config/prisma');
const { successResponse, errorResponse } = require('../../utils/formatResponse');

// Khung giờ 6 Slot chuẩn FAP
const SLOT_HOURS = {
  1: { start: '07:30', end: '09:50' },
  2: { start: '10:00', end: '12:20' },
  3: { start: '12:50', end: '15:10' },
  4: { start: '15:20', end: '17:40' },
  5: { start: '18:00', end: '20:20' },
  6: { start: '20:30', end: '22:50' }
};

// ==========================================
// 1. CLASSES MANAGEMENT (UC4.1 - UC4.2)
// ==========================================

// UC4.1: Danh sách lớp học phần
router.get('/classes', authenticateJWT, async (req, res) => {
  try {
    const { semester, courseId, teacherId, status } = req.query;

    const where = {
      ...(semester ? { semester } : {}),
      ...(courseId ? { courseId: parseInt(courseId) } : {}),
      ...(teacherId ? { teacherId: parseInt(teacherId) } : {}),
      ...(status ? { status } : {})
    };

    const classes = await prisma.class.findMany({
      where,
      include: {
        course: true,
        teacher: { select: { id: true, code: true, fullName: true, email: true } },
        schedules: true,
        _count: { select: { enrollments: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return successResponse(
      res,
      classes.map(c => ({
        id: c.id,
        classCode: c.classCode,
        semester: c.semester,
        maxStudents: c.maxStudents,
        currentStudents: c._count.enrollments,
        status: c.status,
        course: c.course,
        teacher: c.teacher,
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

    const classItem = await prisma.class.findUnique({
      where: { id },
      include: {
        course: true,
        teacher: { select: { id: true, code: true, fullName: true, email: true, phone: true } },
        schedules: {
          orderBy: [{ dayOfWeek: 'asc' }, { shift: 'asc' }]
        },
        enrollments: {
          include: {
            student: {
              select: {
                id: true,
                code: true,
                fullName: true,
                email: true,
                phone: true,
                studentProfile: true
              }
            },
            grade: true,
            tuitionInvoice: true
          },
          orderBy: { student: { code: 'asc' } }
        }
      }
    });

    if (!classItem) {
      return errorResponse(res, 'Không tìm thấy lớp học phần', 404);
    }

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
    const existing = await prisma.class.findUnique({
      where: { classCode: classCode.trim().toUpperCase() }
    });
    if (existing) {
      return errorResponse(res, `Lớp học mã ${classCode} đã tồn tại`, 400);
    }

    const newClass = await prisma.class.create({
      data: {
        classCode: classCode.trim().toUpperCase(),
        courseId: parseInt(courseId),
        teacherId: teacherId ? parseInt(teacherId) : null,
        semester: semester.trim().toUpperCase(),
        maxStudents: maxStudents ? parseInt(maxStudents) : 30,
        status: 'UPCOMING'
      },
      include: {
        course: true,
        teacher: { select: { fullName: true, code: true } }
      }
    });

    return successResponse(res, newClass, 'Mở lớp học phần thành công', 201);
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

    const updated = await prisma.class.update({
      where: { id },
      data: {
        ...(teacherId !== undefined ? { teacherId: teacherId ? parseInt(teacherId) : null } : {}),
        ...(status ? { status } : {}),
        ...(maxStudents ? { maxStudents: parseInt(maxStudents) } : {}),
        ...(semester ? { semester: semester.trim().toUpperCase() } : {})
      },
      include: {
        course: true,
        teacher: { select: { fullName: true, code: true } }
      }
    });

    return successResponse(res, updated, 'Cập nhật thông tin lớp học thành công');
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
    const { studentId } = req.body;

    if (!studentId) {
      return errorResponse(res, 'Vui lòng chọn học viên cần ghi danh', 400);
    }

    const classItem = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        course: true,
        enrollments: true,
        schedules: true
      }
    });

    if (!classItem) {
      return errorResponse(res, 'Không tìm thấy lớp học phần', 404);
    }

    // Kiểm tra sĩ số tối đa max_students
    if (classItem.enrollments.length >= classItem.maxStudents) {
      return errorResponse(
        res,
        `Lớp đã đạt sĩ số tối đa (${classItem.maxStudents} sinh viên). Không thể thêm học viên.`,
        400
      );
    }

    // Kiểm tra xem sinh viên đã được ghi danh trước đó chưa
    const existingEnrollment = await prisma.enrollment.findUnique({
      where: {
        classId_studentId: {
          classId,
          studentId: parseInt(studentId)
        }
      }
    });

    if (existingEnrollment) {
      return errorResponse(res, 'Học viên này đã có trong danh sách lớp học', 400);
    }

    // KIỂM TRA TRÙNG LỊCH HỌC CỦA HỌC VIÊN TRONG CÙNG HỌC KỲ (Cross-Module Logic)
    if (classItem.schedules && classItem.schedules.length > 0) {
      const studentOtherEnrollments = await prisma.enrollment.findMany({
        where: {
          studentId: parseInt(studentId),
          status: 'ACTIVE',
          class: {
            semester: classItem.semester,
            id: { not: classId }
          }
        },
        include: {
          class: {
            include: { schedules: true }
          }
        }
      });

      for (const newSched of classItem.schedules) {
        for (const enr of studentOtherEnrollments) {
          for (const existSched of enr.class.schedules) {
            if (existSched.dayOfWeek === newSched.dayOfWeek && existSched.shift === newSched.shift) {
              return errorResponse(
                res,
                `[Xung đột lịch học viên] Học viên đã có lịch học lớp ${enr.class.classCode} vào Thứ ${newSched.dayOfWeek}, Slot ${newSched.shift} trong học kỳ ${classItem.semester}. Không thể ghi danh!`,
                409
              );
            }
          }
        }
      }
    }

    // THỰC HIỆN TRANSACTION GHI DANH KÈM TRIGGER TỰ ĐỘNG THEO YÊU CẦU ĐẶC TẢ
    const result = await prisma.$transaction(async (tx) => {
      // 1. Tạo Enrollment
      const enrollment = await tx.enrollment.create({
        data: {
          classId,
          studentId: parseInt(studentId),
          status: 'ACTIVE'
        }
      });

      // 2. Trigger tự động 1: Tạo bản ghi Grade trống
      const grade = await tx.grade.create({
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

      // 3. Trigger tự động 2: Tạo hóa đơn học phí tương ứng baseTuitionFee của môn
      const tuitionFee = classItem.course?.baseTuitionFee || 5000000;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30); // Hạn đóng sau 30 ngày

      const invoice = await tx.tuitionInvoice.create({
        data: {
          studentId: parseInt(studentId),
          enrollmentId: enrollment.id,
          amount: tuitionFee,
          paidAmount: 0,
          dueDate,
          status: 'UNPAID'
        }
      });

      return { enrollment, grade, invoice };
    });

    return successResponse(res, result, 'Ghi danh học viên vào lớp thành công (Đã tự động khởi tạo bảng điểm và học phí)', 201);
  } catch (error) {
    console.error('Error enrolling student:', error);
    return errorResponse(res, 'Lỗi ghi danh sinh viên', 500);
  }
});

// Xóa học viên khỏi lớp
router.delete('/classes/:id/enrollments/:studentId', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const studentId = parseInt(req.params.studentId);

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        classId_studentId: { classId, studentId }
      }
    });

    if (!enrollment) {
      return errorResponse(res, 'Học viên không có trong lớp này', 404);
    }

    // Xóa cascade grade và tuitionInvoice liên kết
    await prisma.$transaction(async (tx) => {
      await tx.grade.deleteMany({ where: { enrollmentId: enrollment.id } });
      await tx.tuitionInvoice.deleteMany({ where: { enrollmentId: enrollment.id } });
      await tx.attendance.deleteMany({ where: { classId, studentId } });
      await tx.enrollment.delete({ where: { id: enrollment.id } });
    });

    return successResponse(res, null, 'Hủy ghi danh học viên thành công');
  } catch (error) {
    console.error('Error removing enrollment:', error);
    return errorResponse(res, 'Lỗi khi hủy ghi danh học viên', 500);
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

    const currentClass = await prisma.class.findUnique({
      where: { id: classId },
      include: { teacher: true }
    });

    if (!currentClass) {
      return errorResponse(res, 'Không tìm thấy lớp học phần', 404);
    }

    const timeSlot = SLOT_HOURS[shiftNum];
    const roomClean = room.trim().toUpperCase();

    // === THUẬT TOÁN KIỂM TRA XUNG ĐỘT (CONFLICT DETECTION) ===

    // 1. Kiểm tra Trùng phòng học:
    // Cùng học kỳ, cùng thứ, cùng ca học, cùng phòng học với lớp khác
    const roomConflict = await prisma.schedule.findFirst({
      where: {
        dayOfWeek: dayNum,
        shift: shiftNum,
        room: roomClean,
        class: {
          semester: currentClass.semester,
          id: { not: classId }
        }
      },
      include: { class: true }
    });

    if (roomConflict) {
      return errorResponse(
        res,
        `[Xung đột lịch] Phòng ${roomClean} đã có lớp ${roomConflict.class.classCode} sử dụng vào Thứ ${dayNum}, Slot ${shiftNum} (Học kỳ ${currentClass.semester}).`,
        409
      );
    }

    // 2. Kiểm tra Trùng giảng viên:
    // Nếu lớp có giảng viên phân công, kiểm tra xem giảng viên có dạy lớp nào khác cùng Thứ và Ca trong học kỳ đó không
    if (currentClass.teacherId) {
      const teacherConflict = await prisma.schedule.findFirst({
        where: {
          dayOfWeek: dayNum,
          shift: shiftNum,
          class: {
            semester: currentClass.semester,
            teacherId: currentClass.teacherId,
            id: { not: classId }
          }
        },
        include: { class: true }
      });

      if (teacherConflict) {
        return errorResponse(
          res,
          `[Xung đột lịch] Giảng viên ${currentClass.teacher?.fullName || ''} đang có lịch dạy lớp ${teacherConflict.class.classCode} vào Thứ ${dayNum}, Slot ${shiftNum}.`,
          409
        );
      }
    }

    // Lưu lịch học mới
    const schedule = await prisma.schedule.create({
      data: {
        classId,
        dayOfWeek: dayNum,
        shift: shiftNum,
        startTime: timeSlot.start,
        endTime: timeSlot.end,
        room: roomClean
      }
    });

    return successResponse(res, schedule, 'Xếp lịch học thành công', 201);
  } catch (error) {
    console.error('Error adding schedule:', error);
    return errorResponse(res, 'Lỗi khi xếp lịch học', 500);
  }
});

// Xóa 1 buổi lịch học
router.delete('/classes/:id/schedules/:scheduleId', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const scheduleId = parseInt(req.params.scheduleId);
    await prisma.schedule.delete({ where: { id: scheduleId } });
    return successResponse(res, null, 'Xóa lịch học thành công');
  } catch (error) {
    console.error('Error deleting schedule:', error);
    return errorResponse(res, 'Lỗi khi xóa lịch học', 500);
  }
});

// UC5.4: Lấy thời khóa biểu tuần của người dùng (TEACHER / STUDENT / ADMIN)
router.get('/schedules/my-schedule', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { semester } = req.query;

    let classWhere = {
      ...(semester ? { semester } : {})
    };

    if (role === 'TEACHER') {
      classWhere.teacherId = userId;
    } else if (role === 'STUDENT') {
      const activeEnrollments = await prisma.enrollment.findMany({
        where: { studentId: userId, status: 'ACTIVE' },
        select: { classId: true }
      });
      classWhere.id = { in: activeEnrollments.map(e => e.classId) };
    }

    const schedules = await prisma.schedule.findMany({
      where: {
        class: classWhere
      },
      include: {
        class: {
          include: {
            course: true,
            teacher: { select: { fullName: true, code: true } }
          }
        }
      },
      orderBy: [{ dayOfWeek: 'asc' }, { shift: 'asc' }]
    });

    return successResponse(
      res,
      schedules.map(s => ({
        id: s.id,
        classId: s.classId,
        classCode: s.class.classCode,
        courseCode: s.class.course.courseCode,
        courseName: s.class.course.name,
        teacherName: s.class.teacher?.fullName || 'Chưa phân công',
        dayOfWeek: s.dayOfWeek,
        shift: s.shift,
        startTime: s.startTime,
        endTime: s.endTime,
        room: s.room,
        semester: s.class.semester
      })),
      'Lấy thời khóa biểu thành công'
    );
  } catch (error) {
    console.error('Error getting my-schedule:', error);
    return errorResponse(res, 'Lỗi lấy thời khóa biểu tuần', 500);
  }
});

module.exports = router;
