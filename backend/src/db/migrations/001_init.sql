-- MRI Waiting List — Schema khởi tạo (Migration 001)
-- PostgreSQL. Theo §5 bản thiết kế. 7 bảng.

-- ────────────────────────────────────────────────────────────────────────────
-- rooms — 2 phòng MRI
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
  id         SERIAL  PRIMARY KEY,
  ma_phong   TEXT    UNIQUE NOT NULL,   -- mã phòng (vd 'MRI1', 'MRI2')
  ten        TEXT    NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────────
-- hh_routing — ánh xạ mã HH (mã dịch vụ) → phòng + thời lượng chuẩn
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hh_routing (
  ma_hh           TEXT    PRIMARY KEY,
  room_id         INTEGER NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  thoi_luong_phut INTEGER NOT NULL DEFAULT 20 CHECK (thoi_luong_phut > 0),
  mo_ta           TEXT
);

-- ────────────────────────────────────────────────────────────────────────────
-- priority_types — danh mục nhóm ưu tiên (nhãn gợi ý, không tự sắp xếp)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS priority_types (
  id           SERIAL PRIMARY KEY,
  ma           TEXT   UNIQUE NOT NULL,
  ten          TEXT   NOT NULL,
  quy_tac_goi_y TEXT,            -- mô tả/biểu thức gợi ý từ dữ liệu HIS (vd tuổi ≥ 75)
  active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- ────────────────────────────────────────────────────────────────────────────
-- users — KTV, bác sĩ, admin
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  ma_nv           TEXT,                 -- mã nhân viên (nullable: admin/dùng chung)
  ho_ten          TEXT   NOT NULL,
  role            TEXT   NOT NULL CHECK (role IN ('ktv','bac_si','admin')),
  ma_bs           TEXT,                 -- để lọc "ca của tôi" (bác sĩ chỉ định), nullable
  nguon_xac_thuc  TEXT   NOT NULL DEFAULT 'hrm' CHECK (nguon_xac_thuc IN ('hrm','noi_bo')),
  password_hash   TEXT,                 -- bcrypt, chỉ khi nguon_xac_thuc = 'noi_bo'
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_ma_nv_uniq ON users(ma_nv) WHERE ma_nv IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- orders — mỗi chỉ định MRI = 1 bản ghi
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                 SERIAL PRIMARY KEY,
  ma_his             TEXT   UNIQUE NOT NULL,   -- mã chỉ định HIS (chống trùng/idempotent)
  ma_bn              TEXT,
  ho_ten             TEXT   NOT NULL,
  tuoi               INTEGER,
  sdt                TEXT,
  ma_hh              TEXT,
  room_id            INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  status             TEXT   NOT NULL DEFAULT 'cho'
                     CHECK (status IN ('cho','dang_goi','dang_chup','qua_luot','hoan_thanh','huy')),
  queue_pos          INTEGER,                  -- vị trí trong hàng của phòng (KTV sắp)
  gio_hen            TIMESTAMPTZ,              -- giờ hẹn dự kiến (nullable)
  gio_hen_thu_cong   BOOLEAN NOT NULL DEFAULT FALSE,  -- KTV đã ghi đè giờ hẹn
  priority_type_id   INTEGER REFERENCES priority_types(id) ON DELETE SET NULL,
  priority_confirmed BOOLEAN NOT NULL DEFAULT FALSE,  -- KTV đã duyệt nhãn ưu tiên
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Truy vấn hàng đợi theo phòng + thứ tự là nóng nhất.
CREATE INDEX IF NOT EXISTS orders_room_queue ON orders(room_id, queue_pos);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);

-- ────────────────────────────────────────────────────────────────────────────
-- change_log — nhật ký mọi thay đổi hàng đợi (ai, lúc nào, đổi gì, lý do)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS change_log (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  loai       TEXT NOT NULL,   -- goi/bat_dau/hoan_thanh/qua_luot/goi_lai/doi_thu_tu/doi_gio/chuyen_phong/huy/duyet_uu_tien
  gia_tri_cu  TEXT,
  gia_tri_moi TEXT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ly_do      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS change_log_order ON change_log(order_id, created_at);

-- ────────────────────────────────────────────────────────────────────────────
-- notifications — hàng chờ gửi SMS/Zalo
-- ────────────────────────────────────────────────────────────────────────────
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
