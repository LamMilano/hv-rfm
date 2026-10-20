-- 015: Nhật ký hệ thống (audit_log) — lưu vết các sự kiện NGOÀI phạm vi một ca:
-- đăng nhập (kể cả thất bại), đổi cấu hình, kéo HIS, quản trị người dùng, lỗi hệ
-- thống. Bổ trợ cho change_log (vốn chỉ ghi thao tác trên orders). Append-only:
-- không sửa/xóa, không tham chiếu orders (giữ nguyên cả khi ca bị dọn).
--
-- Dùng cho: trang "Nhật ký" (admin), thống kê mức sử dụng & độ ổn định, truy vết
-- an ninh (ai đăng nhập, ai đổi luật). Xem [[auditRepo]].

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL   PRIMARY KEY,
  thoi_diem   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  nhom        TEXT        NOT NULL,   -- 'auth' | 'config' | 'his' | 'user' | 'he_thong'
  loai        TEXT        NOT NULL,   -- 'dang_nhap' | 'dang_nhap_that_bai' | 'doi_cau_hinh' | 'keo_his' | ...
  muc_do      TEXT        NOT NULL DEFAULT 'info' CHECK (muc_do IN ('info','warn','error')),
  actor_id    INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  actor_ten   TEXT,                   -- tên/mã hiển thị (giữ lại cả khi user bị xóa)
  actor_role  TEXT,                   -- vai trò lúc thao tác (có thể đổi sau)
  ip          TEXT,                   -- IP phiên (sau Nginx loopback: X-Forwarded-For)
  doi_tuong   TEXT,                   -- bảng:khóa bị tác động, vd 'app_settings:luat_giu_hang'
  gia_tri_cu  JSONB,
  gia_tri_moi JSONB,
  mo_ta       TEXT,
  CONSTRAINT audit_log_nhom_chk CHECK (nhom IN ('auth','config','his','user','he_thong'))
);

-- Truy vấn nóng: dòng thời gian mới nhất, lọc theo nhóm/loại, lọc theo người.
CREATE INDEX IF NOT EXISTS audit_log_thoi_diem ON audit_log(thoi_diem DESC);
CREATE INDEX IF NOT EXISTS audit_log_nhom_loai ON audit_log(nhom, loai, thoi_diem DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor     ON audit_log(actor_id, thoi_diem DESC);

-- change_log: thêm cột ngữ cảnh "người hay hệ thống" (điền ngay trong ghiLog theo
-- việc có user_id hay không — không cần đổi chữ ký các hàm mutation). actor_role/ip
-- của thao tác trên ca suy ra qua join users khi đọc, chưa cần cột riêng.
ALTER TABLE change_log ADD COLUMN IF NOT EXISTS nguon TEXT;   -- 'nguoi' | 'he_thong'
