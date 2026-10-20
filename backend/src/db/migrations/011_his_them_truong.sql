-- Migration 011 — lưu ĐẦY ĐỦ thông tin HIS trả về để màn điều phối hiển thị.
-- Trước đây chỉ giữ 10/16 trường; các trường còn lại (giới tính, đối tượng, khoa/phòng
-- chỉ định, loại điều trị, ghi chú, ngày sinh) dồn vào MỘT cột JSONB cho linh hoạt —
-- HIS thêm trường mới không phải migrate lại. Xem [[hisPull]].
ALTER TABLE orders ADD COLUMN IF NOT EXISTS his_meta JSONB;

-- Cấu hình: các cột đưa ra "cột chính" ở màn điều phối (ngoài cột chính luôn hiện là
-- STT + thao tác). Admin chỉnh ở trang Cấu hình → Hiển thị. JSON mảng key (xem COT_HIS).
INSERT INTO app_settings (khoa, gia_tri)
VALUES ('dieu_phoi_cot_chinh', '["ho_ten","tuoi","chi_dinh","gio_hen","trang_thai","nhan"]')
ON CONFLICT (khoa) DO NOTHING;
