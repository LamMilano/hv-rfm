// Truy vấn người dùng. CSDL app là nguồn chuẩn cho vai trò/phòng/quyền (dù xác
// thực mật khẩu có thể qua HIS). Xem [[hisAuth]], [[jwt]].

import { queryOne } from '../db/pool'

export interface UserRow {
  id: number
  ma_nv: string | null
  ho_ten: string
  sdt: string | null
  role: 'ktv' | 'bac_si' | 'admin'
  ma_bs: string | null
  nguon_xac_thuc: 'hrm' | 'noi_bo'
  password_hash: string | null
  active: boolean
}

export function timTheoMaNV(ma_nv: string): Promise<UserRow | null> {
  return queryOne<UserRow>('SELECT * FROM users WHERE ma_nv = $1 AND active = TRUE', [ma_nv])
}

export function timTheoId(id: number): Promise<UserRow | null> {
  return queryOne<UserRow>('SELECT * FROM users WHERE id = $1 AND active = TRUE', [id])
}
