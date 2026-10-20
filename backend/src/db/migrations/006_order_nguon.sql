-- Migration 006 — nguồn tiếp nhận ca: 'his' (HIS push) hoặc 'thu_cong' (KTV nhập tay
-- khi mất kết nối HIS). Mặc định 'his' để dữ liệu cũ giữ nguyên ý nghĩa.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS nguon TEXT NOT NULL DEFAULT 'his'
  CHECK (nguon IN ('his','thu_cong'));
