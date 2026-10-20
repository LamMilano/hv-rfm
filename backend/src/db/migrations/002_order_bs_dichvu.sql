-- Migration 002 — bổ sung 2 cột cho orders:
--   ma_bs       : bác sĩ chỉ định (HIS gửi) → lọc "ca của tôi" cho bác sĩ.
--   ten_dich_vu : tên dịch vụ/loại chụp HIS gửi → hiển thị (ưu tiên hơn mô tả tuyến).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ma_bs       TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ten_dich_vu TEXT;

-- Lọc "ca của tôi" theo bác sĩ chỉ định.
CREATE INDEX IF NOT EXISTS orders_ma_bs ON orders(ma_bs) WHERE ma_bs IS NOT NULL;
