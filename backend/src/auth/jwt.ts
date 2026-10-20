// Ký / giải JWT cho phiên người dùng. Payload chỉ chứa thứ app cần để phân quyền
// và lọc "ca của tôi" — KHÔNG đựng bí mật. Vai trò/phòng là của app (CSDL app là
// nguồn chuẩn), không lấy từ HIS. Xem [[hisAuth]].

import jwt from 'jsonwebtoken'

export type VaiTro = 'ktv' | 'bac_si' | 'admin'

export interface TokenPayload {
  uid: number
  role: VaiTro
  ho_ten: string
  ma_bs: string | null
}

// Phiên 12 giờ: đủ 1 ca trực, hết giờ thì đăng nhập lại.
const HAN_TOKEN = '12h'

export function kyToken(p: TokenPayload): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('Thiếu JWT_SECRET — không thể ký token')
  return jwt.sign(p, secret, { expiresIn: HAN_TOKEN })
}

// Trả payload nếu token hợp lệ & còn hạn, ngược lại null (không ném lỗi ra ngoài).
export function giaiToken(token: string): TokenPayload | null {
  const secret = process.env.JWT_SECRET
  if (!secret) return null
  try {
    const d = jwt.verify(token, secret) as jwt.JwtPayload & TokenPayload
    if (typeof d.uid !== 'number' || !d.role) return null
    return { uid: d.uid, role: d.role, ho_ten: d.ho_ten, ma_bs: d.ma_bs ?? null }
  } catch {
    return null
  }
}
