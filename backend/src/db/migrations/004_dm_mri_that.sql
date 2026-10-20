-- Migration 004 — Danh mục MRI thật (nguồn: "DM MRI.xls", 54 mã HH).
--   • Đặt tên 2 phòng theo máy: MRI1 = Phòng 1.5T, MRI2 = Phòng 0.4T.
--   • Bỏ 4 tuyến demo (MRI_SONAO, MRI_COTSONG, MRI_KHOP, MRI_BUNG).
--   • Nạp mã HH → phòng + thời lượng (ghi đè nếu đã có).
--   • Ca đang chờ chưa xếp được phòng (mã HH trước đây chưa cấu hình) → xếp ngay.

UPDATE rooms SET ten = 'Phòng 1.5T' WHERE ma_phong = 'MRI1';
UPDATE rooms SET ten = 'Phòng 0.4T' WHERE ma_phong = 'MRI2';

DELETE FROM hh_routing WHERE ma_hh IN ('MRI_SONAO', 'MRI_COTSONG', 'MRI_KHOP', 'MRI_BUNG');

INSERT INTO hh_routing (ma_hh, room_id, thoi_luong_phut, mo_ta)
SELECT v.ma_hh, r.id, v.phut, v.mo_ta
FROM (VALUES
  ('586', 'MRI1', 25, 'Chụp cộng hưởng từ sọ não có tiêm chất tương phản (0.2-1.5T)'),
  ('587', 'MRI1', 20, 'Chụp cộng hưởng từ não- mạch não có tiêm chất tương phản (0.2-1.5T)'),
  ('588', 'MRI1', 20, 'Chụp cộng hưởng từ hệ mạch cổ có tiêm chất tương phản (0.2-1.5T)'),
  ('589', 'MRI1', 25, 'Chụp cộng hưởng từ tuyến yên có tiêm chất tương phản (khảo sát động học) (0.2-1.5T)'),
  ('590', 'MRI1', 25, 'Chụp cộng hưởng từ hốc mắt và thần kinh thị giác có tiêm chất tương phản (0.2-1.5T)'),
  ('591', 'MRI1', 20, 'Chụp cộng hưởng từ đáy sọ và xương đá (0.2-1.5T) [có chất tương phản]'),
  ('592', 'MRI1', 30, 'Chụp cộng hưởng từ vùng chậu (gồm: chụp cộng hưởng từ tử cung - phần phụ, tiền liệt tuyến, đại tràng chậu hông, trực tràng, các khối u vùng chậu…) (0.2-1.5T) [không có chất tương phản]'),
  ('593', 'MRI1', 30, 'Chụp cộng hưởng từ vùng mặt - cổ có tiêm tương phản (0.2-1.5T)'),
  ('594', 'MRI1', 30, 'Chụp cộng hưởng từ lồng ngực có tiêm chất tương phản (0.2-1.5T)'),
  ('595', 'MRI1', 25, 'Chụp cộng hưởng từ thông khí phổi (Heli) (0.2-1.5T) [có chất tương phản]'),
  ('596', 'MRI1', 40, 'Chụp cộng hưởng từ tuyến vú động học có tiêm tương phản (0.2-1.5T)'),
  ('597', 'MRI1', 20, 'Chụp cộng hưởng từ bìu, dương vật có tiêm chất tương phản (0.2-1.5T)'),
  ('598', 'MRI1', 40, 'Chụp cộng hưởng từ ruột non (enteroclysis) (0.2-1.5T) [có chất tương phản]'),
  ('599', 'MRI1', 30, 'Chụp cộng hưởng từ tuyến tiền liệt có tiêm tương phản (0.2-1.5T)'),
  ('600', 'MRI1', 40, 'Chụp cộng hưởng từ đánh giá bánh nhau (rau) (0.2-1.5T) [có chất tương phản]'),
  ('601', 'MRI1', 25, 'Chụp cộng hưởng từ cột sống cổ có tiêm tương phản (0.2-1.5T)'),
  ('602', 'MRI1', 20, 'Chụp cộng hưởng từ cột sống ngực có tiêm tương phản (0.2-1.5T)'),
  ('603', 'MRI1', 25, 'Chụp cộng hưởng từ cột sống thắt lưng - cùng có tiêm tương phản (0.2-1.5T)'),
  ('604', 'MRI1', 25, 'Chụp cộng hưởng từ khớp có tiêm tương phản tĩnh mạch (0.2-1.5T)'),
  ('605', 'MRI1', 25, 'Chụp cộng hưởng từ khớp có tiêm tương phản nội khớp (0.2-1.5T)'),
  ('606', 'MRI1', 25, 'Chụp cộng hưởng từ xương và tủy xương có tiêm tương phản (0.2-1.5T)'),
  ('607', 'MRI1', 40, 'Chụp cộng hưởng từ tầng trên ổ bụng có khảo sát mạch các tạng (bao gồm mạch: gan, tụy, lách và mạch khối u) (1.5T) [có chất tương phản]'),
  ('608', 'MRI1', 40, 'Chụp cộng hưởng từ vùng chậu dò hậu môn (0.2-1.5T) [có chất tương phản]'),
  ('609', 'MRI1', 40, 'Chụp cộng hưởng từ vùng chậu có tiêm chất tương phản (gồm: chụp cộng hưởng từ tử cung - phần phụ, tiền liệt tuyến, đại tràng chậu hông, trực tràng, các khối u vùng chậu…) (0.2-1.5T)'),
  ('610', 'MRI1', 40, 'Chụp cộng hưởng từ phần mềm chi có tiêm tương phản (0.2-1.5T)'),
  ('611', 'MRI1', 40, 'Chụp cộng hưởng từ động mạch chủ - chậu (1.5T) [có chất tương phản]'),
  ('612', 'MRI1', 40, 'Chụp cộng hưởng từ động mạch chủ - ngực (1.5T) [có chất tương phản]'),
  ('613', 'MRI1', 40, 'Chụp cộng hưởng từ tầng bụng có tiêm chất tương phản (gồm: chụp cộng hưởng từ gan - mật, tụy, lách, thận, dạ dày - tá tràng...) (0.2-1.5T)'),
  ('614', 'MRI1', 20, 'Chụp cộng hưởng từ sọ não (0.2-1.5T) [không có chất tương phản]'),
  ('615', 'MRI1', 20, 'Chụp cộng hưởng từ não- mạch não không tiêm chất tương phản (0.2-1.5T)'),
  ('616', 'MRI1', 20, 'Chụp cộng hưởng từ hệ mạch cổ không tiêm chất tương phản (0.2-1.5T)'),
  ('617', 'MRI1', 20, 'Chụp cộng hưởng từ hốc mắt và thần kinh thị giác (0.2-1.5T) [không có chất tương phản]'),
  ('618', 'MRI1', 25, 'Chụp cộng hưởng từ vùng mặt - cổ (0.2-1.5T) [không có chất tương phản]'),
  ('619', 'MRI1', 20, 'Chụp cộng hưởng từ lồng ngực (0.2-1.5T) [không có chất tương phản]'),
  ('620', 'MRI1', 40, 'Chụp cộng hưởng từ tuyến vú (0.2-1.5T) [không có chất tương phản]'),
  ('621', 'MRI1', 20, 'Chụp cộng hưởng từ bìu, dương vật (0.2-1.5T) [không có chất tương phản]'),
  ('622', 'MRI1', 20, 'Chụp cộng hưởng từ động học sàn chậu, tống phân (defecography-MR) (0.2-1.5T) [không có chất tương phản]'),
  ('623', 'MRI1', 40, 'Chụp cộng hưởng từ thai nhi (0.2-1.5T) [không có chất tương phản]'),
  ('624', 'MRI1', 20, 'Chụp cộng hưởng từ cột sống cổ (0.2-1.5T) [không có chất tương phản]'),
  ('625', 'MRI1', 20, 'Chụp cộng hưởng từ cột sống ngực (0.2-1.5T) [không có chất tương phản]'),
  ('626', 'MRI1', 20, 'Chụp cộng hưởng từ cột sống thắt lưng - cùng (0.2-1.5T) [không có chất tương phản]'),
  ('627', 'MRI1', 20, 'Chụp cộng hưởng từ khớp (0.2-1.5T) [không có chất tương phản]'),
  ('628', 'MRI1', 40, 'Chụp cộng hưởng từ xương và tủy xương (0.2-1.5T) [không có chất tương phản]'),
  ('629', 'MRI1', 40, 'Chụp cộng hưởng từ phần mềm chi (0.2-1.5T) [không có chất tương phản]'),
  ('630', 'MRI1', 20, 'Chụp cộng hưởng từ động mạch chi trên (1.5T) [không có chất tương phản]'),
  ('631', 'MRI1', 20, 'Chụp cộng hưởng từ động mạch chi dưới (1.5T) [không có chất tương phản]'),
  ('632', 'MRI1', 20, 'Chụp cộng hưởng từ dây thần kinh ngoại biên (neurography MR) (1.5T) [không có chất tương phản]'),
  ('633', 'MRI1', 40, 'Chụp cộng hưởng từ tầng bụng không tiêm chất tương phản (gồm: chụp cộng hưởng từ gan - mật, tụy, lách, thận, dạ dày - tá tràng...) (0.2-1.5T)'),
  ('634', 'MRI1', 20, 'Chụp cộng hưởng từ khuếch tán (DWI - Diffusion-weighted Imaging) (0.2-1.5T) [không có chất tương phản]'),
  ('635', 'MRI1', 40, 'Chụp cộng hưởng từ phổ tuyến vú (0.2-1.5T)'),
  ('10716', 'MRI2', 30, 'Chụp cộng hưởng từ sọ não 0.4 T [không có chất tương phản]'),
  ('10717', 'MRI2', 30, 'Chụp cộng hưởng từ não - mạch não không tiêm chất tương phản 0.4 T'),
  ('10718', 'MRI2', 30, 'Chụp cộng hưởng từ cột sống thắt lưng - cùng 0.4 T [không có chất tương phản]'),
  ('10719', 'MRI2', 30, 'Chụp cộng hưởng từ khớp 0.4 T [không có chất tương phản]')
) AS v(ma_hh, ma_phong, phut, mo_ta)
JOIN rooms r ON r.ma_phong = v.ma_phong
ON CONFLICT (ma_hh) DO UPDATE
  SET room_id = EXCLUDED.room_id, thoi_luong_phut = EXCLUDED.thoi_luong_phut, mo_ta = EXCLUDED.mo_ta;

-- Xếp các ca đang chờ còn treo (room_id NULL) vào cuối hàng phòng tương ứng, theo thứ tự đến.
UPDATE orders o
SET room_id = x.room_id,
    queue_pos = x.base + x.rn,
    updated_at = NOW()
FROM (
  SELECT o2.id, hr.room_id,
         ROW_NUMBER() OVER (PARTITION BY hr.room_id ORDER BY o2.id) AS rn,
         (SELECT COALESCE(MAX(queue_pos), 0) FROM orders WHERE room_id = hr.room_id AND status = 'cho') AS base
  FROM orders o2 JOIN hh_routing hr ON hr.ma_hh = o2.ma_hh
  WHERE o2.room_id IS NULL AND o2.status = 'cho'
) x
WHERE o.id = x.id;
