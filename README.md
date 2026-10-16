# TÀI LIỆU ĐẶC TẢ YÊU CẦU & THIẾT KẾ HỆ THỐNG
## DỰ ÁN: HỆ THỐNG QUẢN LÝ GIÁO DỤC (EDUCATION MANAGEMENT SYSTEM - EMS)
> **Mô hình học hỏi & cải tiến từ:** Cổng thông tin đào tạo FAP (FPT University Academic Portal - https://fap.fpt.edu.vn/)  
> **Quy mô nhóm:** 5 thành viên  
> **Tech Stack:** Express.js (Backend) + React / Vite / Ant Design (Frontend) + MySQL 8.0 (Database) + Docker & Docker Compose  
> **Phạm vi (Scope):** MVP hoàn chỉnh gồm 11 module chính, tập trung vào luồng nghiệp vụ cốt lõi (Core Business Flow), tối ưu hóa để 5 thành viên phát triển song song.

---

## MỤC LỤC
1. [Giai đoạn 1: Kết quả khảo sát & học hỏi từ FAP FPT](#1-giai-đoạn-1-kết-quả-khảo-sát--học-hỏi-từ-fap-fpt)
2. [Phần 1: Tổng quan & Phân quyền hệ thống (Actors & Roles)](#phần-1-tổng-quan--phân-quyền-hệ-thống-actors--roles)
3. [Phần 2: Đặc tả yêu cầu chức năng chi tiết (11 Modules)](#phần-2-đặc-tả-yêu-cầu-chức-năng-chi-tiết-11-modules)
4. [Phần 3: Yêu cầu phi chức năng (Non-Functional Requirements)](#phần-3-yêu-cầu-phi-chức-năng-non-functional-requirements)
5. [Phần 4: Thiết kế cơ sở dữ liệu MySQL (Database Schema - 13 Bảng)](#phần-4-thiết-kế-cơ-sở-dữ-liệu-mysql-database-schema---13-bảng)
6. [Phần 5: Danh sách RESTful API Endpoints chuẩn hóa](#phần-5-danh-sách-restful-api-endpoints-chuẩn-hóa)
7. [Phần 6: Kiến trúc thư mục & Cấu hình Docker](#phần-6-kiến-trúc-thư-mục--cấu-hình-docker)
8. [Phần 7: Phân công nhiệm vụ & Kế hoạch triển khai (5 Thành viên)](#phần-7-phân-công-nhiệm-vụ--kế-hoạch-triển-khai-5-thành-viên)

---

## 1. GIAI ĐOẠN 1: KẾT QUẢ KHẢO SÁT & HỌC HỎI TỪ FAP FPT

### 1.1. Báo cáo kỹ thuật truy cập website mẫu
* **Địa chỉ:** `https://fap.fpt.edu.vn/`
* **Trạng thái kết nối trực tiếp:** Phản hồi `HTTP 403 Forbidden` (`Cf-Mitigated: challenge`) do hệ thống tường lửa Cloudflare WAF bảo vệ chống truy cập tự động / bot.
* **Đặc điểm nhận diện và trải nghiệm quan sát được:**
  * **Brand Colors:** Màu cam chủ đạo (`#F26F21` / `#FA742B`), nền trắng/xám trung tính, chữ đậm độ tương phản cao, badge trạng thái (Xanh lá - Có mặt/Passed, Đỏ - Vắng mặt/Not Passed, Cam - Đang xử lý).
  * **Cấu trúc Bố cục:** Trang chọn cơ sở (Campus Selection: Hà Nội, TP.HCM, Đà Nẵng, Cần Thơ, Quy Nhơn) -> Đăng nhập (Google SSO / FeID) -> Dashboard sinh viên với Breadcrumbs -> Lưới thời khóa biểu ma trận theo Slot/Ca học -> Báo cáo điểm danh & bảng điểm.
  * **Điểm cải tiến trên hệ thống mới (EMS):**
    * Bổ sung giao diện hiện đại dựa trên **Ant Design (v5)**, hỗ trợ responsive hoàn hảo trên cả thiết bị di động.
    * Mở rộng đầy đủ 3 Actor tương tác: **Admin (Giáo vụ)**, **Teacher (Giảng viên)**, **Student (Học viên)**.
    * Tích hợp tính năng nộp bài tập trực tuyến, thanh toán học phí qua mã VietQR và thông báo tự động (In-app notifications).

---

## PHẦN 1: TỔNG QUAN & PHÂN QUYỀN HỆ THỐNG (ACTORS & ROLES)

Hệ thống sử dụng cơ chế phân quyền dựa trên vai trò (**RBAC - Role-Based Access Control**) với 3 vai trò cố định:

### 1. Admin (Giáo vụ / Quản trị viên)
* Quản lý toàn bộ dữ liệu danh mục gốc: Hồ sơ Học viên, Hồ sơ Giảng viên, Môn học/Khóa học (Course), Lớp học phần (Class).
* Xếp thời khóa biểu, gán giảng viên và thêm học viên vào lớp.
* Quản lý công nợ học phí, cập nhật trạng thái thanh toán và phát hành thông báo toàn hệ thống.
* Xem Dashboard thống kê số lượng đào tạo và doanh thu học phí.

### 2. Teacher (Giảng viên)
* Xem lịch giảng dạy hàng tuần và danh sách lớp phụ trách.
* Thực hiện điểm danh học viên theo từng buổi học.
* Tạo bài tập (Assignment), tải file đề bài, thu bài và chấm điểm/nhận xét bài làm của học viên.
* Nhập điểm thành phần (Chuyên cần, Giữa kỳ, Cuối kỳ) và xuất bảng điểm lớp học.

### 3. Student (Học viên)
* Xem lịch học hàng tuần (Calendar View) và danh sách các lớp đang theo học.
* Theo dõi lịch sử điểm danh và tỷ lệ chuyên cần cá nhân.
* Xem đề bài tập, nộp bài trực tuyến trước hạn (Deadline) và xem điểm/lời phê của giảng viên.
* Tra cứu bảng điểm học tập (Transcript/Grade Report), tra cứu công nợ học phí và mã thanh toán QR.

---

## PHẦN 2: ĐẶC TẢ YÊU CẦU CHỨC NĂNG CHI TIẾT (11 MODULES)

### Cụm 1: Quản trị Người dùng & Đào tạo (Phụ trách: Member 1)

#### 1. Student Management (Quản lý Học viên)
* **UC1.1 - Quản lý hồ sơ học viên:** Thêm mới, chỉnh sửa thông tin, khóa/mở khóa tài khoản học viên (Mã SV, Họ tên, Email, SĐT, Ngày sinh, Địa chỉ, Niên khóa).
* **UC1.2 - Import danh sách học viên:** Cho phép Admin tải lên file Excel (.xlsx) danh sách nhiều học viên để tự động tạo tài khoản hàng loạt.

#### 2. Teacher Management (Quản lý Giảng viên)
* **UC2.1 - Quản lý hồ sơ giảng viên:** Thêm, sửa, khóa tài khoản giảng viên; lưu trữ thông tin học vị (Cử nhân, Thạc sĩ, Tiến sĩ), chuyên ngành và tiểu sử.
* **UC2.2 - Tra cứu lịch dạy & Lớp phụ trách:** Xem danh sách các lớp học phần mà giảng viên đang hoặc đã giảng dạy.

#### 3. Course Management (Quản lý Môn học / Khóa học gốc)
* **UC3.1 - Quản lý danh mục môn học:** CRUD môn học gồm Mã môn (VD: `PRN231`), Tên môn, Số tín chỉ / Tổng số buổi học, Mức học phí cơ bản (`base_tuition_fee`), Mô tả và file Đề cương (Syllabus URL).
* **Ràng buộc nghiệp vụ:** Không cho phép xóa cứng môn học nếu đã có Lớp học phần (Classes) được mở từ môn học đó.

---

### Cụm 2: Tổ chức Lớp học & Thời khóa biểu (Phụ trách: Member 2)

#### 4. Class Management (Quản lý Lớp học phần)
* **UC4.1 - Mở lớp học phần:** Tạo lớp mới từ một Course có sẵn, chọn Học kỳ (VD: `2026A`), gán 1 Teacher phụ trách, thiết lập sĩ số tối đa (`max_students`) và trạng thái lớp (`UPCOMING`, `ONGOING`, `COMPLETED`).
* **UC4.2 - Quản lý danh sách học viên trong lớp (Enrollment):** Thêm/xóa học viên vào lớp.
* **Ràng buộc nghiệp vụ:**
  * Không cho phép thêm học viên vượt quá `max_students`.
  * Khi thêm học viên vào lớp thành công, hệ thống tự động khởi tạo bản ghi bảng điểm trống (`grades`) và hóa đơn học phí (`tuition_invoices`) tương ứng.

#### 5. Schedule Management (Quản lý Thời khóa biểu)
* **UC5.1 - Xếp lịch học cho lớp:** Gán lịch học theo Thứ trong tuần (Thứ 2 -> Chủ nhật), Ca học / Giờ bắt đầu - Giờ kết thúc và Phòng học.
* **UC5.2 - Kiểm tra xung đột lịch (Conflict Detection):** Khi Admin lưu lịch học, hệ thống tự động kiểm tra và báo lỗi nếu:
  * *Trùng phòng học:* Phòng đó đã có lớp khác học vào cùng Thứ và Ca học trong cùng học kỳ.
  * *Trùng giảng viên:* Giảng viên của lớp đó đang phải dạy một lớp khác vào cùng Thứ và Ca học.
* **UC5.3 - Xem Thời khóa biểu dạng Lưới (Calendar View):** Hiển thị lịch học/lịch dạy trực quan theo tuần cho Student và Teacher tương tự giao diện FAP.

---

### Cụm 3: Vận hành Lớp học (Phụ trách: Member 3)

#### 6. Attendance Management (Quản lý Điểm danh)
* **UC6.1 - Điểm danh theo buổi học:** Giảng viên chọn lớp và ngày học, hệ thống hiển thị danh sách học viên của lớp (mặc định trạng thái `PRESENT` - Có mặt). Giảng viên tích chọn các trường hợp `ABSENT_EXCUSED` (Vắng có phép), `ABSENT_UNEXCUSED` (Vắng không phép), `LATE` (Đi muộn) và nhập ghi chú.
* **UC6.2 - Thống kê chuyên cần:** Tự động tính tỷ lệ % số buổi vắng của từng học viên trong lớp và cảnh báo nếu vượt ngưỡng (VD: vắng quá 20% số buổi).

#### 7. Assignment Management (Quản lý Bài tập)
* **UC7.1 - Giao bài tập:** Giảng viên tạo bài tập mới cho lớp gồm Tiêu đề, Hướng dẫn, File đính kèm (PDF/Docx/Zip) và Hạn nộp (`due_date`).
* **UC7.2 - Nộp bài tập (Submission):** Học viên tải file bài làm lên hệ thống. Hệ thống kiểm tra thời gian nộp so với `due_date` (cho phép chặn nộp muộn hoặc đánh dấu nộp muộn).
* **UC7.3 - Chấm điểm & Nhận xét:** Giảng viên tải bài làm của học viên, nhập điểm số (thang 10) và lời phê (`teacher_feedback`).

---

### Cụm 4: Khảo thí & Tài chính (Phụ trách: Member 4)

#### 8. Exam & Grade Management (Quản lý Thi & Điểm số)
* **UC8.1 - Bảng điểm lớp học:** Giảng viên xem bảng điểm của cả lớp dưới dạng lưới (Editable Table), nhập điểm Chuyên cần (10%), Giữa kỳ (30%), Cuối kỳ (60%).
* **UC8.2 - Tự động tính điểm tổng kết:** Hệ thống tự động tính:
  $$\text{total\_score} = \text{attendance} \times 0.1 + \text{midterm} \times 0.3 + \text{final} \times 0.6$$
  Làm tròn 1 chữ số thập phân và tự động xét trạng thái Qua môn (`is_passed = true` nếu `total_score >= 4.0`).
* **UC8.3 - Import/Export Bảng điểm:** Hỗ trợ tải file mẫu Excel để nhập điểm nhanh và xuất bảng điểm ra Excel.
* **UC8.4 - Xem kết quả học tập (Student):** Học viên xem điểm từng môn và điểm trung bình tích lũy (GPA).

#### 9. Tuition Management (Quản lý Học phí)
* **UC9.1 - Quản lý công nợ học phí:** Tự động ghi nhận khoản phải thu dựa trên `base_tuition_fee` của môn học khi học viên được thêm vào lớp.
* **UC9.2 - Ghi nhận thanh toán:** Admin cập nhật số tiền học viên đã đóng (đóng 1 phần hoặc đóng đủ), hệ thống tự động đổi trạng thái hóa đơn (`UNPAID` -> `PARTIAL` -> `PAID`).
* **UC9.3 - Phiếu thu & Mã QR:** Hiển thị mã VietQR tĩnh theo số tiền còn nợ cho học viên và cho phép in biên lai thu tiền trên trình duyệt.

---

### Cụm 5: Tương tác & Báo cáo (Phụ trách: Member 5)

#### 10. Notification Management (Quản lý Thông báo)
* **UC10.1 - Thông báo hệ thống:** Admin tạo thông báo gửi toàn bộ người dùng hoặc gửi riêng cho một lớp học.
* **UC10.2 - Thông báo tự động (Trigger In-App Notification):** Hệ thống tự động tạo thông báo gửi đến quả chuông trên thanh Header của học viên khi:
  * Giảng viên giao bài tập mới.
  * Giảng viên công bố điểm môn học.
  * Admin tạo nhắc nhở đóng học phí.
* **UC10.3 - Đánh dấu đã đọc:** Người dùng xem danh sách thông báo và đánh dấu đã đọc (`is_read = true`).

#### 11. Report & Analytics (Báo cáo & Thống kê)
* **UC11.1 - Admin Dashboard:**
  * 4 thẻ KPI tổng quan: Tổng số học viên, Tổng số giảng viên, Số lớp đang hoạt động, Tổng doanh thu học phí trong tháng.
  * Biểu đồ cột (Bar Chart): Doanh thu học phí đã thu vs. Còn nợ theo từng tháng.
  * Biểu đồ tròn (Pie Chart): Tỷ lệ học viên Qua môn / Học lại trên toàn hệ thống.
* **UC11.2 - Student & Teacher Dashboard:**
  * Hiển thị lịch học/dạy hôm nay, danh sách bài tập sắp hết hạn (Upcoming Deadlines) và biểu đồ GPA qua các học kỳ.

---

## PHẦN 3: YÊU CẦU PHI CHỨC NĂNG (NON-FUNCTIONAL REQUIREMENTS)

* **Bảo mật (Security):**
  * Mật khẩu lưu trong MySQL phải được băm bằng `bcryptjs` (salt rounds >= 10).
  * Sử dụng JWT (JSON Web Token) cho xác thực API. Mọi API cập nhật dữ liệu nhạy cảm (sửa điểm, thu học phí, tạo lớp) đều phải có Middleware kiểm tra đúng Role.
* **Hiệu năng & Trải nghiệm (UX/UI):**
  * Thống nhất sử dụng bộ thư viện **Ant Design (v5)** trên React để đảm bảo giao diện đồng nhất giữa cả 5 thành viên.
  * Các danh sách lớn (Students, Courses, Invoices) bắt buộc có phân trang (Pagination) từ phía Backend.
* **Tính sẵn sàng & Đóng gói (Portability):**
  * Toàn bộ Database MySQL và công cụ quản trị (phpMyAdmin/Adminer) được cấu hình trong `docker-compose.yml` để cả 5 thành viên khởi chạy môi trường giống hệt nhau bằng 1 lệnh duy nhất.

---

## PHẦN 4: THIẾT KẾ CƠ SỞ DỮ LIỆU MYSQL (DATABASE SCHEMA - 13 BẢNG)

| STT | Tên bảng | Khóa chính (PK) | Khóa ngoại (FK) & Ràng buộc chính | Các cột dữ liệu cốt lõi | Phụ trách |
| :---: | :--- | :--- | :--- | :--- | :---: |
| 1 | **users** | `id` (INT, AI) | `code` (UNIQUE), `email` (UNIQUE) | `password_hash`, `full_name`, `role` (ADMIN, TEACHER, STUDENT), `phone`, `avatar`, `status`, `created_at` | Member 1 |
| 2 | **student_profiles** | `user_id` (INT) | FK -> `users(id)` ON DELETE CASCADE | `dob`, `gender`, `address`, `enrollment_year` | Member 1 |
| 3 | **teacher_profiles** | `user_id` (INT) | FK -> `users(id)` ON DELETE CASCADE | `degree`, `specialty`, `bio` | Member 1 |
| 4 | **courses** | `id` (INT, AI) | `course_code` (UNIQUE) | `name`, `credits`, `base_tuition_fee` (DECIMAL), `description`, `syllabus_url`, `created_at` | Member 1 |
| 5 | **classes** | `id` (INT, AI) | `class_code` (UNIQUE), `course_id` -> `courses(id)`, `teacher_id` -> `users(id)` | `semester`, `max_students`, `status` (UPCOMING, ONGOING, COMPLETED), `created_at` | Member 2 |
| 6 | **enrollments** | `id` (INT, AI) | `class_id` -> `classes(id)`, `student_id` -> `users(id)`, UNIQUE(`class_id`, `student_id`) | `enrolled_at`, `status` (ACTIVE, DROPPED) | Member 2 |
| 7 | **schedules** | `id` (INT, AI) | `class_id` -> `classes(id)` ON DELETE CASCADE | `day_of_week` (TINYINT 2-8), `shift`, `start_time`, `end_time`, `room` | Member 2 |
| 8 | **attendances** | `id` (INT, AI) | `class_id` -> `classes(id)`, `student_id` -> `users(id)` | `session_date` (DATE), `status` (PRESENT, ABSENT_EXCUSED, ABSENT_UNEXCUSED, LATE), `note` | Member 3 |
| 9 | **assignments** | `id` (INT, AI) | `class_id` -> `classes(id)` ON DELETE CASCADE | `title`, `description`, `file_url`, `due_date` (DATETIME), `created_at` | Member 3 |
| 10 | **submissions** | `id` (INT, AI) | `assignment_id` -> `assignments(id)`, `student_id` -> `users(id)` | `file_url`, `submitted_at`, `score` (DECIMAL), `teacher_feedback` | Member 3 |
| 11 | **grades** | `id` (INT, AI) | `enrollment_id` -> `enrollments(id)` (UNIQUE) | `attendance_score`, `midterm_score`, `final_score`, `total_score`, `is_passed` (BOOLEAN) | Member 4 |
| 12 | **tuition_invoices** | `id` (INT, AI) | `student_id` -> `users(id)`, `enrollment_id` -> `enrollments(id)` | `amount`, `paid_amount`, `due_date`, `status` (UNPAID, PARTIAL, PAID), `paid_at` | Member 4 |
| 13 | **notifications** | `id` (INT, AI) | `user_id` -> `users(id)` (Nullable nếu gửi toàn hệ thống) | `title`, `message`, `type` (ASSIGNMENT, GRADE, TUITION, SYSTEM), `is_read`, `created_at` | Member 5 |

---

## PHẦN 5: DANH SÁCH RESTFUL API ENDPOINTS CHUẨN HÓA

Tất cả các API đều có tiền tố `/api/v1` và trả về JSON theo định dạng thống nhất:
```json
{
  "success": true,
  "message": "Thao tác thành công",
  "data": {}
}
```

### 1. Auth & Users, Courses (Phụ trách: Member 1)
* `POST /api/v1/auth/login` - Đăng nhập và nhận JWT Token (Public)
* `GET /api/v1/auth/me` - Lấy thông tin người dùng hiện tại (Authenticated)
* `GET /api/v1/students` - Danh sách học viên có phân trang & tìm kiếm (ADMIN)
* `POST /api/v1/students` - Thêm mới học viên (ADMIN)
* `POST /api/v1/students/import` - Import học viên từ file Excel (ADMIN)
* `GET /api/v1/teachers` - Danh sách giảng viên (ADMIN)
* `POST /api/v1/teachers` - Thêm mới giảng viên (ADMIN)
* `GET /api/v1/courses` - Danh sách môn học (ADMIN, TEACHER, STUDENT)
* `POST /api/v1/courses` - Tạo môn học mới (ADMIN)

### 2. Classes & Schedules (Phụ trách: Member 2)
* `GET /api/v1/classes` - Danh sách lớp học (lọc theo học kỳ, giảng viên, học viên)
* `POST /api/v1/classes` - Mở lớp học phần mới (ADMIN)
* `POST /api/v1/classes/:id/enrollments` - Thêm học viên vào lớp + Tự tạo bản ghi Grade & Tuition (ADMIN)
* `DELETE /api/v1/classes/:id/enrollments/:studentId` - Xóa học viên khỏi lớp (ADMIN)
* `GET /api/v1/schedules/my-schedule` - Lấy thời khóa biểu tuần của GV hoặc SV đang đăng nhập (TEACHER, STUDENT)
* `POST /api/v1/classes/:id/schedules` - Gán lịch học cho lớp kèm kiểm tra trùng phòng/trùng GV (ADMIN)

### 3. Attendance & Assignments (Phụ trách: Member 3)
* `GET /api/v1/classes/:id/attendances?date=YYYY-MM-DD` - Lấy bảng điểm danh theo ngày (TEACHER, ADMIN)
* `POST /api/v1/classes/:id/attendances` - Lưu/Cập nhật điểm danh cả lớp trong buổi học (TEACHER)
* `GET /api/v1/classes/:id/assignments` - Lấy danh sách bài tập của lớp (TEACHER, STUDENT)
* `POST /api/v1/classes/:id/assignments` - Tạo bài tập mới kèm upload file đề bài (TEACHER)
* `POST /api/v1/assignments/:id/submissions` - Học viên nộp bài tập (STUDENT)
* `PATCH /api/v1/submissions/:id/grade` - Giảng viên chấm điểm và nhận xét bài tập (TEACHER)

### 4. Grades & Tuition (Phụ trách: Member 4)
* `GET /api/v1/classes/:id/grades` - Lấy bảng điểm toàn bộ học viên trong lớp (TEACHER, ADMIN)
* `PUT /api/v1/classes/:id/grades` - Cập nhật điểm hàng loạt và tự động tính điểm tổng kết (TEACHER)
* `GET /api/v1/students/my-grades` - Học viên xem bảng điểm cá nhân (STUDENT)
* `GET /api/v1/tuition-invoices` - Danh sách hóa đơn học phí, lọc theo trạng thái (ADMIN, STUDENT)
* `PATCH /api/v1/tuition-invoices/:id/pay` - Ghi nhận thanh toán học phí (ADMIN)

### 5. Notifications & Analytics (Phụ trách: Member 5)
* `GET /api/v1/notifications` - Lấy danh sách thông báo của người dùng (Authenticated)
* `POST /api/v1/notifications/broadcast` - Gửi thông báo cho toàn hệ thống hoặc theo lớp (ADMIN)
* `PATCH /api/v1/notifications/:id/read` - Đánh dấu đã đọc thông báo (Authenticated)
* `GET /api/v1/analytics/admin-overview` - Số liệu KPI tổng quan, biểu đồ doanh thu và tỷ lệ qua môn (ADMIN)
* `GET /api/v1/analytics/student-overview` - Thống kê GPA, chuyên cần và deadline sắp tới (STUDENT)

---

## PHẦN 6: KIẾN TRÚC THƯ MỤC & CẤU HÌNH DOCKER

### 1. Cấu trúc thư mục Monorepo
```text
ems-project/
├── docker-compose.yml
├── backend/                  # Express.js + Prisma ORM
│   ├── Dockerfile
│   ├── package.json
│   ├── prisma/
│   │   ├── schema.prisma     # Định nghĩa 13 bảng MySQL
│   │   └── seed.js           # Dữ liệu mẫu (Admin, 5 GV, 20 SV, 5 Course, 3 Class)
│   └── src/
│       ├── config/           # Cấu hình DB, JWT, Multer
│       ├── middlewares/      # auth.middleware.js, role.middleware.js
│       ├── modules/          # Chia 5 cụm thư mục độc lập để tránh Git Conflict
│       │   ├── users-courses/
│       │   ├── classes-schedules/
│       │   ├── attendance-assignments/
│       │   ├── grades-tuition/
│       │   └── notifications-analytics/
│       └── app.js
└── frontend/                 # React (Vite) + Ant Design
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── api/              # Cấu hình Axios Interceptor
        ├── components/       # Layout, Sidebar, NotificationBell
        └── pages/            # Chia 5 cụm thư mục tương ứng với Backend
```

### 2. Nội dung file `docker-compose.yml`
```yaml
version: '3.8'

services:
  mysql_db:
    image: mysql:8.0
    container_name: ems_mysql
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: ems_db
      MYSQL_USER: ems_user
      MYSQL_PASSWORD: ems_password
    ports:
      - "3307:3306"
    volumes:
      - mysql_data:/var/lib/mysql

  phpmyadmin:
    image: phpmyadmin/phpmyadmin
    container_name: ems_phpmyadmin
    restart: always
    ports:
      - "8080:80"
    environment:
      PMA_HOST: mysql_db
      MYSQL_ROOT_PASSWORD: rootpassword
    depends_on:
      - mysql_db

volumes:
  mysql_data:
```

---

## PHẦN 7: PHÂN CÔNG NHIỆM VỤ & KẾ HOẠCH TRIỂN KHAI (5 THÀNH VIÊN)

### 1. Bảng phân công trách nhiệm
| Thành viên | Cụm Module phụ trách | Các bảng DB làm việc chính | Đầu việc trọng tâm |
| :--- | :--- | :--- | :--- |
| **Member 1 (Leader)** | Auth, Student, Teacher, Course | `users`, `student_profiles`, `teacher_profiles`, `courses` | Dựng Base Project (Express + React + Docker), phân quyền JWT, CRUD User/Course, Import Excel SV. |
| **Member 2** | Class, Schedule | `classes`, `enrollments`, `schedules` | Mở lớp, thêm SV vào lớp, kiểm tra trùng phòng/trùng lịch dạy, giao diện Thời khóa biểu tuần. |
| **Member 3** | Attendance, Assignment | `attendances`, `assignments`, `submissions` | Điểm danh theo buổi học, tính % chuyên cần, Upload/Download file bài tập, chấm điểm bài tập. |
| **Member 4** | Exam & Grade, Tuition | `grades`, `tuition_invoices` | Bảng điểm Editable, tự động tính điểm tổng kết & xét qua môn, quản lý thu học phí & in biên lai. |
| **Member 5** | Notification, Report & Analytics | `notifications` + Truy vấn tổng hợp | Quả chuông thông báo, hàm dùng chung để bắn thông báo tự động, vẽ biểu đồ Dashboard Admin & Student. |

### 2. Lộ trình thực hiện (Timeline 4 - 6 Tuần)
* **Tuần 1 - Khởi tạo & Đồng bộ nền tảng:**
  * Member 1 dựng khung Monorepo, cấu hình `docker-compose.yml`, tạo 13 bảng bằng Prisma/SQL và viết `seed.js` tạo sẵn dữ liệu mẫu.
  * Cả nhóm thống nhất quy ước đặt tên nhánh Git (`feat/ten-module`) và chuẩn JSON trả về.
* **Tuần 2 - Phát triển Backend API & Giao diện cơ bản (CRUD):**
  * Các thành viên tự viết API và dựng trang danh sách/biểu mẫu (Ant Design Table & Modal) cho cụm module của mình dựa trên dữ liệu Seed có sẵn.
* **Tuần 3 - Xử lý Nghiệp vụ Nâng cao (Core Logic):**
  * Member 2 hoàn thiện thuật toán kiểm tra trùng lịch.
  * Member 3 hoàn thiện tính năng Upload file bài tập và bảng điểm danh.
  * Member 4 hoàn thiện công thức tính điểm tự động và cập nhật hóa đơn học phí.
  * Member 5 tích hợp biểu đồ Recharts và gắn hàm gửi thông báo vào các sự kiện Giao bài tập / Nhập điểm.
* **Tuần 4 - Tích hợp, Kiểm thử (Testing) & Đóng gói:**
  * Ghép toàn bộ luồng nghiệp vụ từ lúc Tạo môn học -> Mở lớp -> Xếp lịch -> Điểm danh/Làm bài tập -> Nhập điểm -> Thu học phí -> Xem báo cáo.
  * Kiểm thử phân quyền (Role Student không được truy cập trang của Teacher/Admin) và hoàn thiện báo cáo đồ án.
