/**
 * KHUNG CHƯƠNG TRÌNH ĐÀO TẠO CHUẨN ĐẠI HỌC FPT (FAP CURRICULUM)
 * Chuyên ngành: Kỹ thuật phần mềm (Software Engineering - SE)
 * Tham chiếu chuẩn: https://fap.fpt.edu.vn/Curriculum
 */

const SE_CURRICULUM = [
  // HỌC KỲ 1 (TERM 1)
  {
    term: 1,
    courseCode: 'PRF192',
    name: 'Programming Fundamentals with C',
    credits: 3,
    prerequisites: [],
    description: 'Nền tảng lập trình với ngôn ngữ C, biến, kiểu dữ liệu, vòng lặp, hàm và con trỏ.'
  },
  {
    term: 1,
    courseCode: 'CEA201',
    name: 'Computer Organization and Architecture',
    credits: 3,
    prerequisites: [],
    description: 'Kiến trúc máy tính và tổ chức hệ thống phần cứng, biểu diễn dữ liệu số, thanh ghi và tập lệnh.'
  },
  {
    term: 1,
    courseCode: 'CSI104',
    name: 'Introduction to Computer Science',
    credits: 3,
    prerequisites: [],
    description: 'Nhập môn khoa học máy tính, thuật toán cơ bản, cấu trúc mạng và hệ điều hành.'
  },
  {
    term: 1,
    courseCode: 'MAE101',
    name: 'Mathematics for Engineering',
    credits: 3,
    prerequisites: [],
    description: 'Toán cao cấp dành cho kỹ sư: giải tích vi phân, tích phân và ma trận.'
  },

  // HỌC KỲ 2 (TERM 2)
  {
    term: 2,
    courseCode: 'PRO192',
    name: 'Object-Oriented Programming (Java)',
    credits: 3,
    prerequisites: ['PRF192'],
    description: 'Lập trình hướng đối tượng với Java: Tính đóng gói, kế thừa, đa hình và trừu tượng.'
  },
  {
    term: 2,
    courseCode: 'MAD101',
    name: 'Discrete Mathematics',
    credits: 3,
    prerequisites: [],
    description: 'Toán rời rạc: Logic mệnh đề, tập hợp, quan hệ, lý thuyết đồ thị và cây.'
  },
  {
    term: 2,
    courseCode: 'OSG201',
    name: 'Operating Systems',
    credits: 3,
    prerequisites: ['CEA201'],
    description: 'Hệ điều hành: Quản lý tiến trình, luồng, bộ nhớ ảo, lập lịch CPU và hệ thống tập tin.'
  },
  {
    term: 2,
    courseCode: 'SSG104',
    name: 'Communication and In-Group Skills',
    credits: 3,
    prerequisites: [],
    description: 'Kỹ năng giao tiếp, làm việc nhóm, thuyết trình và giải quyết xung đột trong dự án.'
  },

  // HỌC KỲ 3 (TERM 3)
  {
    term: 3,
    courseCode: 'CSD201',
    name: 'Data Structures and Algorithms',
    credits: 3,
    prerequisites: ['PRF192'], // FAP: CSD201 cần pass PRO192/PRF192
    description: 'Cấu trúc dữ liệu và giải thuật: Danh sách liên kết, Ngăn xếp, Hàng đợi, Cây nhị phân tìm kiếm, Đồ thị và sắp xếp.'
  },
  {
    term: 3,
    courseCode: 'DBI202',
    name: 'Introduction to Databases',
    credits: 3,
    prerequisites: [],
    description: 'Cơ sở dữ liệu quan hệ, SQL chuẩn, mô hình hóa dữ liệu ERD, chuẩn hóa 1NF-3NF.'
  },
  {
    term: 3,
    courseCode: 'MAS291',
    name: 'Statistics & Probability',
    credits: 3,
    prerequisites: ['MAE101'],
    description: 'Xác suất thống kê trong kỹ thuật, phân phối xác suất, ước lượng và kiểm định giả thuyết.'
  },
  {
    term: 3,
    courseCode: 'JPD113',
    name: 'Elementary Japanese 1-A1.1',
    credits: 3,
    prerequisites: [],
    description: 'Tiếng Nhật sơ cấp: Bảng chữ cái Hiragana, Katakana và hội thoại cơ bản.'
  },

  // HỌC KỲ 4 (TERM 4)
  {
    term: 4,
    courseCode: 'PRJ301',
    name: 'Java Web Application Development',
    credits: 3,
    prerequisites: ['PRO192', 'DBI202'],
    description: 'Lập trình ứng dụng Web với Java Servlet, JSP, MVC và kết nối Database qua JDBC.'
  },
  {
    term: 4,
    courseCode: 'SWE201c',
    name: 'Introduction to Software Engineering',
    credits: 3,
    prerequisites: ['CSD201'],
    description: 'Quy trình phát triển phần mềm, Agile/Scrum, thiết kế kiến trúc hệ thống và kiểm thử.'
  },
  {
    term: 4,
    courseCode: 'IOT102',
    name: 'Internet of Things',
    credits: 3,
    prerequisites: ['CEA201'],
    description: 'Lập trình vi điều khiển, cảm biến, giao thức mạng IoT và kết nối Cloud.'
  },

  // HỌC KỲ 5 (TERM 5)
  {
    term: 5,
    courseCode: 'PRN231',
    name: 'Building Web Applications with Node.js & Express',
    credits: 3,
    prerequisites: ['PRF192'], // Môn nền tảng cần pass
    description: 'Xây dựng RESTful API chuyên sâu với Node.js, Express, xác thực JWT và cơ sở dữ liệu MySQL/TiDB.'
  },
  {
    term: 5,
    courseCode: 'SWP391',
    name: 'Software Development Project (CapStone MVP)',
    credits: 3,
    prerequisites: ['CSD201', 'PRJ301'], // Cần pass CSD201 (Kỳ 3) và PRJ301 (Kỳ 4)
    description: 'Thực hiện dự án phần mềm theo nhóm Agile thực tế từ đặc tả yêu cầu, thiết kế kiến trúc đến triển khai MVP.'
  },
  {
    term: 5,
    courseCode: 'SWR302',
    name: 'Software Requirement',
    credits: 3,
    prerequisites: ['SWE201c'],
    description: 'Kỹ nghệ yêu cầu phần mềm: Khảo sát người dùng, viết User Story, SRS và vẽ biểu đồ UML/BPMN.'
  },

  // HỌC KỲ 6 (TERM 6 - ON-THE-JOB TRAINING)
  {
    term: 6,
    courseCode: 'OJT401',
    name: 'On-the-Job Training (Internship)',
    credits: 10,
    prerequisites: ['SWP391'],
    description: 'Thực tập toàn thời gian tại các doanh nghiệp phần mềm (FPT Software, Viettel, VNPT...).'
  },

  // HỌC KỲ 7 (TERM 7)
  {
    term: 7,
    courseCode: 'SWD392',
    name: 'Software Architecture and Design',
    credits: 3,
    prerequisites: ['SWP391'],
    description: 'Kiến trúc và thiết kế phần mềm nâng cao: Microservices, Clean Architecture, Design Patterns.'
  },
  {
    term: 7,
    courseCode: 'PRM392',
    name: 'Mobile Programming (React Native / Flutter)',
    credits: 3,
    prerequisites: ['PRN231'],
    description: 'Lập trình ứng dụng di động đa nền tảng cho iOS và Android.'
  },
  {
    term: 7,
    courseCode: 'MLN122',
    name: 'Triết học Mác - Lênin',
    credits: 3,
    prerequisites: [],
    description: 'Các nguyên lý cơ bản của Triết học Mác - Lênin và phương pháp luận duy vật biện chứng.'
  },

  // HỌC KỲ 8 (TERM 8)
  {
    term: 8,
    courseCode: 'PRU212',
    name: 'C# Programming and Unity Game Engine',
    credits: 3,
    prerequisites: ['PRF192'],
    description: 'Phát triển ứng dụng với C# và thiết kế game 2D/3D trên nền tảng Unity.'
  },
  {
    term: 8,
    courseCode: 'WDU203',
    name: 'Web UI/UX Design & Front-end Frameworks',
    credits: 3,
    prerequisites: [],
    description: 'Thiết kế giao diện người dùng hiện đại với Figma, React.js và Ant Design.'
  },

  // HỌC KỲ 9 (TERM 9 - GRADUATION CAPSTONE)
  {
    term: 9,
    courseCode: 'SEP490',
    name: 'Graduation Capstone Project (Đồ án tốt nghiệp)',
    credits: 10,
    prerequisites: ['OJT401', 'SWD392'],
    description: 'Khóa luận tốt nghiệp chuyên ngành Kỹ thuật phần mềm bảo vệ trước hội đồng khoa học.'
  }
];

/**
 * Tính toán học kỳ hiện tại của sinh viên dựa trên số tín chỉ đã PASS
 * và các môn đang theo học trong kỳ hiện tại (Academic Standing / Term)
 * @param {number} passedCredits - Tổng số tín chỉ đã pass
 * @param {string[]} studyingCourseCodes - Danh sách mã môn đang học (nếu có)
 * @returns {number} Kỳ học ước tính (1 - 9)
 */
function calculateStudentTerm(passedCredits = 0, studyingCourseCodes = []) {
  let creditTerm = 1;
  if (passedCredits >= 79) creditTerm = 9;
  else if (passedCredits >= 73) creditTerm = 8;
  else if (passedCredits >= 64) creditTerm = 7;
  else if (passedCredits >= 54) creditTerm = 6;
  else if (passedCredits >= 45) creditTerm = 5;
  else if (passedCredits >= 36) creditTerm = 4;
  else if (passedCredits >= 24) creditTerm = 3;
  else if (passedCredits >= 12) creditTerm = 2;

  if (Array.isArray(studyingCourseCodes) && studyingCourseCodes.length > 0) {
    let maxStudyingTerm = 1;
    for (const code of studyingCourseCodes) {
      const found = SE_CURRICULUM.find(c => c.courseCode.toUpperCase() === String(code).toUpperCase());
      if (found && found.term > maxStudyingTerm) {
        maxStudyingTerm = found.term;
      }
    }
    return Math.max(creditTerm, maxStudyingTerm);
  }

  return creditTerm;
}

/**
 * Kiểm tra điều kiện tiên quyết của một môn học đối với sinh viên
 * @param {string} courseCode - Mã môn cần học
 * @param {Array} studentPassedCourseCodes - Danh sách các mã môn sinh viên đã PASS
 * @returns {{ isEligible: boolean, missingPrerequisites: string[] }}
 */
function checkPrerequisites(courseCode, studentPassedCourseCodes = []) {
  const course = SE_CURRICULUM.find(c => c.courseCode.toUpperCase() === courseCode.toUpperCase());
  if (!course || !course.prerequisites || course.prerequisites.length === 0) {
    return { isEligible: true, missingPrerequisites: [] };
  }

  const passedSet = new Set(studentPassedCourseCodes.map(c => c.toUpperCase()));
  const missing = course.prerequisites.filter(req => !passedSet.has(req.toUpperCase()));

  return {
    isEligible: missing.length === 0,
    missingPrerequisites: missing
  };
}

module.exports = {
  SE_CURRICULUM,
  calculateStudentTerm,
  checkPrerequisites
};

