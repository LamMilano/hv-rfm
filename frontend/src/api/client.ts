import axios from 'axios'

// Client gọi API dùng chung. Base '/api' đi qua proxy Vite (dev) hoặc cùng origin
// (production sau Nginx). Token JWT gắn tự động; 401 → báo lên tầng xác thực.
export const api = axios.create({ baseURL: '/api' })

export const KHOA_TOKEN = 'mri_token'

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem(KHOA_TOKEN)
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// Khi phiên hết hạn / không hợp lệ, tầng xác thực đăng ký callback để đưa về trang
// đăng nhập. Không gọi trực tiếp router ở đây để tránh phụ thuộc vòng.
let khiHetPhien: (() => void) | null = null
export function dangKyKhiHetPhien(cb: () => void) { khiHetPhien = cb }

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url: string = err.config?.url ?? ''
    // Bỏ qua chính endpoint đăng nhập (sai mật khẩu cũng trả 401).
    if (err.response?.status === 401 && !url.includes('/auth/login')) {
      khiHetPhien?.()
    }
    return Promise.reject(err)
  },
)

// Rút thông điệp lỗi thân thiện từ phản hồi API.
export function thongDiepLoi(err: unknown, macDinh = 'Có lỗi xảy ra, vui lòng thử lại.'): string {
  const e = err as { response?: { data?: { error?: string } } }
  return e?.response?.data?.error ?? macDinh
}
