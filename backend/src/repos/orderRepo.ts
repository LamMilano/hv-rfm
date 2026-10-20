// Lớp dữ liệu hàng đợi: truy vấn (join routing + nhóm ưu tiên), mutation vòng đời,
// ghi change_log, và tiếp nhận chỉ định HIS (idempotent theo ma_his).
// Logic thuần (vòng đời, thứ tự, ước tính) nằm ở [[queueLogic]] / [[uoctinh]] /
// [[adapter]]; ở đây chỉ nối DB. Shape hiển thị do [[orderView]] dựng.

import { pool, query, queryOne } from '../db/pool'
import type { TrangThai } from '../services/orderView'
import type { OrderTiepNhan } from '../his/adapter'
import { goiYNhanUuTien, khopLuat, type NhomUuTien, type DuLieuUuTien } from '../his/adapter'
import { danhSoThuTu } from '../services/queueLogic'
import { gioHM } from '../services/orderView'
import { uocTinhMacDinh, tinhBatDauPhong, type CaTrongHang } from '../uoctinh'

// Thời lượng mặc định khi mã HH chưa cấu hình thời lượng chuẩn.
const THOI_LUONG_MAC_DINH = 20

// Giao diện tối thiểu để chạy câu lệnh — nhận cả PoolClient (trong transaction) lẫn pool.
type Db = { query: (sql: string, p?: any[]) => Promise<any> }

export interface OrderDbRow {
  id: number
  stt_ngay: number | null   // STT tiếp nhận theo phòng/ngày (NULL khi chưa xếp phòng)
  ho_ten: string
  tuoi: number | null
  ma_hh: string | null
  ten_dich_vu: string | null
  hh_mo_ta: string | null
  thoi_luong_phut: number | null
  room_id: number | null   // NULL = mã HH chưa có trong cấu hình → chưa xếp được số
  giu_hang: boolean        // ca ở hàng GIỮ (nội trú): chưa vào hàng thời gian, không tự hẹn giờ
  status: TrangThai
  queue_pos: number | null
  gio_hen: Date | null
  gio_hen_goc: Date | null        // mốc giờ hẹn ban đầu (đóng băng) — để tính độ chậm
  cham_phut_khi_goi: number | null // độ trễ chốt lúc gọi (ca đã rời hàng chờ)
  gio_hen_thu_cong: boolean
  priority_type_id: number | null
  priority_confirmed: boolean
  pt_ma: string | null
  pt_ten: string | null
  pt_viet_tat: string | null
  pt_mau: string | null
  ma_bs: string | null
  ten_bs_chi_dinh: string | null
  ma_bn: string | null
  sdt: string | null
  gio_chi_dinh: Date | null
  his_meta: Record<string, unknown> | null
  nguon: string
  ghep_bo_qua: boolean   // phiếu đặt trước đã "Để riêng" → không gợi ý ghép nữa
  updated_at: Date | null
}

const CHON = `
  SELECT o.id, o.stt_ngay, o.ho_ten, o.tuoi, o.ma_hh, o.ten_dich_vu, o.room_id, o.giu_hang, o.status,
         o.queue_pos, o.gio_hen, o.gio_hen_goc, o.cham_phut_khi_goi, o.gio_hen_thu_cong, o.priority_type_id,
         o.priority_confirmed, o.ma_bs, o.ten_bs_chi_dinh, o.ma_bn, o.sdt,
         o.gio_chi_dinh, o.his_meta, o.nguon, o.ghep_bo_qua, o.updated_at,
         COALESCE(o.thoi_luong_phut, hr.thoi_luong_phut) AS thoi_luong_phut, hr.mo_ta AS hh_mo_ta,
         pt.ma AS pt_ma, pt.ten AS pt_ten, pt.viet_tat AS pt_viet_tat, pt.mau AS pt_mau
  FROM orders o
  LEFT JOIN hh_routing   hr ON hr.ma_hh = o.ma_hh
  LEFT JOIN priority_types pt ON pt.id  = o.priority_type_id
`

// Tất cả ca đang hoạt động (chưa hủy) toàn bộ phòng — một truy vấn phục vụ mọi màn
// hình (KTV lọc phòng, bác sĩ lọc ma_bs, màn tổng/sảnh dùng cả). Ca 'cho' xếp theo
// queue_pos; dòng đang phục vụ/quá lượt đưa lên theo trạng thái.
export function layTatCaDangHoatDong(): Promise<OrderDbRow[]> {
  return query<OrderDbRow>(
    `${CHON} WHERE o.status <> 'huy' ORDER BY o.room_id, o.queue_pos NULLS LAST, o.id`,
  )
}

export function layTheoId(id: number): Promise<OrderDbRow | null> {
  return queryOne<OrderDbRow>(`${CHON} WHERE o.id = $1`, [id])
}

// Các ca đã hoàn thành trong ngày (giờ VN) — cho tab "Hoàn thành" + đếm.
export function layHoanThanhHomNay(): Promise<OrderDbRow[]> {
  return query<OrderDbRow>(
    `${CHON} WHERE o.status = 'hoan_thanh'
       AND (o.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
         = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
     ORDER BY o.updated_at DESC`,
  )
}

// Toàn bộ ca TIẾP NHẬN trong một ngày (giờ VN) — mọi trạng thái trừ hủy. Cho màn
// "Danh sách MRI" xem lại ngày quá khứ (ảnh chụp tĩnh; ngày hôm nay dùng dữ liệu live).
export function layTheoNgay(ngay: string): Promise<OrderDbRow[]> {
  return query<OrderDbRow>(
    `${CHON} WHERE (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $1::date
       AND o.status <> 'huy'
     ORDER BY o.room_id NULLS LAST, o.queue_pos NULLS LAST, o.id`,
    [ngay],
  )
}

// ── Giờ hẹn: tính lại + LƯU vào DB (nguồn sự thật duy nhất) ──────────────────
// Neo mốc đầu hàng theo TIẾN ĐỘ ca đang chụp (dang_goi); phòng rảnh → now. Chỉ ghi
// cho ca 'cho' chưa bị KTV sửa tay (gio_hen_thu_cong=false) — ca sửa tay giữ nguyên.
// Ca đã rời hàng (dang_goi/qua_luot/hoan_thanh) KHÔNG đụng tới → giữ giờ đã gán.
// Gọi sau MỖI thay đổi hàng (thêm/gọi/hoàn thành/quá lượt/đổi thứ tự/chuyển phòng/sửa giờ).
interface HangGioHenRow {
  id: number
  status: TrangThai
  queue_pos: number | null
  gio_hen: Date | null
  gio_hen_goc: Date | null
  gio_hen_thu_cong: boolean
  updated_at: Date | null
  thoi_luong_phut: number | null
  ho_ten: string
  sdt: string | null
  tre_da_bao_phut: number | null
}

// Đọc một app_setting kiểu số (dùng được trong transaction qua client `db`).
async function docSoCaiDat(db: Db, khoa: string, macDinh: number): Promise<number> {
  const r = await db.query(`SELECT gia_tri FROM app_settings WHERE khoa=$1`, [khoa])
  const v = r.rows[0]?.gia_tri
  const n = v == null ? NaN : Number(v)
  return Number.isFinite(n) ? n : macDinh
}

export async function capNhatGioHenPhong(db: Db, room_id: number, now: Date = new Date()): Promise<void> {
  const r = await db.query(
    `SELECT o.id, o.status, o.queue_pos, o.gio_hen, o.gio_hen_goc, o.gio_hen_thu_cong,
            o.updated_at, o.ho_ten, o.sdt, o.tre_da_bao_phut,
            COALESCE(o.thoi_luong_phut, hr.thoi_luong_phut) AS thoi_luong_phut
       FROM orders o LEFT JOIN hh_routing hr ON hr.ma_hh = o.ma_hh
      WHERE o.room_id = $1 AND o.status IN ('cho','dang_goi') AND NOT o.giu_hang`,
    [room_id],
  )
  const rows = r.rows as HangGioHenRow[]

  const active = rows.find((x) => x.status === 'dang_goi')
  const batDau = tinhBatDauPhong(
    active && active.updated_at
      ? { bat_dau: new Date(active.updated_at), thoi_luong_phut: active.thoi_luong_phut ?? THOI_LUONG_MAC_DINH }
      : null,
    now,
  )

  const hang: CaTrongHang[] = rows
    .filter((x) => x.status === 'cho')
    .sort((a, b) => (a.queue_pos ?? 0) - (b.queue_pos ?? 0))
    .map((x) => ({
      id: x.id,
      thoi_luong_phut: x.thoi_luong_phut ?? THOI_LUONG_MAC_DINH,
      gio_hen_thu_cong: x.gio_hen_thu_cong,
      gio_hen: x.gio_hen ? x.gio_hen.toISOString() : null,
    }))

  // Đệm cấp cứu: giãn giờ hẹn để GỐC gói sẵn kỳ vọng cấp cứu chen ngang (0 = tắt).
  const dem = await docSoCaiDat(db, 'dem_cap_cuu_phut_moi_gio', 0)
  const ketQua = uocTinhMacDinh.tinhChoHang(batDau, hang, dem)

  const suaTay = new Map(rows.map((x) => [x.id, x.gio_hen_thu_cong]))
  for (const e of ketQua) {
    if (suaTay.get(e.id)) continue  // ca KTV sửa tay → giữ nguyên giờ + mốc gốc
    // gio_hen_goc đóng băng LẦN ĐẦU (COALESCE): về sau gio_hen đổi nhưng gốc giữ nguyên.
    await db.query(
      `UPDATE orders SET gio_hen=$1, gio_hen_goc=COALESCE(gio_hen_goc,$1) WHERE id=$2`,
      [e.gio_hen, e.id],
    )
  }

  // Thông báo lùi giờ (C): ca chờ trễ vượt ngưỡng so với giờ hẹn gốc → xếp notification.
  const nguong = await docSoCaiDat(db, 'nguong_bao_tre_phut', 0)
  if (nguong > 0) await xepThongBaoLuiGio(db, rows, ketQua, suaTay, nguong)
}

// Xếp thông báo "lùi giờ" cho ca chờ đã trễ ≥ ngưỡng so với giờ hẹn gốc. Chống trùng
// bằng orders.tre_da_bao_phut: chỉ báo lại khi độ chậm tăng thêm trọn một ngưỡng nữa.
// Hết trễ (< ngưỡng) → reset mốc đã báo để lần trễ sau còn báo tiếp.
async function xepThongBaoLuiGio(
  db: Db, rows: HangGioHenRow[], ketQua: { id: number; gio_hen: string }[],
  suaTay: Map<number, boolean>, nguong: number,
): Promise<void> {
  const byId = new Map(rows.map((x) => [x.id, x]))
  for (const e of ketQua) {
    if (suaTay.get(e.id)) continue
    const row = byId.get(e.id)
    if (!row || row.status !== 'cho' || !row.gio_hen_goc) continue  // chưa có mốc gốc → bỏ
    const cham = Math.round((new Date(e.gio_hen).getTime() - new Date(row.gio_hen_goc).getTime()) / 60_000)
    const daBao = row.tre_da_bao_phut ?? 0
    if (cham >= nguong && cham - daBao >= nguong) {
      if (row.sdt) {
        const gio = gioHM(e.gio_hen) ?? ''
        await db.query(
          `INSERT INTO notifications (order_id, loai, noi_dung) VALUES ($1,'tre_gio',$2)`,
          [e.id, `Do có ca cấp cứu/ưu tiên, giờ chụp MRI của ${row.ho_ten} lùi khoảng ${cham} phút (dự kiến ${gio}). Mong quý khách thông cảm.`],
        )
      }
      await db.query(`UPDATE orders SET tre_da_bao_phut=$1 WHERE id=$2`, [cham, e.id])
    } else if (cham < nguong && daBao > 0) {
      await db.query(`UPDATE orders SET tre_da_bao_phut=0 WHERE id=$1`, [e.id])
    }
  }
}

// Tính lại giờ hẹn cho TẤT CẢ phòng — chạy lúc khởi động để điền giờ cho hàng chờ
// hiện có (trước mutation đầu tiên).
export async function capNhatTatCaPhong(now: Date = new Date()): Promise<void> {
  const rooms = await query<{ id: number }>('SELECT id FROM rooms')
  for (const rm of rooms) await capNhatGioHenPhong(pool, rm.id, now)
}

// ── Ghi nhật ký ───────────────────────────────────────────────────────────────
async function ghiLog(
  client: { query: (sql: string, p?: any[]) => Promise<any> },
  orderId: number, loai: string, cu: string | null, moi: string | null,
  userId: number | null, lyDo: string | null,
): Promise<void> {
  // nguon: không có userId = do hệ thống sinh (poller HIS, tự xếp); có = người thao tác.
  await client.query(
    `INSERT INTO change_log (order_id, loai, gia_tri_cu, gia_tri_moi, user_id, ly_do, nguon)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [orderId, loai, cu, moi, userId, lyDo, userId === null ? 'he_thong' : 'nguoi'],
  )
}

// ── Đổi trạng thái vòng đời ─────────────────────────────────────────────────
// (Route đã kiểm tra chuyển trạng thái hợp lệ bằng queueLogic trước khi gọi.)
export async function datTrangThai(
  id: number, cu: TrangThai, moi: TrangThai, loai: string, userId: number | null,
  room_id: number | null = null,
): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Khi ca được GỌI (→ dang_goi): chốt độ trễ THỰC TẾ bệnh nhân gánh = lúc gọi −
    // giờ hẹn gốc (kẹp sàn 0). Snapshot này là nguồn cho thống kê xu hướng độ chậm.
    await client.query(
      `UPDATE orders SET status=$1, updated_at=NOW(),
         cham_phut_khi_goi = CASE
           WHEN $1 = 'dang_goi' AND gio_hen_goc IS NOT NULL
           THEN GREATEST(0, ROUND(EXTRACT(EPOCH FROM (NOW() - gio_hen_goc)) / 60.0))::int
           ELSE cham_phut_khi_goi END
       WHERE id=$2`, [moi, id],
    )
    await ghiLog(client, id, loai, cu, moi, userId, null)
    // Vòng đời đổi (gọi/hoàn thành/quá lượt/gọi lại) → tính lại giờ hẹn hàng chờ phòng.
    if (room_id !== null) await capNhatGioHenPhong(client, room_id)
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK'); throw e
  } finally {
    client.release()
  }
}

// ── Đặt lại thứ tự hàng (KTV kéo/chen) ───────────────────────────────────────
export async function datThuTu(room_id: number, idsTheoThuTu: number[], userId: number | null): Promise<void> {
  const capNhat = danhSoThuTu(idsTheoThuTu)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const { id, queue_pos } of capNhat) {
      await client.query(
        `UPDATE orders SET queue_pos=$1, updated_at=NOW() WHERE id=$2 AND room_id=$3 AND status='cho'`,
        [queue_pos, id, room_id],
      )
    }
    await ghiLog(client, capNhat[0]?.id ?? 0, 'doi_thu_tu', null, idsTheoThuTu.join(','), userId, null)
    await capNhatGioHenPhong(client, room_id)
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK'); throw e
  } finally {
    client.release()
  }
}

// ── Sửa giờ hẹn (ghi đè tay) + xếp hàng thông báo đổi giờ ────────────────────
export async function datGioHen(id: number, iso: string | null, userId: number | null): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const cu = await client.query<{ gio_hen: Date | null; room_id: number | null }>(
      'SELECT gio_hen, room_id FROM orders WHERE id=$1', [id],
    )
    // Sửa giờ tay = cam kết MỚI với bệnh nhân → đặt lại mốc gốc = giờ mới (độ chậm
    // tính từ cam kết hiện hành). Bỏ giờ tay (iso=null) → gốc về NULL, capNhat tự đóng
    // băng lại. Reset luôn mốc "đã báo trễ".
    await client.query(
      `UPDATE orders SET gio_hen=$1, gio_hen_goc=$1, gio_hen_thu_cong=$2,
              tre_da_bao_phut=0, updated_at=NOW() WHERE id=$3`,
      [iso, iso !== null, id],
    )
    await ghiLog(client, id, 'doi_gio', cu.rows[0]?.gio_hen?.toISOString() ?? null, iso, userId, null)
    if (iso !== null) {
      await client.query(
        `INSERT INTO notifications (order_id, loai, noi_dung)
         VALUES ($1, 'doi_gio', $2)`,
        [id, `Giờ hẹn MRI được cập nhật: ${iso}`],
      )
    }
    // Ghi đè tay: ca này giữ nguyên (gio_hen_thu_cong=true); tính lại các ca còn lại.
    // Bỏ ghi đè (iso=null): ca này trở lại tự tính trong lượt capNhat này.
    const rid = cu.rows[0]?.room_id ?? null
    if (rid !== null) await capNhatGioHenPhong(client, rid)
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK'); throw e
  } finally {
    client.release()
  }
}

// ── Chuyển phòng (xuống cuối hàng phòng mới) ─────────────────────────────────
export async function chuyenPhong(id: number, room_id_moi: number, userId: number | null): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const cu = await client.query<{ room_id: number | null }>('SELECT room_id FROM orders WHERE id=$1', [id])
    const roomCu = cu.rows[0]?.room_id ?? null
    await client.query(
      `UPDATE orders
         SET room_id=$1,
             queue_pos=(SELECT COALESCE(MAX(queue_pos),0)+1 FROM orders WHERE room_id=$1 AND status='cho'),
             stt_ngay=(SELECT COALESCE(MAX(stt_ngay),0)+1 FROM orders
                       WHERE room_id=$1
                         AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                           = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
             updated_at=NOW()
       WHERE id=$2`,
      [room_id_moi, id],
    )
    await ghiLog(client, id, 'chuyen_phong', String(roomCu ?? ''), String(room_id_moi), userId, null)
    // Tính lại giờ hẹn cả phòng cũ (bớt 1 ca) lẫn phòng mới (thêm 1 ca cuối hàng).
    if (roomCu !== null && roomCu !== room_id_moi) await capNhatGioHenPhong(client, roomCu)
    await capNhatGioHenPhong(client, room_id_moi)
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK'); throw e
  } finally {
    client.release()
  }
}

// ── Đưa ca từ hàng GIỮ (nội trú) vào HÀNG THỜI GIAN ──────────────────────────
// KTV chủ động xếp ca nội trú vào buổi chiều: gán phòng đích + xuống cuối hàng +
// cấp STT trong ngày + bỏ cờ giữ, rồi tính lại giờ hẹn như mọi ca thường. Cho phép
// đổi phòng đích so với phòng tra sẵn (KTV chọn trong modal).
export async function vaoHang(id: number, room_id_moi: number, userId: number | null): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const cu = await client.query<{ room_id: number | null }>('SELECT room_id FROM orders WHERE id=$1', [id])
    const roomCu = cu.rows[0]?.room_id ?? null
    await client.query(
      `UPDATE orders
         SET room_id=$1, giu_hang=FALSE,
             queue_pos=(SELECT COALESCE(MAX(queue_pos),0)+1 FROM orders WHERE room_id=$1 AND status='cho'),
             stt_ngay=COALESCE(stt_ngay, (SELECT COALESCE(MAX(stt_ngay),0)+1 FROM orders
                       WHERE room_id=$1
                         AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                           = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)),
             updated_at=NOW()
       WHERE id=$2`,
      [room_id_moi, id],
    )
    await ghiLog(client, id, 'vao_hang', String(roomCu ?? ''), String(room_id_moi), userId, 'Nội trú vào hàng thời gian')
    // Phòng cũ (nếu khác) cũng tính lại; phòng mới có thêm ca cuối hàng.
    if (roomCu !== null && roomCu !== room_id_moi) await capNhatGioHenPhong(client, roomCu)
    await capNhatGioHenPhong(client, room_id_moi)
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK'); throw e
  } finally {
    client.release()
  }
}

// ── Đưa ca từ HÀNG THỜI GIAN ngược về hàng GIỮ (nội trú xếp chờ) ─────────────
// KTV rút một ca đang chờ ra khỏi hàng thời gian: bật cờ giữ, bỏ số/vị trí/giờ hẹn
// (về trạng thái "chờ xếp" sạch), giữ nguyên phòng đích. Chỉ áp cho ca 'cho'. Sau đó
// tính lại giờ hẹn cho các ca còn lại trong phòng. Ngược của [[vaoHang]].
export async function roiHang(id: number, userId: number | null): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const cu = await client.query<{ room_id: number | null; status: TrangThai }>(
      `SELECT room_id, status FROM orders WHERE id=$1 FOR UPDATE`, [id],
    )
    const row = cu.rows[0]
    if (!row || row.status !== 'cho') { await client.query('ROLLBACK'); return }
    await client.query(
      `UPDATE orders
         SET giu_hang=TRUE, queue_pos=NULL, stt_ngay=NULL,
             gio_hen=NULL, gio_hen_goc=NULL, gio_hen_thu_cong=FALSE,
             tre_da_bao_phut=0, updated_at=NOW()
       WHERE id=$1`,
      [id],
    )
    await ghiLog(client, id, 'roi_hang', String(row.room_id ?? ''), 'giu_hang', userId, 'Rút về hàng giữ (nội trú)')
    if (row.room_id !== null) await capNhatGioHenPhong(client, row.room_id)
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK'); throw e
  } finally {
    client.release()
  }
}

// ── Duyệt / gỡ nhãn ưu tiên ──────────────────────────────────────────────────
export async function duyetUuTien(id: number, priority_type_id: number | null, userId: number | null): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE orders SET priority_type_id=$1, priority_confirmed=$2, updated_at=NOW() WHERE id=$3`,
      [priority_type_id, priority_type_id !== null, id],
    )
    await ghiLog(client, id, 'duyet_uu_tien', null, priority_type_id === null ? 'bo' : String(priority_type_id), userId, null)
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK'); throw e
  } finally {
    client.release()
  }
}

// ── Tiếp nhận chỉ định (dùng chung HIS & nhập tay) ───────────────────────────
export interface KetQuaTiepNhan { id: number; moi: boolean; room_id: number | null }

interface ChenOrder {
  ma_his: string; ma_bn: string | null; ho_ten: string; tuoi: number | null
  sdt: string | null; ma_hh: string | null; ten_dich_vu: string | null
  ma_bs: string | null; room_id: number | null; nguon: 'his' | 'thu_cong' | 'dat_truoc'
  thoi_luong_phut: number | null
  ten_bs_chi_dinh: string | null; gio_chi_dinh: string | null
  his_meta: Record<string, unknown> | null   // trường HIS phụ (giới tính, khoa/phòng…) — [[hisPull]]
}

// Chèn một ca với room_id đã giải quyết sẵn. Idempotent theo ma_his (push HIS lặp
// → không xếp lại hàng). Tự gợi ý nhãn ưu tiên theo tuổi (KTV duyệt sau).
async function chenOrder(d: ChenOrder): Promise<KetQuaTiepNhan> {
  const nhom = await query<NhomUuTien>(
    `SELECT ma, quy_tac_goi_y FROM priority_types WHERE active = TRUE ORDER BY thu_tu, id`,
  )
  const meta = (d.his_meta ?? {}) as Record<string, unknown>
  const chuoiHoacNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)
  const duLieu: DuLieuUuTien = {
    tuoi: d.tuoi,
    phong: chuoiHoacNull(meta.phong_chi_dinh),
    khoa: chuoiHoacNull(meta.khoa_chi_dinh),
    doi_tuong: chuoiHoacNull(meta.doi_tuong),
    loai_dieu_tri: chuoiHoacNull(meta.loai_dieu_tri),
    gioi_tinh: chuoiHoacNull(meta.gioi_tinh),
    dich_vu: d.ten_dich_vu,
    ghi_chu: chuoiHoacNull(meta.ghi_chu),
  }
  const maNhom = goiYNhanUuTien(duLieu, nhom)
  const pt = maNhom
    ? await queryOne<{ id: number }>('SELECT id FROM priority_types WHERE ma=$1', [maNhom])
    : null

  // Luồng GIỮ HÀNG: ca khớp luật (mặc định Nội trú, trừ Cấp cứu) không tự hẹn giờ,
  // nằm hàng riêng đến khi KTV đưa vào hàng. Ca nhập tay không có his_meta → không giữ.
  const luatGiu = (await queryOne<{ gia_tri: string | null }>(
    `SELECT gia_tri FROM app_settings WHERE khoa='luat_giu_hang'`,
  ))?.gia_tri ?? null
  const giuHang = khopLuat(duLieu, luatGiu)

  const insert = await queryOne<{ id: number; room_id: number | null }>(
    `INSERT INTO orders (ma_his, ma_bn, ho_ten, tuoi, sdt, ma_hh, ten_dich_vu, ma_bs, nguon,
                         room_id, status, queue_pos, stt_ngay, priority_type_id, thoi_luong_phut,
                         ten_bs_chi_dinh, gio_chi_dinh, his_meta, giu_hang, his_last_seen,
                         tre_da_bao_phut)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'cho',
       CASE WHEN $10::int IS NULL OR $16 THEN NULL
            ELSE (SELECT COALESCE(MAX(queue_pos),0)+1 FROM orders WHERE room_id=$10 AND status='cho') END,
       CASE WHEN $10::int IS NULL OR $16 THEN NULL
            ELSE (SELECT COALESCE(MAX(stt_ngay),0)+1 FROM orders
                  WHERE room_id=$10
                    AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                      = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) END,
       $11, $12, $13, $14, $15::jsonb, $16,
       CASE WHEN $9 = 'his' THEN NOW() ELSE NULL END,
       0)  -- tre_da_bao_phut: cấp rõ ràng, không phụ thuộc DEFAULT của cột (tránh lỗi NOT NULL)
     ON CONFLICT (ma_his) DO NOTHING
     RETURNING id, room_id`,
    [d.ma_his, d.ma_bn, d.ho_ten, d.tuoi, d.sdt, d.ma_hh, d.ten_dich_vu, d.ma_bs, d.nguon, d.room_id, pt?.id ?? null, d.thoi_luong_phut, d.ten_bs_chi_dinh, d.gio_chi_dinh, d.his_meta ? JSON.stringify(d.his_meta) : null, giuHang],
  )

  if (insert) {
    // Ghi nhận CẤP CỨU CHEN HÀNG (tầng sâu): ca nhóm cấp cứu vào phòng đang có ca chờ.
    // Dùng để đếm số lượt chen + xu hướng theo khung giờ ([[thongKeRepo]]). Mã nhóm cấp
    // cứu cấu hình ở app_settings 'nhom_cap_cuu_ma' (mặc định 'cap_cuu').
    if (insert.room_id !== null && !giuHang && maNhom) {
      const emgMa = (await queryOne<{ gia_tri: string | null }>(
        `SELECT gia_tri FROM app_settings WHERE khoa='nhom_cap_cuu_ma'`,
      ))?.gia_tri ?? 'cap_cuu'
      if (maNhom === emgMa) {
        const dem = await queryOne<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM orders WHERE room_id=$1 AND status='cho' AND id<>$2`,
          [insert.room_id, insert.id],
        )
        if ((dem?.n ?? 0) > 0) {
          await query(
            `INSERT INTO change_log (order_id, loai, gia_tri_moi, nguon)
             VALUES ($1,'chen_cap_cuu',$2,'he_thong')`,
            [insert.id, String(dem!.n)],
          )
        }
      }
    }
    // Ca mới vào cuối hàng → tính lại giờ hẹn cả hàng phòng (nếu đã xếp phòng & không giữ).
    if (insert.room_id !== null && !giuHang) await capNhatGioHenPhong(pool, insert.room_id)
    return { id: insert.id, moi: true, room_id: insert.room_id }
  }

  const cu = await queryOne<{ id: number; room_id: number | null; status: string }>(
    'SELECT id, room_id, status FROM orders WHERE ma_his=$1', [d.ma_his],
  )

  // HỒI SINH: ca HIS từng bị đóng (thường do đối soát hủy khi HIS trả thiếu thoáng qua)
  // nay HIS lại báo chờ thực hiện → mở lại về 'cho', định tuyến/giữ hàng theo luật hiện
  // tại, giữ nguyên STT đã cấp nếu có, xếp xuống cuối hàng và tính lại giờ hẹn. Chỉ áp
  // dụng cho ca nguồn HIS (ca nhập tay do người đóng thì không tự mở). Đếm như "mới".
  if (cu && cu.status === 'huy' && d.nguon === 'his') {
    const moLai = await queryOne<{ id: number; room_id: number | null }>(
      `UPDATE orders SET
         status='cho', giu_hang=$2, room_id=$3, priority_type_id=$4,
         his_last_seen=NOW(), updated_at=NOW(),
         gio_hen=NULL, gio_hen_goc=NULL, gio_hen_thu_cong=FALSE,
         cham_phut_khi_goi=NULL, tre_da_bao_phut=0,
         queue_pos = CASE WHEN $3::int IS NULL OR $2 THEN NULL
           ELSE (SELECT COALESCE(MAX(queue_pos),0)+1 FROM orders WHERE room_id=$3 AND status='cho') END,
         stt_ngay = CASE WHEN $3::int IS NULL OR $2 THEN stt_ngay
           ELSE COALESCE(stt_ngay, (SELECT COALESCE(MAX(stt_ngay),0)+1 FROM orders
                 WHERE room_id=$3
                   AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                     = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)) END
       WHERE id=$1
       RETURNING id, room_id`,
      [cu.id, giuHang, d.room_id, pt?.id ?? null],
    )
    await ghiLog(pool, cu.id, 'his_mo_lai', 'huy', 'cho', null, 'HIS báo lại chờ thực hiện — mở lại ca')
    if (moLai?.room_id != null && !giuHang) await capNhatGioHenPhong(pool, moLai.room_id)
    return { id: cu.id, moi: true, room_id: moLai?.room_id ?? null }
  }

  // Ca đang hoạt động: poller bump his_last_seen hàng loạt mỗi vòng ([[hisPoller]]).
  return { id: cu!.id, moi: false, room_id: cu!.room_id }
}

// Đánh dấu "vừa thấy" cho mọi ca HIS còn hiệu lực trong lần kéo — mốc chống hủy oan.
// Gọi mỗi vòng TRƯỚC khi đối soát hủy ([[hisPoller]]).
export async function capNhatHisLastSeen(maHisConHieuLuc: string[]): Promise<void> {
  if (maHisConHieuLuc.length === 0) return
  await query(
    `UPDATE orders SET his_last_seen=NOW() WHERE nguon='his' AND ma_his = ANY($1::text[])`,
    [maHisConHieuLuc],
  )
}

// Tiếp nhận từ HIS (idempotent theo ma_his) — định tuyến phòng theo mã HH.
// ten_bs_chi_dinh/gio_chi_dinh: dữ liệu bổ sung từ API kéo ([[hisPull]]); push cũ bỏ trống.
export async function themTuHIS(
  o: OrderTiepNhan, ma_bs: string | null, ten_dich_vu: string | null,
  ten_bs_chi_dinh: string | null = null, gio_chi_dinh: string | null = null,
  his_meta: Record<string, unknown> | null = null,
): Promise<KetQuaTiepNhan> {
  const tuyen = o.ma_hh
    ? await queryOne<{ room_id: number }>('SELECT room_id FROM hh_routing WHERE ma_hh=$1', [o.ma_hh])
    : null
  return chenOrder({
    ma_his: o.ma_his, ma_bn: o.ma_bn, ho_ten: o.ho_ten, tuoi: o.tuoi, sdt: o.sdt,
    ma_hh: o.ma_hh, ten_dich_vu, ma_bs, room_id: tuyen?.room_id ?? null, nguon: 'his',
    thoi_luong_phut: null,   // HIS: lấy thời lượng chuẩn theo hh_routing
    ten_bs_chi_dinh, gio_chi_dinh, his_meta,
  })
}

// Điền bù his_meta cho ca đã có nhưng còn thiếu (ca tạo trước khi bổ sung trường, hoặc
// push cũ). Chỉ ghi khi đang NULL để không đè dữ liệu. Không đổi gì khác → không tính "mới".
export async function capNhatHisMeta(ma_his: string, his_meta: Record<string, unknown> | null): Promise<void> {
  if (!his_meta) return
  await query(
    `UPDATE orders SET his_meta = $2::jsonb WHERE ma_his = $1 AND his_meta IS NULL`,
    [ma_his, JSON.stringify(his_meta)],
  )
}

// Đóng ca khi HIS báo ĐÃ CHỤP XONG (TrangThai 2/3/4). Chỉ đụng ca còn hoạt động —
// ca đã 'hoan_thanh'/'huy' giữ nguyên (không hồi sinh, không ghi đè KTV hủy tay).
// Trả true nếu vừa đóng. Idempotent: gọi lại ca đã đóng → false.
export async function dongCaHIS(ma_his: string, userId: number | null): Promise<boolean> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const r = await client.query<{ id: number; status: TrangThai }>(
      `SELECT id, status FROM orders WHERE ma_his=$1 FOR UPDATE`, [ma_his],
    )
    const row = r.rows[0]
    if (!row || row.status === 'hoan_thanh' || row.status === 'huy') {
      await client.query('ROLLBACK'); return false
    }
    await client.query(`UPDATE orders SET status='hoan_thanh', updated_at=NOW() WHERE id=$1`, [row.id])
    await ghiLog(client, row.id, 'his_dong', row.status, 'hoan_thanh', userId, 'HIS báo đã chụp')
    await client.query('COMMIT')
    return true
  } catch (e) {
    await client.query('ROLLBACK'); throw e
  } finally {
    client.release()
  }
}

// Hủy các ca HIS đã BIẾN MẤT khỏi danh sách kéo (bác sĩ hủy chỉ định trên HIS). HIS
// không có cờ/trạng thái "Hủy" → ca bị hủy chỉ đơn giản không còn trong danh sách
// ([[hisPull]]). Đối soát theo sự VẮNG MẶT: ca nguồn HIS, tạo trong ngày (giờ VN),
// đang 'cho'/'qua_luot', mà ma_his KHÔNG nằm trong tập ma_his HIS vừa trả → chuyển
// 'huy'. KHÔNG đụng ca nhập tay (thu_cong), ca đang chụp (dang_goi), ca đã xong/đã hủy.
// An toàn: tập rỗng (nghi HIS lỗi/rỗng) → không hủy gì (poller đã chặn thêm một lớp).
// Trả số ca vừa hủy. Tính lại giờ hẹn các phòng có ca rời hàng.
export async function dongCacCaBiHuy(
  maHisConHieuLuc: string[], userId: number | null, graceGiay = 90,
): Promise<number> {
  if (maHisConHieuLuc.length === 0) return 0
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Chỉ hủy ca VẮNG MẶT LIÊN TỤC quá ngưỡng ân hạn (his_last_seen cũ hơn graceGiay) —
    // danh sách kéo HIS chập chờn nên thiếu thoáng qua 1–2 vòng KHÔNG được coi là hủy.
    const r = await client.query<{ id: number; room_id: number | null; status: TrangThai }>(
      `SELECT id, room_id, status FROM orders
        WHERE nguon = 'his'
          AND status IN ('cho','qua_luot')
          AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
            = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
          AND ma_his <> ALL($1::text[])
          AND (his_last_seen IS NULL OR his_last_seen < NOW() - make_interval(secs => $2::double precision))
        FOR UPDATE`,
      [maHisConHieuLuc, graceGiay],
    )
    const rows = r.rows
    for (const row of rows) {
      await client.query(`UPDATE orders SET status='huy', updated_at=NOW() WHERE id=$1`, [row.id])
      await ghiLog(client, row.id, 'his_huy', row.status, 'huy', userId, 'HIS hủy chỉ định (biến mất khỏi danh sách kéo)')
    }
    const phong = [...new Set(rows.map((x) => x.room_id).filter((x): x is number => x !== null))]
    for (const rid of phong) await capNhatGioHenPhong(client, rid)
    await client.query('COMMIT')
    return rows.length
  } catch (e) {
    await client.query('ROLLBACK'); throw e
  } finally {
    client.release()
  }
}

// Nhập tay (dự phòng khi mất kết nối HIS). KTV chọn phòng trực tiếp; mã HIS tạm tự
// sinh (tiền tố TC) để không trùng và vẫn truy vết được là ca nhập tay.
export interface OrderThuCong {
  ho_ten: string; tuoi: number | null; sdt: string | null
  room_id: number | null; ten_dich_vu: string | null; ma_bs: string | null; ma_hh: string | null
  thoi_luong_phut: number | null
}
export function themThuCong(d: OrderThuCong): Promise<KetQuaTiepNhan> {
  const ma_his = `TC-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  return chenOrder({
    ma_his, ma_bn: null, ho_ten: d.ho_ten, tuoi: d.tuoi, sdt: d.sdt,
    ma_hh: d.ma_hh, ten_dich_vu: d.ten_dich_vu, ma_bs: d.ma_bs, room_id: d.room_id, nguon: 'thu_cong',
    thoi_luong_phut: d.thoi_luong_phut,
    ten_bs_chi_dinh: null, gio_chi_dinh: null, his_meta: null,
  })
}

// ── Đặt lịch hẹn trước ───────────────────────────────────────────────────────
// Phiếu hẹn tạo TRƯỚC giờ chụp: vào hàng chờ NGAY như ca nhập tay, nhưng giờ hẹn do
// KTV điền và ĐÓNG BĂNG (gio_hen_thu_cong). ma_his tự sinh (tiền tố DT-) để không trùng
// và truy vết được là phiếu đặt trước. Khi HIS đẩy chỉ định thật → gợi ý ghép
// ([[ghepDatTruoc]] timCapGhepDatTruoc); KTV xác nhận thì gọi ghepDatTruoc bên dưới.
export interface OrderDatTruoc {
  ho_ten: string; tuoi: number | null; sdt: string | null; ma_bn: string | null
  room_id: number; ten_dich_vu: string | null; ma_hh: string | null; ma_bs: string | null
  gio_hen: string   // ISO 8601 — giờ đã hẹn với bệnh nhân
}
export async function themDatTruoc(d: OrderDatTruoc, userId: number | null): Promise<KetQuaTiepNhan> {
  const ma_his = `DT-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  const kq = await chenOrder({
    ma_his, ma_bn: d.ma_bn, ho_ten: d.ho_ten, tuoi: d.tuoi, sdt: d.sdt,
    ma_hh: d.ma_hh, ten_dich_vu: d.ten_dich_vu, ma_bs: d.ma_bs, room_id: d.room_id,
    nguon: 'dat_truoc', thoi_luong_phut: null,
    ten_bs_chi_dinh: null, gio_chi_dinh: null, his_meta: null,
  })
  // Đóng băng giờ hẹn KTV điền (gio_hen_thu_cong=TRUE, hàng không tự tính lại).
  await datGioHen(kq.id, d.gio_hen, userId)
  return kq
}

// Ghép phiếu đặt trước vào ca HIS thật: GIỮ dòng HIS (có ma_his → HIS tự đóng ca),
// CHÉP giờ hẹn đã hứa từ phiếu sang (đóng băng), rồi XÓA phiếu. KTV xác nhận thủ công.
// Trả true nếu ghép được (phiếu + ca HIS còn hợp lệ).
export async function ghepDatTruoc(datTruocId: number, hisId: number, userId: number | null): Promise<boolean> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const r = await client.query<{ id: number; nguon: string; status: TrangThai; room_id: number | null; gio_hen: Date | null }>(
      `SELECT id, nguon, status, room_id, gio_hen FROM orders WHERE id IN ($1,$2) FOR UPDATE`,
      [datTruocId, hisId],
    )
    const phieu = r.rows.find((x) => x.id === datTruocId)
    const his = r.rows.find((x) => x.id === hisId)
    if (!phieu || !his || phieu.nguon !== 'dat_truoc' || his.nguon !== 'his'
      || his.status === 'hoan_thanh' || his.status === 'huy') {
      await client.query('ROLLBACK'); return false
    }
    const gioHen = phieu.gio_hen ? phieu.gio_hen.toISOString() : null
    // Chép giờ đã hứa sang ca HIS, đóng băng để hàng không tự tính lại; reset mốc báo trễ.
    await client.query(
      `UPDATE orders SET gio_hen=$1, gio_hen_goc=$1, gio_hen_thu_cong=TRUE,
              tre_da_bao_phut=0, updated_at=NOW() WHERE id=$2`,
      [gioHen, hisId],
    )
    await ghiLog(client, hisId, 'ghep_dat_truoc', String(datTruocId), gioHen, userId,
      `Ghép phiếu đặt trước #${datTruocId} — lấy giờ hẹn ${gioHen ?? '(trống)'}`)
    // Xóa phiếu (change_log/notifications của phiếu cascade theo FK).
    await client.query(`DELETE FROM orders WHERE id=$1`, [datTruocId])
    const phong = [...new Set([phieu.room_id, his.room_id].filter((x): x is number => x !== null))]
    for (const rid of phong) await capNhatGioHenPhong(client, rid)
    await client.query('COMMIT')
    return true
  } catch (e) {
    await client.query('ROLLBACK'); throw e
  } finally {
    client.release()
  }
}

// "Để riêng": bỏ qua gợi ý ghép cho phiếu đặt trước này (sống độc lập như ca nhập tay).
export async function boQuaGhep(id: number, userId: number | null): Promise<void> {
  await query(`UPDATE orders SET ghep_bo_qua=TRUE, updated_at=NOW() WHERE id=$1 AND nguon='dat_truoc'`, [id])
  await query(
    `INSERT INTO change_log (order_id, loai, gia_tri_moi, user_id, ly_do, nguon)
     VALUES ($1,'ghep_bo_qua','bo_qua',$2,'KTV để phiếu đặt trước riêng (không ghép)',$3)`,
    [id, userId, userId === null ? 'he_thong' : 'nguoi'],
  )
}

// Thời điểm gần nhất nhận được ca TỪ HIS (để màn KTV cảnh báo mất kết nối HIS).
export const layHisCuoi = () =>
  queryOne<{ his_cuoi: Date | null }>(
    `SELECT MAX(created_at) AS his_cuoi FROM orders WHERE nguon = 'his'`,
  )
