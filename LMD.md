# PHẦN B — NỘI DUNG CHI TIẾT CONTEXT DIAGRAM (THEO 5 NGƯỜI)

## B.1. Bảng phân bổ lại luồng dữ liệu Context (Tách bạch cho 5 Actor)

| Mã luồng | Chiều dữ liệu | Nội dung luồng dữ liệu | Phụ trách |
| :--- | :--- | :--- | :--- |
| DF01 | Mọi Actor người dùng (A1..A5) → EMS | Thông tin đăng nhập (mã/email, mật khẩu) | Người 1 (System Admin) |
| DF02 | EMS → Mọi Actor người dùng (A1..A5) | JWT token, thông tin tài khoản và phân quyền (role) | Người 1 (System Admin) |
| DF03a | System Admin → EMS | Yêu cầu quản lý tài khoản người dùng (Khóa / Mở khóa tài khoản, phân quyền) | Người 1 (System Admin) |
| DF08a | System Admin → EMS | Nội dung thông báo toàn hệ thống / theo lớp (loại SYSTEM) | Người 1 (System Admin) |
| DF12a | EMS → System Admin | Dashboard tổng quan hệ thống (4 KPI tổng, biểu đồ tỷ lệ qua môn, danh sách tài khoản) | Người 1 (System Admin) |
| DF03b | Academic Staff → EMS | Hồ sơ học viên (STU2026001..) và hồ sơ giảng viên (TEA001..) (Thêm mới, cập nhật) | Người 2 (Academic Staff) |
| DF04 | Academic Staff → Tệp Excel (X2) → EMS | File Excel .xlsx danh sách học viên nhập hàng loạt (Import) | Người 2 (Academic Staff) |
| DF05 | Academic Staff → EMS | Thông tin danh mục môn học (WEB101, JS201, số buổi, học phí cơ bản, file syllabus) | Người 2 (Academic Staff) |
| DF06 | Academic Staff → EMS | Yêu cầu mở lớp học phần (WEB101-2026A-01, kỳ 2026A, GV TEA001, max = 3) | Người 2 (Academic Staff) |
| DF07 | Academic Staff → EMS | Yêu cầu thêm / xóa học viên trong lớp (STU2026001..004) | Người 2 (Academic Staff) |
| DF09 | EMS → Academic Staff | Danh sách & hồ sơ chi tiết 360° học viên, giảng viên, môn học, bảng điểm lớp (chỉ đọc) | Người 2 (Academic Staff) |
| DF10 | EMS → Academic Staff → Tệp Excel (X2) | Kết quả import học viên và File Excel danh sách học viên xuất ra (Export) | Người 2 (Academic Staff) |
| DF11 | EMS → Academic Staff | Kết quả mở lớp / thêm học viên (Thành công hoặc báo lỗi "Vượt sĩ số 3/3") | Người 2 (Academic Staff) |
| DF13 | Academic Staff → EMS | Yêu cầu xếp lịch học (lớp, thứ, ca, giờ bắt đầu/kết thúc, phòng P101/P102, GV) | Người 2 (Academic Staff) |
| DF14 | EMS → Academic Staff | Kết quả xếp lịch (Đã lưu hoặc báo "Lỗi trùng phòng P101" / "Lỗi trùng GV TEA001") | Người 2 (Academic Staff) |
| DF15 | EMS → Academic Staff, Teacher, Student | Thời khóa biểu tuần dạng lưới | Người 2 (Academic Staff) |
| DF08b | Accountant → EMS | Yêu cầu tạo thông báo nhắc đóng học phí (loại TUITION) | Người 3 (Accountant) |
| DF12b | EMS → Accountant | Báo cáo thống kê doanh thu học phí đã thu vs còn nợ theo tháng, danh sách công nợ | Người 3 (Accountant) |
| DF32 | EMS → Payment System (VietQR) | Yêu cầu tạo mã QR: Số tiền còn nợ (2.000.000 đ) + Nội dung CK ("STU2026001 WEB101") | Người 3 (Accountant) |
| DF33 | Payment System (VietQR) → EMS | Mã VietQR tĩnh trả về | Người 3 (Accountant) |
| DF34 | Accountant → EMS | Thông tin ghi nhận thanh toán học phí (mã hóa đơn, số tiền thực thu đợt 1: 1tr, đợt 2: 2tr) | Người 3 (Accountant) |
| DF35 | EMS → Accountant | Cập nhật trạng thái hóa đơn (UNPAID → PARTIAL → PAID) & Phiếu thu/biên lai in trình duyệt | Người 3 (Accountant) |
| DF16 | Teacher → EMS | Dữ liệu điểm danh buổi học (lớp, ngày, trạng thái PRESENT/ABSENT..., ghi chú) | Người 4 (Teacher) |
| DF17 | Teacher → EMS → File Storage (X1) | Bài tập mới BT01 (tiêu đề, hướng dẫn, file đề đính kèm, hạn nộp 02/11/2026 23:59) | Người 4 (Teacher) |
| DF18 | Teacher → EMS | Điểm bài tập (thang 10) và nhận xét teacher_feedback | Người 4 (Teacher) |
| DF19 | Teacher → EMS | Điểm thành phần 3 cột (chuyên cần, giữa kỳ, cuối kỳ) và lệnh Công bố điểm | Người 4 (Teacher) |
| DF20 | EMS → Teacher | Danh sách lớp phụ trách, lịch dạy, danh sách học viên trong lớp | Người 4 (Teacher) |
| DF21 | EMS → Teacher | Danh sách bài nộp của học viên (file bài làm, thời gian nộp, cờ nộp muộn) | Người 4 (Teacher) |
| DF22 | EMS → Teacher | Cảnh báo chuyên cần (STU2026003 vắng 30% > ngưỡng 20%) | Người 4 (Teacher) |
| DF23 | EMS ↔ Teacher ↔ Tệp Excel (X2) | Bảng điểm lớp dạng lưới, file mẫu import, file Excel điểm xuất/nhập | Người 4 (Teacher) |
| DF24 | Student → EMS → File Storage (X1) | File bài làm BT01 nộp trực tuyến | Người 5 (Student) |
| DF25 | Student → EMS | Thao tác đánh dấu thông báo đã đọc (is_read = true) | Người 5 (Student) |
| DF26 | EMS → Student | Lịch học tuần, lịch sử điểm danh cá nhân, tỷ lệ % chuyên cần | Người 5 (Student) |
| DF27 | EMS → Student | Đề bài BT01, trạng thái nộp, điểm bài tập và nhận xét của giảng viên | Người 5 (Student) |
| DF28 | EMS → Student | Bảng điểm từng môn (7.8) và điểm trung bình tích lũy GPA | Người 5 (Student) |
| DF30 | EMS → Student | Công nợ học phí cá nhân (tổng phải thu, đã đóng, còn nợ, trạng thái) & mã VietQR | Người 5 (Student) |
| DF31 | EMS → Student, Teacher | Dashboard Học viên / Giảng viên (lịch hôm nay, deadline sắp hết hạn, biểu đồ GPA) | Người 5 (Student) |
| DF36 | EMS ↔ File Storage (X1) | Lưu và đọc file (đề bài tập, bài nộp học viên, syllabus môn học) | Người 1 chốt, N2/N4/N5 dùng |

---

# PHẦN C — NỘI DUNG CHI TIẾT USE CASE DIAGRAM (THEO 5 NGƯỜI)

## C.1. Danh mục Use Case phân bổ theo 5 Thành viên

| Mã UC | Tên Use Case | Actor chính | Sơ đồ chứa | Phụ trách |
| :--- | :--- | :--- | :--- | :--- |
| UC0.1 | Đăng nhập / Xem thông tin cá nhân & Phân quyền | Mọi Actor | UC-00, UC-SYSADMIN | Người 1 |
| UC1.2a\* | Quản lý tài khoản người dùng (Khóa / Mở khóa tài khoản) | System Admin | UC-SYSADMIN | Người 1 |
| UC10.1 | Tạo thông báo toàn hệ thống / theo lớp (SYSTEM) | System Admin | UC-SYSADMIN | Người 1 |
| UC11.1a | Xem Dashboard tổng quan (4 KPI, tỷ lệ qua môn) | System Admin | UC-SYSADMIN | Người 1 |
| UC1.1 | Danh sách và tìm kiếm học viên | Academic Staff | UC-ACADEMIC | Người 2 |
| UC1.2b | Thêm / Sửa hồ sơ học viên (tự sinh mã STU2026xxx) | Academic Staff | UC-ACADEMIC | Người 2 |
| UC1.3 | Import / Export Excel danh sách học viên | Academic Staff | UC-ACADEMIC | Người 2 |
| UC1.4 | Xem hồ sơ chi tiết 360° học viên | Academic Staff | UC-ACADEMIC | Người 2 |
| UC2.1 | Quản lý hồ sơ giảng viên (TEA001, TEA002) | Academic Staff | UC-ACADEMIC | Người 2 |
| UC2.2 | Tra cứu lịch dạy và lớp phụ trách | Academic Staff, Teacher | UC-ACADEMIC, UC-TEACHER | Người 2, Người 4 |
| UC3.1 | Quản lý danh mục môn học (WEB101, JS201) | Academic Staff | UC-ACADEMIC | Người 2 |
| UC4.1 | Mở lớp học phần (gán GV, thiết lập sĩ số tối đa) | Academic Staff | UC-ACADEMIC | Người 2 |
| UC4.2 | Quản lý enrollment (thêm/xóa học viên vào lớp) | Academic Staff | UC-ACADEMIC | Người 2 |
| UC5.1 | Xếp lịch học cho lớp | Academic Staff | UC-ACADEMIC | Người 2 |
| UC5.2 | Kiểm tra xung đột lịch (trùng phòng / trùng GV) | Academic Staff | UC-ACADEMIC | Người 2 |
| UC5.3 | Xem thời khóa biểu dạng lưới tuần | Academic Staff, Teacher, Student | UC-ACADEMIC, UC-TEACHER, UC-STUDENT | Người 2, 4, 5 |
| UC8.5\* | Xem bảng điểm lớp (chỉ đọc) | Academic Staff | UC-ACADEMIC | Người 2 |
| UC9.1 | Ghi nhận và tra cứu công nợ học phí tự động | Accountant (Hệ thống tạo khi ghi danh) | UC-ACCOUNTANT | Người 3 |
| UC9.2 | Cập nhật trạng thái thanh toán học phí (UNPAID → PARTIAL → PAID) | Accountant | UC-ACCOUNTANT | Người 3 |
| UC9.3 | Xuất mã VietQR và in phiếu thu/biên lai học phí | Accountant, Student, Payment System | UC-ACCOUNTANT, UC-STUDENT | Người 3 |
| UC10.2 | Thông báo tự động (Trigger 3: Nhắc nợ học phí TUITION) | Accountant / Hệ thống | UC-ACCOUNTANT | Người 3 |
| UC11.1b\* | Xem thống kê doanh thu học phí (đã thu vs nợ theo tháng) | Accountant | UC-ACCOUNTANT | Người 3 |
| UC6.1 | Điểm danh theo buổi học | Teacher | UC-TEACHER | Người 4 |
| UC6.2 | Thống kê chuyên cần và cảnh báo vắng (> 20%) | Teacher, Student | UC-TEACHER, UC-STUDENT | Người 4, Người 5 |
| UC7.1 | Giao bài tập mới (BT01) | Teacher | UC-TEACHER | Người 4 |
| UC7.3 | Chấm điểm và nhận xét bài tập | Teacher | UC-TEACHER | Người 4 |
| UC8.1 | Nhập bảng điểm thi kết thúc học phần dạng lưới | Teacher | UC-TEACHER | Người 4 |
| UC8.2 | Tự tính điểm tổng kết và xét qua môn (total >= 4.0) | Hệ thống (Teacher kích hoạt) | UC-TEACHER | Người 4 |
| UC8.3 | Import / Export bảng điểm Excel | Teacher | UC-TEACHER | Người 4 |
| UC10.3 | Xem và đánh dấu thông báo đã đọc | Teacher, Student | UC-TEACHER, UC-STUDENT | Người 4, Người 5 |
| UC11.2 | Xem Student / Teacher Dashboard | Teacher, Student | UC-TEACHER, UC-STUDENT | Người 4, Người 5 |
| UC6.3\* | Xem lịch sử điểm danh cá nhân | Student | UC-STUDENT | Người 5 |
| UC7.2 | Nộp bài tập trực tuyến | Student | UC-STUDENT | Người 5 |
| UC7.4\* | Xem nhận xét và điểm bài tập | Student | UC-STUDENT | Người 5 |
| UC8.4 | Tra cứu kết quả học tập và GPA | Student | UC-STUDENT | Người 5 |
| UC9.4\* | Kiểm tra công nợ học phí cá nhân | Student | UC-STUDENT | Người 5 |

## C.2. Chi tiết Use Case & Đặc tả của Người 1 — SYSTEM ADMIN (UC-SYSADMIN)

**Các Use Case và quan hệ:**

- **UC0.1:** Đăng nhập & Phân quyền `<<include>>` Xác thực JWT và kiểm tra Role (ADMIN, TEACHER, STUDENT).
- **UC1.2a\*:** Quản lý tài khoản người dùng `<<include>>` Khóa / Mở khóa tài khoản (is_active) và `<<extend>>` Phân quyền vai trò người dùng.
- **UC10.1:** Quản lý thông báo toàn hệ thống `<<include>>` Lưu thông báo loại SYSTEM vào D13 (notifications).
- **UC11.1a:** Xem Dashboard tổng quan `<<include>>` Thống kê 4 KPI tổng (Tổng HV, Tổng GV, Tổng lớp đang mở, Tổng doanh thu) và `<<include>>` Biểu đồ tỷ lệ qua môn / trượt môn.

**Bảng đặc tả Use Case mẫu cho Người 1 (UC10.1 & UC1.2a\*):**

| Mục | Nội dung đặc tả (UC1.2a\* & UC10.1) |
| :--- | :--- |
| **Tác nhân chính** | System Admin (Người 1 - tài khoản ADM001) |
| **Tiền điều kiện** | Đã đăng nhập thành công với role ADMIN (UC0.1). |
| **Luồng chính** | **Nhánh A (Khóa/Mở khóa tài khoản):** 1) System Admin tìm kiếm tài khoản trong D1 (users) (VD: STU2026003 hoặc TEA002). 2) Chọn thao tác Khóa (hoặc Mở khóa) và cập nhật quyền. 3) Hệ thống cập nhật trạng thái tài khoản trong D1 và thu hồi phiên đăng nhập nếu bị khóa.<br><br>**Nhánh B (Tạo thông báo hệ thống):** 1) System Admin chọn phạm vi nhận (Toàn hệ thống hoặc Lớp WEB101-2026A-01). 2) Nhập tiêu đề và nội dung thông báo. 3) Hệ thống tạo bản ghi loại SYSTEM vào D13 (notifications) cho toàn bộ người nhận. |
| **Luồng ngoại lệ** | System Admin tự khóa chính tài khoản ADM001 đang đăng nhập → Hệ thống chặn và báo lỗi không được tự khóa tài khoản quản trị hiện hành. Thiếu tiêu đề/nội dung thông báo → Báo lỗi bắt buộc nhập. |
| **Hậu điều kiện** | Bảng D1 (users) hoặc D13 (notifications) được cập nhật; quả chuông của Teacher và Student tăng số thông báo chưa đọc (DF29). |

## C.3. Chi tiết Use Case & Đặc tả của Người 2 — ACADEMIC STAFF / GIÁO VỤ (UC-ACADEMIC)

**Các Use Case và quan hệ:**

- **UC1.2b:** Thêm/Sửa hồ sơ học viên `<<include>>` Tự sinh mã học viên (STU2026001..004); **UC1.3:** Import/Export Excel HV `<<extend>>` vào UC1.2b.
- **UC1.4:** Hồ sơ chi tiết 360° `<<include>>` Xem lớp đã học, điểm số, học phí.
- **UC3.1:** Quản lý danh mục môn học có nhánh `<<extend>>` Xóa môn học (Chặn xóa nếu môn học như WEB101 đã có lớp mở).
- **UC4.1:** Mở lớp học phần `<<include>>` Gán 1 Giảng viên (TEA001) và thiết lập max_students (3).
- **UC4.2:** Quản lý enrollment `<<include>>` 3 bước bắt buộc: (1) Kiểm tra sĩ số tối đa, (2) Tự tạo bản ghi grades trống (D11), (3) Tự tạo hóa đơn tuition_invoices (D12).
- **UC5.1:** Xếp lịch học cho lớp `<<include>>` UC5.2: Kiểm tra xung đột lịch.
- **UC5.2** có 2 nhánh `<<extend>>`: Báo lỗi trùng phòng (P101) và Báo lỗi trùng giảng viên (TEA001).

**Bảng đặc tả Use Case mẫu cho Người 2 (UC4.2 & UC5.2):**

| Mục | Đặc tả UC4.2: Quản lý Enrollment | Đặc tả UC5.2: Kiểm tra xung đột lịch |
| :--- | :--- | :--- |
| **Tác nhân** | Academic Staff / Giáo vụ (Người 2) | Academic Staff / Giáo vụ (Người 2) |
| **Tiền điều kiện** | Lớp WEB101-2026A-01 (max_students = 3) đã mở; học viên trạng thái Đang học. | Lớp JS201-2026A-01 và JS201-2026A-02 đã mở và gán GV. |
| **Luồng chính** | 1) Chọn lớp WEB101-2026A-01. 2) Chọn STU2026001. 3) Kiểm tra sĩ số hiện tại (< 3). 4) Tạo enrollment ACTIVE vào D6. 5) Tự tạo bản ghi grades trống vào D11. 6) Tự tạo hóa đơn 3.000.000 đ UNPAID vào D12. 7) Báo thành công. | 1) Chọn lớp JS201-2026A-02 (GV TEA001). 2) Chọn Thứ 4, Chiều 13:30–15:30, Phòng P102. 3) Kiểm tra D7 không trùng phòng P102. 4) Kiểm tra D5+D7 không trùng GV TEA001. 5) Lưu vào D7 (schedules). |
| **Luồng ngoại lệ** | Lớp đã đủ 3/3 (STU2026001..003), thêm tiếp STU2026004 → Báo lỗi "Vượt sĩ số", không tạo bản ghi nào. Thêm trùng HV đã có trong lớp → Báo lỗi trùng. | - Xếp JS201-2026A-01 vào Thứ 2 Sáng 07:30–09:30 tại P101 → Báo Lỗi trùng phòng P101 (với WEB101).<br>- Xếp JS201-2026A-02 vào Thứ 2 Sáng 07:30–09:30 tại P102 → Báo Lỗi trùng giảng viên TEA001. |
| **Hậu điều kiện** | D6, D11, D12 có thêm 1 bản ghi mới tương ứng. | D7 lưu lịch hợp lệ; xuất TKB dạng lưới (UC5.3). |

## C.4. Chi tiết Use Case & Đặc tả của Người 3 — ACCOUNTANT / KẾ TOÁN (UC-ACCOUNTANT)

**Các Actor tham gia:** Accountant (Actor chính bên trái), Student (Actor chính tham gia xem QR), Payment System (VietQR) (Actor hệ thống phụ bên phải).

**Các Use Case và quan hệ:**

- **UC9.1:** Quản lý công nợ học phí `<<include>>` Tự tạo hóa đơn UNPAID theo base_tuition_fee (3.000.000 đ) (khi Giáo vụ thêm HV vào lớp ở UC4.2).
- **UC9.2:** Cập nhật trạng thái thanh toán `<<include>>` Cộng dồn paid_amount và chuyển trạng thái UNPAID → PARTIAL → PAID.
- **UC9.2** có 2 nhánh `<<extend>>`: (1) Xuất & In phiếu thu/biên lai trên trình duyệt (UC9.3) và (2) Gửi thông báo nhắc nợ học phí (UC10.2 - Trigger 3).
- **UC9.3:** Xuất mã VietQR & Phiếu thu `<<include>>` Gửi số tiền còn nợ + mã HV tới Payment System (DF32) và Nhận mã VietQR tĩnh (DF33).
- **UC11.1b\*:** Xem thống kê doanh thu học phí theo tháng `<<include>>` Biểu đồ tổng đã thu vs tổng còn nợ theo tháng.

**Bảng đặc tả Use Case mẫu cho Người 3 (UC9.2: Cập nhật trạng thái thanh toán):**

| Mục | Nội dung đặc tả (UC9.2) |
| :--- | :--- |
| **Tác nhân chính** | Accountant / Kế toán (Người 3) |
| **Tiền điều kiện** | Hóa đơn của STU2026001 môn WEB101 đã tồn tại trong D12 (tuition_invoices), amount = 3.000.000 đ, status = UNPAID. |
| **Luồng chính** | 1) Kế toán mở hóa đơn của STU2026001. 2) Nhập số tiền thu đợt 1 là 1.000.000 đ (DF34). 3) Hệ thống cộng vào paid_amount = 1.000.000 đ. 4) Do paid_amount < amount, hệ thống cập nhật trạng thái thành PARTIAL (còn nợ 2.000.000 đ). 5) Đợt 2, Kế toán nhập tiếp 2.000.000 đ → paid_amount = 3.000.000 đ == amount → Cập nhật trạng thái PAID, ghi nhận paid_at. 6) Kế toán bấm in phiếu thu/biên lai trên trình duyệt (DF35). |
| **Luồng ngoại lệ** | Nhập số tiền <= 0 hoặc làm paid_amount > amount (> 3.000.000 đ) → Hệ thống từ chối và báo lỗi. Hóa đơn đã PAID → Khóa không cho thu thêm. |
| **Hậu điều kiện** | Bảng D12 (tuition_invoices) cập nhật trạng thái mới; Student thấy công nợ giảm về 0 (DF30); biểu đồ doanh thu tháng (UC11.1b\*) tự động cập nhật. |

## C.5. Chi tiết Use Case & Đặc tả của Người 4 — TEACHER / GIẢNG VIÊN (UC-TEACHER)

**Các Use Case và quan hệ:**

- **UC2.2:** Tra cứu lịch dạy & lớp phụ trách, **UC5.3:** Xem TKB dạng lưới.
- **UC6.1:** Điểm danh theo buổi `<<include>>` Chọn lớp và ngày học; `<<extend>>` UC6.2: Cảnh báo vắng quá 20% (VD: STU2026003 vắng 3/10 buổi = 30%).
- **UC7.1:** Giao bài tập (BT01) `<<include>>` Tải file đề lên File Storage (X1) và `<<include>>` UC10.2: Gửi thông báo bài tập mới (Trigger 1 - ASSIGNMENT).
- **UC7.3:** Chấm điểm & nhận xét bài tập `<<include>>` Tải bài làm của học viên.
- **UC8.1:** Nhập bảng điểm lớp dạng lưới `<<include>>` UC8.2: Tự tính điểm tổng kết & xét qua môn (`total = 0.1*CC + 0.3*GK + 0.6*CK`, `is_passed = total >= 4.0`).
- **UC8.1** có 2 nhánh `<<extend>>`: UC8.3: Import/Export bảng điểm Excel và Công bố điểm (kèm `<<include>>` sang UC10.2 - Trigger 2: Gửi thông báo GRADE).
- **UC10.3:** Xem & đánh dấu đã đọc thông báo, **UC11.2:** Xem Teacher Dashboard.

## C.6. Chi tiết Use Case & Đặc tả của Người 5 — STUDENT / HỌC VIÊN (UC-STUDENT)

**Các Use Case và quan hệ:**

- **UC5.3:** Xem thời khóa biểu dạng lưới, **UC6.2:** Xem thống kê chuyên cần & cảnh báo, **UC6.3\*:** Xem lịch sử điểm danh cá nhân.
- **UC7.2:** Nộp bài tập trực tuyến (BT01) `<<include>>` Kiểm tra hạn nộp (02/11/2026 23:59) và Lưu file lên File Storage (X1); có 2 nhánh `<<extend>>`: Đánh dấu nộp muộn (STU2026002 nộp 03/11 08:00) hoặc Từ chối nộp.
- **UC7.4\*:** Xem điểm bài tập & nhận xét GV.
- **UC8.4:** Tra cứu kết quả học tập & GPA `<<include>>` Tính GPA tích lũy.
- **UC9.4\*:** Kiểm tra công nợ học phí cá nhân `<<extend>>` UC9.3: Hiển thị mã VietQR theo số tiền còn nợ (khi còn nợ > 0).
- **UC10.3:** Nhận & đánh dấu đã đọc thông báo `<<include>>` Cập nhật is_read = true, **UC11.2:** Xem Student Dashboard.

---

# PHẦN D — NỘI DUNG CHI TIẾT BUSINESS FLOW / SWIMLANE (THEO 5 NGƯỜI)

## D.1. Người 1 — BF-SYSADMIN: Quản lý tài khoản, Phân quyền & Phát thông báo hệ thống

**Swimlanes:** System Admin (Người 1) | EMS | Teacher / Student (Người 4, Người 5).

| Mã bước | Lane | Hoạt động chi tiết | Quyết định / Kho dữ liệu & Luồng |
| :--- | :--- | :--- | :--- |
| BF-SYS-1 | System Admin | Đăng nhập bằng tài khoản ADM001 (DF01) | EMS kiểm tra D1 (users), trả JWT + role ADMIN (DF02) |
| BF-SYS-2 | System Admin | Mở Dashboard tổng quan (DF12a) | EMS tổng hợp 4 KPI & tỷ lệ qua môn từ D1, D5, D11, D12 |
| BF-SYS-3 | System Admin | Chọn chức năng: Quản lý tài khoản hoặc Tạo thông báo hệ thống | Rẽ 2 nhánh nghiệp vụ |
| BF-SYS-4a | System Admin | Tìm tài khoản (VD: STU2026003), chọn Khóa/Mở khóa hoặc đổi Role (DF03a) | |
| BF-SYS-5a | EMS | Kiểm tra có phải đang tự khóa ADM001 không? | Có → Báo lỗi chặn. Không → Cập nhật D1 (users) |
| BF-SYS-4b | System Admin | Nhập tiêu đề, nội dung thông báo và chọn phạm vi (Toàn hệ thống / Lớp WEB101-2026A-01) (DF08a) | |
| BF-SYS-5b | EMS | Gọi hàm notify(), ghi thông báo loại SYSTEM vào D13 (notifications) | |
| BF-SYS-6 | Teacher / Student | Hiển thị số thông báo mới trên quả chuông (DF29) | Đọc từ D13 |

## D.2. Người 2 — BF-ACADEMIC: Quản lý Hồ sơ, Mở lớp, Ghi danh & Xếp Thời khóa biểu

Người 2 phụ trách 2 luồng nghiệp vụ cốt lõi của Giáo vụ:

### Luồng 1 (BF-ACAD-1): Thêm/Import Học viên → Tạo môn → Mở lớp → Ghi danh

**Swimlanes:** Academic Staff (Người 2) | EMS | File Storage (X1).

**Các bước:**

- **BF-ACAD-1.1:** Giáo vụ thêm lẻ hoặc tải file .xlsx (DF03b, DF04) → EMS kiểm tra trùng email/SĐT, tự sinh mã STU2026001..004, lưu D1 (users) và D2 (student_profiles).
- **BF-ACAD-1.2:** Giáo vụ tạo môn WEB101 (30 buổi, 3.000.000 đ - DF05) → EMS lưu D4 (courses) và lưu syllabus vào X1 (DF36). (Nếu chọn xóa môn đã có lớp → EMS chặn xóa cứng).
- **BF-ACAD-1.3:** Giáo vụ mở lớp WEB101-2026A-01, gán GV TEA001 (từ D3), max_students = 3 (DF06) → Lưu D5 (classes).
- **BF-ACAD-1.4:** Giáo vụ thêm học viên vào lớp (DF07) → EMS kiểm tra sĩ số trong D6 (enrollments):
  - Nếu đã đủ 3/3 (thêm STU2026004): Báo lỗi "Vượt sĩ số (3/3)" (DF11), dừng.
  - Nếu chưa đủ (thêm STU2026001..003): Ghi ACTIVE vào D6 (enrollments), tự tạo điểm trống vào D11 (grades), và tự tạo hóa đơn 3.000.000 đ UNPAID vào D12 (tuition_invoices) (chuyển giao sang Người 3 - Kế toán).

### Luồng 2 (BF-ACAD-2): Xếp thời khóa biểu & Kiểm tra xung đột lịch

**Swimlanes:** Academic Staff (Người 2) | EMS.

**Các bước:**

- **BF-ACAD-2.1:** Giáo vụ chọn lớp (JS201-2026A-01 hoặc JS201-2026A-02) từ D5.
- **BF-ACAD-2.2:** Nhập Thứ, Ca/giờ, Phòng học (DF13).
- **BF-ACAD-2.3:** EMS kiểm tra trùng Phòng trong D7 (schedules) → Nếu xếp JS201-2026A-01 vào Thứ 2 Sáng 07:30–09:30 tại P101 → Báo "Lỗi trùng phòng P101" (DF14), quay lại bước 2.
- **BF-ACAD-2.4:** EMS kiểm tra trùng Giảng viên trong D5 + D7 → Nếu xếp JS201-2026A-02 (GV TEA001) vào Thứ 2 Sáng 07:30–09:30 tại P102 → Báo "Lỗi trùng giảng viên TEA001" (DF14), quay lại bước 2.
- **BF-ACAD-2.5:** Nếu chọn Thứ 4 Chiều 13:30–15:30 tại P102 (Hợp lệ) → Lưu vào D7 (schedules) và xuất TKB tuần dạng lưới (DF15) cho Giáo vụ, Giảng viên, Học viên.

## D.3. Người 3 — BF-ACCOUNTANT: Quản lý Công nợ, VietQR, Thu học phí & Thống kê Doanh thu

**Swimlanes:** Accountant / Kế toán (Người 3) | EMS | Payment System (VietQR) | Student (Người 5).

| Mã bước | Lane | Hoạt động chi tiết | Quyết định / Kho dữ liệu & Luồng |
| :--- | :--- | :--- | :--- |
| BF-ACC-1 | EMS | Tự động sinh hóa đơn 3.000.000 đ, status = UNPAID khi STU2026001 vào lớp WEB101-2026A-01 | Lưu D12 (tuition_invoices) (nhận từ BF-ACAD-1.4) |
| BF-ACC-2 | Accountant | Kiểm tra danh sách công nợ, bấm gửi nhắc học phí cho các HV chưa PAID (DF08b) | EMS ghi thông báo loại TUITION vào D13 (notifications) (Trigger 3) |
| BF-ACC-3 | Student | Nhận thông báo (DF29), xem công nợ (DF30) và yêu cầu hiển thị mã QR thanh toán | |
| BF-ACC-4 | EMS | Tính số tiền còn nợ (amount - paid_amount), gửi yêu cầu kèm nội dung "STU2026001 WEB101" (DF32) | Gọi sang Payment System |
| BF-ACC-5 | Payment System | Tạo và trả về mã VietQR tĩnh (DF33) | Hiển thị cho Student & Accountant |
| BF-ACC-6 | Student | Quét mã VietQR và chuyển khoản ngân hàng (ngoài hệ thống EMS) | |
| BF-ACC-7 | Accountant | Đối soát tiền vào, nhập số tiền thực thu Đợt 1: 1.000.000 đ cho STU2026001 (DF34) | |
| BF-ACC-8 | EMS | Kiểm tra hợp lệ (0 < thu <= nợ) → Cộng paid_amount = 1.000.000 đ | Vì 1tr < 3tr → Đổi trạng thái thành PARTIAL (còn nợ 2.000.000 đ) trong D12 |
| BF-ACC-9 | Accountant | Lần sau, nhập tiếp số tiền thực thu Đợt 2: 2.000.000 đ (DF34) | |
| BF-ACC-10 | EMS | Cộng dồn paid_amount = 3.000.000 đ == amount | Đổi trạng thái thành PAID, ghi paid_at vào D12 |
| BF-ACC-11 | Accountant | Xuất & in phiếu thu/biên lai trên trình duyệt (DF35) và xem biểu đồ thống kê doanh thu đã thu vs còn nợ theo tháng (DF12b) | Đọc từ D12 |

## D.4. Người 4 — BF-TEACHER: Điểm danh, Giao & Chấm bài tập, Nhập bảng điểm thi

**Swimlanes:** Teacher (Người 4) | EMS | File Storage (X1) | Student (Người 5).

Gồm 3 luồng chuẩn (giữ nguyên 100% logic & dữ liệu mẫu):

- **BF-TEA-1 (Điểm danh buổi học & Cảnh báo vắng > 20%):** Teacher chọn lớp WEB101-2026A-01 và ngày học (DF20) → EMS hiển thị danh sách HV mặc định PRESENT (D6, D8) → Teacher tích STU2026003 là ABSENT_UNEXCUSED và lưu (DF16 vào D8) → EMS tính tỷ lệ vắng: STU2026003 vắng 3/10 buổi (30% > 20%) → Phát cảnh báo chuyên cần (DF22).
- **BF-TEA-2 (Giao bài tập BT01 & Chấm bài):** Teacher tạo BT01, hạn 02/11/2026 23:59, đính kèm file đề (DF17 lưu vào D9 và X1) → EMS chạy Trigger 1 (UC10.2) tạo thông báo ASSIGNMENT vào D13 gửi cho Student → Sau khi Student nộp bài vào D10, EMS trả danh sách bài nộp kèm cờ nộp muộn (DF21) → Teacher tải file, chấm điểm thang 10 và nhập teacher_feedback (DF18 cập nhật D10).
- **BF-TEA-3 (Nhập điểm kết thúc học phần & Công bố điểm):** Teacher mở bảng điểm lưới hoặc import Excel (DF23), nhập 3 cột điểm (STU2026001: 9/7/8; STU2026002: 10/3/4; STU2026003: 8/2/3) (DF19) → EMS kiểm tra miền 0..10, tự tính `total = 0.1*CC + 0.3*GK + 0.6*CK` (7.8, 4.3 → is_passed = true; 3.2 → is_passed = false) lưu vào D11 (grades) → Teacher bấm Công bố điểm → EMS chạy Trigger 2 (UC10.2) tạo thông báo GRADE vào D13.

## D.5. Người 5 — BF-STUDENT: Xem lịch, Nộp bài tập, Tra cứu điểm/GPA & Kiểm tra công nợ

**Swimlanes:** Student (Người 5) | EMS | File Storage (X1).

Trình tự 10 bước chuẩn (BF-STU-1 đến BF-STU-10):

1. **BF-STU-1:** Học viên (STU2026001, STU2026002) đăng nhập (DF01), xem Student Dashboard (DF31 - lịch học hôm nay, deadline BT01, biểu đồ GPA).
2. **BF-STU-2:** Xem thời khóa biểu tuần (DF15) và theo dõi tỷ lệ chuyên cần cá nhân (DF26, đọc từ D7, D8).
3. **BF-STU-3:** Nhận thông báo trên quả chuông (DF29 từ D13), bấm đánh dấu đã đọc (DF25 → cập nhật is_read = true).
4. **BF-STU-4:** Mở bài tập BT01, tải file đề bài từ X1 (DF27).
5. **BF-STU-5:** Tải file bài làm lên nộp trực tuyến (DF24).
6. **BF-STU-6:** EMS so sánh thời gian nộp với hạn 02/11/2026 23:59:
   - STU2026001 nộp trước hạn → Lưu file vào X1, ghi D10 (submissions) trạng thái Đúng hạn.
   - STU2026002 nộp lúc 03/11/2026 08:00 (sau hạn) → Lưu file vào X1, ghi D10 kèm cờ Nộp muộn (hoặc từ chối nếu cấu hình chặn).
7. **BF-STU-7:** Xem điểm bài tập và nhận xét teacher_feedback của giảng viên (DF27 từ D10).
8. **BF-STU-8:** Nhận thông báo GRADE, tra cứu bảng điểm môn WEB101 (7.8 - Qua môn) và GPA tích lũy (DF28 từ D11).
9. **BF-STU-9:** Kiểm tra công nợ học phí cá nhân (DF30 từ D12: tổng 3.000.000 đ, đã đóng 1.000.000 đ, còn nợ 2.000.000 đ, trạng thái PARTIAL).
10. **BF-STU-10:** Bấm hiển thị mã VietQR theo số tiền còn nợ (2.000.000 đ) để thanh toán (kết nối sang BF-ACCOUNTANT bước 3–6 của Người 3).
