-- 014: Luồng "giữ hàng" — ca KHÔNG tự hẹn giờ cho đến khi KTV chủ động đưa vào hàng.
-- Bệnh viện ưu tiên HOÀN TOÀN Ngoại trú + Cấp cứu ở hàng thời gian; Nội trú chụp
-- buổi chiều → nằm hàng giữ riêng cho đến khi KTV sắp xếp vào hàng (như hiện tại).
--
-- Ca giữ: room_id VẪN tra sẵn theo mã HH (biết phòng đích) nhưng KHÔNG cấp
-- queue_pos/stt_ngay và KHÔNG tự tính gio_hen. KTV bấm "Đưa vào hàng" → cấp số +
-- bỏ cờ giữ + tính lại giờ như mọi ca thường ([[orderRepo]] vaoHang).

ALTER TABLE orders ADD COLUMN IF NOT EXISTS giu_hang BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS orders_giu_hang ON orders(giu_hang) WHERE giu_hang = TRUE;

-- Luật phân luồng: dùng chung engine DSL khopLuat + whitelist field với nhóm ưu tiên
-- ([[adapter]]). Ca khớp → giữ hàng. Mặc định: Nội trú, TRỪ ca Cấp cứu (phòng CĐ chứa
-- "cấp cứu") vẫn lọt vào hàng thời gian ngay. Admin đổi quy ước không phải sửa code.
INSERT INTO app_settings (khoa, gia_tri)
VALUES ('luat_giu_hang', 'loai_dieu_tri ~ "noi tru" && phong !~ "cap cuu"')
ON CONFLICT (khoa) DO NOTHING;
