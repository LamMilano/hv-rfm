// Thống kê vận hành & đánh giá hiệu quả (trang "Thống kê" của admin). Rút hoàn toàn
// từ orders + change_log trong một khoảng ngày (giờ VN) — không cần nhập liệu thêm.
// Mốc thời gian suy từ change_log: lần 'goi' đầu = bắt đầu phục vụ; 'hoan_thanh'/
// 'his_dong' = chụp xong. Xem [[orderRepo]] (ghiLog), migration 015.

import { query, queryOne } from '../db/pool'

export interface ThongKe {
  khoang: { tu_ngay: string; den_ngay: string }
  ca: { tiep_nhan: number; hoan_thanh: number; huy: number; qua_luot: number; goi_lai: number }
  nguon: { his: number; thu_cong: number }                 // mức dùng: HIS tự động vs nhập tay
  thoi_gian: {                                              // phút, trung bình (null = chưa đủ mẫu)
    cho_tb: number | null; chup_tb: number | null; tre_hen_tb: number | null
  }
  sua_gio_tay: { so_ca_sua: number; tong_ca: number; so_lan_doi_gio: number }
  theo_phong: { ten: string; hoan_thanh: number; cho_tb: number | null }[]
  theo_ktv: { ho_ten: string; hoan_thanh: number; goi: number; doi_gio: number }[]
  theo_nhom_uu_tien: { ten: string; so_ca: number; cho_tb: number | null }[]
  // ── Tầng sâu: cấp cứu chen hàng + xu hướng độ chậm so với lịch gốc ──
  cap_cuu: {
    tong: number                                     // số ca cấp cứu trong khoảng
    chen: number                                     // số lượt chen vào phòng đang có ca chờ
    theo_gio: { gio: number; so_ca: number }[]       // phân bố theo khung giờ (0–23, giờ VN)
  }
  cham_hen: {
    tb: number | null; p90: number | null; max: number | null   // độ chậm thực tế (phút) lúc gọi
    theo_ngay: { ngay: string; cham_tb: number | null; so_ca: number }[]
  }
}

// CTE mốc thời gian mỗi ca (dùng lại ở nhiều truy vấn). lan_goi_dau: lần gọi đầu;
// luc_xong: lúc chụp xong (KTV hoàn thành hoặc HIS đóng); so_doi_gio: số lần sửa giờ tay.
const SU_KIEN = `
  su_kien AS (
    SELECT order_id,
           MIN(created_at) FILTER (WHERE loai = 'goi')                        AS lan_goi_dau,
           MAX(created_at) FILTER (WHERE loai IN ('hoan_thanh','his_dong'))   AS luc_xong,
           COUNT(*)        FILTER (WHERE loai = 'doi_gio')::int               AS so_doi_gio
    FROM change_log GROUP BY order_id
  )`

// Chênh phút trung bình giữa hai mốc (null khi không có mẫu). Dùng trong SELECT.
// FILTER phải bám TRỰC TIẾP vào AVG (không được đặt sau ::int), nên lọc nằm bên trong.
const PHUT = (a: string, b: string, loc?: string) =>
  `ROUND(AVG(EXTRACT(EPOCH FROM (${a} - ${b})) / 60.0)` +
  `${loc ? ` FILTER (WHERE ${loc})` : ''})::int`

const TRONG_NGAY = (cot: string) =>
  `(${cot} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date`

export async function thongKe(tu_ngay: string, den_ngay: string): Promise<ThongKe> {
  const p = [tu_ngay, den_ngay]

  // 1) Tổng hợp ca + nguồn + thời gian + sửa giờ tay (một lượt trên orders).
  const tong = await queryOne<{
    tiep_nhan: number; hoan_thanh: number; huy: number
    nguon_his: number; nguon_thu_cong: number
    cho_tb: number | null; chup_tb: number | null; tre_hen_tb: number | null
    sua_gio_tay: number; so_lan_doi_gio: number | null
  }>(
    `WITH ${SU_KIEN}
     SELECT
       COUNT(*)::int                                              AS tiep_nhan,
       COUNT(*) FILTER (WHERE o.status = 'hoan_thanh')::int       AS hoan_thanh,
       COUNT(*) FILTER (WHERE o.status = 'huy')::int              AS huy,
       COUNT(*) FILTER (WHERE o.nguon = 'his')::int              AS nguon_his,
       COUNT(*) FILTER (WHERE o.nguon = 'thu_cong')::int         AS nguon_thu_cong,
       ${PHUT('sk.lan_goi_dau', 'o.created_at', 'sk.lan_goi_dau IS NOT NULL')} AS cho_tb,
       ${PHUT('sk.luc_xong', 'sk.lan_goi_dau', 'sk.luc_xong IS NOT NULL AND sk.lan_goi_dau IS NOT NULL')} AS chup_tb,
       ${PHUT('sk.lan_goi_dau', 'o.gio_hen', 'sk.lan_goi_dau IS NOT NULL AND o.gio_hen IS NOT NULL')} AS tre_hen_tb,
       COUNT(*) FILTER (WHERE o.gio_hen_thu_cong)::int            AS sua_gio_tay,
       COALESCE(SUM(sk.so_doi_gio), 0)::int                       AS so_lan_doi_gio
     FROM orders o LEFT JOIN su_kien sk ON sk.order_id = o.id
     WHERE ${TRONG_NGAY('o.created_at')}`,
    p,
  )

  // 2) Sự kiện quá lượt / gọi lại (đếm theo thời điểm sự kiện, không theo ngày tạo ca).
  const sk = await queryOne<{ qua_luot: number; goi_lai: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE loai = 'qua_luot')::int AS qua_luot,
       COUNT(*) FILTER (WHERE loai = 'goi_lai')::int  AS goi_lai
     FROM change_log WHERE ${TRONG_NGAY('created_at')}`,
    p,
  )

  // 3) Năng suất + thời gian chờ theo phòng.
  const theo_phong = await query<{ ten: string; hoan_thanh: number; cho_tb: number | null }>(
    `WITH ${SU_KIEN}
     SELECT r.ten,
            COUNT(o.id) FILTER (WHERE o.status = 'hoan_thanh')::int AS hoan_thanh,
            ${PHUT('sk.lan_goi_dau', 'o.created_at', 'sk.lan_goi_dau IS NOT NULL')} AS cho_tb
     FROM rooms r
     LEFT JOIN orders o ON o.room_id = r.id AND ${TRONG_NGAY('o.created_at')}
     LEFT JOIN su_kien sk ON sk.order_id = o.id
     WHERE r.active = TRUE
     GROUP BY r.id, r.ten ORDER BY r.id`,
    p,
  )

  // 4) Năng suất theo KTV/người thao tác (đếm sự kiện trong change_log, bỏ hệ thống).
  const theo_ktv = await query<{ ho_ten: string; hoan_thanh: number; goi: number; doi_gio: number }>(
    `SELECT u.ho_ten,
            COUNT(*) FILTER (WHERE cl.loai = 'hoan_thanh')::int AS hoan_thanh,
            COUNT(*) FILTER (WHERE cl.loai = 'goi')::int        AS goi,
            COUNT(*) FILTER (WHERE cl.loai = 'doi_gio')::int    AS doi_gio
     FROM change_log cl JOIN users u ON u.id = cl.user_id
     WHERE cl.user_id IS NOT NULL AND ${TRONG_NGAY('cl.created_at')}
     GROUP BY u.id, u.ho_ten
     HAVING COUNT(*) FILTER (WHERE cl.loai IN ('hoan_thanh','goi','doi_gio')) > 0
     ORDER BY hoan_thanh DESC, goi DESC`,
    p,
  )

  // 5) Phân bố + thời gian chờ theo nhóm ưu tiên (công bằng giữa các nhóm).
  const theo_nhom_uu_tien = await query<{ ten: string; so_ca: number; cho_tb: number | null }>(
    `WITH ${SU_KIEN}
     SELECT COALESCE(pt.ten, '(Chưa phân nhóm)') AS ten,
            COUNT(o.id)::int AS so_ca,
            ${PHUT('sk.lan_goi_dau', 'o.created_at', 'sk.lan_goi_dau IS NOT NULL')} AS cho_tb
     FROM orders o
     LEFT JOIN priority_types pt ON pt.id = o.priority_type_id
     LEFT JOIN su_kien sk ON sk.order_id = o.id
     WHERE ${TRONG_NGAY('o.created_at')}
     GROUP BY pt.ten ORDER BY so_ca DESC`,
    p,
  )

  // 6) Tầng sâu — CẤP CỨU: tổng số ca nhóm cấp cứu, số lượt chen hàng, phân bố giờ.
  const emgMa = (await queryOne<{ gia_tri: string | null }>(
    `SELECT gia_tri FROM app_settings WHERE khoa='nhom_cap_cuu_ma'`,
  ))?.gia_tri ?? 'cap_cuu'

  const ccTong = await queryOne<{ tong: number }>(
    `SELECT COUNT(*)::int AS tong
       FROM orders o JOIN priority_types pt ON pt.id = o.priority_type_id
      WHERE pt.ma = $3 AND ${TRONG_NGAY('o.created_at')}`,
    [tu_ngay, den_ngay, emgMa],
  )
  const ccChen = await queryOne<{ chen: number }>(
    `SELECT COUNT(*)::int AS chen FROM change_log
      WHERE loai = 'chen_cap_cuu' AND ${TRONG_NGAY('created_at')}`,
    p,
  )
  const ccGio = await query<{ gio: number; so_ca: number }>(
    `SELECT EXTRACT(HOUR FROM (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int AS gio,
            COUNT(*)::int AS so_ca
       FROM orders o JOIN priority_types pt ON pt.id = o.priority_type_id
      WHERE pt.ma = $3 AND ${TRONG_NGAY('o.created_at')}
      GROUP BY gio ORDER BY gio`,
    [tu_ngay, den_ngay, emgMa],
  )

  // 7) Tầng sâu — XU HƯỚNG ĐỘ CHẬM so với lịch gốc (snapshot cham_phut_khi_goi lúc gọi).
  const chamTong = await queryOne<{ tb: number | null; p90: number | null; max: number | null }>(
    `SELECT ROUND(AVG(cham_phut_khi_goi))::int AS tb,
            ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY cham_phut_khi_goi))::int AS p90,
            MAX(cham_phut_khi_goi)::int AS max
       FROM orders
      WHERE cham_phut_khi_goi IS NOT NULL AND ${TRONG_NGAY('created_at')}`,
    p,
  )
  const chamNgay = await query<{ ngay: string; cham_tb: number | null; so_ca: number }>(
    `SELECT (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS ngay,
            ROUND(AVG(cham_phut_khi_goi))::int AS cham_tb,
            COUNT(*)::int AS so_ca
       FROM orders
      WHERE cham_phut_khi_goi IS NOT NULL AND ${TRONG_NGAY('created_at')}
      GROUP BY ngay ORDER BY ngay`,
    p,
  )

  return {
    khoang: { tu_ngay, den_ngay },
    ca: {
      tiep_nhan: tong?.tiep_nhan ?? 0,
      hoan_thanh: tong?.hoan_thanh ?? 0,
      huy: tong?.huy ?? 0,
      qua_luot: sk?.qua_luot ?? 0,
      goi_lai: sk?.goi_lai ?? 0,
    },
    nguon: { his: tong?.nguon_his ?? 0, thu_cong: tong?.nguon_thu_cong ?? 0 },
    thoi_gian: {
      cho_tb: tong?.cho_tb ?? null,
      chup_tb: tong?.chup_tb ?? null,
      tre_hen_tb: tong?.tre_hen_tb ?? null,
    },
    sua_gio_tay: {
      so_ca_sua: tong?.sua_gio_tay ?? 0,
      tong_ca: tong?.tiep_nhan ?? 0,
      so_lan_doi_gio: tong?.so_lan_doi_gio ?? 0,
    },
    theo_phong,
    theo_ktv,
    theo_nhom_uu_tien,
    cap_cuu: {
      tong: ccTong?.tong ?? 0,
      chen: ccChen?.chen ?? 0,
      theo_gio: ccGio,
    },
    cham_hen: {
      tb: chamTong?.tb ?? null,
      p90: chamTong?.p90 ?? null,
      max: chamTong?.max ?? null,
      theo_ngay: chamNgay,
    },
  }
}

// ── Chi tiết từng chỉ số (nút "Chi tiết" trên trang Thống kê) ────────────────
// Mỗi chỉ số ở trên rút xuống danh sách ca (hoặc sự kiện) tạo nên con số đó, cùng
// tiêu chí lọc với thongKe() để số dòng khớp số tổng. `khoa` thu hẹp theo một
// phần tử (tên phòng, tên nhóm, giờ cấp cứu, ngày, tên người, nguồn).
export const LOAI_CHI_TIET = [
  'tiep_nhan', 'hoan_thanh', 'huy', 'qua_luot', 'thoi_gian', 'nguon', 'sua_gio',
  'phong', 'nhom', 'cap_cuu', 'cham', 'ktv',
] as const
export type LoaiChiTiet = typeof LOAI_CHI_TIET[number]

export interface DongChiTiet {
  id: number; stt_ngay: number | null; ma_bn: string | null; ho_ten: string; tuoi: number | null
  ten_dich_vu: string | null; status: string; nguon: string; phong: string | null; nhom: string | null
  tao_luc: string; gio_hen: string | null; gio_hen_goc: string | null
  lan_goi_dau: string | null; luc_xong: string | null
  cho_phut: number | null; chup_phut: number | null; lech_hen_phut: number | null
  cham_phut: number | null; so_doi_gio: number; gio_hen_thu_cong: boolean; chen: number
  // Chỉ có ở chỉ số dạng sự kiện (quá lượt, người thao tác) hoặc sự kiện hủy gần nhất.
  su_kien_luc: string | null; su_kien_loai: string | null; nguoi: string | null
  ly_do: string | null; gia_tri_cu: string | null; gia_tri_moi: string | null
}
export interface KetQuaChiTiet { dong: DongChiTiet[]; tong: number; gioi_han: number }

const GIOI_HAN_CHI_TIET = 2000
const CHENH = (a: string, b: string) => `ROUND(EXTRACT(EPOCH FROM (${a} - ${b})) / 60.0)::int`

// Cột ca dùng chung. `ev` = sự kiện đi kèm (LATERAL hoặc chính change_log).
const COT_CA = `
  o.id, o.stt_ngay, o.ma_bn, o.ho_ten, o.tuoi, o.ten_dich_vu, o.status, o.nguon,
  r.ten AS phong, pt.ten AS nhom,
  o.created_at AS tao_luc, o.gio_hen, o.gio_hen_goc, sk.lan_goi_dau, sk.luc_xong,
  ${CHENH('sk.lan_goi_dau', 'o.created_at')} AS cho_phut,
  ${CHENH('sk.luc_xong', 'sk.lan_goi_dau')}  AS chup_phut,
  ${CHENH('sk.lan_goi_dau', 'o.gio_hen')}    AS lech_hen_phut,
  o.cham_phut_khi_goi AS cham_phut, COALESCE(sk.so_doi_gio, 0)::int AS so_doi_gio,
  o.gio_hen_thu_cong, COALESCE(sk.so_chen, 0)::int AS chen`

const SU_KIEN_CT = `
  su_kien AS (
    SELECT order_id,
           MIN(created_at) FILTER (WHERE loai = 'goi')                        AS lan_goi_dau,
           MAX(created_at) FILTER (WHERE loai IN ('hoan_thanh','his_dong'))   AS luc_xong,
           COUNT(*)        FILTER (WHERE loai = 'doi_gio')::int               AS so_doi_gio,
           COUNT(*)        FILTER (WHERE loai = 'chen_cap_cuu')::int          AS so_chen
    FROM change_log GROUP BY order_id
  )`

const JOIN_CA = `
  LEFT JOIN su_kien sk ON sk.order_id = o.id
  LEFT JOIN rooms r ON r.id = o.room_id
  LEFT JOIN priority_types pt ON pt.id = o.priority_type_id`

export async function chiTietThongKe(
  loai: LoaiChiTiet, tu_ngay: string, den_ngay: string, khoa: string | null,
): Promise<KetQuaChiTiet> {
  const p: unknown[] = [tu_ngay, den_ngay]
  const them = (v: unknown) => { p.push(v); return `$${p.length}` }

  // Chỉ số dạng SỰ KIỆN: mỗi dòng là một lượt trong change_log (đếm theo thời điểm sự kiện).
  if (loai === 'qua_luot' || loai === 'ktv') {
    const dk: string[] = [TRONG_NGAY('cl.created_at')]
    if (loai === 'qua_luot') dk.push(`cl.loai = 'qua_luot'`)
    else {
      dk.push(`cl.user_id IS NOT NULL`, `cl.loai IN ('hoan_thanh','goi','doi_gio')`)
      if (khoa) dk.push(`u.ho_ten = ${them(khoa)}`)
    }
    const dong = await query<DongChiTiet>(
      `WITH ${SU_KIEN_CT}
       SELECT ${COT_CA}, cl.created_at AS su_kien_luc, cl.loai AS su_kien_loai, u.ho_ten AS nguoi,
              cl.ly_do, cl.gia_tri_cu, cl.gia_tri_moi
       FROM change_log cl
       JOIN orders o ON o.id = cl.order_id
       LEFT JOIN users u ON u.id = cl.user_id
       ${JOIN_CA}
       WHERE ${dk.join(' AND ')}
       ORDER BY cl.created_at DESC
       LIMIT ${GIOI_HAN_CHI_TIET + 1}`,
      p,
    )
    return dongGioiHan(dong)
  }

  // Chỉ số dạng CA: lọc orders theo ngày tạo ca, giống thongKe().
  const dk: string[] = [TRONG_NGAY('o.created_at')]
  let sapXep = 'o.created_at DESC'
  switch (loai) {
    case 'hoan_thanh': dk.push(`o.status = 'hoan_thanh'`); break
    case 'huy': dk.push(`o.status = 'huy'`); break
    case 'thoi_gian': sapXep = 'cho_phut DESC NULLS LAST, o.created_at DESC'; break
    case 'nguon': if (khoa) dk.push(`o.nguon = ${them(khoa)}`); break
    case 'sua_gio':
      dk.push(`o.gio_hen_thu_cong`); sapXep = 'so_doi_gio DESC, o.created_at DESC'; break
    case 'phong': if (khoa) dk.push(`r.ten = ${them(khoa)}`); break
    case 'nhom':
      if (khoa === '(Chưa phân nhóm)') dk.push(`pt.id IS NULL`)
      else if (khoa) dk.push(`pt.ten = ${them(khoa)}`)
      sapXep = 'cho_phut DESC NULLS LAST, o.created_at DESC'
      break
    case 'cap_cuu': {
      const emgMa = (await queryOne<{ gia_tri: string | null }>(
        `SELECT gia_tri FROM app_settings WHERE khoa='nhom_cap_cuu_ma'`,
      ))?.gia_tri ?? 'cap_cuu'
      dk.push(`pt.ma = ${them(emgMa)}`)
      if (khoa !== null && /^\d{1,2}$/.test(khoa)) {
        dk.push(`EXTRACT(HOUR FROM (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int = ${them(Number(khoa))}`)
      }
      break
    }
    case 'cham':
      dk.push(`o.cham_phut_khi_goi IS NOT NULL`)
      if (khoa && /^\d{4}-\d{2}-\d{2}$/.test(khoa)) {
        dk.push(`(o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = ${them(khoa)}::date`)
      }
      sapXep = 'o.cham_phut_khi_goi DESC, o.created_at DESC'
      break
  }

  // Sự kiện hủy gần nhất (ai/vì sao) — chỉ cần cho danh sách Hủy, dòng khác để null.
  const evHuy = loai === 'huy'
  const dong = await query<DongChiTiet>(
    `WITH ${SU_KIEN_CT}
     SELECT ${COT_CA},
            ${evHuy ? 'ev.created_at' : 'NULL::timestamptz'} AS su_kien_luc,
            ${evHuy ? 'ev.loai' : 'NULL'} AS su_kien_loai,
            ${evHuy ? 'ev.ho_ten' : 'NULL'} AS nguoi,
            ${evHuy ? 'ev.ly_do' : 'NULL'} AS ly_do,
            NULL AS gia_tri_cu, NULL AS gia_tri_moi
     FROM orders o
     ${JOIN_CA}
     ${evHuy ? `LEFT JOIN LATERAL (
         SELECT cl.created_at, cl.loai, cl.ly_do, u.ho_ten
           FROM change_log cl LEFT JOIN users u ON u.id = cl.user_id
          WHERE cl.order_id = o.id AND cl.loai IN ('huy','his_huy')
          ORDER BY cl.created_at DESC LIMIT 1) ev ON TRUE` : ''}
     WHERE ${dk.join(' AND ')}
     ORDER BY ${sapXep}
     LIMIT ${GIOI_HAN_CHI_TIET + 1}`,
    p,
  )
  return dongGioiHan(dong)
}

function dongGioiHan(dong: DongChiTiet[]): KetQuaChiTiet {
  const vuot = dong.length > GIOI_HAN_CHI_TIET
  return {
    dong: vuot ? dong.slice(0, GIOI_HAN_CHI_TIET) : dong,
    tong: vuot ? GIOI_HAN_CHI_TIET + 1 : dong.length,
    gioi_han: GIOI_HAN_CHI_TIET,
  }
}
