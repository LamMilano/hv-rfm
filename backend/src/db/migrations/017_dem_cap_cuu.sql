-- 017: Đệm cấp cứu + ngưỡng báo lùi giờ + nhãn nhóm cấp cứu (cấu hình admin).
--
--  • dem_cap_cuu_phut_moi_gio — số phút MỖI GIỜ chừa sẵn cho ca cấp cứu chen ngang.
--      Engine ước tính ([[uoctinh]]) giãn giờ hẹn theo hệ số 60/(60−đệm) để giờ hẹn
--      GỐC đã gói sẵn kỳ vọng cấp cứu → ít vỡ lịch. MẶC ĐỊNH 0 = tắt (không đổi hành vi
--      cũ khi mới deploy); admin bật dần theo số liệu thực tế (trang Thống kê).
--  • nguong_bao_tre_phut — ca chậm vượt ngưỡng này (phút) so với giờ hẹn gốc → xếp một
--      thông báo "lùi giờ" vào hàng notifications. 0 = tắt (mặc định).
--  • nhom_cap_cuu_ma — mã nhóm ưu tiên được coi là "Cấp cứu" (để đếm chen hàng & xu
--      hướng). Mặc định 'cap_cuu'; đổi nếu đặt mã khác ở danh mục nhóm ưu tiên.

INSERT INTO app_settings (khoa, gia_tri) VALUES
  ('dem_cap_cuu_phut_moi_gio', '0'),
  ('nguong_bao_tre_phut',      '0'),
  ('nhom_cap_cuu_ma',          'cap_cuu')
ON CONFLICT (khoa) DO NOTHING;

-- notifications: bổ sung loại 'tre_gio' (thông báo lùi giờ do cấp cứu chen hàng).
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_loai_check;
ALTER TABLE notifications ADD  CONSTRAINT notifications_loai_check
  CHECK (loai IN ('dat_gio','doi_gio','tre_gio'));
