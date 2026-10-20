-- Migration 021 — Chống hủy nhầm ca HIS do danh sách kéo chập chờn.
--   Thực tế: API /api/CanLamSang/mri trả danh sách KHÔNG ổn định — cùng khoảng ngày,
--   gọi cách nhau vài giây ra tập khác nhau (ca xuất hiện/biến mất tạm thời). Logic đối
--   soát cũ hủy ca ngay sau MỘT vòng vắng mặt → ca có chỉ định thật bị đóng nhầm, và do
--   INSERT ... ON CONFLICT DO NOTHING nên không hồi sinh được khi HIS trả lại.
--
--   Khắc phục:
--   • his_last_seen: mốc lần cuối HIS còn trả ca này về. Poller cập nhật mỗi vòng cho mọi
--     ca còn hiệu lực; chèn mới cũng đặt = NOW(). Đối soát CHỈ hủy ca vắng mặt LIÊN TỤC
--     quá his_huy_grace_giay (mặc định 90s ≈ vài vòng), tránh hủy do thiếu thoáng qua.
--   • his_huy_grace_giay: ngưỡng ân hạn (giây) trước khi coi là HIS đã hủy chỉ định.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS his_last_seen TIMESTAMPTZ;

-- Ca HIS đang hoạt động hiện tại coi như "vừa thấy" để không bị hủy oan ngay sau khi lên.
UPDATE orders SET his_last_seen = NOW()
 WHERE nguon = 'his' AND status IN ('cho','qua_luot','dang_goi') AND his_last_seen IS NULL;

INSERT INTO app_settings (khoa, gia_tri) VALUES
  ('his_huy_grace_giay', '90')
ON CONFLICT (khoa) DO NOTHING;
