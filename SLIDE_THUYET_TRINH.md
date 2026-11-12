# Slide thuyết trình EMS — 10 slide (marketing nhẹ + luồng nghiệp vụ chính)

**Cách dùng:** mỗi slide là một khối chữ — bấm copy rồi dán vào slide. Dòng đầu là **tiêu đề**, dòng thứ hai là **câu dẫn**. Mục "Lời nói" dán vào phần Notes. Tổng thời lượng khoảng **12–15 phút**.

> [!NOTE]
> Nội dung khớp với hệ thống hiện tại (dữ liệu trên MongoDB Atlas: 25 môn FPT theo kỳ + 5 chứng chỉ, 64 khóa học, 13 giảng viên; 50/50 bài kiểm thử backend đạt). Hai điểm cần nói thật nếu bị hỏi: **video bài giảng mẫu chưa gắn link thật**, và **thanh toán trong demo là mô phỏng webhook**, chưa chạy với giao dịch ngân hàng thật.

## Phân công 5 người (mỗi người 2 slide)

| Người | Vai trò code | Slide |
| :--- | :--- | :---: |
| Người 1 | Quản trị hệ thống | 1, 2 |
| Người 2 | Giáo vụ | 3, 4 |
| Người 3 | Kế toán | 5, 6 |
| Người 4 | Giảng viên | 7, 8 |
| Người 5 | Học viên | 9, 10 |

> Thứ tự slide đã sắp để mỗi người nói một khối liền nhau. Luồng học viên (slide 9) đặt sau luồng giảng viên để kết bài bằng trải nghiệm học viên.

---

## Slide 1 — Bìa · 👤 Người 1

```text
EMS – TRUNG TÂM KHÓA HỌC TRỰC TUYẾN
Học đúng môn. Đúng thầy. Đóng tiền trong 5 giây.

Nền tảng quản lý & bán khóa học cho trung tâm đào tạo
Ôn luyện môn chuyên ngành FPT • Luyện thi CCNA, IELTS, TOEIC, AWS, JLPT

Nhóm thực hiện: ....................
Giảng viên hướng dẫn: ....................
```

**Lời nói:** "Một sinh viên FPT sắp thi PRF192, một bạn khác cần IELTS 6.5 để ra trường. Cả hai đều cần một nơi tìm đúng khóa, đúng thầy và học ngay. Đó là EMS."

---

## Slide 2 — Vấn đề & Giải pháp · 👤 Người 1

```text
VẤN ĐỀ & GIẢI PHÁP
Trung tâm nhỏ đang mất thời gian vào việc máy có thể làm

VẤN ĐỀ
• Dò sao kê ngân hàng để biết ai đã đóng tiền
• Xếp lịch bằng Excel → trùng giờ giảng viên
• Học viên hỏi bài qua Zalo, không biết hỏi ai
• Không theo dõi được học viên học tới đâu

GIẢI PHÁP EMS – một nền tảng duy nhất
✅ Bán khóa học theo môn / chứng chỉ, 2 hình thức Video & Live
✅ Thanh toán VietQR, SePay xác nhận tự động, mở khóa ngay
✅ Xếp lịch tự chặn trùng giảng viên
✅ Tiến độ học, điểm danh, bài tập, hỏi đáp đúng giảng viên
```

**Lời nói:** "EMS gom Excel, Zalo, app ngân hàng và Google Form vào một chỗ."

---

## Slide 3 — Mô hình sản phẩm · 👤 Người 2

```text
MÔ HÌNH SẢN PHẨM
Một môn học – nhiều lựa chọn khóa học

MÔN / CHỨNG CHỈ  →  NHIỀU KHÓA HỌC  →  NHIỀU LỚP
Ví dụ PRF192:
• Khóa video quay sẵn – 620.000 đ
• Lớp Live ôn tập & luyện đề – 2 lớp, thầy Nam / thầy Khải
• Lớp kèm nhóm nhỏ tối đa 10 học viên

2 HÌNH THỨC HỌC
🎥 Video quay sẵn: mua xong học ngay, thanh tiến độ %
👨‍🏫 Live online: học theo lịch qua Google Meet, có giảng viên kèm

DANH MỤC
• 25 môn chuyên ngành FPT, giữ đúng Kỳ 1 → Kỳ 9
• 5 chứng chỉ: CCNA, IELTS, TOEIC, AWS, JLPT N3
```

**Gợi ý hình:** sơ đồ 3 tầng Môn → Khóa → Lớp.

---

## Slide 4 — 5 vai trò & giá trị · 👤 Người 2

```text
AI DÙNG EMS – VÀ ĐƯỢC GÌ?

👔 Quản trị: nắm doanh thu, học viên, khóa học trên một dashboard
🗂️ Giáo vụ: mở khóa, mở lớp, xếp lịch – hệ thống tự chặn trùng giảng viên
💰 Kế toán: tiền vào là biết, không đối soát tay, mọi thao tác có nhật ký
👨‍🏫 Giảng viên: lịch dạy, điểm danh, chấm bài, trả lời câu hỏi đúng lớp mình
🎓 Học viên: tìm khóa, quét QR, học ngay, biết mình đang ở đâu

Dữ liệu demo hiện có:
13 giảng viên • 64 khóa học • 51 lớp Live • 180 bài giảng
```

---

## Slide 5 — Luồng 1: Mua khóa học & thanh toán tự động · 👤 Người 3

```text
LUỒNG 1 – MUA KHÓA HỌC & THANH TOÁN TỰ ĐỘNG
Từ "muốn học" đến "vào học" không cần ai duyệt

1. Học viên chọn khóa (Live thì chọn lớp còn chỗ, không trùng lịch)
2. Hệ thống tạo đăng ký "Chờ thanh toán" + hóa đơn
3. Hiện mã VietQR đúng số tiền, nội dung là mã đơn duy nhất
4. Học viên quét QR, chuyển khoản
5. SePay gửi Webhook → hệ thống xác thực khóa bảo mật
6. Hóa đơn "Đã thanh toán" → phiếu thu → MỞ KHÓA KHÓA HỌC

✔ Chuyển thiếu → "Thanh toán một phần", khóa học chưa mở
✔ Webhook gửi trùng → không cộng tiền 2 lần
✔ Cửa sổ QR tự cập nhật kết quả sau khoảng 5 giây
```

**Gợi ý hình:** sơ đồ tuần tự Học viên → EMS → Ngân hàng → SePay → EMS.

---

## Slide 6 — Luồng 2: Kế toán & đối soát · 👤 Người 3

```text
LUỒNG 2 – KẾ TOÁN & ĐỐI SOÁT
Minh bạch từng đồng, không sửa tay

• Công nợ: lọc theo học viên, khóa học, trạng thái, quá hạn
• Giao dịch ngân hàng: chỉ xem, không ai sửa / xóa được
• Đối soát lại với dữ liệu SePay theo giao dịch hoặc khoảng ngày
• Tự phát hiện sai lệch: chuyển thiếu, chuyển thừa, sai nội dung
• Khôi phục giao dịch khi webhook bị nhỡ
• Nhắc thanh toán, báo cáo doanh thu theo tháng / theo khóa
• Mọi thao tác đều ghi nhật ký kiểm toán

Kế toán KHÔNG thể tự đánh dấu "đã trả" – tiền phải đến từ ngân hàng
```

---

## Slide 7 — Luồng 3: Tổ chức lớp & giảng dạy · 👤 Người 4

```text
LUỒNG 3 – TỔ CHỨC LỚP & GIẢNG DẠY
Giảng viên tập trung dạy, hệ thống lo phần còn lại

1. Giáo vụ mở lớp Live, gán giảng viên, link Google Meet
2. Xếp lịch theo Thứ – Ca: trùng giảng viên / phòng → bị chặn ngay
3. Giảng viên xem lịch dạy tuần, bấm vào phòng học online
4. Điểm danh từng buổi: Có mặt / Đi muộn / Vắng
5. Giao bài tập → học viên nộp link → chấm điểm + nhận xét

Trung tâm không xét điểm tổng kết / cấm thi:
điểm bài tập và nhận xét để học viên biết mình tiến bộ đến đâu
```

---

## Slide 8 — Luồng 4: Hỏi đáp đúng giảng viên · 👤 Người 4

```text
LUỒNG 4 – HỎI ĐÁP VỚI GIẢNG VIÊN
Hỏi đúng người dạy mình – trả lời có trách nhiệm

1. Học viên chọn khóa mình ĐÃ thanh toán
2. Hệ thống tự hiện: "Gửi tới: ThS. Nguyễn Hoài Nam"
   (lớp Live → giảng viên lớp; khóa video → giảng viên phụ trách)
3. Giảng viên nhận thông báo, trả lời ngay trên hệ thống
4. Học viên nhận thông báo khi có phản hồi

✔ Khóa chưa thanh toán → chưa được hỏi
✔ Giảng viên khác không xem / không trả lời được câu hỏi
✔ Độ tin cậy: 50/50 bài kiểm thử backend đạt
   (thanh toán, phân quyền, lịch, hỏi đáp, tiến độ)
```

---

## Slide 9 — Luồng 5: Trải nghiệm học viên & Demo · 👤 Người 5

```text
LUỒNG 5 – HÀNH TRÌNH HỌC VIÊN
Đăng ký 1 phút – học ngay – biết rõ mình ở đâu

🔍 KHÁM PHÁ: 2 tab Môn FPT (gom theo Kỳ 1–9) / Chứng chỉ
   → bấm môn → xem các khóa Video & Live, giảng viên, giá
💳 MUA: chọn khóa / lớp → quét VietQR → tự mở khóa
📺 HỌC VIDEO: xem bài, bấm "Hoàn thành" → thanh tiến độ tăng
👨‍🏫 HỌC LIVE: lịch học tuần, nút "Vào lớp", "Đã tham gia 4/4 buổi"
📝 BÀI TẬP: nộp link, xem điểm & nhận xét
💬 HỎI ĐÁP: hỏi giảng viên đang dạy mình

DEMO: tài khoản bachnvhe170009@fpt.edu.vn / 123456
```

**Lời nói (demo):** Khám phá → mở PRF192 → xem 3 khóa → Khóa học của tôi → Chuyên cần → Hỏi đáp. Phần thanh toán gửi webhook mô phỏng bằng Postman.

---

## Slide 10 — Kết quả, lộ trình & cảm ơn · 👤 Người 5

```text
KẾT QUẢ & LỘ TRÌNH

ĐÃ ĐẠT ĐƯỢC
✅ Bán khóa theo Môn / Chứng chỉ, 2 hình thức Video & Live
✅ Thanh toán VietQR xác nhận tự động, đối soát, xử lý sai lệch
✅ Xếp lịch chống trùng, điểm danh, bài tập, hỏi đáp đúng giảng viên
✅ Dữ liệu thật trên MongoDB Atlas, 50/50 bài kiểm thử đạt

TIẾP THEO
🚀 Gắn video bài giảng thật, chứng nhận hoàn thành khóa
🚀 Kết nối ngân hàng thật qua SePay
🔭 Ứng dụng di động, gợi ý khóa học theo kỳ của sinh viên

EMS – Học đúng môn. Đúng thầy. Đóng tiền trong 5 giây.
CẢM ƠN THẦY CÔ VÀ CÁC BẠN! – Hỏi & Đáp
```

## Câu chuyển giao giữa các người

- **Người 1 → 2:** "Vậy EMS bán những gì, và tổ chức ra sao? Mời bạn [tên]."
- **Người 2 → 3:** "Học viên đã chọn được khóa – bước tiếp theo là đóng tiền. Mời bạn [tên]."
- **Người 3 → 4:** "Tiền đã về, lớp học bắt đầu. Mời bạn [tên]."
- **Người 4 → 5:** "Cuối cùng, hãy xem tất cả những điều đó dưới góc nhìn học viên. Mời bạn [tên]."
