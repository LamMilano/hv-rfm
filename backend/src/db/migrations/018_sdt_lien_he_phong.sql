-- Migration 018 — Số liên hệ phòng chụp (tách khỏi tên phòng).
--   • Thêm cột rooms.lien_he (số điện thoại phòng), để tên phòng (ten) giữ gọn
--     cho các chỗ hẹp (nút lọc, dropdown) và hiển thị số liên hệ tách riêng,
--     in nhạt bên cạnh tên phòng (đã highlight) ở các màn theo dõi/điều phối.
--   • Số mẫu — mỗi cơ sở thay bằng số thật của mình (UPDATE rooms SET lien_he = ...).

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS lien_he TEXT;

UPDATE rooms SET ten = 'Phòng 1.5T', lien_he = '0900 000 001' WHERE ma_phong = 'MRI1';
UPDATE rooms SET ten = 'Phòng 0.4T', lien_he = '0900 000 002' WHERE ma_phong = 'MRI2';
