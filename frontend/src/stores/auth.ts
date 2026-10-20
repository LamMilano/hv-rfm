import { defineStore } from 'pinia'
import { apiAuth } from '@/api/endpoints'
import { KHOA_TOKEN } from '@/api/client'
import type { NguoiDung, VaiTro } from '@/types'

// Phiên đăng nhập. Token giữ ở localStorage để F5 không mất phiên; thông tin người
// dùng khôi phục qua /auth/me lúc khởi động.
export const useAuth = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(KHOA_TOKEN) as string | null,
    user: null as NguoiDung | null,
    dangKhoiPhuc: false,
  }),
  getters: {
    daDangNhap: (s) => !!s.token,
    vaiTro: (s): VaiTro | null => s.user?.role ?? null,
  },
  actions: {
    async dangNhap(ma_nv: string, mat_khau: string) {
      const kq = await apiAuth.dangNhap(ma_nv, mat_khau)
      this.token = kq.token
      this.user = kq.user
      localStorage.setItem(KHOA_TOKEN, kq.token)
    },
    // Khôi phục phiên khi mở app (có token nhưng chưa có user).
    async khoiPhuc() {
      if (!this.token || this.user) return
      this.dangKhoiPhuc = true
      try {
        this.user = await apiAuth.toiLaAi()
      } catch {
        this.dangXuat()
      } finally {
        this.dangKhoiPhuc = false
      }
    },
    dangXuat() {
      this.token = null
      this.user = null
      localStorage.removeItem(KHOA_TOKEN)
    },
  },
})

// Trang mặc định theo vai trò (điều hướng sau đăng nhập / khi vào '/').
export function trangMacDinh(role: VaiTro | null): string {
  switch (role) {
    case 'admin': return '/quan-tri/tong-quan'
    case 'bac_si': return '/bac-si'
    case 'ktv': return '/ktv'
    default: return '/dang-nhap'
  }
}
