// Lớp dữ liệu cấu hình (trang quản trị): phòng, tuyến mã HH, nhóm ưu tiên, người
// dùng, mẫu thông báo. Mật khẩu nội bộ băm bcrypt, KHÔNG trả ra ngoài.

import bcrypt from 'bcryptjs'
import { pool, query, queryOne } from '../db/pool'
import type { UserRow } from './userRepo'

export interface Room { id: number; ma_phong: string; ten: string; lien_he: string | null; active: boolean }
export interface HhRoutingRow { ma_hh: string; room_id: number; ten_phong: string; thoi_luong_phut: number; mo_ta: string | null }
export interface PriorityTypeRow { id: number; ma: string; ten: string; viet_tat: string | null; mau: string | null; quy_tac_goi_y: string | null; thu_tu: number; active: boolean }
export interface UserListRow { id: number; ma_nv: string | null; ho_ten: string; sdt: string | null; role: string; ma_bs: string | null; nguon_xac_thuc: string; active: boolean }

export const layRooms = () =>
  query<Room>('SELECT id, ma_phong, ten, lien_he, active FROM rooms WHERE active = TRUE ORDER BY id')

export const layHhRouting = () =>
  query<HhRoutingRow>(
    `SELECT hr.ma_hh, hr.room_id, r.ten AS ten_phong, hr.thoi_luong_phut, hr.mo_ta
     FROM hh_routing hr JOIN rooms r ON r.id = hr.room_id ORDER BY hr.ma_hh`,
  )

// Lưu tuyến rồi xếp luôn các ca đang chờ bị treo (HIS gửi mã HH lúc chưa cấu hình)
// vào cuối hàng phòng mới, theo thứ tự đến. Trả số ca vừa được xếp.
export async function luuHhRouting(
  ma_hh: string, room_id: number, thoi_luong_phut: number, mo_ta: string | null,
): Promise<number> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO hh_routing (ma_hh, room_id, thoi_luong_phut, mo_ta)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (ma_hh) DO UPDATE SET room_id=$2, thoi_luong_phut=$3, mo_ta=$4`,
      [ma_hh, room_id, thoi_luong_phut, mo_ta],
    )
    const r = await client.query(
      `UPDATE orders o
         SET room_id = $2,
             queue_pos = x.base + x.rn,
             updated_at = NOW()
       FROM (
         SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn,
                (SELECT COALESCE(MAX(queue_pos),0) FROM orders WHERE room_id=$2 AND status='cho') AS base
         FROM orders WHERE ma_hh=$1 AND room_id IS NULL AND status='cho' AND NOT giu_hang
       ) x
       WHERE o.id = x.id`,
      [ma_hh, room_id],
    )
    await client.query('COMMIT')
    return r.rowCount ?? 0
  } catch (e) {
    await client.query('ROLLBACK'); throw e
  } finally {
    client.release()
  }
}

// Mã HH đang có ca chờ bị treo (chưa cấu hình) — gợi ý cho Admin bổ sung.
export const layMaHhChuaCauHinh = () =>
  query<{ ma_hh: string; ten_dich_vu: string | null; so_ca: number }>(
    `SELECT o.ma_hh, MAX(o.ten_dich_vu) AS ten_dich_vu, COUNT(*)::int AS so_ca
     FROM orders o
     WHERE o.room_id IS NULL AND o.status = 'cho' AND o.ma_hh IS NOT NULL
     GROUP BY o.ma_hh ORDER BY so_ca DESC, o.ma_hh`,
  )

export const xoaHhRouting = (ma_hh: string) =>
  query('DELETE FROM hh_routing WHERE ma_hh=$1', [ma_hh])

export const layPriorityTypes = () =>
  query<PriorityTypeRow>('SELECT id, ma, ten, viet_tat, mau, quy_tac_goi_y, thu_tu, active FROM priority_types ORDER BY thu_tu, id')

export const luuPriorityType = (
  ma: string, ten: string, viet_tat: string | null, mau: string | null,
  quy_tac_goi_y: string | null, thu_tu: number,
) =>
  query(
    `INSERT INTO priority_types (ma, ten, viet_tat, mau, quy_tac_goi_y, thu_tu)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (ma) DO UPDATE SET ten=$2, viet_tat=$3, mau=$4, quy_tac_goi_y=$5, thu_tu=$6`,
    [ma, ten, viet_tat, mau, quy_tac_goi_y, thu_tu],
  )

export const layUsers = () =>
  query<UserListRow>(
    `SELECT id, ma_nv, ho_ten, sdt, role, ma_bs, nguon_xac_thuc, active FROM users ORDER BY id`,
  )

export async function taoUser(d: {
  ma_nv: string | null; ho_ten: string; sdt: string | null; role: string; ma_bs: string | null;
  nguon_xac_thuc: 'hrm' | 'noi_bo'; mat_khau?: string | null
}): Promise<void> {
  const hash = d.nguon_xac_thuc === 'noi_bo' && d.mat_khau ? await bcrypt.hash(d.mat_khau, 10) : null
  await query(
    `INSERT INTO users (ma_nv, ho_ten, sdt, role, ma_bs, nguon_xac_thuc, password_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [d.ma_nv, d.ho_ten, d.sdt, d.role, d.ma_bs, d.nguon_xac_thuc, hash],
  )
}

export const datTrangThaiUser = (id: number, active: boolean) =>
  query('UPDATE users SET active=$1 WHERE id=$2', [active, id])

// Cập nhật vai trò / mã BS / trạng thái cho 1 user (lưới phân quyền trang admin).
// Chỉ đụng các trường được truyền; mã NV & nguồn xác thực giữ nguyên.
export function capNhatUser(
  id: number, d: { role?: string; sdt?: string | null; ma_bs?: string | null; active?: boolean },
): Promise<unknown> {
  const set: string[] = []; const val: unknown[] = []
  if (d.role !== undefined) { val.push(d.role); set.push(`role=$${val.length}`) }
  if (d.sdt !== undefined) { val.push(d.sdt); set.push(`sdt=$${val.length}`) }
  if (d.ma_bs !== undefined) { val.push(d.ma_bs); set.push(`ma_bs=$${val.length}`) }
  if (d.active !== undefined) { val.push(d.active); set.push(`active=$${val.length}`) }
  if (!set.length) return Promise.resolve(null)
  val.push(id)
  return query(`UPDATE users SET ${set.join(', ')} WHERE id=$${val.length}`, val)
}

// Thêm hàng loạt người dùng HIS (nguồn xác thực 'hrm', không mật khẩu). Trùng mã NV
// thì bỏ qua (idempotent) — chạy trong một transaction, trả số tạo mới / bỏ qua.
export async function taoNhieuUser(
  ds: { ma_nv: string; ho_ten: string; role: string; ma_bs: string | null }[],
): Promise<{ tao_moi: number; bo_qua: number }> {
  const client = await pool.connect()
  let tao_moi = 0
  try {
    await client.query('BEGIN')
    for (const d of ds) {
      const r = await client.query(
        `INSERT INTO users (ma_nv, ho_ten, role, ma_bs, nguon_xac_thuc)
         VALUES ($1,$2,$3,$4,'hrm')
         ON CONFLICT (ma_nv) WHERE ma_nv IS NOT NULL DO NOTHING`,
        [d.ma_nv, d.ho_ten, d.role, d.ma_bs],
      )
      if (r.rowCount) tao_moi++
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK'); throw e
  } finally {
    client.release()
  }
  return { tao_moi, bo_qua: ds.length - tao_moi }
}

// Tự tạo người dùng khi đăng nhập HIS hợp lệ mà chưa có bản ghi (JIT). Vai trò mặc
// định KTV; admin nâng quyền sau. Họ tên tạm = "NV <mã>" (admin sửa ở lưới).
export const taoUserJIT = (ma_nv: string) =>
  queryOne<UserRow>(
    `INSERT INTO users (ma_nv, ho_ten, role, nguon_xac_thuc)
     VALUES ($1,$2,'bac_si','hrm')
     RETURNING id, ma_nv, ho_ten, sdt, role, ma_bs, nguon_xac_thuc, password_hash, active`,
    [ma_nv, `NV ${ma_nv}`],
  )

export const laySettingDon = (khoa: string) =>
  queryOne<{ gia_tri: string | null }>('SELECT gia_tri FROM app_settings WHERE khoa=$1', [khoa])

// ── Thống kê bảng điều khiển (admin) ─────────────────────────────────────────
export interface DemDashboard {
  ca_hom_nay: number; dang_cho: number; dang_phuc_vu: number;
  da_chup_hom_nay: number; his_cuoi: Date | null
}
export const demDashboard = () =>
  queryOne<DemDashboard>(
    `SELECT
       COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                              = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::int AS ca_hom_nay,
       COUNT(*) FILTER (WHERE status = 'cho')::int AS dang_cho,
       COUNT(*) FILTER (WHERE status = 'dang_goi')::int AS dang_phuc_vu,
       COUNT(*) FILTER (WHERE status = 'hoan_thanh'
                          AND (updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                            = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::int AS da_chup_hom_nay,
       MAX(created_at) AS his_cuoi
     FROM orders`,
  )

export const hangDoiTheoPhong = () =>
  query<{ id: number; ten: string; dang_cho: number; dang_phuc_vu: number }>(
    `SELECT r.id, r.ten,
            COUNT(o.id) FILTER (WHERE o.status = 'cho')::int AS dang_cho,
            COUNT(o.id) FILTER (WHERE o.status = 'dang_goi')::int AS dang_phuc_vu
     FROM rooms r LEFT JOIN orders o ON o.room_id = r.id
     WHERE r.active = TRUE
     GROUP BY r.id, r.ten ORDER BY r.id`,
  )

export const demUserTheoVaiTro = () =>
  query<{ role: string; so: number }>(
    `SELECT role, COUNT(*)::int AS so FROM users WHERE active = TRUE GROUP BY role`,
  )

export const laySettings = () =>
  query<{ khoa: string; gia_tri: string | null }>('SELECT khoa, gia_tri FROM app_settings')

export const luuSetting = (khoa: string, gia_tri: string) =>
  query(
    `INSERT INTO app_settings (khoa, gia_tri, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (khoa) DO UPDATE SET gia_tri=$2, updated_at=NOW()`,
    [khoa, gia_tri],
  )
