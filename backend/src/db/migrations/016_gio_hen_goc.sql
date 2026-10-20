-- 016: Giờ hẹn GỐC + độ chậm — nền cho "chậm bao nhiêu phút so với lịch ban đầu"
-- và theo dõi xu hướng (tầng sâu). orders.gio_hen bị tính lại/ghi đè mỗi mutation
-- ([[orderRepo]] capNhatGioHenPhong) nên KHÔNG dùng được làm mốc gốc. Ba cột mới:
--
--  • gio_hen_goc        — ĐÓNG BĂNG một lần = giờ hẹn lần đầu được gán cho ca (lời hứa
--                         với bệnh nhân). capNhatGioHenPhong chỉ ghi khi đang NULL
--                         (COALESCE). KTV sửa giờ tay → reset theo giờ mới. Rời hàng
--                         (nội trú rút về giữ) → về NULL để lần vào hàng sau lấy mốc mới.
--  • cham_phut_khi_goi  — SNAPSHOT độ trễ bệnh nhân THỰC SỰ gánh, chốt đúng lúc ca được
--                         "Gọi" (status → dang_goi) = round((lúc gọi − gio_hen_goc)/phút),
--                         kẹp sàn 0. Ca lịch sử đọc từ đây; ca đang chờ tính sống ở app.
--  • tre_da_bao_phut    — mốc chống trùng cho thông báo lùi giờ: đã báo bệnh nhân ở mức
--                         chậm bao nhiêu phút (0 = chưa báo). Xem app_settings 017.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS gio_hen_goc       TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cham_phut_khi_goi INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tre_da_bao_phut   INTEGER NOT NULL DEFAULT 0;

-- Điền bù cho hàng chờ hiện có: lấy giờ hẹn đang có làm mốc gốc (xấp xỉ, tốt hơn NULL).
UPDATE orders SET gio_hen_goc = gio_hen
 WHERE gio_hen_goc IS NULL AND gio_hen IS NOT NULL AND status IN ('cho','dang_goi');
