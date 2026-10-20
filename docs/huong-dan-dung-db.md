# Hướng dẫn dựng database — MRI Waiting List

DB riêng `mri_waitlist`, **tách khỏi `mrm_db` của HV-MRM**. Có 2 đường, chọn một.

---

## Đường A — Docker (khuyến nghị, gọn & cô lập)

Cần: Docker Desktop. Từ thư mục gốc dự án:

```bash
docker compose up -d          # dựng Postgres 16 ở cổng 5433
cd backend
npm run migrate               # tạo 7 bảng (migration 001)
npm run seed                  # 2 phòng, 2 nhóm ưu tiên, 4 tuyến mã HH, 1 admin nội bộ
```

`backend/.env` đã trỏ sẵn `DATABASE_URL=postgresql://mri:mri_local_dev@localhost:5433/mri_waitlist` — khớp docker-compose, không phải sửa gì.

Tắt / xóa:
```bash
docker compose down           # tắt (giữ dữ liệu)
docker compose down -v        # tắt + XÓA dữ liệu
```

---

## Đường B — Postgres sẵn có trên máy/máy chủ

1. Tạo database + user riêng (chạy bằng tài khoản quản trị Postgres):
   ```sql
   CREATE USER mri WITH PASSWORD 'doi_mat_khau_manh';
   CREATE DATABASE mri_waitlist OWNER mri;
   ```
2. Sửa `backend/.env` cho khớp host/port/user/mật khẩu/db của bạn:
   ```
   DATABASE_URL=postgresql://mri:doi_mat_khau_manh@localhost:5432/mri_waitlist
   ```
3. Chạy migrate + seed:
   ```bash
   cd backend
   npm run migrate
   npm run seed
   ```

---

## Kiểm tra đã dựng xong

```bash
cd backend
npm run dev
# log phải KHÔNG còn dòng "❌ DATABASE_URL"
```

Nghiệm thu Lát 1: migrate chạy sạch trên DB rỗng, seed xong truy vấn ra 2 phòng.
Tài khoản admin lối vào dự phòng (demo): **admin / admin123** — đổi mật khẩu trước khi lên production.

## Lưu ý production
- Đổi mọi mật khẩu/secret trong `.env` (DB, JWT_SECRET, HIS_PUSH_API_KEY).
- Postgres production nên bật sao lưu định kỳ; dữ liệu bệnh nhân → kiểm soát truy cập chặt.
