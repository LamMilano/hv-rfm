-- Migration 019 — Chu kỳ kéo HIS theo khung giờ.
--   Trong giờ hành chính gọi HIS dày (his_pull_chu_ky_giay), ngoài giờ giãn ra
--   (his_pull_chu_ky_ngoai_gio_giay) để đỡ tải HIS/mạng ban đêm.
--   • his_pull_theo_khung_gio: '1' bật / '0' tắt (bật sẵn theo yêu cầu vận hành).
--   • his_pull_gio_hc_tu / _den: khung giờ hành chính [tu, den) theo giờ VN (0–24).
--   • his_pull_chu_ky_ngoai_gio_giay: chu kỳ ngoài giờ (giây). Mặc định 600 = 10 phút.
-- Tắt khung giờ → poller dùng his_pull_chu_ky_giay cho mọi thời điểm (như trước).

INSERT INTO app_settings (khoa, gia_tri) VALUES
  ('his_pull_theo_khung_gio', '1'),
  ('his_pull_gio_hc_tu', '7'),
  ('his_pull_gio_hc_den', '17'),
  ('his_pull_chu_ky_ngoai_gio_giay', '600')
ON CONFLICT (khoa) DO NOTHING;
