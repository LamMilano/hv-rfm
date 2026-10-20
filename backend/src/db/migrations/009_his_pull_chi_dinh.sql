-- Migration 009 — tích hợp KÉO (pull) chỉ định MRI từ HIS.
-- HIS chỉ trả TÊN bác sĩ chỉ định (không có mã NV) → lưu làm tên hiển thị.
-- Lưu thêm giờ chỉ định (NgayChiDinh) để truy vết/đối chiếu.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ten_bs_chi_dinh TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gio_chi_dinh    TIMESTAMPTZ;

-- Chu kỳ tự gọi API HIS (giây) — admin chỉnh được ở trang Cấu hình. Mặc định 20s.
INSERT INTO app_settings (khoa, gia_tri) VALUES ('his_pull_chu_ky_giay', '20')
ON CONFLICT (khoa) DO NOTHING;
