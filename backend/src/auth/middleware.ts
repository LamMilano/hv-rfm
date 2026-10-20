// Middleware bảo vệ route. Ba lớp:
//  - yeuCauDangNhap : bắt buộc có JWT hợp lệ (gắn req.nguoiDung).
//  - yeuCauVaiTro   : chặn theo vai trò (ktv/bac_si/admin).
//  - xacThucApiKey  : khóa riêng cho HIS push (tách khỏi JWT người dùng).

import type { Request, Response, NextFunction } from 'express'
import { giaiToken, type VaiTro } from './jwt'

export function yeuCauDangNhap(req: Request, res: Response, next: NextFunction): void {
  const h = req.headers.authorization
  const token = h && h.startsWith('Bearer ') ? h.slice(7) : null
  const payload = token ? giaiToken(token) : null
  if (!payload) {
    res.status(401).json({ error: 'Chưa đăng nhập hoặc phiên đã hết hạn' })
    return
  }
  req.nguoiDung = payload
  next()
}

export function yeuCauVaiTro(...roles: VaiTro[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.nguoiDung) {
      res.status(401).json({ error: 'Chưa đăng nhập' })
      return
    }
    if (!roles.includes(req.nguoiDung.role)) {
      res.status(403).json({ error: 'Tài khoản không đủ quyền cho thao tác này' })
      return
    }
    next()
  }
}

// So khớp theo thời gian hằng định để tránh dò khóa qua độ trễ.
function bangNhau(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let kh = 0
  for (let i = 0; i < a.length; i++) kh |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return kh === 0
}

export function xacThucApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = process.env.HIS_PUSH_API_KEY
  if (!key) {
    res.status(503).json({ error: 'HIS push chưa cấu hình khóa trên server' })
    return
  }
  const got = req.headers['x-api-key']
  if (typeof got !== 'string' || !bangNhau(got, key)) {
    res.status(401).json({ error: 'Sai hoặc thiếu API key' })
    return
  }
  next()
}
