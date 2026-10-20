-- Migration 007 — thời lượng riêng cho ca (chủ yếu dùng cho ca nhập tay, khi không
-- có mã HH để tra thời lượng chuẩn trong hh_routing). NULL → dùng thời lượng theo
-- hh_routing, nếu vẫn không có thì mặc định 20 phút ở tầng ước tính.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS thoi_luong_phut INTEGER
  CHECK (thoi_luong_phut IS NULL OR thoi_luong_phut > 0);
