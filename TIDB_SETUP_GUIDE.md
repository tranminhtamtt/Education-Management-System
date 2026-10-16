# HƯỚNG DẪN KẾT NỐI TIDB CLOUD SERVERLESS (FREE TIER) CHO EMS

Dự án **Education Management System (EMS)** sử dụng cơ sở dữ liệu MySQL thông qua **Prisma ORM**. Vì **TiDB Cloud Serverless** tương thích hoàn toàn 100% với giao thức MySQL 8.0, bạn không cần cài Docker hay MySQL local mà có thể sử dụng database online miễn phí (5GB vĩnh viễn, không cần thẻ tín dụng).

---

## 1. Các bước tạo Database TiDB Cloud Serverless (Miễn phí)

1. **Đăng ký / Đăng nhập:**
   - Truy cập: [https://tidbcloud.com/](https://tidbcloud.com/)
   - Đăng nhập bằng tài khoản Google hoặc GitHub.

2. **Tạo Cluster:**
   - Nhấn **Create Cluster** (hoặc chọn gói **Serverless**).
   - Chọn Region gần nhất: ví dụ **Singapore (ap-southeast-1)** hoặc **Tokyo (ap-northeast-1)** để độ trễ thấp nhất.
   - Đặt tên Cluster: ví dụ `ems-cluster`.
   - Nhấn **Create**. Quá trình tạo diễn ra chỉ mất khoảng 10-20 giây.

3. **Lấy chuỗi kết nối (Connection String):**
   - Tại trang quản trị Cluster, nhấn nút **Connect** ở góc trên bên phải.
   - Trong mục **Connect with**, chọn **Prisma** (hoặc **General / MySQL CLI**).
   - Hệ thống sẽ hiển thị chuỗi kết nối dạng:
     ```text
     DATABASE_URL="mysql://<prefix>.<username>:<password>@gateway01.<region>.prod.aws.tidbcloud.com:4000/<database_name>?sslaccept=strict"
     ```
   - Nếu mới tạo lần đầu, nhấn **Generate Password** và sao chép mật khẩu được tạo lưu lại cẩn thận.
   - Đảm bảo tham số đuôi là `?sslaccept=strict` để TiDB bảo mật kết nối SSL.

---

## 2. Cấu hình vào Dự án

1. Mở file `backend/.env`
2. Dán chuỗi `DATABASE_URL` bạn vừa sao chép từ TiDB Cloud vào:
   ```env
   DATABASE_URL="mysql://<username>:<password>@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/ems_db?sslaccept=strict"
   ```

---

## 3. Khởi tạo Bảng & Nạp Dữ liệu Mẫu (Seed Data)

Mở terminal tại thư mục `backend`:

```bash
cd backend

# 1. Cài đặt các thư viện cần thiết
npm install

# 2. Sinh mã Prisma Client
npm run prisma:generate

# 3. Đồng bộ 14 bảng CSDL lên TiDB Cloud Serverless
npm run prisma:push

# 4. Nạp dữ liệu mẫu khởi tạo (1 Admin, 3 Giảng viên, 10 Sinh viên, 6 Môn học, 4 Lớp, TKB, Bảng điểm)
npm run prisma:seed
```

> **Lưu ý:** Với TiDB Cloud Serverless, khuyến nghị sử dụng lệnh `npm run prisma:push` (`prisma db push`) thay vì `prisma migrate dev` vì TiDB Serverless là kiến trúc phân tán đám mây tối ưu tốt nhất cho cơ chế push schema trực tiếp.

---

## 4. Tài khoản Đăng nhập Mẫu sau khi Seed

Mật khẩu mặc định cho tất cả tài khoản mẫu là: `123456`

| Vai trò (Role) | Mã người dùng | Email | Mật khẩu |
| :--- | :--- | :--- | :--- |
| **Quản trị viên (Admin)** | `ADM001` | `admin@fpt.edu.vn` | `123456` |
| **Giảng viên (Teacher)** | `GV001` | `thaynam@fpt.edu.vn` | `123456` |
| **Giảng viên (Teacher)** | `GV002` | `colinh@fpt.edu.vn` | `123456` |
| **Sinh viên (Student)** | `HE170001` | `namnvhe170001@fpt.edu.vn` | `123456` |
| **Sinh viên (Student)** | `HE170002` | `trangtthe170002@fpt.edu.vn` | `123456` |

---

## 5. Khởi chạy Ứng dụng

- **Khởi chạy Backend:**
  ```bash
  cd backend
  npm run dev
  # Server chạy tại: http://localhost:5000
  ```

- **Khởi chạy Frontend:**
  ```bash
  cd frontend
  npm install
  npm run dev
  # Web chạy tại: http://localhost:5173
  ```
