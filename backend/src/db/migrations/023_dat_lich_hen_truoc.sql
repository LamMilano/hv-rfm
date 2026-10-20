-- 023: Đặt lịch hẹn trước + ghép với chỉ định HIS.
-- Phiếu đặt trước là một ca VÀO HÀNG CHỜ NGAY (giống ca nhập tay, tạo trước giờ chụp):
-- nguon='dat_truoc', ma_his tự sinh (tiền tố DT-), gio_hen do KTV điền và ĐÓNG BĂNG
-- (gio_hen_thu_cong=TRUE). Khi HIS đẩy chỉ định thật, hệ thống GỢI Ý ghép (không tự
-- ghép); KTV xác nhận → giữ dòng HIS, chép giờ hẹn từ phiếu, xóa phiếu. Xem [[orderRepo]].

-- Mở rộng nguồn tiếp nhận: thêm 'dat_truoc' bên cạnh 'his' / 'thu_cong'.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_nguon_check;
ALTER TABLE orders ADD CONSTRAINT orders_nguon_check
  CHECK (nguon IN ('his','thu_cong','dat_truoc'));

-- Cờ "Để riêng": KTV đã bỏ qua gợi ý ghép cho phiếu này → không gợi ý nữa, phiếu sống
-- độc lập như ca nhập tay (đóng tay/hủy). Chỉ có ý nghĩa với dòng nguon='dat_truoc'.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ghep_bo_qua BOOLEAN NOT NULL DEFAULT FALSE;
