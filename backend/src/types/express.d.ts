// Gắn người dùng đã xác thực vào req (đặt bởi middleware yeuCauDangNhap).
import type { TokenPayload } from '../auth/jwt'

declare global {
  namespace Express {
    interface Request {
      nguoiDung?: TokenPayload
    }
  }
}

export {}
