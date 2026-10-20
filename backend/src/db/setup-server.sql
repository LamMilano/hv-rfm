-- ════════════════════════════════════════════════════════════════════════════
-- MRI Waiting List — Dựng DB trọn gói chạy thẳng bằng psql (không cần code trên
-- server). Chạy BÊN TRONG database mri_waitlist.
--   = nội dung migration 001_init.sql + seed + đánh dấu schema_migrations.
-- An toàn chạy lại nhiều lần (IF NOT EXISTS / ON CONFLICT).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Bảng theo dõi migration (để sau này `npm run migrate` không chạy lại 001) ──
CREATE TABLE IF NOT EXISTS schema_migrations (
  file       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── rooms ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
  id         SERIAL  PRIMARY KEY,
  ma_phong   TEXT    UNIQUE NOT NULL,
  ten        TEXT    NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── hh_routing ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hh_routing (
  ma_hh           TEXT    PRIMARY KEY,
  room_id         INTEGER NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  thoi_luong_phut INTEGER NOT NULL DEFAULT 20 CHECK (thoi_luong_phut > 0),
  mo_ta           TEXT
);

-- ── priority_types ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS priority_types (
  id           SERIAL PRIMARY KEY,
  ma           TEXT   UNIQUE NOT NULL,
  ten          TEXT   NOT NULL,
  viet_tat     TEXT,                          -- mã viết tắt hiện trên chip cạnh tên (trống → FE tự rút gọn)
  mau          TEXT,                           -- khóa bảng màu: do/cam/vang/xanh/tim/luc (tô chip + nền dòng)
  quy_tac_goi_y TEXT,
  thu_tu       INTEGER NOT NULL DEFAULT 100,  -- nhỏ hơn = ưu tiên hơn khi khớp nhiều luật
  active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── users ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  ma_nv           TEXT,
  ho_ten          TEXT   NOT NULL,
  sdt             TEXT,                       -- SĐT trong hồ sơ nhân viên (tự điền vào kíp trực)
  role            TEXT   NOT NULL CHECK (role IN ('ktv','bac_si','admin')),
  ma_bs           TEXT,
  nguon_xac_thuc  TEXT   NOT NULL DEFAULT 'hrm' CHECK (nguon_xac_thuc IN ('hrm','noi_bo')),
  password_hash   TEXT,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_ma_nv_uniq ON users(ma_nv) WHERE ma_nv IS NOT NULL;

-- ── orders ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                 SERIAL PRIMARY KEY,
  ma_his             TEXT   UNIQUE NOT NULL,
  ma_bn              TEXT,
  ho_ten             TEXT   NOT NULL,
  tuoi               INTEGER,
  sdt                TEXT,
  ma_hh              TEXT,
  room_id            INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  status             TEXT   NOT NULL DEFAULT 'cho'
                     CHECK (status IN ('cho','dang_goi','qua_luot','hoan_thanh','huy')),
  queue_pos          INTEGER,
  gio_hen            TIMESTAMPTZ,
  gio_hen_thu_cong   BOOLEAN NOT NULL DEFAULT FALSE,
  priority_type_id   INTEGER REFERENCES priority_types(id) ON DELETE SET NULL,
  priority_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ma_bs              TEXT,                 -- bác sĩ chỉ định (migration 002)
  ten_dich_vu        TEXT,                 -- tên dịch vụ/loại chụp HIS (migration 002)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Bù cột cho DB tạo từ bản cũ (bảng orders đã tồn tại → CREATE IF NOT EXISTS bỏ qua,
-- không tự thêm cột mới). ALTER ... IF NOT EXISTS an toàn chạy lại.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ma_bs       TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ten_dich_vu TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS nguon       TEXT NOT NULL DEFAULT 'his'
  CHECK (nguon IN ('his','thu_cong'));   -- nguồn tiếp nhận (migration 006)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS thoi_luong_phut INTEGER
  CHECK (thoi_luong_phut IS NULL OR thoi_luong_phut > 0);  -- thời lượng riêng ca nhập tay (migration 007)
CREATE INDEX IF NOT EXISTS orders_room_queue ON orders(room_id, queue_pos);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS orders_ma_bs ON orders(ma_bs) WHERE ma_bs IS NOT NULL;

-- ── change_log ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS change_log (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  loai       TEXT NOT NULL,
  gia_tri_cu  TEXT,
  gia_tri_moi TEXT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ly_do      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS change_log_order ON change_log(order_id, created_at);

-- ── notifications ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  loai       TEXT NOT NULL CHECK (loai IN ('dat_gio','doi_gio')),
  noi_dung   TEXT NOT NULL,
  trang_thai TEXT NOT NULL DEFAULT 'cho' CHECK (trang_thai IN ('cho','da_gui','loi')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS notifications_trang_thai ON notifications(trang_thai) WHERE trang_thai = 'cho';

-- ── kip_truc (migration 005, 008) — kíp KTV trực theo ngày (tên + SĐT) ────────────
CREATE TABLE IF NOT EXISTS kip_truc (
  id         SERIAL PRIMARY KEY,
  ngay       DATE   NOT NULL,
  ho_ten     TEXT   NOT NULL,
  sdt        TEXT,
  thu_tu     INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS kip_truc_ngay ON kip_truc(ngay);

-- ── Đánh dấu migration 001 đã áp dụng ───────────────────────────────────────────
INSERT INTO schema_migrations (file) VALUES ('001_init.sql') ON CONFLICT (file) DO NOTHING;
INSERT INTO schema_migrations (file) VALUES ('002_order_bs_dichvu.sql') ON CONFLICT (file) DO NOTHING;
INSERT INTO schema_migrations (file) VALUES ('003_app_settings.sql') ON CONFLICT (file) DO NOTHING;
INSERT INTO schema_migrations (file) VALUES ('005_kip_truc.sql') ON CONFLICT (file) DO NOTHING;
INSERT INTO schema_migrations (file) VALUES ('006_order_nguon.sql') ON CONFLICT (file) DO NOTHING;
INSERT INTO schema_migrations (file) VALUES ('007_order_thoiluong.sql') ON CONFLICT (file) DO NOTHING;
INSERT INTO schema_migrations (file) VALUES ('008_user_sdt_bo_vaitro_kip.sql') ON CONFLICT (file) DO NOTHING;

-- ── migration 009 — tích hợp KÉO chỉ định MRI từ HIS ────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ten_bs_chi_dinh TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gio_chi_dinh    TIMESTAMPTZ;
INSERT INTO app_settings (khoa, gia_tri) VALUES ('his_pull_chu_ky_giay', '20')
ON CONFLICT (khoa) DO NOTHING;
INSERT INTO schema_migrations (file) VALUES ('009_his_pull_chi_dinh.sql') ON CONFLICT (file) DO NOTHING;

-- ── app_settings (migration 003) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  khoa       TEXT PRIMARY KEY,
  gia_tri    TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO app_settings (khoa, gia_tri) VALUES
  ('mau_dat_gio', 'Kính mời {ho_ten}, số {stt}, dự kiến chụp MRI lúc {gio_hen} tại {phong}.'),
  ('mau_doi_gio', 'Giờ hẹn MRI của {ho_ten} (số {stt}) đổi sang {gio_hen}. {ly_do}'),
  ('jit_tu_tao',  'false')   -- tự tạo tài khoản Bác sĩ khi đăng nhập HIS hợp lệ (admin bật ở Tổng quan)
ON CONFLICT (khoa) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- SEED — dữ liệu nền tối thiểu
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO rooms (ma_phong, ten) VALUES
  ('MRI1', 'Phòng 1.5T'),
  ('MRI2', 'Phòng 0.4T')
ON CONFLICT (ma_phong) DO NOTHING;

INSERT INTO priority_types (ma, ten, viet_tat, mau, quy_tac_goi_y, thu_tu) VALUES
  ('cap_cuu',  'Cấp cứu',      'CC',  'do',  'phong ~ "cap cuu"', 10),
  ('cao_tuoi', 'Ưu tiên ≥75t', '75+', 'cam', 'tuoi >= 75',        20)
ON CONFLICT (ma) DO NOTHING;

-- Danh mục mã HH thật (54 mã từ "DM MRI.xls") — dùng chung file migration 004.
\ir migrations/004_dm_mri_that.sql
INSERT INTO schema_migrations (file) VALUES ('004_dm_mri_that.sql') ON CONFLICT (file) DO NOTHING;

-- Admin nội bộ (lối vào dự phòng). Mật khẩu: admin123 (bcrypt). ĐỔI trước production!
INSERT INTO users (ma_nv, ho_ten, role, nguon_xac_thuc, password_hash)
VALUES ('admin', 'Quản trị hệ thống', 'admin', 'noi_bo',
        '$2b$10$kLgmVxVCHoqlxf5ulc4iY.QJGZ9IPeiVQDqc22X.wRO.R66NkbALC')
ON CONFLICT (ma_nv) WHERE ma_nv IS NOT NULL DO NOTHING;

COMMIT;

-- Kiểm nhanh
SELECT 'rooms' AS bang, count(*) FROM rooms
UNION ALL SELECT 'hh_routing', count(*) FROM hh_routing
UNION ALL SELECT 'priority_types', count(*) FROM priority_types
UNION ALL SELECT 'users', count(*) FROM users;
