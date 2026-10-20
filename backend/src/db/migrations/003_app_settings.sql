-- Migration 003 — bảng cấu hình key/value (mẫu tin nhắn SMS/Zalo & cài đặt chung).
CREATE TABLE IF NOT EXISTS app_settings (
  khoa       TEXT PRIMARY KEY,
  gia_tri    TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (khoa, gia_tri) VALUES
  ('mau_dat_gio', 'Kính mời {ho_ten}, số {stt}, dự kiến chụp MRI lúc {gio_hen} tại {phong}.'),
  ('mau_doi_gio', 'Giờ hẹn MRI của {ho_ten} (số {stt}) đổi sang {gio_hen}. {ly_do}')
ON CONFLICT (khoa) DO NOTHING;
