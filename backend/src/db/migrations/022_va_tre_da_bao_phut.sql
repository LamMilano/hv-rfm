-- 022: VÁ cột orders.tre_da_bao_phut — khôi phục DEFAULT 0 + NOT NULL cho DB production.
--
-- Triệu chứng: HIS kéo thành công (nhan: 27) nhưng chèn ca mới lỗi "null value in column
-- tre_da_bao_phut violates not-null constraint" → ca không vào hàng chờ (loi: 1 mỗi vòng).
-- Nguyên nhân: trên DB thật, cột tre_da_bao_phut là NOT NULL nhưng MẤT giá trị DEFAULT 0
-- (migration 016 có "ADD COLUMN IF NOT EXISTS ... DEFAULT 0" nhưng nếu cột đã tồn tại sẵn
-- thì ADD bị bỏ qua, default không được gán). INSERT ở chenOrder lại không liệt kê cột này
-- → Postgres định dùng default → không có → NULL → vi phạm NOT NULL.
--
-- Vá idempotent, an toàn chạy lại nhiều lần: gán lại DEFAULT, điền bù mọi NULL còn sót,
-- rồi siết NOT NULL. (Mã app cũng đã sửa để cấp thẳng 0 khi INSERT — xem [[orderRepo]].)

ALTER TABLE orders ALTER COLUMN tre_da_bao_phut SET DEFAULT 0;
UPDATE orders SET tre_da_bao_phut = 0 WHERE tre_da_bao_phut IS NULL;
ALTER TABLE orders ALTER COLUMN tre_da_bao_phut SET NOT NULL;
