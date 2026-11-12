# Cổng học viên — Người 5

Triển khai theo phần STUDENT trong `Education Management System.md`. Database thực tế là MongoDB Atlas; TiDB không còn là database của mã nguồn hiện tại.

## Chức năng

- `/dashboard`: số khóa đang học, tiến độ trung bình, điểm trung bình thang 10 có trọng số tín chỉ, lịch Live hôm nay và bài tập chưa nộp sắp đến hạn.
- `/catalog`: tìm kiếm, phân trang, lọc môn FPT/chứng chỉ và Video/Live; xem đề cương, giảng viên, học phí, lịch và chỗ trống.
- `/my-courses`: khóa đã mua, đăng ký chờ thanh toán, vào học Video/Live và tiến độ từng khóa.
- `/my-courses/:enrollmentId`: trình phát MP4/WebM/YouTube, link tài liệu, hoàn thành bài học; phòng học Live và lịch học.
- `/questions`: đặt câu hỏi kèm link tài liệu, đọc phản hồi. Teacher/Admin trả lời tại cùng trang; chỉ giảng viên được phân công được trả lời.
- `/assignments`, `/grades`, `/attendance`, `/tuition`, `/notifications`: giữ tích hợp các module hiện có. Nộp bài hỗ trợ file hoặc link GitHub/Drive, ghi chú, nhận xét và nộp muộn. Nộp lại xóa điểm/nhận xét phiên bản cũ.

## Đăng ký và thanh toán

`POST /api/v1/courses/:id/purchase` nhận `{ "classId": 123 }` cho Live; Video không cần `classId`.

Khóa có phí tạo `Enrollment.PENDING_PAYMENT`, `Grade` và `TuitionInvoice.UNPAID` trong cùng transaction. Gọi lại trả về đăng ký cũ. Chỉ webhook/giao dịch SePay đã xác minh, được phân bổ đủ hóa đơn, mới chuyển đăng ký sang `ACTIVE`. Đóng một phần chưa mở khóa. Khóa giá 0 mở ngay. Frontend đưa học viên tới `/tuition` để tạo VietQR theo cơ chế PaymentOrder hiện có.

Mua Live kiểm tra sĩ số và trùng giờ trong cùng học kỳ, tính cả đăng ký đang chờ thanh toán. Hiện đăng ký chờ thanh toán giữ chỗ đến khi giáo vụ xử lý; chưa có cơ chế tự hết hạn. Đăng ký đã `DROPPED` cần giáo vụ xử lý đăng ký lại. Các ghi danh `ACTIVE` cũ được giữ quyền học, kể cả hóa đơn chưa thu đủ, để bảo toàn nghiệp vụ cũ.

## Database và dữ liệu hiện có

Thêm `courses.category/deliveryMode/level/instructorId/thumbnailUrl`, `classes.meetUrl`, `enrollments.progressPercent/completedLessonsCount` và ba collection:

| Collection | Khóa duy nhất | Mục đích |
| --- | --- | --- |
| `course_lessons` | `courseId + orderIndex` | Đề cương, video, tài liệu, học thử |
| `lesson_progress` | `enrollmentId + lessonId` | Tiến độ riêng từng học viên |
| `course_questions` | `id` | Câu hỏi, trả lời, trạng thái |

Khởi động backend không còn tự xóa/seed dữ liệu. Tạo index theo cách bổ sung, không xóa index ngoài model.

Chạy tại thư mục `backend`:

```powershell
node scripts/migrate-student.js          # Xem số lượng, không ghi dữ liệu
node scripts/migrate-student.js --apply  # Sao lưu rồi bổ sung các trường còn thiếu
```

Migration có thể chạy lại. Sao lưu nằm trong `backend/backups/student-<timestamp>/`, đã loại khỏi Git. Không sửa user, điểm, hóa đơn, phiếu thu hoặc trạng thái ghi danh cũ. Khóa học cũ được phân loại `FPT_SUBJECT/LIVE_ONLINE`; giảng viên lấy từ lớp đã phân công. Không tự chuyển khóa cũ thành khóa Video hay tự tạo link Meet/video.

Ngày 10/11/2026 đã áp dụng migration lên Atlas: giữ nguyên 15 users, 25 courses, 35 classes, 151 enrollments, 151 tuition invoices và 26 tuition payments. Chưa có nội dung video, link phòng học, tiến độ hay câu hỏi trước migration. Cần người phụ trách nội dung cung cấp tài nguyên thật để dùng luồng Video/Live đầy đủ.

## Cung cấp nội dung thật

Admin dùng `POST/PUT /api/v1/courses[/:id]` để lưu `category`, `deliveryMode`, `level`, `instructorId`, `thumbnailUrl`. Admin dùng `POST/PUT /api/v1/classes[/:id]` để lưu `meetUrl`.

Admin hoặc giảng viên khớp `course.instructorId` có thể xem `GET /api/v1/courses/:id/lessons` và tạo/cập nhật bài giảng bằng `POST /api/v1/courses/:id/lessons`. Cùng `orderIndex` cập nhật bài hiện có, giữ nguyên ID và tiến độ:

```json
{
  "orderIndex": 1,
  "sectionTitle": "Chương 1",
  "title": "Bài 1: Giới thiệu",
  "videoUrl": "https://your-content-host.example/lesson-1.mp4",
  "materialUrl": "https://your-content-host.example/lesson-1.pdf",
  "durationMinutes": 15,
  "isPreview": false
}
```

Đây là URL minh họa, cần thay bằng tài nguyên thật. Thêm bài mới sẽ tính lại mẫu số tiến độ. Nội dung không phải học thử chỉ được API học tập trả về cho chủ đăng ký `ACTIVE`; catalog chỉ trả metadata và video học thử. URL video/tài liệu công khai vẫn có thể được chia sẻ ngoài hệ thống; để bảo vệ nội dung tại nơi lưu trữ cần tích hợp URL có thời hạn hoặc video host hỗ trợ phân quyền.

## Kiểm tra và xem thử

```powershell
# backend
npm test
# frontend
npm run build
# backend, sau khi đã build frontend
node scripts/preview-student.js
```

Preview tại `http://127.0.0.1:5180/__preview` dùng MongoDB replica set tạm, dữ liệu mẫu và phiên demo riêng. Không kết nối Atlas. Dừng bằng Ctrl+C. Preview chỉ hỗ trợ kiểm tra giao diện, không mô phỏng chuyển khoản ngân hàng thật.
