-- Migration 008 — hồ sơ nhân viên có SĐT + bỏ "vai trò/phòng" khỏi kíp trực.
-- (1) users.sdt: số điện thoại trong hồ sơ nhân viên, dùng để tự điền vào kíp trực.
-- (2) kip_truc.vai_tro: bỏ đi — kíp chỉ cần tên (chọn từ danh sách KTV) + SĐT.
ALTER TABLE users ADD COLUMN IF NOT EXISTS sdt TEXT;
ALTER TABLE kip_truc DROP COLUMN IF EXISTS vai_tro;
