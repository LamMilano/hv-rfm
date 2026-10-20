import { createRouter, createWebHistory } from 'vue-router'
import { useAuth, trangMacDinh } from '@/stores/auth'
import type { VaiTro } from '@/types'

// 6 màn hình (§11). Mỗi route khai báo vai trò được vào (admin vào được tất cả).
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dang-nhap' },
    { path: '/dang-nhap', name: 'login', component: () => import('@/views/LoginView.vue') },
    { path: '/ktv', name: 'ktv', component: () => import('@/views/KtvView.vue'), meta: { roles: ['ktv', 'admin'] } },
    { path: '/bac-si', name: 'bac-si', component: () => import('@/views/BacSiView.vue'), meta: { roles: ['bac_si', 'admin'] } },
    { path: '/quan-tri/tong-quan', name: 'tong-quan', component: () => import('@/views/TongQuanView.vue'), meta: { roles: ['admin'] } },
    { path: '/quan-tri/thong-ke', name: 'thong-ke', component: () => import('@/views/ThongKeView.vue'), meta: { roles: ['admin'] } },
    { path: '/quan-tri/nhat-ky', name: 'nhat-ky', component: () => import('@/views/NhatKyView.vue'), meta: { roles: ['admin'] } },
    { path: '/quan-tri', name: 'admin', component: () => import('@/views/AdminView.vue'), meta: { roles: ['admin'] } },
    { path: '/man-hinh-tong', name: 'tong', component: () => import('@/views/ManHinhTongView.vue'), meta: { roles: ['ktv', 'bac_si', 'admin'] } },
    { path: '/man-hinh-sanh', name: 'sanh', component: () => import('@/views/ManHinhSanhView.vue'), meta: { roles: ['ktv', 'bac_si', 'admin'] } },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuth()

  // Có token nhưng chưa có thông tin người dùng (vừa F5) → khôi phục phiên.
  if (auth.token && !auth.user) await auth.khoiPhuc()

  if (to.name === 'login') {
    return auth.daDangNhap ? trangMacDinh(auth.vaiTro) : true
  }

  if (!auth.daDangNhap) {
    return { name: 'login', query: to.fullPath !== '/' ? { next: to.fullPath } : undefined }
  }

  const roles = to.meta.roles as VaiTro[] | undefined
  if (roles && auth.vaiTro && !roles.includes(auth.vaiTro)) {
    return trangMacDinh(auth.vaiTro)
  }
  return true
})

// Vừa deploy bản mới → chunk cũ không còn. Tải lại trang đến đúng route (chỉ 1 lần, tránh vòng lặp).
router.onError((err, to) => {
  const msg = String((err as Error)?.message ?? err)
  if (!/dynamically imported module|Importing a module script failed|Failed to fetch/i.test(msg)) return
  const KEY = 'mri-chunk-reload'
  if (sessionStorage.getItem(KEY) === to.fullPath) return
  sessionStorage.setItem(KEY, to.fullPath)
  window.location.assign(to.fullPath)
})
router.afterEach(() => sessionStorage.removeItem('mri-chunk-reload'))

export default router
