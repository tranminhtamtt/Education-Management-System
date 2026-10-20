-- ========================================================================
-- DỰ ÁN: EDUCATION MANAGEMENT SYSTEM (EMS) - CHUẨN QUY CHẾ FAP FPT
-- HỆ CƠ SỞ DỮ LIỆU: TIDB CLOUD SERVERLESS (MYSQL 8.0 COMPATIBLE)
-- ========================================================================

-- 1. TẠO CƠ SỞ DỮ LIỆU
CREATE DATABASE IF NOT EXISTS ems_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ems_db;

-- 2. TẮT TẠM KIỂM TRA KHÓA NGOẠI ĐỂ KHỞI TẠO BẢNG SẠCH
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS student_requests;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS tuition_payments;
DROP TABLE IF EXISTS tuition_invoices;
DROP TABLE IF EXISTS grades;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS assignments;
DROP TABLE IF EXISTS attendances;
DROP TABLE IF EXISTS schedules;
DROP TABLE IF EXISTS enrollments;
DROP TABLE IF EXISTS classes;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS teacher_profiles;
DROP TABLE IF EXISTS student_profiles;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ========================================================================
-- 3. ĐỊNH NGHĨA 14 BẢNG CSDL QUAN HỆ CHUẨN HÓA
-- ========================================================================

-- BẢNG 1: users (Tài khoản người dùng & phân quyền RBAC)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role ENUM('ADMIN', 'TEACHER', 'STUDENT', 'ACCOUNTANT') NOT NULL DEFAULT 'STUDENT',
    phone VARCHAR(20),
    avatar VARCHAR(255),
    status ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_role (role),
    INDEX idx_user_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- BẢNG 2: student_profiles (Hồ sơ học viên)
CREATE TABLE student_profiles (
    user_id INT PRIMARY KEY,
    dob DATE,
    gender ENUM('MALE', 'FEMALE', 'OTHER') DEFAULT 'MALE',
    address VARCHAR(255),
    enrollment_year INT DEFAULT 2026,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- BẢNG 3: teacher_profiles (Hồ sơ giảng viên)
CREATE TABLE teacher_profiles (
    user_id INT PRIMARY KEY,
    degree VARCHAR(100),
    specialty VARCHAR(150),
    bio TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- BẢNG 4: courses (Danh mục môn học / Khóa học gốc)
CREATE TABLE courses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    credits INT NOT NULL DEFAULT 3,
    total_sessions INT NOT NULL DEFAULT 30,
    base_tuition_fee DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    description TEXT,
    syllabus_url VARCHAR(255),
    status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- BẢNG 5: classes (Lớp học phần)
CREATE TABLE classes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_code VARCHAR(50) NOT NULL UNIQUE,
    course_id INT NOT NULL,
    teacher_id INT,
    semester VARCHAR(20) NOT NULL,
    max_students INT NOT NULL DEFAULT 30,
    status ENUM('UPCOMING', 'ONGOING', 'COMPLETED') NOT NULL DEFAULT 'UPCOMING',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id),
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_class_semester (semester)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- BẢNG 6: enrollments (Ghi danh học viên vào lớp học phần)
CREATE TABLE enrollments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT NOT NULL,
    student_id INT NOT NULL,
    enrolled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status ENUM('ACTIVE', 'DROPPED') NOT NULL DEFAULT 'ACTIVE',
    UNIQUE KEY uk_enrollment (class_id, student_id),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- BẢNG 7: schedules (Thời khóa biểu theo 6 Slot học FAP)
CREATE TABLE schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT NOT NULL,
    day_of_week INT NOT NULL, -- 2: Thứ 2 ... 8: Chủ nhật
    shift INT NOT NULL DEFAULT 1, -- Slot 1 -> Slot 6
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    room VARCHAR(50) NOT NULL,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    INDEX idx_sched_day_shift_room (day_of_week, shift, room)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- BẢNG 8: attendances (Điểm danh buổi học - Chống trùng lặp dữ liệu)
CREATE TABLE attendances (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT NOT NULL,
    student_id INT NOT NULL,
    session_date DATE NOT NULL,
    status ENUM('PRESENT', 'ABSENT_EXCUSED', 'ABSENT_UNEXCUSED', 'LATE') NOT NULL DEFAULT 'PRESENT',
    note VARCHAR(255),
    UNIQUE KEY uk_attendance (class_id, student_id, session_date),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- BẢNG 9: assignments (Quản lý Bài tập lớp học)
CREATE TABLE assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    file_url VARCHAR(255),
    due_date DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- BẢNG 10: submissions (Bài nộp trực tuyến - Chống nộp trùng dòng)
CREATE TABLE submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    assignment_id INT NOT NULL,
    student_id INT NOT NULL,
    file_url VARCHAR(255) NOT NULL,
    submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status ENUM('SUBMITTED', 'LATE_SUBMITTED') NOT NULL DEFAULT 'SUBMITTED',
    score DECIMAL(4, 2),
    teacher_feedback TEXT,
    UNIQUE KEY uk_submission (assignment_id, student_id),
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- BẢNG 11: grades (Bảng điểm & Xét qua môn)
CREATE TABLE grades (
    id INT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id INT NOT NULL UNIQUE,
    attendance_score DECIMAL(4, 2) DEFAULT 10.00,
    midterm_score DECIMAL(4, 2),
    final_score DECIMAL(4, 2),
    total_score DECIMAL(4, 2),
    is_passed BOOLEAN NOT NULL DEFAULT FALSE,
    is_banned BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- BẢNG 12: tuition_invoices (Hóa đơn học phí & Công nợ)
CREATE TABLE tuition_invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    enrollment_id INT NOT NULL UNIQUE,
    amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    paid_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    due_date DATE NOT NULL,
    status ENUM('UNPAID', 'PARTIAL', 'PAID') NOT NULL DEFAULT 'UNPAID',
    paid_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- BẢNG 12b: tuition_payments (Lịch sử từng đợt thu học phí - Phiếu thu/Biên lai)
CREATE TABLE tuition_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    receipt_no VARCHAR(50) NOT NULL UNIQUE,
    amount DECIMAL(12, 2) NOT NULL,
    method ENUM('CASH', 'BANK_TRANSFER', 'VIETQR') NOT NULL DEFAULT 'BANK_TRANSFER',
    note VARCHAR(255),
    collected_by INT,
    paid_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_payment_paid_at (paid_at),
    FOREIGN KEY (invoice_id) REFERENCES tuition_invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (collected_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- BẢNG 13: notifications (Hệ thống thông báo In-App)
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT, -- NULL nếu là thông báo broadcast toàn trường
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('ASSIGNMENT', 'GRADE', 'TUITION', 'REQUEST', 'SYSTEM') NOT NULL DEFAULT 'SYSTEM',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- BẢNG 14: student_requests (Đơn từ học vụ online - Kèm session_date ngày xin nghỉ)
CREATE TABLE student_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    class_id INT,
    request_type ENUM('ABSENCE', 'REMARK', 'CONFIRMATION') NOT NULL,
    session_date DATE, -- Ngày xin nghỉ học
    reason TEXT NOT NULL,
    attachment_url VARCHAR(255),
    status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    admin_response TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================================================
-- 4. DỮ LIỆU MẪU KHỞI TẠO (SEED DATA)
-- Mật khẩu mặc định cho tất cả tài khoản mẫu là: 123456
-- (Băm bcrypt: $2a$10$wT0lHlSvdvYw8nfxz5m6.Oq0Jp0C0tNfe2WbVjZ3BqK4B5eRzY5O6)
-- ========================================================================

-- ADMIN
INSERT INTO users (id, code, email, password_hash, full_name, role, phone, status) VALUES
(1, 'ADM001', 'admin@fpt.edu.vn', '$2a$10$wT0lHlSvdvYw8nfxz5m6.Oq0Jp0C0tNfe2WbVjZ3BqK4B5eRzY5O6', 'Phòng Quản Lý Đào Tạo FAP', 'ADMIN', '02473005588', 'ACTIVE');

-- KẾ TOÁN (ACCOUNTANT)
INSERT INTO users (id, code, email, password_hash, full_name, role, phone, status) VALUES
(10, 'ACC001', 'ketoan@fpt.edu.vn', '$2a$10$wT0lHlSvdvYw8nfxz5m6.Oq0Jp0C0tNfe2WbVjZ3BqK4B5eRzY5O6', 'Phòng Kế toán - Tài chính', 'ACCOUNTANT', '02473005599', 'ACTIVE');

-- GIẢNG VIÊN (TEACHERS)
INSERT INTO users (id, code, email, password_hash, full_name, role, phone, status) VALUES
(2, 'GV001', 'thaynam@fpt.edu.vn', '$2a$10$wT0lHlSvdvYw8nfxz5m6.Oq0Jp0C0tNfe2WbVjZ3BqK4B5eRzY5O6', 'ThS. Nguyễn Hoài Nam', 'TEACHER', '0981234567', 'ACTIVE'),
(3, 'GV002', 'colinh@fpt.edu.vn', '$2a$10$wT0lHlSvdvYw8nfxz5m6.Oq0Jp0C0tNfe2WbVjZ3BqK4B5eRzY5O6', 'TS. Trần Thùy Linh', 'TEACHER', '0982345678', 'ACTIVE'),
(4, 'GV003', 'thaytuan@fpt.edu.vn', '$2a$10$wT0lHlSvdvYw8nfxz5m6.Oq0Jp0C0tNfe2WbVjZ3BqK4B5eRzY5O6', 'ThS. Lê Anh Tuấn', 'TEACHER', '0983456789', 'ACTIVE');

INSERT INTO teacher_profiles (user_id, degree, specialty, bio) VALUES
(2, 'Thạc sĩ', 'Kỹ thuật Phần mềm (SE)', 'Giảng viên bộ môn Kỹ thuật Phần mềm với hơn 8 năm kinh nghiệm giảng dạy.'),
(3, 'Tiến sĩ', 'Khoa học Máy tính (CS)', 'Trưởng bộ môn Khoa học Máy tính, nghiên cứu Trí tuệ Nhân tạo.'),
(4, 'Thạc sĩ', 'Hệ thống Thông tin (IS)', 'Chuyên gia Cơ sở dữ liệu và Kiến trúc Hệ thống Doanh nghiệp.');

-- SINH VIÊN (STUDENTS)
INSERT INTO users (id, code, email, password_hash, full_name, role, phone, status) VALUES
(5, 'HE170001', 'namnvhe170001@fpt.edu.vn', '$2a$10$wT0lHlSvdvYw8nfxz5m6.Oq0Jp0C0tNfe2WbVjZ3BqK4B5eRzY5O6', 'Nguyễn Văn Nam', 'STUDENT', '0901234567', 'ACTIVE'),
(6, 'HE170002', 'trangtthe170002@fpt.edu.vn', '$2a$10$wT0lHlSvdvYw8nfxz5m6.Oq0Jp0C0tNfe2WbVjZ3BqK4B5eRzY5O6', 'Trần Thu Trang', 'STUDENT', '0902345678', 'ACTIVE'),
(7, 'HE170003', 'longldhe170003@fpt.edu.vn', '$2a$10$wT0lHlSvdvYw8nfxz5m6.Oq0Jp0C0tNfe2WbVjZ3BqK4B5eRzY5O6', 'Lê Đức Long', 'STUDENT', '0903456789', 'ACTIVE'),
(8, 'HE170004', 'linhpthe170004@fpt.edu.vn', '$2a$10$wT0lHlSvdvYw8nfxz5m6.Oq0Jp0C0tNfe2WbVjZ3BqK4B5eRzY5O6', 'Phạm Thùy Linh', 'STUDENT', '0904567890', 'ACTIVE'),
(9, 'HE170005', 'hoangnmhe170005@fpt.edu.vn', '$2a$10$wT0lHlSvdvYw8nfxz5m6.Oq0Jp0C0tNfe2WbVjZ3BqK4B5eRzY5O6', 'Ngô Minh Hoàng', 'STUDENT', '0905678901', 'ACTIVE');

INSERT INTO student_profiles (user_id, dob, gender, address, enrollment_year) VALUES
(5, '2004-05-15', 'MALE', 'Hà Nội, Việt Nam', 2024),
(6, '2004-08-20', 'FEMALE', 'Hải Phòng, Việt Nam', 2024),
(7, '2004-11-10', 'MALE', 'Đà Nẵng, Việt Nam', 2024),
(8, '2004-02-28', 'FEMALE', 'Hà Nội, Việt Nam', 2024),
(9, '2004-09-05', 'MALE', 'TP. Hồ Chí Minh, Việt Nam', 2024);

-- MÔN HỌC (COURSES)
INSERT INTO courses (id, course_code, name, credits, total_sessions, base_tuition_fee, description, syllabus_url, status) VALUES
(1, 'PRN231', 'Building Web Applications with Node.js & Express', 3, 30, 4500000.00, 'Xây dựng ứng dụng web hiện đại backend RESTful API.', 'https://fap.fpt.edu.vn/syllabus/PRN231.pdf', 'ACTIVE'),
(2, 'CSD201', 'Data Structures and Algorithms', 3, 30, 4500000.00, 'Cấu trúc dữ liệu và giải thuật căn bản.', 'https://fap.fpt.edu.vn/syllabus/CSD201.pdf', 'ACTIVE'),
(3, 'PRF192', 'Programming Fundamentals with C', 3, 30, 4200000.00, 'Nhập môn lập trình căn bản C.', 'https://fap.fpt.edu.vn/syllabus/PRF192.pdf', 'ACTIVE'),
(4, 'MAS291', 'Statistics & Probability', 3, 30, 4200000.00, 'Xác suất thống kê trong kỹ thuật phần mềm.', 'https://fap.fpt.edu.vn/syllabus/MAS291.pdf', 'ACTIVE'),
(5, 'SWP391', 'Software Development Project (CapStone MVP)', 3, 30, 5000000.00, 'Đồ án phát triển phần mềm theo nhóm thực tế.', 'https://fap.fpt.edu.vn/syllabus/SWP391.pdf', 'ACTIVE');

-- LỚP HỌC PHẦN (CLASSES)
INSERT INTO classes (id, class_code, course_id, teacher_id, semester, max_students, status) VALUES
(1, 'SE1701-PRN231', 1, 2, 'SP26', 30, 'ONGOING'),
(2, 'SE1702-CSD201', 2, 3, 'SP26', 30, 'ONGOING');

-- THỜI KHÓA BIỂU THEO SLOT FAP (SCHEDULES)
-- Lớp 1: Thứ 2 (day 2) & Thứ 5 (day 5) - Slot 2 (10:00 - 12:20) tại BE-301
INSERT INTO schedules (class_id, day_of_week, shift, start_time, end_time, room) VALUES
(1, 2, 2, '10:00:00', '12:20:00', 'BE-301'),
(1, 5, 2, '10:00:00', '12:20:00', 'BE-301'),
-- Lớp 2: Thứ 3 (day 3) & Thứ 6 (day 6) - Slot 4 (15:20 - 17:40) tại AL-205
(2, 3, 4, '15:20:00', '17:40:00', 'AL-205'),
(2, 6, 4, '15:20:00', '17:40:00', 'AL-205');

-- GHI DANH HỌC VIÊN (ENROLLMENTS)
INSERT INTO enrollments (id, class_id, student_id, status) VALUES
(1, 1, 5, 'ACTIVE'),
(2, 1, 6, 'ACTIVE'),
(3, 1, 7, 'ACTIVE'),
(4, 2, 5, 'ACTIVE'),
(5, 2, 8, 'ACTIVE');

-- BẢNG ĐIỂM (GRADES)
INSERT INTO grades (id, enrollment_id, attendance_score, midterm_score, final_score, total_score, is_passed, is_banned) VALUES
(1, 1, 10.00, 8.50, 7.50, 8.10, TRUE, FALSE),
(2, 1, 9.00, 7.00, 6.00, 6.60, TRUE, FALSE),
(3, 1, 10.00, 8.00, NULL, NULL, FALSE, FALSE),
(4, 2, 10.00, 9.00, 8.00, 8.50, TRUE, FALSE),
(5, 2, 8.50, 6.50, 7.00, 7.00, TRUE, FALSE);

-- HÓA ĐƠN HỌC PHÍ (TUITION INVOICES)
INSERT INTO tuition_invoices (id, student_id, enrollment_id, amount, paid_amount, due_date, status, paid_at) VALUES
(1, 5, 1, 4500000.00, 4500000.00, '2026-03-30', 'PAID', '2026-02-15 09:30:00'),
(2, 6, 2, 4500000.00, 2000000.00, '2026-03-30', 'PARTIAL', '2026-02-18 14:00:00'),
(3, 7, 3, 4500000.00, 0.00, '2026-03-30', 'UNPAID', NULL),
(4, 5, 4, 4500000.00, 4500000.00, '2026-03-30', 'PAID', '2026-02-15 09:30:00'),
(5, 8, 5, 4500000.00, 0.00, '2026-03-30', 'UNPAID', NULL);

-- LỊCH SỬ THU HỌC PHÍ (TUITION PAYMENTS)
INSERT INTO tuition_payments (invoice_id, receipt_no, amount, method, note, collected_by, paid_at) VALUES
(1, 'PT-202602-0001', 4500000.00, 'VIETQR', 'Thu đủ học phí', 10, '2026-02-15 09:30:00'),
(2, 'PT-202602-0002', 2000000.00, 'CASH', 'Thu đợt 1', 10, '2026-02-18 14:00:00'),
(4, 'PT-202602-0003', 4500000.00, 'BANK_TRANSFER', 'Thu đủ học phí', 10, '2026-02-15 09:30:00');

-- BÀI TẬP (ASSIGNMENTS)
INSERT INTO assignments (id, class_id, title, description, file_url, due_date) VALUES
(1, 1, 'Lab 1: Xây dựng RESTful API với Express.js & MySQL', 'Yêu cầu viết CRUD cho Entity Student, có xác thực JWT và phân quyền RBAC.', 'https://fap.fpt.edu.vn/materials/PRN231_Lab1.pdf', DATE_ADD(NOW(), INTERVAL 7 DAY));

-- THÔNG BÁO (NOTIFICATIONS)
INSERT INTO notifications (id, user_id, title, message, type, is_read) VALUES
(1, NULL, 'Thông báo về việc đóng học phí Học kỳ Spring 2026 (SP26)', 'Hạn cuối hoàn thành công nợ học phí là ngày 30/03/2026. Sinh viên thanh toán qua mã VietQR trên cổng.', 'TUITION', FALSE),
(2, 5, 'Giảng viên đã giao bài tập Lab 1 môn PRN231', 'Hạn nộp bài là 23:59 Chủ nhật tuần này. Vui lòng nộp bài đúng hạn.', 'ASSIGNMENT', FALSE);

-- ĐƠN TỪ HỌC VỤ (STUDENT REQUESTS)
INSERT INTO student_requests (id, student_id, class_id, request_type, session_date, reason, status) VALUES
(1, 5, 1, 'ABSENCE', '2026-03-12', 'Em bị sốt cao có giấy khám bệnh tại Bệnh viện Bạch Mai, em xin phép vắng mặt buổi học ngày 12/03.', 'PENDING');
