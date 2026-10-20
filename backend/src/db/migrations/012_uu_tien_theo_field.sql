-- Migration 012 — bộ luật nhóm ưu tiên TỔNG QUÁT (theo nhiều trường HIS, không chỉ tuổi).
-- quy_tac_goi_y giờ là biểu thức "field op value" nối bằng &&; bộ so khớp ở [[adapter]].
-- Thêm thu_tu để quyết định nhóm nào thắng khi một ca khớp nhiều luật (nhỏ hơn = ưu tiên hơn).
ALTER TABLE priority_types ADD COLUMN IF NOT EXISTS thu_tu INTEGER NOT NULL DEFAULT 100;

-- Cấp cứu đứng trước Cao tuổi; đặt luật thật theo Phòng chỉ định (khớp chứa "cap cuu",
-- bỏ dấu → trùng "PK TT cấp cứu 115"). Trước đây chỉ là chữ mô tả, không khớp gì.
UPDATE priority_types SET thu_tu = 10, quy_tac_goi_y = 'phong ~ "cap cuu"' WHERE ma = 'cap_cuu';
UPDATE priority_types SET thu_tu = 20 WHERE ma = 'cao_tuoi';
