# HV-RFM — Hệ thống điều phối hàng chờ chụp MRI

**HV-RFM** (*Radiology Flow Management*) điều phối hàng chờ chụp cộng hưởng từ (MRI) trong bệnh viện. Hệ thống nhận chỉ định từ HIS, xếp ca vào đúng phòng chụp theo luật ưu tiên, tính giờ hẹn dự kiến và hiển thị realtime cho kỹ thuật viên, bác sĩ chỉ định, màn hình điều hành và màn hình sảnh chờ.

Dự án được phát triển và vận hành thực tế tại Khoa Chẩn đoán hình ảnh – Bệnh viện Đa khoa Hùng Vương.

## Tính năng chính

- **Nhận chỉ định từ HIS**: tự kéo (pull) theo chu kỳ hoặc nhận đẩy (push) qua `POST /api/his/orders` bằng API key. Ánh xạ tên trường cấu hình trong DB, không cần sửa code. Có cơ chế chống hủy nhầm khi API HIS trả dữ liệu chập chờn.
- **Xếp hàng theo phòng**: phân phòng theo mã dịch vụ (mã HH), STT theo phòng/ngày, nhóm ưu tiên khai báo bằng luật (`field op value && ...`): cấp cứu, người cao tuổi…
- **Giờ hẹn dự kiến**: tính lại sau mỗi thao tác, neo theo ca đang chụp. Hỗ trợ giờ sửa tay, đệm cho ca cấp cứu chen hàng và báo lùi giờ.
- **Luồng nội trú**: ca nội trú vào *hàng giữ*, KTV chủ động đưa vào hàng chờ.
- **Đặt lịch hẹn trước**: tạo phiếu hẹn trước, sau đó ghép với chỉ định HIS khi chỉ định đổ về.
- **Màn hình theo vai trò**: KTV điều phối (gọi / quá lượt / gọi lại), bác sĩ theo dõi ("Ca của tôi"), màn hình tổng, màn hình sảnh. Giao diện tối ưu cho cả điện thoại.
- **Quản trị**: người dùng và phân quyền (thêm hàng loạt từ API nhân sự), cấu hình phòng / ưu tiên / tích hợp HIS, thống kê có xuất CSV, nhật ký hệ thống (audit log).
- **Đăng nhập**: qua hệ tài khoản nhân sự của bệnh viện (HRM), kèm lối vào dự phòng bằng tài khoản nội bộ (bcrypt). App tự cấp phiên JWT.

## Công nghệ

| Thành phần | Công nghệ |
|---|---|
| Backend | Node.js ≥ 20, Express 5, TypeScript, PostgreSQL 16 (`pg`), JWT, SSE cho realtime |
| Frontend | Vue 3, Vite, Pinia, Vue Router, Tailwind CSS 4 |
| Kiểm thử | Vitest |
| Vận hành | Nginx (reverse proxy + TLS), systemd hoặc pm2 |

## Cấu trúc thư mục

```
backend/    API Express: auth, hàng đợi, tích hợp HIS, ước tính giờ, migration SQL
frontend/   SPA Vue 3 (các màn KTV, bác sĩ, quản trị, màn hình tổng/sảnh)
deploy/     Cấu hình triển khai: nginx, systemd, mẫu .env production, script deploy
docs/       Tài liệu thiết kế, hướng dẫn dựng DB, yêu cầu tích hợp HIS
```

## Chạy thử ở máy dev

Cần Node.js ≥ 20 và Docker (hoặc một Postgres 16 sẵn có, xem [docs/huong-dan-dung-db.md](docs/huong-dan-dung-db.md)).

```bash
# 1. Database (Postgres 16 ở cổng 5433)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env          # sửa JWT_SECRET; đặt HIS_AUTH_ENABLED=false nếu không có HRM
npm install
npm run migrate && npm run seed
npm run dev                   # http://localhost:3003

# 3. Frontend (terminal khác)
cd frontend
npm install
npm run dev                   # http://localhost:5173 (proxy /api → 3003)
```

Đăng nhập bằng tài khoản dự phòng **admin / admin123** do seed tạo. **Đổi hoặc khóa tài khoản này trước khi dùng thật.**

Chạy test backend:

```bash
cd backend && npm test
```

## Triển khai

Xem [deploy/README.md](deploy/README.md): build, dựng DB, chạy dịch vụ, Nginx + HTTPS và bàn giao endpoint HIS cho IT.
Script `deploy/deploy.sh` deploy từ máy dev qua SSH. Nó cần biến `MRI_HOST=user@host`, hoặc file `deploy/deploy.local.env` (không commit).

## Tích hợp với hệ thống của bạn

Dự án được viết cho hạ tầng của một bệnh viện cụ thể. Khi áp dụng nơi khác, bạn cần chỉnh:

- **Xác thực**: `HIS_AUTH_URL` trỏ tới API đăng nhập nhân sự của bạn (xem [backend/src/services/hisAuth.ts](backend/src/services/hisAuth.ts)), hoặc chỉ dùng tài khoản nội bộ.
- **Chỉ định HIS**: endpoint kéo (`HIS_PULL_URL`), ánh xạ trường (`app_settings.his_anh_xa`) và danh mục mã dịch vụ MRI (migration `004`).
- **Phòng chụp**: migration `018` đặt tên phòng và **số liên hệ mẫu**. Cập nhật số thật bằng `UPDATE rooms SET lien_he = ...`.
- **Nhận diện**: logo ở `frontend/public/` và tên đơn vị trong các file `AppHeader.vue`, `LoginView.vue`, `ManHinhSanhView.vue`.

## Bảo mật

- Mọi bí mật (DB, `JWT_SECRET`, `HIS_PUSH_API_KEY`, tài khoản dịch vụ HRM) chỉ nằm trong `.env`, không commit. Ở production, backend dừng ngay khi thiếu biến bắt buộc.
- Repo **không chứa dữ liệu bệnh nhân**. Dữ liệu trong test và mock đều là dữ liệu giả.
- Phát hiện lỗ hổng bảo mật: vui lòng báo riêng cho tác giả, đừng mở issue công khai.

## Giấy phép

Copyright © 2026 Nguyễn Thành Lâm.

Phát hành theo giấy phép **GNU Affero General Public License v3.0** ([LICENSE](LICENSE)). Bạn được dùng, sửa đổi và phân phối lại. Nếu cung cấp bản đã sửa đổi cho người khác dùng qua mạng (web), bạn phải công bố mã nguồn của bản đó theo cùng giấy phép.

---

Phát triển bởi **Nguyễn Thành Lâm**, Bệnh viện Đa khoa Hùng Vương.
