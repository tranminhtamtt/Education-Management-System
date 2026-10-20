const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed data for EMS...');

  // Mật khẩu chung đã băm: "123456"
  const passwordHash = await bcrypt.hash('123456', 10);

  // 1. Dọn sạch dữ liệu cũ theo thứ tự quan hệ
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

  // 2. Tạo Admin
  const admin = await prisma.user.create({
    data: {
      code: 'ADM001',
      email: 'admin@fpt.edu.vn',
      passwordHash,
      fullName: 'Phòng Quản lý Đào tạo FAP',
      role: 'ADMIN',
      phone: '02473005588',
      status: 'ACTIVE'
    }
  });

  // 2b. Tạo Kế toán (Accountant - Người 3)
  const accountant = await prisma.user.create({
    data: {
      code: 'ACC001',
      email: 'ketoan@fpt.edu.vn',
      passwordHash,
      fullName: 'Phòng Kế toán - Tài chính',
      role: 'ACCOUNTANT',
      phone: '02473005599',
      status: 'ACTIVE'
    }
  });

  let receiptSeq = 0;
  const createPayment = async (invoiceId, amount, paidAt, method, note) => {
    receiptSeq += 1;
    const ym = `${paidAt.getFullYear()}${String(paidAt.getMonth() + 1).padStart(2, '0')}`;
    await prisma.tuitionPayment.create({
      data: {
        invoiceId,
        receiptNo: `PT-${ym}-${String(receiptSeq).padStart(5, '0')}`,
        amount,
        method,
        note,
        collectedById: accountant.id,
        paidAt
      }
    });
  };

  // 3. Tạo 3 Giảng viên
  const teachersData = [
    { code: 'GV001', email: 'thaynam@fpt.edu.vn', name: 'ThS. Nguyễn Hoài Nam', specialty: 'Kỹ thuật Phần mềm (SE)', degree: 'Thạc sĩ' },
    { code: 'GV002', email: 'colinh@fpt.edu.vn', name: 'TS. Trần Thùy Linh', specialty: 'Khoa học Máy tính (CS)', degree: 'Tiến sĩ' },
    { code: 'GV003', email: 'thaytuan@fpt.edu.vn', name: 'ThS. Lê Anh Tuấn', specialty: 'Hệ thống Thông tin (IS)', degree: 'Thạc sĩ' }
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
            bio: `Giảng viên bộ môn ${t.specialty} với hơn 8 năm kinh nghiệm đào tạo.`
          }
        }
      }
    });
    teachers.push(user);
  }

  // 4. Tạo 10 Sinh viên
  const studentsData = [
    { code: 'HE170001', email: 'namnvhe170001@fpt.edu.vn', name: 'Nguyễn Văn Nam', gender: 'MALE', year: 2024 },
    { code: 'HE170002', email: 'trangtthe170002@fpt.edu.vn', name: 'Trần Thu Trang', gender: 'FEMALE', year: 2024 },
    { code: 'HE170003', email: 'longldhe170003@fpt.edu.vn', name: 'Lê Đức Long', gender: 'MALE', year: 2024 },
    { code: 'HE170004', email: 'linhpthe170004@fpt.edu.vn', name: 'Phạm Thùy Linh', gender: 'FEMALE', year: 2024 },
    { code: 'HE170005', email: 'hoangnmhe170005@fpt.edu.vn', name: 'Ngô Minh Hoàng', gender: 'MALE', year: 2024 },
    { code: 'HE170006', email: 'quynhntkhe170006@fpt.edu.vn', name: 'Nguyễn Thị Kim Quỳnh', gender: 'FEMALE', year: 2025 },
    { code: 'HE170007', email: 'dungdvhe170007@fpt.edu.vn', name: 'Đỗ Việt Dũng', gender: 'MALE', year: 2025 },
    { code: 'HE170008', email: 'maipmhe170008@fpt.edu.vn', name: 'Phan Phương Mai', gender: 'FEMALE', year: 2025 },
    { code: 'HE170009', email: 'bachnvhe170009@fpt.edu.vn', name: 'Nguyễn Vũ Bách', gender: 'MALE', year: 2025 },
    { code: 'HE170010', email: 'haonvhe170010@fpt.edu.vn', name: 'Nguyễn Văn Hào', gender: 'MALE', year: 2025 }
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
            address: 'Hà Nội, Việt Nam',
            enrollmentYear: s.year
          }
        }
      }
    });
    students.push(user);
  }

  // 5. Tạo 5 Môn học FPT
  const coursesData = [
    { code: 'PRN231', name: 'Building Web Applications with Node.js & Express', credits: 3, totalSessions: 30, fee: 4500000 },
    { code: 'CSD201', name: 'Data Structures and Algorithms', credits: 3, totalSessions: 30, fee: 4500000 },
    { code: 'PRF192', name: 'Programming Fundamentals with C', credits: 3, totalSessions: 30, fee: 4200000 },
    { code: 'MAS291', name: 'Statistics & Probability', credits: 3, totalSessions: 30, fee: 4200000 },
    { code: 'SWP391', name: 'Software Development Project (CapStone MVP)', credits: 3, totalSessions: 30, fee: 5000000 }
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
        description: `Môn học chuẩn đào tạo cử nhân CNTT chuyên ngành Kỹ thuật Phần mềm.`,
        syllabusUrl: `https://fap.fpt.edu.vn/syllabus/${c.code}.pdf`
      }
    });
    courses.push(course);
  }

  // 6. Mở 2 Lớp học phần
  const class1 = await prisma.class.create({
    data: {
      classCode: 'SE1701-PRN231',
      courseId: courses[0].id,
      teacherId: teachers[0].id,
      semester: 'SP26',
      maxStudents: 30,
      status: 'ONGOING'
    }
  });

  const class2 = await prisma.class.create({
    data: {
      classCode: 'SE1702-CSD201',
      courseId: courses[1].id,
      teacherId: teachers[1].id,
      semester: 'SP26',
      maxStudents: 30,
      status: 'ONGOING'
    }
  });

  // 7. Xếp Thời khóa biểu theo Slot chuẩn FAP
  // Lớp 1: Thứ 2 và Thứ 5 - Slot 2 (10:00 - 12:20) tại BE-301
  await prisma.schedule.createMany({
    data: [
      { classId: class1.id, dayOfWeek: 2, shift: 2, startTime: new Date('1970-01-01T10:00:00Z'), endTime: new Date('1970-01-01T12:20:00Z'), room: 'BE-301' },
      { classId: class1.id, dayOfWeek: 5, shift: 2, startTime: new Date('1970-01-01T10:00:00Z'), endTime: new Date('1970-01-01T12:20:00Z'), room: 'BE-301' }
    ]
  });

  // Lớp 2: Thứ 3 và Thứ 6 - Slot 4 (15:20 - 17:40) tại AL-205
  await prisma.schedule.createMany({
    data: [
      { classId: class2.id, dayOfWeek: 3, shift: 4, startTime: new Date('1970-01-01T15:20:00Z'), endTime: new Date('1970-01-01T17:40:00Z'), room: 'AL-205' },
      { classId: class2.id, dayOfWeek: 6, shift: 4, startTime: new Date('1970-01-01T15:20:00Z'), endTime: new Date('1970-01-01T17:40:00Z'), room: 'AL-205' }
    ]
  });

  // 8. Ghi danh (Enrollment) 5 sinh viên đầu vào Lớp 1, 5 sinh viên sau vào Lớp 2
  for (let i = 0; i < 5; i++) {
    const student = students[i];
    const enrollment = await prisma.enrollment.create({
      data: {
        classId: class1.id,
        studentId: student.id,
        status: 'ACTIVE'
      }
    });

    // Tự sinh Bảng điểm
    await prisma.grade.create({
      data: {
        enrollmentId: enrollment.id,
        attendanceScore: 10.0,
        midtermScore: 8.5,
        finalScore: null,
        totalScore: null,
        isPassed: false,
        isBanned: false
      }
    });

    // Tự sinh Hóa đơn học phí
    const isPaid = i % 2 === 0;
    const invoice1 = await prisma.tuitionInvoice.create({
      data: {
        studentId: student.id,
        enrollmentId: enrollment.id,
        amount: 4500000,
        paidAmount: isPaid ? 4500000 : 0,
        dueDate: new Date('2026-09-15'),
        status: isPaid ? 'PAID' : 'UNPAID',
        paidAt: isPaid ? new Date('2026-09-05T10:00:00') : null,
        createdAt: new Date('2026-08-15T08:00:00')
      }
    });

    if (isPaid) {
      // Đóng 2 đợt: đợt 1 tháng 8, đợt 2 tháng 9
      await createPayment(invoice1.id, 2000000, new Date('2026-08-20T09:00:00'), 'CASH', 'Thu đợt 1');
      await createPayment(invoice1.id, 2500000, new Date('2026-09-05T10:00:00'), 'VIETQR', 'Thu đợt 2 - hoàn tất');
    }
  }

  for (let i = 5; i < 10; i++) {
    const student = students[i];
    const enrollment = await prisma.enrollment.create({
      data: {
        classId: class2.id,
        studentId: student.id,
        status: 'ACTIVE'
      }
    });

    await prisma.grade.create({
      data: {
        enrollmentId: enrollment.id,
        attendanceScore: 9.0,
        midtermScore: 7.0,
        finalScore: null,
        totalScore: null,
        isPassed: false,
        isBanned: false
      }
    });

    const invoice2 = await prisma.tuitionInvoice.create({
      data: {
        studentId: student.id,
        enrollmentId: enrollment.id,
        amount: 4500000,
        paidAmount: 2000000,
        dueDate: new Date('2026-10-30'),
        status: 'PARTIAL',
        paidAt: null,
        createdAt: new Date('2026-09-10T08:00:00')
      }
    });

    await createPayment(invoice2.id, 2000000, new Date('2026-10-02T14:00:00'), 'BANK_TRANSFER', 'Thu đợt 1');
  }

  // 9. Tạo 1 Bài tập mẫu
  const assignment1 = await prisma.assignment.create({
    data: {
      classId: class1.id,
      title: 'Lab 1: Xây dựng RESTful API với Express.js & MySQL',
      description: 'Yêu cầu viết CRUD cho Entity Student, có xác thực JWT và phân quyền.',
      fileUrl: 'https://fap.fpt.edu.vn/materials/PRN231_Lab1.pdf',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Còn 7 ngày
    }
  });

  // 10. Tạo Thông báo mẫu
  await prisma.notification.createMany({
    data: [
      {
        userId: null, // Gửi toàn trường
        title: 'Thông báo về việc đóng học phí Học kỳ Spring 2026 (SP26)',
        message: 'Hạn cuối hoàn thành công nợ học phí là ngày 30/03/2026. Sinh viên thanh toán qua VietQR trên cổng.',
        type: 'TUITION'
      },
      {
        userId: students[0].id,
        title: 'Giảng viên đã giao bài tập Lab 1 môn PRN231',
        message: 'Hạn nộp bài là 23:59 Chủ nhật tuần này. Vui lòng nộp file .zip đúng định dạng.',
        type: 'ASSIGNMENT'
      }
    ]
  });

  console.log('✅ Seed data created successfully!');
  console.log('   - 1 Admin: admin@fpt.edu.vn | Pass: 123456');
  console.log('   - 1 Accountant: ketoan@fpt.edu.vn | Pass: 123456');
  console.log('   - 3 Teachers: thaynam@fpt.edu.vn, colinh@fpt.edu.vn, thaytuan@fpt.edu.vn | Pass: 123456');
  console.log('   - 10 Students: namnvhe170001@fpt.edu.vn ... | Pass: 123456');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
