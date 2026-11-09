const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const xlsx = require('xlsx');
const fs = require('fs');
const upload = require('../../config/upload');
const { login, getMe } = require('./auth.controller');
const authenticateJWT = require('../../middlewares/auth.middleware');
const authorizeRoles = require('../../middlewares/role.middleware');
const { User, Course, Class, Enrollment } = require('../../models');
const { like, plain } = require('../../utils/query');
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


// ==========================================
// UC1.3: IMPORT / EXPORT EXCEL HỌC VIÊN
// ==========================================

// Tải file Excel mẫu để nhập học viên
const generateStudentTemplate = (req, res) => {
  try {
    const templateData = [
      {
        'Họ và tên': 'Nguyễn Văn An',
        'Email': 'annv@fpt.edu.vn',
        'Số điện thoại': '0901234567',
        'Giới tính (Nam/Nữ)': 'Nam',
        'Ngày sinh (YYYY-MM-DD)': '2004-05-15',
        'Khóa tuyển sinh': 2026,
        'Địa chỉ': 'Hà Nội'
      },
      {
        'Họ và tên': 'Trần Thị Bình',
        'Email': 'binhtt@fpt.edu.vn',
        'Số điện thoại': '0901234568',
        'Giới tính (Nam/Nữ)': 'Nữ',
        'Ngày sinh (YYYY-MM-DD)': '2004-08-20',
        'Khóa tuyển sinh': 2026,
        'Địa chỉ': 'Đà Nẵng'
      }
    ];

    const worksheet = xlsx.utils.json_to_sheet(templateData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Mau_Hoc_Vien');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="Mau_Import_Hoc_Vien.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (error) {
    console.error('Error generating template:', error);
    return errorResponse(res, 'Lỗi khi tạo file mẫu Excel', 500);
  }
};

router.get('/students/template-excel', authenticateJWT, authorizeRoles('ADMIN'), generateStudentTemplate);
router.get('/students/import/template', authenticateJWT, authorizeRoles('ADMIN'), generateStudentTemplate);

// Xuất danh sách học viên ra file Excel
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

// Import học viên hàng loạt từ file Excel
const handleStudentImport = async (req, res) => {
  if (!req.file) {
    return errorResponse(res, 'Vui lòng tải lên file Excel (.xlsx, .xls)', 400);
  }

  const filePath = req.file.path;
  try {
    const workbook = xlsx.readFile(filePath);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = xlsx.utils.sheet_to_json(worksheet);

    if (!rows || rows.length === 0) {
      return errorResponse(res, 'File Excel không có dữ liệu', 400);
    }

    let createdCount = 0;
    let skippedCount = 0;
    const errors = [];
    const defaultPasswordHash = await bcrypt.hash('123456', 10);
    let currentStudentCount = await User.countDocuments({ role: 'STUDENT' });

    const existingUsers = await User.find({}, 'code email').lean();
    const existingEmails = new Set(existingUsers.map(u => (u.email || '').toLowerCase()));
    const existingCodes = new Set(existingUsers.map(u => (u.code || '').toLowerCase()));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const fullName = (row['Họ và tên'] || row['Họ và Tên'] || row['Ho va ten'] || row['fullName'] || row['Name'] || '').toString().trim();
      const email = (row['Email'] || row['email'] || '').toString().trim().toLowerCase();
      const phone = (row['Số điện thoại'] || row['Điện thoại'] || row['So dien thoai'] || row['phone'] || '').toString().trim();
      const genderRaw = (row['Giới tính (Nam/Nữ)'] || row['Giới tính'] || row['gender'] || '').toString().trim().toLowerCase();
      const dobRaw = row['Ngày sinh (YYYY-MM-DD)'] || row['Ngày sinh'] || row['dob'];
      const enrollmentYearRaw = row['Khóa tuyển sinh'] || row['Năm nhập học'] || row['Khóa'] || row['enrollmentYear'];
      const address = (row['Địa chỉ'] || row['address'] || '').toString().trim();
      let code = (row['Mã SV'] || row['Mã học viên'] || row['code'] || '').toString().trim();

      if (!fullName || !email) {
        errors.push(`Dòng ${i + 2}: Thiếu Họ tên hoặc Email`);
        continue;
      }

      if (existingEmails.has(email)) {
        skippedCount++;
        continue;
      }

      const year = enrollmentYearRaw ? parseInt(enrollmentYearRaw) : new Date().getFullYear();
      if (!code) {
        currentStudentCount++;
        code = `STU${year}${String(currentStudentCount).padStart(3, '0')}`;
      }

      if (existingCodes.has(code.toLowerCase())) {
        currentStudentCount++;
        code = `STU${year}${String(currentStudentCount).padStart(3, '0')}`;
      }

      let gender = 'MALE';
      if (genderRaw.includes('nữ') || genderRaw.includes('nu') || genderRaw.includes('female')) gender = 'FEMALE';
      else if (genderRaw.includes('khác') || genderRaw.includes('khac') || genderRaw.includes('other')) gender = 'OTHER';

      let dob = null;
      if (dobRaw) {
        const parsedDate = new Date(dobRaw);
        if (!isNaN(parsedDate.getTime())) {
          dob = parsedDate;
        }
      }

      try {
        await User.create({
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
            enrollmentYear: year
          }
        });
        existingEmails.add(email);
        existingCodes.add(code.toLowerCase());
        createdCount++;
      } catch (err) {
        errors.push(`Dòng ${i + 2}: ${err.message}`);
      }
    }

    return successResponse(
      res,
      {
        totalRows: rows.length,
        createdCount,
        skippedCount,
        errors
      },
      `Import Excel hoàn tất: Đã tạo ${createdCount} học viên mới, bỏ qua ${skippedCount} bản ghi trùng.`
    );
  } catch (error) {
    console.error('Error importing students from Excel:', error);
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }
    return errorResponse(res, `Lỗi khi xử lý file Excel: ${error.message}`, 500);
  }
};

router.post('/students/import-excel', authenticateJWT, authorizeRoles('ADMIN'), upload.single('file'), handleStudentImport);
router.post('/students/import', authenticateJWT, authorizeRoles('ADMIN'), upload.single('file'), handleStudentImport);

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

// ==========================================
// 4. COURSES MANAGEMENT (UC3.1)
// ==========================================

// UC3.1: Lấy danh sách môn học
router.get('/courses', authenticateJWT, async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};

    const courses = await Course.find(where).sort({ courseCode: 1 });
    const counts = await Class.aggregate([{ $group: { _id: '$courseId', n: { $sum: 1 } } }]);
    const countMap = new Map(counts.map(c => [c._id, c.n]));

    return successResponse(
      res,
      courses.map(c => ({
        ...plain(c),
        totalClasses: countMap.get(c.id) || 0
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

    const existing = await Course.findOne({ courseCode: String(courseCode).toUpperCase().trim() });
    if (existing) {
      return errorResponse(res, `Mã môn ${courseCode} đã tồn tại`, 400);
    }

    const course = await Course.create({
      courseCode: courseCode.toUpperCase().trim(),
      name: name.trim(),
      credits: parseInt(credits),
      totalSessions: parseInt(totalSessions) || 30,
      baseTuitionFee: parseFloat(baseTuitionFee) || 5000000.0,
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

// UC3.1: Cập nhật môn học
router.put('/courses/:id', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, credits, totalSessions, baseTuitionFee, description, syllabusUrl, status } = req.body;

    const updated = await Course.findOneAndUpdate(
      { id },
      {
        $set: {
          ...(name ? { name: name.trim() } : {}),
          ...(credits ? { credits: parseInt(credits) } : {}),
          ...(totalSessions ? { totalSessions: parseInt(totalSessions) } : {}),
          ...(baseTuitionFee !== undefined ? { baseTuitionFee: parseFloat(baseTuitionFee) } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(syllabusUrl !== undefined ? { syllabusUrl } : {}),
          ...(status ? { status } : {})
        }
      },
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
    const id = parseInt(req.params.id);
    const countClasses = await Class.countDocuments({ courseId: id });

    if (countClasses > 0) {
      // Soft-delete chuyển trạng thái sang INACTIVE
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


module.exports = router;
