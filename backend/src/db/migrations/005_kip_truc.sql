-- Migration 005 — kíp KTV trực MRI theo ngày (hiển thị tên + SĐT cho bác sĩ biết
-- hôm đó ai làm, liên hệ thế nào). Mỗi dòng = 1 người; sửa kíp = thay toàn bộ dòng
-- của ngày đó. Giữ lịch sử theo ngày (giờ Việt Nam).
CREATE TABLE IF NOT EXISTS kip_truc (
  id         SERIAL PRIMARY KEY,
  ngay       DATE   NOT NULL,              -- ngày trực (giờ VN)
  ho_ten     TEXT   NOT NULL,
  sdt        TEXT,
  vai_tro    TEXT,                         -- vd "KTV chính", "Phụ", phòng phụ trách
  thu_tu     INTEGER NOT NULL DEFAULT 0,   -- thứ tự hiển thị
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS kip_truc_ngay ON kip_truc(ngay);
