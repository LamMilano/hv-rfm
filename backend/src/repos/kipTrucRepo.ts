// Lớp dữ liệu kíp KTV trực MRI theo ngày (giờ VN). Đọc kíp hôm nay cho mọi màn hình;
// sửa kíp = thay toàn bộ dòng của ngày hôm nay trong một transaction. Kíp chỉ cần
// tên (chọn từ danh sách KTV trong hệ thống) + SĐT; không còn trường vai trò/phòng.

import { pool, query } from '../db/pool'

export interface KipTrucRow { id: number; ho_ten: string; sdt: string | null }
export interface KipTrucNhap { ho_ten: string; sdt: string | null }
export interface KtvChonRow { ho_ten: string; sdt: string | null }

// Kíp của NGÀY HÔM NAY theo giờ Việt Nam.
export const layKipHomNay = () =>
  query<KipTrucRow>(
    `SELECT id, ho_ten, sdt FROM kip_truc
     WHERE ngay = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
     ORDER BY thu_tu, id`,
  )

// Danh sách KTV đang hoạt động (cho ô chọn khi nhập kíp) — tên + SĐT trong hồ sơ.
export const layDanhSachKtv = () =>
  query<KtvChonRow>(
    `SELECT ho_ten, sdt FROM users
     WHERE role = 'ktv' AND active = TRUE
     ORDER BY ho_ten`,
  )

// Thay toàn bộ kíp hôm nay bằng danh sách mới (đã làm sạch ở route).
export async function datKipHomNay(ds: KipTrucNhap[]): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `DELETE FROM kip_truc WHERE ngay = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`,
    )
    for (let i = 0; i < ds.length; i++) {
      const r = ds[i]
      await client.query(
        `INSERT INTO kip_truc (ngay, ho_ten, sdt, thu_tu)
         VALUES ((NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, $1, $2, $3)`,
        [r.ho_ten, r.sdt, i],
      )
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK'); throw e
  } finally {
    client.release()
  }
}
