const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Khởi tạo dữ liệu mẫu chuẩn đặc tả Use Case cho hệ thống EMS...');

  // Mật khẩu chung mặc định: "123456"
  const passwordHash = await bcrypt.hash('123456', 10);

  // 1. Dọn sạch dữ liệu cũ theo đúng thứ tự ràng buộc khóa ngoại
  await prisma.studentRequest.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.tuitionPayment.deleteMany();
  await prisma.tuitionInvoice.deleteMany();
  await prisma.grade.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.class.deleteMany();
  await prisma.course.deleteMany();
  await prisma.teacherProfile.deleteMany();
  await prisma.studentProfile.deleteMany();
  await prisma.user.deleteMany();

  // 2. Người 1: System Admin & Giáo vụ (Academic Staff)
  const admin = await prisma.user.create({
    data: {
      code: 'ADM001',
      email: 'admin@fpt.edu.vn',
      passwordHash,
      fullName: 'Phòng Quản lý Đào tạo (Giáo vụ EMS)',
      role: 'ADMIN',
      phone: '02473005588',
      status: 'ACTIVE'
    }
  });

  // 3. Người 3: Accountant / Kế toán
  const accountant = await prisma.user.create({
    data: {
      code: 'ACC001',
      email: 'ketoan@fpt.edu.vn',
      passwordHash,
      fullName: 'Vũ Thị Kế Toán (Phòng Tài chính)',
      role: 'ACCOUNTANT',
      phone: '02473005599',
      status: 'ACTIVE'
    }
  });

  // 4. Người 4: Giảng viên (TEA001, TEA002)
  const teachersData = [
    {
      code: 'TEA001',
      email: 'namnh@fpt.edu.vn',
      name: 'ThS. Nguyễn Hoài Nam',
      specialty: 'Kỹ thuật Phần mềm (SE)',
      degree: 'Thạc sĩ'
    },
    {
      code: 'TEA002',
      email: 'linhtt@fpt.edu.vn',
      name: 'TS. Trần Thùy Linh',
      specialty: 'Khoa học Máy tính & AI',
      degree: 'Tiến sĩ'
    }
  ];

  const teachers = [];
  for (const t of teachersData) {
    const user = await prisma.user.create({
      data: {
        code: t.code,
        email: t.email,
        passwordHash,
        fullName: t.name,
        role: 'TEACHER',
        phone: '0981234567',
        status: 'ACTIVE',
        teacherProfile: {
          create: {
            degree: t.degree,
            specialty: t.specialty,
            bio: `Giảng viên phụ trách bộ môn ${t.specialty}.`
          }
        }
      }
    });
    teachers.push(user);
  }

  // 5. Người 5: Sinh viên (STU2026001 .. STU2026004)
  const studentsData = [
    { code: 'STU2026001', email: 'annv@fpt.edu.vn', name: 'Nguyễn Văn An', gender: 'MALE', year: 2026, address: 'Hà Nội' },
    { code: 'STU2026002', email: 'binhtt@fpt.edu.vn', name: 'Trần Thị Bình', gender: 'FEMALE', year: 2026, address: 'Đà Nẵng' },
    { code: 'STU2026003', email: 'cuonglh@fpt.edu.vn', name: 'Lê Hoàng Cường', gender: 'MALE', year: 2026, address: 'TP. Hồ Chí Minh' },
    { code: 'STU2026004', email: 'duchm@fpt.edu.vn', name: 'Hoàng Minh Đức', gender: 'MALE', year: 2026, address: 'Hải Phòng' }
  ];

  const students = [];
  for (const s of studentsData) {
    const user = await prisma.user.create({
      data: {
        code: s.code,
        email: s.email,
        passwordHash,
        fullName: s.name,
        role: 'STUDENT',
        phone: '0901234567',
        status: 'ACTIVE',
        studentProfile: {
          create: {
            dob: new Date('2004-05-15'),
            gender: s.gender,
            address: s.address,
            enrollmentYear: s.year
          }
        }
      }
    });
    students.push(user);
  }

  // 6. Danh mục Môn học (WEB101, JS201, PRN231)
  const coursesData = [
    {
      code: 'WEB101',
      name: 'Lập trình Web Cơ bản (HTML5, CSS3, JS)',
      credits: 3,
      totalSessions: 30,
      fee: 3000000.0,
      description: 'Môn học cơ sở phát triển giao diện web front-end hiện đại.',
      syllabusUrl: 'https://fap.fpt.edu.vn/syllabus/WEB101.pdf'
    },
    {
      code: 'JS201',
      name: 'Lập trình JavaScript Nâng cao & Frameworks',
      credits: 3,
      totalSessions: 30,
      fee: 3500000.0,
      description: 'Chuyên sâu về ES6+, Asynchronous, React và NodeJS.',
      syllabusUrl: 'https://fap.fpt.edu.vn/syllabus/JS201.pdf'
    },
    {
      code: 'PRN231',
      name: 'Building Web Applications with Node.js & Express',
      credits: 3,
      totalSessions: 30,
      fee: 4000000.0,
      description: 'Xây dựng RESTful API và kiến trúc phân tán.',
      syllabusUrl: 'https://fap.fpt.edu.vn/syllabus/PRN231.pdf'
    }
  ];

  const courses = [];
  for (const c of coursesData) {
    const course = await prisma.course.create({
      data: {
        courseCode: c.code,
        name: c.name,
        credits: c.credits,
        totalSessions: c.totalSessions,
        baseTuitionFee: c.fee,
        description: c.description,
        syllabusUrl: c.syllabusUrl,
        status: 'ACTIVE'
      }
    });
    courses.push(course);
  }

  // 7. Mở các Lớp học phần theo Kịch bản
  // Lớp WEB101-2026A-01: max_students = 3 (Đặc tả BF-ACAD-1)
  const classWeb = await prisma.class.create({
    data: {
      classCode: 'WEB101-2026A-01',
      courseId: courses[0].id,
      teacherId: teachers[0].id, // GV TEA001
      semester: '2026A',
      maxStudents: 3,
      status: 'ONGOING'
    }
  });

  // Lớp JS201-2026A-01 (GV TEA002)
  const classJs1 = await prisma.class.create({
    data: {
      classCode: 'JS201-2026A-01',
      courseId: courses[1].id,
      teacherId: teachers[1].id,
      semester: '2026A',
      maxStudents: 30,
      status: 'UPCOMING'
    }
  });

  // Lớp JS201-2026A-02 (GV TEA001) - Dùng test Trùng GV TEA001
  const classJs2 = await prisma.class.create({
    data: {
      classCode: 'JS201-2026A-02',
      courseId: courses[1].id,
      teacherId: teachers[0].id,
      semester: '2026A',
      maxStudents: 30,
      status: 'UPCOMING'
    }
  });

  // 8. Xếp Thời khóa biểu (UC5.1 - UC5.3)
  // Lớp WEB101-2026A-01: Thứ 2 (dayOfWeek=2), Slot 1 (07:30 - 09:50) tại phòng P101
  await prisma.schedule.create({
    data: {
      classId: classWeb.id,
      dayOfWeek: 2,
      shift: 1,
      startTime: new Date('1970-01-01T07:30:00Z'),
      endTime: new Date('1970-01-01T09:50:00Z'),
      room: 'P101'
    }
  });

  // Lớp JS201-2026A-02: Thứ 4 (dayOfWeek=4), Slot 3 (12:50 - 15:10) tại phòng P102 (Hợp lệ)
  await prisma.schedule.create({
    data: {
      classId: classJs2.id,
      dayOfWeek: 4,
      shift: 3,
      startTime: new Date('1970-01-01T12:50:00Z'),
      endTime: new Date('1970-01-01T15:10:00Z'),
      room: 'P102'
    }
  });

  // 9. Ghi danh (Enrollment) 3 sinh viên vào lớp WEB101-2026A-01 (Đủ sĩ số 3/3!)
  // Sinh viên thứ 4 (STU2026004) chưa ghi danh để kiểm thử lỗi "Vượt sĩ số 3/3"
  console.log('📌 Ghi danh 3 sinh viên vào lớp WEB101-2026A-01 (Sĩ số 3/3)...');

  // STU2026001: Điểm 9/7/8 -> total = 7.8, Qua môn. Học phí 3tr, đã đóng 1tr (PARTIAL, nợ 2tr)
  const enr1 = await prisma.enrollment.create({
    data: { classId: classWeb.id, studentId: students[0].id, status: 'ACTIVE' }
  });
  await prisma.grade.create({
    data: {
      enrollmentId: enr1.id,
      attendanceScore: 9.0,
      midtermScore: 7.0,
      finalScore: 8.0,
      totalScore: 7.8,
      isPassed: true,
      isBanned: false
    }
  });
  const inv1 = await prisma.tuitionInvoice.create({
    data: {
      studentId: students[0].id,
      enrollmentId: enr1.id,
      amount: 3000000.0,
      paidAmount: 1000000.0,
      dueDate: new Date('2026-11-30'),
      status: 'PARTIAL',
      paidAt: null
    }
  });
  await prisma.tuitionPayment.create({
    data: {
      invoiceId: inv1.id,
      receiptNo: 'PT-202611-00001',
      amount: 1000000.0,
      method: 'BANK_TRANSFER',
      note: 'Học viên STU2026001 nộp học phí đợt 1',
      collectedById: accountant.id,
      paidAt: new Date('2026-11-01T10:00:00Z')
    }
  });

  // STU2026002: Điểm 10/3/4 -> total = 4.3, Qua môn. Học phí 3tr, UNPAID
  const enr2 = await prisma.enrollment.create({
    data: { classId: classWeb.id, studentId: students[1].id, status: 'ACTIVE' }
  });
  await prisma.grade.create({
    data: {
      enrollmentId: enr2.id,
      attendanceScore: 10.0,
      midtermScore: 3.0,
      finalScore: 4.0,
      totalScore: 4.3,
      isPassed: true,
      isBanned: false
    }
  });
  await prisma.tuitionInvoice.create({
    data: {
      studentId: students[1].id,
      enrollmentId: enr2.id,
      amount: 3000000.0,
      paidAmount: 0.0,
      dueDate: new Date('2026-11-30'),
      status: 'UNPAID',
      paidAt: null
    }
  });

  // STU2026003: Điểm 8/2/3 -> total = 3.2, Trượt môn. Vắng 3/10 buổi (30% > 20% -> Cảnh báo). Học phí UNPAID
  const enr3 = await prisma.enrollment.create({
    data: { classId: classWeb.id, studentId: students[2].id, status: 'ACTIVE' }
  });
  await prisma.grade.create({
    data: {
      enrollmentId: enr3.id,
      attendanceScore: 8.0,
      midtermScore: 2.0,
      finalScore: 3.0,
      totalScore: 3.2,
      isPassed: false,
      isBanned: false
    }
  });
  await prisma.tuitionInvoice.create({
    data: {
      studentId: students[2].id,
      enrollmentId: enr3.id,
      amount: 3000000.0,
      paidAmount: 0.0,
      dueDate: new Date('2026-11-30'),
      status: 'UNPAID',
      paidAt: null
    }
  });

  // Tạo 10 bản ghi điểm danh cho STU2026003 (3 buổi vắng không phép = 30%)
  const baseDate = new Date('2026-10-01');
  for (let s = 1; s <= 10; s++) {
    const sessionDate = new Date(baseDate);
    sessionDate.setDate(baseDate.getDate() + s * 3);
    const isAbsent = s <= 3; // 3 buổi đầu vắng
    await prisma.attendance.create({
      data: {
        classId: classWeb.id,
        studentId: students[2].id,
        sessionDate,
        status: isAbsent ? 'ABSENT_UNEXCUSED' : 'PRESENT',
        note: isAbsent ? 'Vắng không lý do' : 'Có mặt đúng giờ'
      }
    });
  }

  // 10. Bài tập & Thông báo mẫu
  const assignmentBT01 = await prisma.assignment.create({
    data: {
      classId: classWeb.id,
      title: 'BT01: Xây dựng Layout Responsive bằng CSS Grid & Flexbox',
      description: 'Yêu cầu hoàn thành giao diện dashboard thích ứng mobile và desktop.',
      fileUrl: '/uploads/de_bai_BT01.pdf',
      dueDate: new Date('2026-11-02T23:59:00Z')
    }
  });

  // Nộp bài tập mẫu: STU2026001 nộp đúng hạn, STU2026002 nộp muộn
  await prisma.submission.create({
    data: {
      assignmentId: assignmentBT01.id,
      studentId: students[0].id,
      fileUrl: '/uploads/bai_nop_STU2026001.zip',
      submittedAt: new Date('2026-11-02T20:00:00Z'),
      status: 'SUBMITTED',
      score: 9.0,
      teacherFeedback: 'Bài làm rất tốt, giao diện responsive mượt mà.'
    }
  });

  await prisma.submission.create({
    data: {
      assignmentId: assignmentBT01.id,
      studentId: students[1].id,
      fileUrl: '/uploads/bai_nop_STU2026002.zip',
      submittedAt: new Date('2026-11-03T08:00:00Z'), // Sau hạn
      status: 'LATE_SUBMITTED',
      score: 7.0,
      teacherFeedback: 'Nộp muộn 8 tiếng, trừ 1 điểm kỹ luật.'
    }
  });

  // Thông báo mẫu
  await prisma.notification.createMany({
    data: [
      {
        userId: null,
        title: 'Chào mừng năm học mới kỳ 2026A',
        message: 'Học kỳ 2026A chính thức bắt đầu từ ngày 01/11/2026.',
        type: 'SYSTEM'
      },
      {
        userId: students[0].id,
        title: 'Thông báo đóng học phí môn WEB101',
        message: 'Bạn còn nợ 2.000.000 đ học phí lớp WEB101-2026A-01. Quét VietQR để thanh toán.',
        type: 'TUITION'
      }
    ]
  });

  console.log('✅ Nạp dữ liệu mẫu thành công!');
  console.log('----------------------------------------------------');
  console.log('🔑 TÀI KHOẢN ĐĂNG NHẬP MẪU (Mật khẩu: 123456):');
  console.log('   - Giáo vụ / Admin (Người 1, 2): admin@fpt.edu.vn  (Mã: ADM001)');
  console.log('   - Kế toán (Người 3):           ketoan@fpt.edu.vn (Mã: ACC001)');
  console.log('   - Giảng viên (Người 4):        namnh@fpt.edu.vn  (Mã: TEA001)');
  console.log('                                  linhtt@fpt.edu.vn (Mã: TEA002)');
  console.log('   - Học viên (Người 5):          annv@fpt.edu.vn   (Mã: STU2026001)');
  console.log('                                  binhtt@fpt.edu.vn (Mã: STU2026002)');
  console.log('                                  cuonglh@fpt.edu.vn (Mã: STU2026003)');
  console.log('                                  duchm@fpt.edu.vn  (Mã: STU2026004)');
  console.log('----------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi nạp dữ liệu mẫu:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
