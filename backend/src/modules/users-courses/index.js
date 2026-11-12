const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { login, register, getMe } = require('./auth.controller');
const authenticateJWT = require('../../middlewares/auth.middleware');
const authorizeRoles = require('../../middlewares/role.middleware');
const { User, Course, CourseLesson, Class, Enrollment } = require('../../models');
const { like, plain } = require('../../utils/query');
const { successResponse, errorResponse } = require('../../utils/formatResponse');
const xlsx = require('xlsx');
const fs = require('fs');
const upload = require('../../config/upload');

const stringQueryValue = value => (typeof value === 'string' ? value : undefined);

const teacherCanManageCourse = async (courseId, user) => {
  if (user.role === 'ADMIN') return true;
  if (!Number.isSafeInteger(courseId)) return false;
  const assignedCourseIds = await Class.find({ teacherId: user.id }).distinct('courseId');
  const manageableCourseIds = await Course.find({
    $or: [
      { instructorId: user.id },
      { id: { $in: assignedCourseIds } }
    ]
  }).distinct('id');
  return manageableCourseIds.includes(courseId);
};

// ==========================================
// 1. AUTH ROUTES
// ==========================================
router.post('/auth/login', login);
router.post('/auth/register', register);
router.get('/auth/me', authenticateJWT, getMe);

// ==========================================
// 1b. SYSTEM ADMIN USER ACCOUNTS MANAGEMENT
// ==========================================

// UC1.1: Danh sách toàn bộ tài khoản người dùng trên hệ thống (SYSTEM ADMIN)
router.get('/users', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize) || 10);
    const search = (stringQueryValue(req.query.search) || '').trim();
    const role = stringQueryValue(req.query.role);
    const status = stringQueryValue(req.query.status);

    const where = {
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
      ...(search
        ? {
            $or: [
              { code: like(search) },
              { fullName: like(search) },
              { email: like(search) },
              { phone: like(search) }
            ]
          }
        : {})
    };

    const [total, users] = await Promise.all([
      User.countDocuments(where),
      User.find(where)
        .sort({ id: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
    ]);

    return successResponse(
      res,
      {
        items: users.map(u => {
          const item = plain(u);
          delete item.passwordHash;
          return item;
        }),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      },
      'Lấy danh sách người dùng thành công'
    );
  } catch (error) {
    console.error('Error fetching users:', error);
    return errorResponse(res, 'Lỗi lấy danh sách tài khoản người dùng', 500);
  }
});

// UC1.1: Khóa / Mở khóa tài khoản & cập nhật vai trò (chặn tự khóa ADM001 hoặc chính mình)
router.patch('/users/:id/status', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const user = await User.findOne({ id });

    if (!user) {
      return errorResponse(res, 'Không tìm thấy tài khoản người dùng', 404);
    }

    const { status, role } = req.body;

    const isSuperAdmin = user.code === 'ADM001';
    const isSelf = req.user.id === user.id;

    if (status && status !== 'ACTIVE') {
      if (isSuperAdmin) {
        return errorResponse(res, 'Không được phép khóa tài khoản Quản trị viên hệ thống gốc (ADM001)', 403);
      }
      if (isSelf) {
        return errorResponse(res, 'Bạn không thể tự khóa tài khoản của chính mình khi đang đăng nhập', 403);
      }
    }

    if (role && isSuperAdmin && role !== 'ADMIN') {
      return errorResponse(res, 'Không được phép thay đổi vai trò của tài khoản ADM001', 403);
    }

    if (status) user.status = status;
    if (role) user.role = role;

    await user.save();

    const data = plain(user);
    delete data.passwordHash;

    return successResponse(
      res,
      data,
      `Cập nhật trạng thái người dùng [${user.code}] thành công`
    );
  } catch (error) {
    console.error('Error updating user status:', error);
    return errorResponse(res, 'Lỗi cập nhật trạng thái người dùng', 500);
  }
});

// ==========================================
// 2. STUDENTS MANAGEMENT (UC1.1 - UC1.4)
// ==========================================

// UC1.1: Danh sách học viên có phân trang, bộ lọc và tìm kiếm
router.get('/students', authenticateJWT, authorizeRoles('ADMIN', 'TEACHER'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize) || 10);
    const search = (stringQueryValue(req.query.search) || '').trim();
    const status = stringQueryValue(req.query.status);

    const where = {
      role: 'STUDENT',
      ...(status ? { status } : {}),
      ...(search
        ? {
            $or: [
              { code: like(search) },
              { fullName: like(search) },
              { email: like(search) },
              { phone: like(search) }
            ]
          }
        : {})
    };

    const [total, students] = await Promise.all([
      User.countDocuments(where),
      User.find(where)
        .sort({ code: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
    ]);

    const counts = await Enrollment.aggregate([
      { $match: { studentId: { $in: students.map(s => s.id) } } },
      { $group: { _id: '$studentId', n: { $sum: 1 } } }
    ]);
    const countMap = new Map(counts.map(c => [c._id, c.n]));

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
          profile: plain(s).studentProfile || null,
          totalClasses: countMap.get(s.id) || 0
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
      const count = await User.countDocuments({ role: 'STUDENT' });
      const year = enrollmentYear || new Date().getFullYear();
      studentCode = `HE${String(year).slice(-2)}${String(count + 1).padStart(4, '0')}`;
    }

    // Kiểm tra trùng email hoặc code
    const existing = await User.findOne({ $or: [{ email: String(email) }, { code: String(studentCode) }] });

    if (existing) {
      return errorResponse(res, 'Mã học viên hoặc Email đã tồn tại trên hệ thống', 400);
    }

    const defaultPassword = password || '123456';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    const newUser = await User.create({
      code: studentCode,
      fullName,
      email,
      phone: phone || null,
      passwordHash,
      role: 'STUDENT',
      status: 'ACTIVE',
      studentProfile: {
        gender: gender || 'MALE',
        dob: dob ? new Date(dob) : null,
        address: address || null,
        enrollmentYear: parseInt(enrollmentYear) || new Date().getFullYear()
      }
    });

    const data = plain(newUser);
    delete data.passwordHash;
    return successResponse(res, data, 'Tạo hồ sơ học viên thành công', 201);
  } catch (error) {
    console.error('Error creating student:', error);
    return errorResponse(res, 'Lỗi khi tạo mới học viên', 500);
  }
});

// UC1.3: Tải file Excel mẫu để Import học viên
router.get('/students/import/template', authenticateJWT, authorizeRoles('ADMIN'), (req, res) => {
  try {
    const templateData = [
      {
        'Mã SV': 'HE180001',
        'Họ và Tên': 'Nguyễn Văn An',
        'Email': 'annvhe180001@fpt.edu.vn',
        'Số điện thoại': '0901234567',
        'Giới tính': 'Nam',
        'Ngày sinh': '2004-05-15',
        'Địa chỉ': 'Hà Nội',
        'Năm nhập học': 2026
      },
      {
        'Mã SV': 'HE180002',
        'Họ và Tên': 'Trần Thị Bình',
        'Email': 'binhtthe180002@fpt.edu.vn',
        'Số điện thoại': '0912345678',
        'Giới tính': 'Nữ',
        'Ngày sinh': '2004-08-20',
        'Địa chỉ': 'Đà Nẵng',
        'Năm nhập học': 2026
      }
    ];

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(templateData);
    xlsx.utils.book_append_sheet(wb, ws, 'DanhSachHocVien');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename=Mau_Import_Hoc_Vien_EMS.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (error) {
    console.error('Error generating import template:', error);
    return errorResponse(res, 'Lỗi khi tạo file mẫu Excel', 500);
  }
});

// UC1.3: Import học viên từ file Excel (.xlsx, .xls)
router.post('/students/import', authenticateJWT, authorizeRoles('ADMIN'), upload.single('file'), async (req, res) => {
  if (!req.file) {
    return errorResponse(res, 'Vui lòng chọn file Excel (.xlsx hoặc .xls) để tải lên', 400);
  }

  const filePath = req.file.path;

  try {
    const workbook = xlsx.readFile(filePath);
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return errorResponse(res, 'File Excel không có sheet nào hợp lệ', 400);
    }

    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = xlsx.utils.sheet_to_json(firstSheet, { defval: '' });

    // Dọn dẹp file tạm trên ổ đĩa
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }

    if (!rawRows || rawRows.length === 0) {
      return errorResponse(res, 'File Excel rỗng, không có dữ liệu học viên', 400);
    }

    const defaultPasswordHash = await bcrypt.hash('123456', 10);
    const existingUsers = await User.find({}, 'code email').lean();
    const existingCodes = new Set(existingUsers.map(u => (u.code || '').toLowerCase()));
    const existingEmails = new Set(existingUsers.map(u => (u.email || '').toLowerCase()));

    let currentStudentCount = await User.countDocuments({ role: 'STUDENT' });
    const imported = [];
    const errors = [];

    for (let index = 0; index < rawRows.length; index++) {
      const row = rawRows[index];
      const rowNum = index + 2; // Dòng 1 là tiêu đề cột trong file Excel

      const fullName = (row['Họ và Tên'] || row['Họ tên'] || row['fullName'] || row['FullName'] || row['Tên'] || '').toString().trim();
      const email = (row['Email'] || row['email'] || row['EMAIL'] || '').toString().trim().toLowerCase();
      let code = (row['Mã SV'] || row['Mã sinh viên'] || row['Ma SV'] || row['code'] || row['Code'] || '').toString().trim();
      const phone = (row['Số điện thoại'] || row['Điện thoại'] || row['SĐT'] || row['SDT'] || row['phone'] || '').toString().trim();
      const rawGender = (row['Giới tính'] || row['Gioi tinh'] || row['gender'] || '').toString().trim().toLowerCase();
      const rawDob = (row['Ngày sinh'] || row['Ngay sinh'] || row['dob'] || '').toString().trim();
      const address = (row['Địa chỉ'] || row['Dia chi'] || row['address'] || '').toString().trim();
      const rawYear = (row['Năm nhập học'] || row['Niên khóa'] || row['Khóa'] || row['enrollmentYear'] || '').toString().trim();

      if (!fullName) {
        errors.push({ row: rowNum, error: 'Thiếu Họ và Tên học viên' });
        continue;
      }
      if (!email) {
        errors.push({ row: rowNum, error: 'Thiếu Email học viên' });
        continue;
      }
      if (!email.includes('@') || !email.includes('.')) {
        errors.push({ row: rowNum, error: `Email không đúng định dạng (${email})` });
        continue;
      }

      const enrollmentYear = parseInt(rawYear) || new Date().getFullYear();

      // Tự sinh mã nếu chưa có
      if (!code) {
        currentStudentCount += 1;
        code = `HE${String(enrollmentYear).slice(-2)}${String(currentStudentCount).padStart(4, '0')}`;
      }

      if (existingEmails.has(email)) {
        errors.push({ row: rowNum, error: `Email '${email}' đã tồn tại trên hệ thống` });
        continue;
      }
      if (existingCodes.has(code.toLowerCase())) {
        errors.push({ row: rowNum, error: `Mã SV '${code}' đã tồn tại trên hệ thống` });
        continue;
      }

      let gender = 'MALE';
      if (rawGender === 'nữ' || rawGender === 'nu' || rawGender === 'female') {
        gender = 'FEMALE';
      } else if (rawGender === 'khác' || rawGender === 'khac' || rawGender === 'other') {
        gender = 'OTHER';
      }

      let dob = null;
      if (rawDob) {
        const parsedDate = new Date(rawDob);
        if (!isNaN(parsedDate.getTime())) {
          dob = parsedDate;
        }
      }

      try {
        const newStudent = await User.create({
          code,
          fullName,
          email,
          phone: phone || null,
          passwordHash: defaultPasswordHash,
          role: 'STUDENT',
          status: 'ACTIVE',
          studentProfile: {
            gender,
            dob,
            address: address || null,
            enrollmentYear
          }
        });

        existingEmails.add(email);
        existingCodes.add(code.toLowerCase());
        imported.push({
          id: newStudent.id,
          code: newStudent.code,
          fullName: newStudent.fullName,
          email: newStudent.email,
          phone: newStudent.phone
        });
      } catch (insertError) {
        console.error(`Error inserting student row ${rowNum}:`, insertError);
        errors.push({ row: rowNum, error: insertError.message || 'Lỗi khi lưu vào cơ sở dữ liệu' });
      }
    }

    return successResponse(
      res,
      {
        totalRows: rawRows.length,
        importedCount: imported.length,
        failedCount: errors.length,
        imported,
        errors
      },
      `Đã xử lý xong file Excel: ${imported.length} học viên thành công, ${errors.length} dòng lỗi.`
    );
  } catch (err) {
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }
    console.error('Error processing student import:', err);
    return errorResponse(res, `Lỗi khi xử lý file Excel: ${err.message}`, 500);
  }
});

// ==========================================
// UC1.3: XUẤT EXCEL DANH SÁCH HỌC VIÊN
// ==========================================
router.get('/students/export-excel', authenticateJWT, authorizeRoles('ADMIN', 'TEACHER'), async (req, res) => {
  try {
    const students = await User.find({ role: 'STUDENT' }).sort({ code: 1 }).lean();
    const studentIds = students.map(s => s.id);
    const enrollments = await Enrollment.find({ studentId: { $in: studentIds } }).select('studentId').lean();
    const countMap = {};
    for (const e of enrollments) {
      countMap[e.studentId] = (countMap[e.studentId] || 0) + 1;
    }

    const exportData = students.map((s, index) => ({
      'STT': index + 1,
      'Mã học viên': s.code,
      'Họ và tên': s.fullName,
      'Email': s.email,
      'Số điện thoại': s.phone || '',
      'Giới tính': s.studentProfile?.gender === 'FEMALE' ? 'Nữ' : (s.studentProfile?.gender === 'MALE' ? 'Nam' : 'Khác'),
      'Ngày sinh': s.studentProfile?.dob ? new Date(s.studentProfile.dob).toISOString().split('T')[0] : '',
      'Khóa tuyển sinh': s.studentProfile?.enrollmentYear || '',
      'Địa chỉ': s.studentProfile?.address || '',
      'Số lớp đã học': countMap[s.id] || 0,
      'Trạng thái': s.status === 'ACTIVE' ? 'Đang học' : (s.status === 'INACTIVE' ? 'Tạm ngưng' : 'Đình chỉ')
    }));

    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Danh_Sach_Hoc_Vien');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="Danh_sach_hoc_vien_EMS.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (error) {
    console.error('Error exporting students:', error);
    return errorResponse(res, 'Lỗi xuất file Excel học viên', 500);
  }
});

// Alias cho template & import
router.get('/students/template-excel', authenticateJWT, authorizeRoles('ADMIN'), (req, res, next) => {
  req.url = '/students/import/template';
  router.handle(req, res, next);
});
router.post('/students/import-excel', authenticateJWT, authorizeRoles('ADMIN'), upload.single('file'), (req, res, next) => {
  req.url = '/students/import';
  router.handle(req, res, next);
});

// UC1.2: Cập nhật học viên
router.put('/students/:id', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { fullName, phone, status, gender, dob, address, enrollmentYear } = req.body;

    const student = await User.findOne({ id });

    if (!student || student.role !== 'STUDENT') {
      return errorResponse(res, 'Không tìm thấy học viên', 404);
    }

    if (fullName) student.fullName = fullName;
    if (phone !== undefined) student.phone = phone;
    if (status) student.status = status;

    // Tương đương upsert student_profiles
    if (!student.studentProfile) {
      student.studentProfile = {
        gender: gender || 'MALE',
        dob: dob ? new Date(dob) : null,
        address: address || null,
        enrollmentYear: enrollmentYear ? parseInt(enrollmentYear) : new Date().getFullYear()
      };
    } else {
      if (gender) student.studentProfile.gender = gender;
      if (dob) student.studentProfile.dob = new Date(dob);
      if (address !== undefined) student.studentProfile.address = address;
      if (enrollmentYear) student.studentProfile.enrollmentYear = parseInt(enrollmentYear);
    }

    await student.save();
    return successResponse(res, plain(student), 'Cập nhật học viên thành công');
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

    const studentDoc = await User.findOne({ id }).populate({
      path: 'enrollments',
      populate: [
        { path: 'class', populate: ['course', { path: 'teacher', select: 'id fullName code email' }] },
        'grade',
        'tuitionInvoice'
      ]
    });

    if (!studentDoc || studentDoc.role !== 'STUDENT') {
      return errorResponse(res, 'Không tìm thấy hồ sơ học viên', 404);
    }
    const student = plain(studentDoc);

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
        profile: student.studentProfile || null
      },
      academicSummary: {
        totalEnrolledClasses: student.enrollments.length,
        gpa: parseFloat(gpa),
        passedCourses: gradesWithTotal.filter(g => g.isPassed).length,
        failedCourses: gradesWithTotal.filter(g => !g.isPassed && g.isBanned !== null).length
      },
      classes: student.enrollments.filter(e => e.class).map(e => ({
        classId: e.class.id,
        classCode: e.class.classCode,
        courseCode: e.class.course?.courseCode,
        courseName: e.class.course?.name,
        semester: e.class.semester,
        teacher: e.class.teacher?.fullName || 'Chưa phân công',
        grade: e.grade || null,
        tuition: e.tuitionInvoice || null
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
    const teachers = (await User.find({ role: 'TEACHER', status: 'ACTIVE' })
      .sort({ fullName: 1 })
      .populate({ path: 'teachingClasses', populate: 'course' })).map(plain);

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
          courseName: c.course?.name,
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
      const count = await User.countDocuments({ role: 'TEACHER' });
      teacherCode = `GV${String(count + 1).padStart(3, '0')}`;
    }

    const existing = await User.findOne({ $or: [{ email: String(email) }, { code: String(teacherCode) }] });
    if (existing) {
      return errorResponse(res, 'Mã hoặc Email giảng viên đã tồn tại', 400);
    }

    const passwordHash = await bcrypt.hash('123456', 10);
    const teacher = await User.create({
      code: teacherCode,
      fullName,
      email,
      phone: phone || null,
      passwordHash,
      role: 'TEACHER',
      status: 'ACTIVE',
      teacherProfile: {
        degree: degree || 'Thạc sĩ',
        specialty: specialty || 'Công nghệ Thông tin',
        bio: bio || ''
      }
    });

    const data = plain(teacher);
    delete data.passwordHash;
    return successResponse(res, data, 'Tạo giảng viên thành công', 201);
  } catch (error) {
    console.error('Error creating teacher:', error);
    return errorResponse(res, 'Lỗi khi tạo giảng viên', 500);
  }
});

// UC2.2: Cập nhật thông tin giảng viên (chuyên môn, học vị, tiểu sử, số điện thoại)
router.put('/teachers/:id', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return errorResponse(res, 'ID giảng viên không hợp lệ', 400);
    const { fullName, phone, degree, specialty, bio, status } = req.body;

    const teacher = await User.findOne({ id, role: 'TEACHER' });
    if (!teacher) return errorResponse(res, 'Không tìm thấy giảng viên', 404);

    const updated = await User.findOneAndUpdate(
      { id, role: 'TEACHER' },
      {
        $set: {
          ...(fullName ? { fullName: fullName.trim() } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(status ? { status } : {}),
          'teacherProfile.degree': degree || teacher.teacherProfile?.degree || 'Thạc sĩ',
          'teacherProfile.specialty': specialty || teacher.teacherProfile?.specialty || 'Chưa cập nhật',
          'teacherProfile.bio': bio !== undefined ? bio : (teacher.teacherProfile?.bio || '')
        }
      },
      { new: true, runValidators: true }
    );

    const data = plain(updated);
    delete data.passwordHash;
    return successResponse(res, data, 'Cập nhật thông tin giảng viên thành công');
  } catch (error) {
    console.error('Error updating teacher:', error);
    return errorResponse(res, 'Lỗi cập nhật giảng viên', 500);
  }
});

// ==========================================
// 4. COURSES MANAGEMENT (UC3.1 - UC3.3)
// ==========================================

// UC3.1: Lấy danh sách môn học & khóa học
router.get('/courses', authenticateJWT, async (req, res) => {
  try {
    const status = stringQueryValue(req.query.status);
    const category = stringQueryValue(req.query.category);
    const deliveryMode = stringQueryValue(req.query.deliveryMode);
    const search = stringQueryValue(req.query.search);
    const where = {
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...(deliveryMode ? { deliveryMode } : {}),
      ...(search
        ? {
            $or: [
              { courseCode: like(search) },
              { name: like(search) }
            ]
          }
        : {})
    };

    const courses = await Course.find(where).sort({ courseCode: 1 });
    const [classCounts, lessonCounts] = await Promise.all([
      Class.aggregate([{ $group: { _id: '$courseId', n: { $sum: 1 } } }]),
      CourseLesson.aggregate([{ $group: { _id: '$courseId', n: { $sum: 1 } } }])
    ]);
    const classCountMap = new Map(classCounts.map(c => [c._id, c.n]));
    const lessonCountMap = new Map(lessonCounts.map(l => [l._id, l.n]));

    return successResponse(
      res,
      courses.map(c => ({
        ...plain(c),
        totalClasses: classCountMap.get(c.id) || 0,
        totalLessons: lessonCountMap.get(c.id) || 0
      })),
      'Lấy danh sách môn học thành công'
    );
  } catch (error) {
    console.error('Error fetching courses:', error);
    return errorResponse(res, 'Lỗi lấy danh mục môn học', 500);
  }
});

// UC3.1: Tạo môn học / khóa học mới
router.post('/courses', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const {
      courseCode,
      name,
      category,
      deliveryMode,
      level,
      instructorId,
      thumbnailUrl,
      credits,
      totalSessions,
      baseTuitionFee,
      description,
      syllabusUrl,
      status
    } = req.body;

    if (!courseCode || !name) {
      return errorResponse(res, 'Mã khóa học và Tên khóa học là bắt buộc', 400);
    }

    const existing = await Course.findOne({ courseCode: String(courseCode).toUpperCase().trim() });
    if (existing) {
      return errorResponse(res, `Mã môn ${courseCode} đã tồn tại`, 400);
    }

    const course = await Course.create({
      courseCode: courseCode.toUpperCase().trim(),
      name: name.trim(),
      category: category || 'FPT_SUBJECT',
      deliveryMode: deliveryMode || 'RECORDED',
      level: level || 'BEGINNER',
      instructorId: instructorId ? Number.parseInt(instructorId, 10) : null,
      thumbnailUrl: thumbnailUrl || null,
      credits: credits !== undefined ? Number.parseInt(credits, 10) : 3,
      totalSessions: Number.parseInt(totalSessions, 10) || 30,
      baseTuitionFee: Number.parseFloat(baseTuitionFee) || 5000000.0,
      description: description || null,
      syllabusUrl: syllabusUrl || null,
      status: status || 'ACTIVE'
    });

    return successResponse(res, plain(course), 'Tạo môn học mới thành công', 201);
  } catch (error) {
    console.error('Error creating course:', error);
    return errorResponse(res, 'Lỗi tạo môn học', 500);
  }
});

function extractCourseUpdates(body) {
  const updates = {};
  const strKeys = ['name', 'category', 'deliveryMode', 'level', 'description', 'syllabusUrl', 'thumbnailUrl', 'status'];
  for (const k of strKeys) {
    if (body[k] !== undefined) {
      updates[k] = typeof body[k] === 'string' ? body[k].trim() : body[k];
    }
  }
  if (body.credits !== undefined) updates.credits = Number.parseInt(body.credits, 10);
  if (body.totalSessions !== undefined) updates.totalSessions = Number.parseInt(body.totalSessions, 10);
  if (body.baseTuitionFee !== undefined) updates.baseTuitionFee = Number.parseFloat(body.baseTuitionFee);
  if (body.instructorId !== undefined) {
    updates.instructorId = body.instructorId ? Number.parseInt(body.instructorId, 10) : null;
  }
  return updates;
}

// UC3.1: Cập nhật môn học / khóa học
router.put('/courses/:id', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return errorResponse(res, 'ID môn học không hợp lệ', 400);

    const updateDoc = extractCourseUpdates(req.body);
    const updated = await Course.findOneAndUpdate(
      { id },
      { $set: updateDoc },
      { new: true, runValidators: true }
    );
    if (!updated) return errorResponse(res, 'Không tìm thấy môn học', 404);

    return successResponse(res, plain(updated), 'Cập nhật môn học thành công');
  } catch (error) {
    console.error('Error updating course:', error);
    return errorResponse(res, 'Lỗi cập nhật môn học', 500);
  }
});

// UC3.1: Xóa môn học (Nếu đã có lớp thì Soft-delete chuyển sang INACTIVE, nếu chưa có thì xóa cứng)
router.delete('/courses/:id', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return errorResponse(res, 'ID môn học không hợp lệ', 400);
    const countClasses = await Class.countDocuments({ courseId: id });

    if (countClasses > 0) {
      const deactivated = await Course.findOneAndUpdate({ id }, { $set: { status: 'INACTIVE' } }, { new: true });
      return successResponse(
        res,
        plain(deactivated),
        `Môn học đã có ${countClasses} lớp liên kết. Đã tự động chuyển trạng thái sang 'INACTIVE' (Ngưng mở môn) để bảo toàn dữ liệu lịch sử.`
      );
    }

    const deleted = await Course.deleteOne({ id });
    if (!deleted.deletedCount) return errorResponse(res, 'Không tìm thấy môn học', 404);
    return successResponse(res, null, 'Xóa môn học thành công');
  } catch (error) {
    console.error('Error deleting course:', error);
    return errorResponse(res, 'Lỗi khi xóa môn học', 500);
  }
});

// ==========================================
// 5. COURSE LESSONS MANAGEMENT (UC3.2)
// ==========================================

// UC3.2: Lấy danh sách bài giảng của khóa học
router.get('/courses/:id/lessons', authenticateJWT, async (req, res) => {
  try {
    const courseId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(courseId)) return errorResponse(res, 'ID khóa học không hợp lệ', 400);

    const course = await Course.findOne({ id: courseId });
    if (!course) return errorResponse(res, 'Không tìm thấy khóa học', 404);
    if (req.user.role === 'TEACHER' && !await teacherCanManageCourse(courseId, req.user)) {
      return errorResponse(res, 'Bạn không được phân công khóa học này', 403);
    }

    const lessons = await CourseLesson.find({ courseId }).sort({ orderIndex: 1, createdAt: 1 });
    return successResponse(res, lessons.map(plain), 'Lấy danh sách bài giảng thành công');
  } catch (error) {
    console.error('Error fetching course lessons:', error);
    return errorResponse(res, 'Lỗi khi lấy danh sách bài giảng', 500);
  }
});

// UC3.2: Thêm bài giảng mới vào khóa học
router.post('/courses/:id/lessons', authenticateJWT, authorizeRoles('ADMIN', 'TEACHER'), async (req, res) => {
  try {
    const courseId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(courseId)) return errorResponse(res, 'ID khóa học không hợp lệ', 400);

    const course = await Course.findOne({ id: courseId });
    if (!course) return errorResponse(res, 'Không tìm thấy khóa học', 404);
    if (req.user.role === 'TEACHER' && !await teacherCanManageCourse(courseId, req.user)) {
      return errorResponse(res, 'Bạn không được phân công khóa học này', 403);
    }

    const { sectionTitle, title, orderIndex, videoUrl, materialUrl, durationMinutes, isPreview } = req.body;
    if (!title || !String(title).trim()) {
      return errorResponse(res, 'Tiêu đề bài học là bắt buộc', 400);
    }

    let lessonOrder = orderIndex ? Number.parseInt(orderIndex, 10) : null;
    if (!lessonOrder) {
      const count = await CourseLesson.countDocuments({ courseId });
      lessonOrder = count + 1;
    }

    const lesson = await CourseLesson.create({
      courseId,
      sectionTitle: (sectionTitle || 'Chương 1').trim(),
      title: title.trim(),
      orderIndex: lessonOrder,
      videoUrl: videoUrl || null,
      materialUrl: materialUrl || null,
      durationMinutes: Number.parseInt(durationMinutes, 10) || 0,
      isPreview: Boolean(isPreview)
    });

    return successResponse(res, plain(lesson), 'Thêm bài giảng mới thành công', 201);
  } catch (error) {
    console.error('Error creating course lesson:', error);
    return errorResponse(res, 'Lỗi khi tạo bài giảng mới', 500);
  }
});

// UC3.2: Cập nhật bài giảng
router.put('/lessons/:lessonId', authenticateJWT, authorizeRoles('ADMIN', 'TEACHER'), async (req, res) => {
  try {
    const lessonId = Number.parseInt(req.params.lessonId, 10);
    if (Number.isNaN(lessonId)) return errorResponse(res, 'ID bài giảng không hợp lệ', 400);
    const lesson = await CourseLesson.findOne({ id: lessonId }).select('courseId');
    if (!lesson) return errorResponse(res, 'Không tìm thấy bài giảng', 404);
    if (req.user.role === 'TEACHER' && !await teacherCanManageCourse(lesson.courseId, req.user)) {
      return errorResponse(res, 'Bạn không được phân công bài giảng này', 403);
    }

    const { sectionTitle, title, orderIndex, videoUrl, materialUrl, durationMinutes, isPreview } = req.body;

    const updated = await CourseLesson.findOneAndUpdate(
      { id: lessonId },
      {
        $set: {
          ...(sectionTitle !== undefined ? { sectionTitle: sectionTitle.trim() } : {}),
          ...(title !== undefined ? { title: title.trim() } : {}),
          ...(orderIndex !== undefined ? { orderIndex: Number.parseInt(orderIndex, 10) } : {}),
          ...(videoUrl !== undefined ? { videoUrl } : {}),
          ...(materialUrl !== undefined ? { materialUrl } : {}),
          ...(durationMinutes !== undefined ? { durationMinutes: Number.parseInt(durationMinutes, 10) } : {}),
          ...(isPreview !== undefined ? { isPreview: Boolean(isPreview) } : {})
        }
      },
      { new: true, runValidators: true }
    );

    if (!updated) return errorResponse(res, 'Không tìm thấy bài giảng', 404);
    return successResponse(res, plain(updated), 'Cập nhật bài giảng thành công');
  } catch (error) {
    console.error('Error updating course lesson:', error);
    return errorResponse(res, 'Lỗi khi cập nhật bài giảng', 500);
  }
});

// UC3.2: Xóa bài giảng
router.delete('/lessons/:lessonId', authenticateJWT, authorizeRoles('ADMIN', 'TEACHER'), async (req, res) => {
  try {
    const lessonId = Number.parseInt(req.params.lessonId, 10);
    if (Number.isNaN(lessonId)) return errorResponse(res, 'ID bài giảng không hợp lệ', 400);
    const lesson = await CourseLesson.findOne({ id: lessonId }).select('courseId');
    if (!lesson) return errorResponse(res, 'Không tìm thấy bài giảng', 404);
    if (req.user.role === 'TEACHER' && !await teacherCanManageCourse(lesson.courseId, req.user)) {
      return errorResponse(res, 'Bạn không được phân công bài giảng này', 403);
    }

    const deleted = await CourseLesson.deleteOne({ id: lessonId });
    if (!deleted.deletedCount) return errorResponse(res, 'Không tìm thấy bài giảng', 404);
    return successResponse(res, null, 'Xóa bài giảng thành công');
  } catch (error) {
    console.error('Error deleting course lesson:', error);
    return errorResponse(res, 'Lỗi khi xóa bài giảng', 500);
  }
});


module.exports = router;
