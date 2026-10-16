const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { login, getMe } = require('./auth.controller');
const authenticateJWT = require('../../middlewares/auth.middleware');
const authorizeRoles = require('../../middlewares/role.middleware');
const prisma = require('../../config/prisma');
const { successResponse, errorResponse } = require('../../utils/formatResponse');

// ==========================================
// 1. AUTH ROUTES
// ==========================================
router.post('/auth/login', login);
router.get('/auth/me', authenticateJWT, getMe);

// ==========================================
// 2. STUDENTS MANAGEMENT (UC1.1 - UC1.4)
// ==========================================

// UC1.1: Danh sách học viên có phân trang, bộ lọc và tìm kiếm
router.get('/students', authenticateJWT, authorizeRoles('ADMIN', 'TEACHER'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize) || 10);
    const search = (req.query.search || '').trim();
    const status = req.query.status;

    const where = {
      role: 'STUDENT',
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search } },
              { fullName: { contains: search } },
              { email: { contains: search } },
              { phone: { contains: search } }
            ]
          }
        : {})
    };

    const [total, students] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          studentProfile: true,
          _count: { select: { enrollments: true } }
        },
        orderBy: { code: 'asc' }
      })
    ]);

    return successResponse(
      res,
      {
        items: students.map(s => ({
          id: s.id,
          code: s.code,
          fullName: s.fullName,
          email: s.email,
          phone: s.phone,
          status: s.status,
          avatar: s.avatar,
          createdAt: s.createdAt,
          profile: s.studentProfile,
          totalClasses: s._count.enrollments
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      },
      'Lấy danh sách học viên thành công'
    );
  } catch (error) {
    console.error('Error fetching students:', error);
    return errorResponse(res, 'Lỗi lấy danh sách học viên', 500);
  }
});

// UC1.2: Tạo học viên mới
router.post('/students', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { code, fullName, email, phone, gender, dob, address, enrollmentYear, password } = req.body;

    if (!fullName || !email) {
      return errorResponse(res, 'Vui lòng điền Họ tên và Email hợp lệ', 400);
    }

    // Tự sinh mã nếu chưa có
    let studentCode = code;
    if (!studentCode) {
      const count = await prisma.user.count({ where: { role: 'STUDENT' } });
      const year = enrollmentYear || new Date().getFullYear();
      studentCode = `HE${String(year).slice(-2)}${String(count + 1).padStart(4, '0')}`;
    }

    // Kiểm tra trùng email hoặc code
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { code: studentCode }]
      }
    });

    if (existing) {
      return errorResponse(res, 'Mã học viên hoặc Email đã tồn tại trên hệ thống', 400);
    }

    const defaultPassword = password || '123456';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    const newUser = await prisma.user.create({
      data: {
        code: studentCode,
        fullName,
        email,
        phone: phone || null,
        passwordHash,
        role: 'STUDENT',
        status: 'ACTIVE',
        studentProfile: {
          create: {
            gender: gender || 'MALE',
            dob: dob ? new Date(dob) : null,
            address: address || null,
            enrollmentYear: parseInt(enrollmentYear) || new Date().getFullYear()
          }
        }
      },
      include: { studentProfile: true }
    });

    return successResponse(res, newUser, 'Tạo hồ sơ học viên thành công', 201);
  } catch (error) {
    console.error('Error creating student:', error);
    return errorResponse(res, 'Lỗi khi tạo mới học viên', 500);
  }
});

// UC1.2: Cập nhật học viên
router.put('/students/:id', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { fullName, phone, status, gender, dob, address, enrollmentYear } = req.body;

    const student = await prisma.user.findUnique({
      where: { id },
      include: { studentProfile: true }
    });

    if (!student || student.role !== 'STUDENT') {
      return errorResponse(res, 'Không tìm thấy học viên', 404);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(fullName ? { fullName } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(status ? { status } : {}),
        studentProfile: {
          upsert: {
            create: {
              gender: gender || 'MALE',
              dob: dob ? new Date(dob) : null,
              address: address || null,
              enrollmentYear: enrollmentYear ? parseInt(enrollmentYear) : new Date().getFullYear()
            },
            update: {
              ...(gender ? { gender } : {}),
              ...(dob ? { dob: new Date(dob) } : {}),
              ...(address !== undefined ? { address } : {}),
              ...(enrollmentYear ? { enrollmentYear: parseInt(enrollmentYear) } : {})
            }
          }
        }
      },
      include: { studentProfile: true }
    });

    return successResponse(res, updated, 'Cập nhật học viên thành công');
  } catch (error) {
    console.error('Error updating student:', error);
    return errorResponse(res, 'Lỗi cập nhật học viên', 500);
  }
});

// UC1.4: Hồ sơ 360 độ của học viên
router.get('/students/:id/profile-360', authenticateJWT, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // Kiểm tra quyền: Student chỉ được xem chính mình, Admin và GV được xem tất cả
    if (req.user.role === 'STUDENT' && req.user.id !== id) {
      return errorResponse(res, 'Bạn không có quyền xem hồ sơ sinh viên khác', 403);
    }

    const student = await prisma.user.findUnique({
      where: { id },
      include: {
        studentProfile: true,
        enrollments: {
          include: {
            class: {
              include: {
                course: true,
                teacher: { select: { fullName: true, code: true, email: true } }
              }
            },
            grade: true,
            tuitionInvoice: true
          }
        }
      }
    });

    if (!student || student.role !== 'STUDENT') {
      return errorResponse(res, 'Không tìm thấy hồ sơ học viên', 404);
    }

    // Tính GPA tích lũy
    const gradesWithTotal = student.enrollments
      .map(e => e.grade)
      .filter(g => g && g.totalScore !== null);

    const gpa = gradesWithTotal.length > 0
      ? (gradesWithTotal.reduce((acc, cur) => acc + Number(cur.totalScore), 0) / gradesWithTotal.length).toFixed(2)
      : '0.0';

    return successResponse(res, {
      personalInfo: {
        id: student.id,
        code: student.code,
        fullName: student.fullName,
        email: student.email,
        phone: student.phone,
        status: student.status,
        avatar: student.avatar,
        profile: student.studentProfile
      },
      academicSummary: {
        totalEnrolledClasses: student.enrollments.length,
        gpa: parseFloat(gpa),
        passedCourses: gradesWithTotal.filter(g => g.isPassed).length,
        failedCourses: gradesWithTotal.filter(g => !g.isPassed && g.isBanned !== null).length
      },
      classes: student.enrollments.map(e => ({
        classId: e.class.id,
        classCode: e.class.classCode,
        courseCode: e.class.course.courseCode,
        courseName: e.class.course.name,
        semester: e.class.semester,
        teacher: e.class.teacher?.fullName || 'Chưa phân công',
        grade: e.grade,
        tuition: e.tuitionInvoice
      }))
    }, 'Lấy hồ sơ 360 thành công');
  } catch (error) {
    console.error('Error in profile-360:', error);
    return errorResponse(res, 'Lỗi lấy hồ sơ 360', 500);
  }
});

// ==========================================
// 3. TEACHERS MANAGEMENT (UC2.1 - UC2.2)
// ==========================================

// UC2.1: Danh sách giảng viên
router.get('/teachers', authenticateJWT, async (req, res) => {
  try {
    const teachers = await prisma.user.findMany({
      where: { role: 'TEACHER', status: 'ACTIVE' },
      include: {
        teacherProfile: true,
        teachingClasses: {
          include: { course: true }
        }
      },
      orderBy: { fullName: 'asc' }
    });

    return successResponse(
      res,
      teachers.map(t => ({
        id: t.id,
        code: t.code,
        fullName: t.fullName,
        email: t.email,
        phone: t.phone,
        status: t.status,
        degree: t.teacherProfile?.degree || 'Giảng viên',
        specialty: t.teacherProfile?.specialty || 'Chưa cập nhật',
        bio: t.teacherProfile?.bio || '',
        activeClassesCount: t.teachingClasses.filter(c => c.status === 'ONGOING').length,
        classes: t.teachingClasses.map(c => ({
          id: c.id,
          classCode: c.classCode,
          courseName: c.course.name,
          semester: c.semester,
          status: c.status
        }))
      })),
      'Lấy danh sách giảng viên thành công'
    );
  } catch (error) {
    console.error('Error fetching teachers:', error);
    return errorResponse(res, 'Lỗi lấy danh sách giảng viên', 500);
  }
});

// UC2.1: Tạo mới giảng viên
router.post('/teachers', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { code, fullName, email, phone, degree, specialty, bio } = req.body;

    if (!fullName || !email) {
      return errorResponse(res, 'Họ tên và Email giảng viên là bắt buộc', 400);
    }

    let teacherCode = code;
    if (!teacherCode) {
      const count = await prisma.user.count({ where: { role: 'TEACHER' } });
      teacherCode = `GV${String(count + 1).padStart(3, '0')}`;
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { code: teacherCode }] }
    });
    if (existing) {
      return errorResponse(res, 'Mã hoặc Email giảng viên đã tồn tại', 400);
    }

    const passwordHash = await bcrypt.hash('123456', 10);
    const teacher = await prisma.user.create({
      data: {
        code: teacherCode,
        fullName,
        email,
        phone: phone || null,
        passwordHash,
        role: 'TEACHER',
        status: 'ACTIVE',
        teacherProfile: {
          create: {
            degree: degree || 'Thạc sĩ',
            specialty: specialty || 'Công nghệ Thông tin',
            bio: bio || ''
          }
        }
      },
      include: { teacherProfile: true }
    });

    return successResponse(res, teacher, 'Tạo giảng viên thành công', 201);
  } catch (error) {
    console.error('Error creating teacher:', error);
    return errorResponse(res, 'Lỗi khi tạo giảng viên', 500);
  }
});

// ==========================================
// 4. COURSES MANAGEMENT (UC3.1)
// ==========================================

// UC3.1: Lấy danh sách môn học
router.get('/courses', authenticateJWT, async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};

    const courses = await prisma.course.findMany({
      where,
      include: {
        _count: { select: { classes: true } }
      },
      orderBy: { courseCode: 'asc' }
    });

    return successResponse(
      res,
      courses.map(c => ({
        ...c,
        totalClasses: c._count.classes
      })),
      'Lấy danh sách môn học thành công'
    );
  } catch (error) {
    console.error('Error fetching courses:', error);
    return errorResponse(res, 'Lỗi lấy danh mục môn học', 500);
  }
});

// UC3.1: Tạo môn học mới
router.post('/courses', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { courseCode, name, credits, totalSessions, baseTuitionFee, description, syllabusUrl, status } = req.body;

    if (!courseCode || !name || !credits) {
      return errorResponse(res, 'Mã môn, Tên môn và Số tín chỉ là bắt buộc', 400);
    }

    const existing = await prisma.course.findUnique({
      where: { courseCode }
    });
    if (existing) {
      return errorResponse(res, `Mã môn ${courseCode} đã tồn tại`, 400);
    }

    const course = await prisma.course.create({
      data: {
        courseCode: courseCode.toUpperCase().trim(),
        name: name.trim(),
        credits: parseInt(credits),
        totalSessions: parseInt(totalSessions) || 30,
        baseTuitionFee: parseFloat(baseTuitionFee) || 5000000.0,
        description: description || null,
        syllabusUrl: syllabusUrl || null,
        status: status || 'ACTIVE'
      }
    });

    return successResponse(res, course, 'Tạo môn học mới thành công', 201);
  } catch (error) {
    console.error('Error creating course:', error);
    return errorResponse(res, 'Lỗi tạo môn học', 500);
  }
});

// UC3.1: Cập nhật môn học
router.put('/courses/:id', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, credits, totalSessions, baseTuitionFee, description, syllabusUrl, status } = req.body;

    const updated = await prisma.course.update({
      where: { id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(credits ? { credits: parseInt(credits) } : {}),
        ...(totalSessions ? { totalSessions: parseInt(totalSessions) } : {}),
        ...(baseTuitionFee !== undefined ? { baseTuitionFee: parseFloat(baseTuitionFee) } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(syllabusUrl !== undefined ? { syllabusUrl } : {}),
        ...(status ? { status } : {})
      }
    });

    return successResponse(res, updated, 'Cập nhật môn học thành công');
  } catch (error) {
    console.error('Error updating course:', error);
    return errorResponse(res, 'Lỗi cập nhật môn học', 500);
  }
});

// UC3.1: Xóa môn học (Nếu đã có lớp thì Soft-delete chuyển sang INACTIVE, nếu chưa có thì xóa cứng)
router.delete('/courses/:id', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const countClasses = await prisma.class.count({
      where: { courseId: id }
    });

    if (countClasses > 0) {
      // Soft-delete chuyển trạng thái sang INACTIVE
      const deactivated = await prisma.course.update({
        where: { id },
        data: { status: 'INACTIVE' }
      });
      return successResponse(
        res,
        deactivated,
        `Môn học đã có ${countClasses} lớp liên kết. Đã tự động chuyển trạng thái sang 'INACTIVE' (Ngưng mở môn) để bảo toàn dữ liệu lịch sử.`
      );
    }

    await prisma.course.delete({ where: { id } });
    return successResponse(res, null, 'Xóa môn học thành công');
  } catch (error) {
    console.error('Error deleting course:', error);
    return errorResponse(res, 'Lỗi khi xóa môn học', 500);
  }
});


module.exports = router;
