# Kế hoạch triển khai: Hệ thống hàng đợi MRI

- **Ngày:** 2026-10-12
- **Thiết kế nguồn:** [2026-10-12-mri-waiting-list-design.md](./2026-10-12-mri-waiting-list-design.md) + canvas UI (6 artboard)
- **Nguyên tắc:** mô phỏng "họ công nghệ" HV-MRM. TDD cho mọi logic thuần. Lát cắt dọc chạy được sớm.

## Stack (khóa cứng theo HV-MRM)

| Phần | Công nghệ |
|---|---|
| Backend | Express 5 + TypeScript (commonjs, `tsx` dev), `pg` Pool, JWT, bcryptjs |
| DB | PostgreSQL — migrations SQL đánh số + bảng `schema_migrations` |
| Test | Vitest (`*.test.ts` cạnh file logic) |
| Frontend | Vue 3 + Vite + Tailwind + Pinia + Vue Router |
| Real-time | SSE, bọc sau interface `publisher` |
| Cấu hình | `config.ts` fail-fast; mọi secret trong `.env` |
| Triển khai | sau Nginx (tắt buffering cho SSE) |

Tái dùng từ HV-MRM: `hisAuth.ts` (xác thực apihrm — đúng §8), mẫu `pool.ts`, `config.ts`, `migrate.ts`, `zaloNotify.ts`.

## Cấu trúc thư mục

```
backend/   src/{config.ts, server.ts, db/{pool,migrate,seed, migrations/}, services/, routes/, middleware/, realtime/, his/, uoctinh/, thongbao/}
frontend/  src/{views/, components/, stores/, router/, api/}
```

---

## Các lát cắt (theo thứ tự, mỗi lát chạy & test được)

### Lát 0 — Khung dự án
- [ ] `git init`, `.gitignore`, README
- [ ] Backend scaffold: package.json (deps như HV-MRM), tsconfig, `config.ts` (DATABASE_URL, JWT_SECRET, HIS_AUTH_URL, SMS/Zalo), `pool.ts`, `server.ts` + `/api/health`, vitest
- [ ] Frontend scaffold: Vite + Vue 3 + Tailwind + Pinia + Router, token màu #1366b1, font Be Vietnam Pro
- **Nghiệm thu:** `npm run dev` hai phía chạy; `/api/health` trả ok; test rỗng xanh.

### Lát 1 — Schema + migrate + seed
- [ ] `001_init.sql`: 7 bảng (`orders, rooms, hh_routing, priority_types, change_log, notifications, users`) theo §5, enum trạng thái, index (`ma_his` unique, `room_id+queue_pos`)
- [ ] `migrate.ts` + `seed.ts`: 2 phòng, vài `hh_routing`, nhóm ưu tiên (≥75t), 1 admin nội bộ bcrypt
- **Nghiệm thu:** migrate sạch trên DB rỗng; seed xong truy vấn ra 2 phòng.

### Lát 2 — Xác thực & phân quyền (§8)
- [ ] Copy `hisAuth.ts` (+ test) → chuẩn hóa mã NV, `docKetQuaHIS`, phân biệt "sai" vs "không kết nối"
- [ ] `routes/auth.ts`: POST /api/auth/login → tra `users`, rẽ hrm/nội bộ, cấp JWT; middleware `auth` + `role`
- [ ] Lối vào dự phòng nội bộ (admin bcrypt)
- **Nghiệm thu (test):** HRM đúng→vào; từng mã lỗi→đúng câu; HRM 5xx→"không kết nối"; nội bộ bcrypt hoạt động.

### Lát 3 — Tiếp nhận HIS push (§7)
- [ ] `his/adapter.ts` (thuần, test): ánh xạ payload cấu hình được → order
- [ ] POST /api/his/orders: API key riêng, idempotent theo `ma_his`, ánh xạ mã HH→phòng, xếp cuối hàng, gắn nhãn ưu tiên gợi ý
- **Nghiệm thu (test):** push → order `cho` đúng phòng, nhãn ưu tiên đúng điều kiện; push trùng `ma_his` không tạo bản ghi mới.

### Lát 4 — Máy trạng thái + API hàng đợi (§6) — lõi
- [ ] `services/queueLogic.ts` (thuần, test): chuyển trạng thái hợp lệ, tính `queue_pos`, chen/đổi thứ tự, quá lượt/gọi lại, chuyển phòng
- [ ] Routes KTV: gọi/bắt đầu/hoàn thành/quá lượt/gọi lại/chen/sửa giờ/chuyển phòng → ghi `change_log`
- **Nghiệm thu (test):** đủ vòng đời cho→dang_goi→dang_chup→hoan_thanh; nhánh quá lượt→gọi lại; mỗi thao tác ghi log.

### Lát 5 — Ước tính giờ hẹn (§9, interface)
- [ ] interface `UocTinhGioHen` + impl tĩnh: giờ hẹn = now + Σ thời lượng ca trước cùng phòng; KTV ghi đè (`gio_hen_thu_cong`)
- **Nghiệm thu (test):** tính đúng theo thứ tự; ghi đè tay không bị tính đè.

### Lát 6 — Real-time SSE (§13, interface)
- [ ] interface `publisher` + impl SSE: GET /api/stream, sự kiện mang loại + lý do; auto-reconnect
- [ ] Mỗi thay đổi hàng đợi → publish
- **Nghiệm thu:** mở client, thao tác KTV → client nhận sự kiện < 1s.

### Lát 7 — Thông báo SMS/Zalo (§10, interface)
- [ ] interface `GuiTinNhan` + bảng `notifications` hàng chờ + worker
- [ ] Kích hoạt khi đặt `gio_hen` lần đầu (`dat_gio`) / đổi giờ (`doi_gio`)
- **Nghiệm thu (test):** đặt/đổi giờ → sinh notification đúng loại.

### Lát 8 — Frontend các màn hình (§11) — bám UI canvas
- [ ] Web KTV (Main) — vùng đang chụp / hàng chờ kéo-thả / quá lượt / hoàn thành; phím tắt F2–F6
- [ ] Web bác sĩ (ca của tôi, lọc `ma_bs`, dấu hiệu dời giờ)
- [ ] Màn hình tổng (TV) · Màn hình sảnh (TV: chỉ họ tên + STT)
- [ ] Login · Admin cấu hình (§12)
- **Nghiệm thu:** 6 màn hình nối API thật; cập nhật real-time; sảnh không lộ thông tin y khoa.

### Lát 9 — Hoàn thiện triển khai
- [ ] Nginx conf (SSE no-buffering), `.env.example`, hướng dẫn deploy
- **Nghiệm thu:** chạy production-mode local qua Nginx giả lập.

---

## Phụ thuộc ngoài cần chốt sớm (song song, §16)
1. Format payload HIS + cách xác thực endpoint push → adapter cấu hình.
2. Đường mạng HIS → backend nội bộ.
3. Nhà cung cấp SMS/Zalo.

## Để ngỏ tương lai (sau interface)
Ước tính động AI · ghi ngược HIS · BN tự tra QR · SSO ticket HRM.
