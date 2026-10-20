-- Migration 020 — nhãn ưu tiên GỌN: thêm mã viết tắt + màu cho mỗi nhóm.
-- Thay cho cột "Nhãn" tốn chỗ: FE hiển thị chip viết tắt cạnh tên bệnh nhân và tô
-- màu dòng theo nhóm (vd Cấp cứu = nền đỏ). viet_tat trống → FE tự rút gọn từ tên.
-- mau là KHÓA bảng màu cố định ('do','cam','vang','xanh','tim','luc'); FE ánh xạ ra CSS.
ALTER TABLE priority_types ADD COLUMN IF NOT EXISTS viet_tat TEXT;
ALTER TABLE priority_types ADD COLUMN IF NOT EXISTS mau      TEXT;

-- Giá trị mặc định cho 2 nhóm sẵn có (chỉ đặt khi còn trống — không ghi đè admin đã sửa).
UPDATE priority_types SET viet_tat = 'CC',  mau = 'do'  WHERE ma = 'cap_cuu'  AND (viet_tat IS NULL OR viet_tat = '');
UPDATE priority_types SET viet_tat = '75+', mau = 'cam' WHERE ma = 'cao_tuoi' AND (viet_tat IS NULL OR viet_tat = '');
