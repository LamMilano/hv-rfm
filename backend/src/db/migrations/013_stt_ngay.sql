-- 013: STT tiếp nhận theo NGÀY, RIÊNG từng phòng (reset mỗi ngày, giờ VN).
-- Trước đây STT hiển thị = orders.id (toàn cục, không reset). Tách thành cột riêng
-- stt_ngay: gán lúc tiếp nhận = số kế tiếp của phòng đó trong ngày. Ca chưa xếp
-- phòng (room_id NULL) để NULL → giao diện hiện "—".

ALTER TABLE orders ADD COLUMN IF NOT EXISTS stt_ngay INTEGER;

CREATE INDEX IF NOT EXISTS orders_room_stt ON orders(room_id, stt_ngay);

-- Backfill cho dữ liệu cũ: đánh số theo (phòng, ngày tạo giờ VN), thứ tự tiếp nhận.
UPDATE orders o
SET stt_ngay = t.rn
FROM (
  SELECT id,
         row_number() OVER (
           PARTITION BY room_id, (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
           ORDER BY created_at, id
         ) AS rn
  FROM orders
  WHERE room_id IS NOT NULL
) t
WHERE o.id = t.id AND o.stt_ngay IS NULL;
