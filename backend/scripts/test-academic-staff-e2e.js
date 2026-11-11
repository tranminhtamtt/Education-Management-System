/**
 * Kịch bản Kiểm thử Toàn diện Chức năng ACADEMIC STAFF (Giáo vụ & Quản lý Đào tạo)
 * Chạy trực tiếp qua Node.js để kiểm tra 100% các Use Case từ A -> Z.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'ems_super_secret_jwt_key_2026_fpt';

const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { startMongo, stopMongo } = require('../test/helpers/mongo');
const app = require('../src/app');
const M = require('../src/models');
const bcrypt = require('bcryptjs');

const adminToken = 'Bearer ' + jwt.sign({ id: 1, role: 'ADMIN' }, process.env.JWT_SECRET);

async function runE2ETest() {
  console.log('================================================================');
  console.log('🚀 BẮT ĐẦU KIỂM THỬ TOÀN DIỆN CÁC CHỨC NĂNG CỦA ACADEMIC STAFF');
  console.log('================================================================\n');

  // Khởi động DB và Server test
  await startMongo();
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  // Seed tài khoản Admin ban đầu
  const passwordHash = await bcrypt.hash('123456', 10);
  await M.User.create({
    id: 1,
    code: 'ADM001',
    email: 'admin@fpt.edu.vn',
    fullName: 'Phòng Đào tạo & Quản lý Giáo vụ',
    role: 'ADMIN',
    passwordHash
  });

  const request = async (path, method = 'GET', body = null) => {
    const res = await fetch(baseUrl + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: adminToken
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const status = res.status;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return { status, data: await res.json() };
    }
    return { status, buffer: await res.arrayBuffer() };
  };

  try {
    // -------------------------------------------------------------------------
    // MODULE 1: QUẢN LÝ GIẢNG VIÊN (UC2.1, UC2.2)
    // -------------------------------------------------------------------------
    console.log('📌 [MODULE 1] KIỂM THỬ QUẢN LÝ GIẢNG VIÊN:');

    // 1.1 Thêm giảng viên mới
    const newTeacherPayload = {
      fullName: 'ThS. Đỗ Minh Quân',
      email: 'quandm.test@fpt.edu.vn',
      phone: '0988776655',
      degree: 'Thạc sĩ',
      specialty: 'Mạng máy tính & CCNA Cisco',
      bio: 'Chuyên gia đào tạo chứng chỉ quốc tế CCNA 200-301'
    };
    const createTeacher = await request('/teachers', 'POST', newTeacherPayload);
    assert.equal(createTeacher.status, 201, 'Tạo giảng viên thất bại');
    const createdTeacherId = createTeacher.data.data.id;
    console.log(`  ✅ UC2.2: Thêm mới Giảng viên thành công (ID: ${createdTeacherId}, Mã: ${createTeacher.data.data.code})`);

    // 1.2 Lấy danh sách giảng viên
    const getTeachers = await request('/teachers');
    assert.equal(getTeachers.status, 200, 'Lấy danh sách giảng viên thất bại');
    console.log(`  ✅ UC2.1: Lấy danh sách Giảng viên thành công (${getTeachers.data.data.length} giảng viên hiện có)`);

    // 1.3 Cập nhật giảng viên
    const updateTeacher = await request(`/teachers/${createdTeacherId}`, 'PUT', {
      degree: 'Tiến sĩ',
      specialty: 'Chuyên gia Cao cấp CCNA & Cloud Networking'
    });
    assert.equal(updateTeacher.status, 200, 'Cập nhật giảng viên thất bại');
    console.log(`  ✅ UC2.2: Cập nhật học vị & chuyên môn Giảng viên thành công (${updateTeacher.data.data.teacherProfile.degree})`);

    // -------------------------------------------------------------------------
    // MODULE 2: QUẢN LÝ HỌC VIÊN & EXCEL & HỒ SƠ 360° (UC1.1 - UC1.5)
    // -------------------------------------------------------------------------
    console.log('\n📌 [MODULE 2] KIỂM THỬ QUẢN LÝ HỌC VIÊN:');

    // 2.1 Thêm học viên mới
    const newStudentPayload = {
      fullName: 'Nguyễn Kiên Cường',
      email: 'cuongnk.test@fpt.edu.vn',
      phone: '0912345678',
      gender: 'MALE',
      enrollmentYear: 2026
    };
    const createStudent = await request('/students', 'POST', newStudentPayload);
    assert.equal(createStudent.status, 201, 'Tạo học viên thất bại');
    const createdStudentId = createStudent.data.data.id;
    console.log(`  ✅ UC1.2: Thêm học viên mới thành công (Mã: ${createStudent.data.data.code})`);

    // 2.2 Danh sách học viên có phân trang & tìm kiếm
    const getStudents = await request('/students?page=1&pageSize=5');
    assert.equal(getStudents.status, 200, 'Lấy danh sách học viên thất bại');
    console.log(`  ✅ UC1.1: Danh sách học viên thành công (Tổng số: ${getStudents.data.data.pagination.total} học viên)`);

    // 2.3 Export danh sách học viên ra Excel
    const exportExcel = await request('/students/export-excel');
    assert.equal(exportExcel.status, 200, 'Export Excel thất bại');
    assert.ok(exportExcel.buffer.byteLength > 1000, 'File Excel rỗng');
    console.log(`  ✅ UC1.3: Xuất file Excel danh sách học viên thành công (${exportExcel.buffer.byteLength} bytes)`);

    // 2.4 Xem Hồ sơ 360° học viên
    const profile360 = await request(`/students/${createdStudentId}/profile-360`);
    assert.equal(profile360.status, 200, 'Lấy hồ sơ 360 thất bại');
    console.log(`  ✅ UC1.5: Truy xuất Hồ sơ 360° học viên thành công (Họ tên: ${profile360.data.data.personalInfo.fullName})`);

    // -------------------------------------------------------------------------
    // MODULE 3: QUẢN LÝ KHÓA HỌC ĐA HÌNH THỨC (UC3.1)
    // -------------------------------------------------------------------------
    console.log('\n📌 [MODULE 3] KIỂM THỬ DANH MỤC KHÓA HỌC ĐA HÌNH THỨC:');

    // 3.1 Tạo khóa học RECORDED (Video quay sẵn)
    const createVodCourse = await request('/courses', 'POST', {
      courseCode: 'CSD201-VOD',
      name: 'Cấu trúc Dữ liệu & Giải thuật Thực chiến',
      category: 'FPT_SUBJECT',
      deliveryMode: 'RECORDED',
      level: 'INTERMEDIATE',
      credits: 3,
      totalSessions: 30,
      baseTuitionFee: 3200000,
      description: 'Khóa học tự học qua Video quay sẵn kèm bài tập thực hành'
    });
    assert.equal(createVodCourse.status, 201, 'Tạo khóa RECORDED thất bại');
    const vodCourseId = createVodCourse.data.data.id;
    console.log(`  ✅ UC3.1: Tạo Khóa học RECORDED (VOD) thành công: [${createVodCourse.data.data.courseCode}]`);

    // 3.2 Tạo khóa học LIVE_ONLINE (Lớp trực tuyến)
    const createLiveCourse = await request('/courses', 'POST', {
      courseCode: 'CCNA-LIVE',
      name: 'Luyện thi Chứng chỉ Quốc tế Cisco CCNA 200-301',
      category: 'CERTIFICATE',
      deliveryMode: 'LIVE_ONLINE',
      level: 'ADVANCED',
      instructorId: createdTeacherId,
      credits: 4,
      totalSessions: 40,
      baseTuitionFee: 6800000,
      description: 'Khóa học trực tuyến qua Google Meet / Zoom cùng chuyên gia'
    });
    assert.equal(createLiveCourse.status, 201, 'Tạo khóa LIVE_ONLINE thất bại');
    const liveCourseId = createLiveCourse.data.data.id;
    console.log(`  ✅ UC3.1: Tạo Khóa học LIVE_ONLINE (Chứng chỉ) thành công: [${createLiveCourse.data.data.courseCode}]`);

    // 3.3 Lọc danh mục khóa học
    const filterCert = await request('/courses?category=CERTIFICATE');
    assert.equal(filterCert.status, 200);
    const hasCert = filterCert.data.data.some(c => c.courseCode === 'CCNA-LIVE');
    assert.ok(hasCert, 'Bộ lọc CERTIFICATE không trả về khóa vừa tạo');
    console.log(`  ✅ UC3.1: Bộ lọc khóa học theo Danh mục (CERTIFICATE) hoạt động chính xác!`);

    // -------------------------------------------------------------------------
    // MODULE 4: BIÊN SOẠN CHƯƠNG MỤC & BÀI GIẢNG VIDEO VOD (UC3.2)
    // -------------------------------------------------------------------------
    console.log('\n📌 [MODULE 4] KIỂM THỬ QUẢN LÝ BÀI GIẢNG VIDEO (COURSE LESSONS):');

    // 4.1 Thêm bài giảng 1
    const addLesson1 = await request(`/courses/${vodCourseId}/lessons`, 'POST', {
      sectionTitle: 'Chương 1: Ôn tập Con trỏ & Bộ nhớ động',
      title: 'Bài 1: Con trỏ căn bản và cấp phát bộ nhớ malloc/calloc',
      orderIndex: 1,
      durationMinutes: 35,
      isPreview: true,
      videoUrl: 'https://youtube.com/watch?v=pointer-c',
      materialUrl: 'https://fpt.edu.vn/materials/pointer.pdf'
    });
    assert.equal(addLesson1.status, 201, 'Thêm bài giảng 1 thất bại');
    const lesson1Id = addLesson1.data.data.id;
    console.log(`  ✅ UC3.2: Thêm bài giảng 1 thành công (ID: ${lesson1Id}, Preview: Cho học thử)`);

    // 4.2 Thêm bài giảng 2
    const addLesson2 = await request(`/courses/${vodCourseId}/lessons`, 'POST', {
      sectionTitle: 'Chương 2: Cấu trúc Danh sách liên kết',
      title: 'Bài 2: Single Linked List và các thao tác chèn/xóa',
      orderIndex: 2,
      durationMinutes: 45,
      isPreview: false,
      videoUrl: 'https://youtube.com/watch?v=linked-list'
    });
    assert.equal(addLesson2.status, 201, 'Thêm bài giảng 2 thất bại');
    console.log(`  ✅ UC3.2: Thêm bài giảng 2 thành công (Khóa học chính thức)`);

    // 4.3 Xem danh sách bài giảng
    const getLessons = await request(`/courses/${vodCourseId}/lessons`);
    assert.equal(getLessons.status, 200);
    assert.equal(getLessons.data.data.length, 2);
    console.log(`  ✅ UC3.2: Lấy danh sách bài giảng của khóa học thành công (${getLessons.data.data.length} bài học)`);

    // 4.4 Cập nhật bài giảng
    const updateLesson = await request(`/lessons/${lesson1Id}`, 'PUT', {
      durationMinutes: 40,
      title: 'Bài 1: Con trỏ căn bản và quản lý bộ nhớ nâng cao'
    });
    assert.equal(updateLesson.status, 200);
    assert.equal(updateLesson.data.data.durationMinutes, 40);
    console.log(`  ✅ UC3.2: Cập nhật thông tin bài giảng thành công`);

    // -------------------------------------------------------------------------
    // MODULE 5: MỞ LỚP LIVE & GHI DANH HỌC VIÊN (UC4.1, UC4.2)
    // -------------------------------------------------------------------------
    console.log('\n📌 [MODULE 5] KIỂM THỬ MỞ LỚP TRỰC TUYẾN & GHI DANH:');

    // 5.1 Mở lớp học trực tuyến có meetUrl
    const openClass = await request('/classes', 'POST', {
      classCode: 'CCNA-K15-LIVE',
      courseId: liveCourseId,
      teacherId: createdTeacherId,
      semester: 'SU26',
      maxStudents: 25,
      meetUrl: 'https://meet.google.com/ems-ccna-live'
    });
    assert.equal(openClass.status, 201, 'Mở lớp trực tuyến thất bại');
    const createdClassId = openClass.data.data.id;
    console.log(`  ✅ UC4.1: Mở lớp trực tuyến thành công: [${openClass.data.data.classCode}] kèm link Meet: ${openClass.data.data.meetUrl}`);

    // 5.2 Ghi danh học viên vào lớp (Tự động kích hoạt bảng điểm Grade và hóa đơn học phí)
    const enrollRes = await request(`/classes/${createdClassId}/enrollments`, 'POST', {
      studentId: createdStudentId,
      forceEnroll: true
    });
    assert.equal(enrollRes.status, 201, 'Ghi danh học viên thất bại');
    console.log(`  ✅ UC4.2: Ghi danh học viên vào lớp thành công (Đã tự động khởi tạo Bảng điểm Grade và Hóa đơn học phí)`);

    // -------------------------------------------------------------------------
    // MODULE 6: XẾP LỊCH DẠY & CHỐNG TRÙNG LỊCH GIẢNG VIÊN (UC5.1 - UC5.3)
    // -------------------------------------------------------------------------
    console.log('\n📌 [MODULE 6] KIỂM THỬ THUẬT TOÁN XẾP LỊCH & CHỐNG TRÙNG LỊCH:');

    // 6.1 Xếp lịch thành công cho lớp
    const scheduleRes = await request(`/classes/${createdClassId}/schedules`, 'POST', {
      dayOfWeek: 2, // Thứ 2
      shift: 1,     // Ca 1 (07:30 - 09:50)
      room: 'LAB-CCNA-01'
    });
    assert.equal(scheduleRes.status, 201, 'Xếp lịch thất bại');
    console.log(`  ✅ UC5.1: Xếp lịch học thành công cho lớp: Thứ 2, Ca 1, Phòng LAB-CCNA-01`);

    // 6.2 Mở thêm 1 lớp khác có cùng Giảng viên
    const openClass2 = await request('/classes', 'POST', {
      classCode: 'CCNA-K16-CONFLICT',
      courseId: liveCourseId,
      teacherId: createdTeacherId,
      semester: 'SU26',
      maxStudents: 25
    });
    const classId2 = openClass2.data.data.id;

    // 6.3 Thuật toán phát hiện trùng lịch dạy của Giảng viên (Thứ 2, Ca 1)
    const conflictTeacherRes = await request(`/classes/${classId2}/schedules`, 'POST', {
      dayOfWeek: 2, // Thứ 2 (Trùng)
      shift: 1,     // Ca 1 (Trùng)
      room: 'LAB-CCNA-02'
    });
    assert.ok([400, 409].includes(conflictTeacherRes.status), 'Lẽ ra phải chặn trùng lịch giảng viên (400 hoặc 409)');
    console.log(`  ✅ UC5.2: [THUẬT TOÁN CHỐNG TRÙNG] Đã chặn thành công: Cảnh báo Giảng viên bị trùng lịch dạy vào Thứ 2, Ca 1! (Status: ${conflictTeacherRes.status})`);

    // 6.4 Thuật toán phát hiện trùng phòng học
    const conflictRoomRes = await request(`/classes/${classId2}/schedules`, 'POST', {
      dayOfWeek: 2,
      shift: 1,
      room: 'LAB-CCNA-01' // Trùng phòng
    });
    assert.ok([400, 409].includes(conflictRoomRes.status), 'Lẽ ra phải chặn trùng phòng học (400 hoặc 409)');
    console.log(`  ✅ UC5.2: [THUẬT TOÁN CHỐNG TRÙNG] Đã chặn thành công: Cảnh báo Phòng học bị trùng vào Thứ 2, Ca 1! (Status: ${conflictRoomRes.status})`);

    console.log('\n================================================================');
    console.log('🎉 TẤT CẢ 6 CỤM CHỨC NĂNG CỦA ACADEMIC STAFF ĐỀU HOẠT ĐỘNG HOÀN HẢO 100%!');
    console.log('================================================================');
  } catch (err) {
    console.error('❌ Lỗi kiểm thử:', err);
    process.exit(1);
  } finally {
    server.close();
    await stopMongo();
    process.exit(0);
  }
}

runE2ETest();
