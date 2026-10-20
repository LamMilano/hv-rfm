-- Bỏ trạng thái ca "đang chụp" do KTV đặt: trạng thái ca chụp nay lấy theo HIS
-- (ca HIS tự đóng = "Đã chụp" khi HIS báo TrangThai 2/3/4). KTV chỉ còn điều phối
-- hàng chờ (Gọi số / Quá lượt / Gọi lại). Các ca đang ở 'dang_chup' (nếu còn) chuyển
-- về 'dang_goi' để không bị kẹt ngoài vòng đời mới.
--
-- Giữ nguyên ràng buộc CHECK cũ (vẫn cho phép 'dang_chup') để an toàn với dữ liệu cũ;
-- ứng dụng đơn giản là KHÔNG ghi giá trị này nữa. Bản dựng mới (setup-server.sql) đã
-- siết CHECK về tập trạng thái mới.
UPDATE orders SET status = 'dang_goi', updated_at = NOW() WHERE status = 'dang_chup';
