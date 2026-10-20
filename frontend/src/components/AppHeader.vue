<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth, trangMacDinh } from '@/stores/auth'
import type { VaiTro } from '@/types'

withDefaults(defineProps<{
  tieuDe: string          // tên module (vd "Điều phối hàng chờ MRI")
  gioCapNhat?: string     // mốc cập nhật hiển thị ở badge SSE
  dieuHuong?: boolean     // hiện thanh điều hướng (tắt ở màn hình TV)
  quayLai?: boolean       // nút quay lại trang chính theo vai trò (màn hình TV)
}>(), { dieuHuong: true, quayLai: false })

const auth = useAuth()
const router = useRouter()
const route = useRoute()

const VAI_TRO: Record<string, string> = { ktv: 'KTV', bac_si: 'BS', admin: 'Quản trị' }
const tenHienThi = computed(() => {
  if (!auth.user) return ''
  const tien = VAI_TRO[auth.user.role]
  return tien ? `${tien}. ${auth.user.ho_ten}` : auth.user.ho_ten
})

// Thanh điều hướng — lọc theo vai trò (admin thấy tất cả).
const MAN_HINH: { ten: string; route: string; roles: VaiTro[] }[] = [
  { ten: 'Tổng quan', route: 'tong-quan', roles: ['admin'] },
  { ten: 'Điều phối', route: 'ktv', roles: ['ktv', 'admin'] },
  { ten: 'Danh sách MRI', route: 'bac-si', roles: ['bac_si', 'admin'] },
  { ten: 'Màn hình khoa', route: 'tong', roles: ['ktv', 'bac_si', 'admin'] },
  { ten: 'Màn hình sảnh', route: 'sanh', roles: ['ktv', 'bac_si', 'admin'] },
  { ten: 'Thống kê', route: 'thong-ke', roles: ['admin'] },
  { ten: 'Nhật ký', route: 'nhat-ky', roles: ['admin'] },
  { ten: 'Cấu hình', route: 'admin', roles: ['admin'] },
]
const menu = computed(() => {
  const vt = auth.vaiTro
  return vt ? MAN_HINH.filter((m) => m.roles.includes(vt)) : []
})

function veTrangChinh() {
  router.push(trangMacDinh(auth.vaiTro))
}

function dangXuat() {
  auth.dangXuat()
  router.push({ name: 'login' })
}
</script>

<template>
 <div class="shrink-0">
  <header class="h-[46px] shrink-0 bg-hv flex items-center px-2.5 sm:px-3.5 gap-2 sm:gap-3 text-white">
    <button
      v-if="quayLai && auth.daDangNhap"
      @click="veTrangChinh"
      class="shrink-0 text-[11px] sm:text-[12px] font-semibold bg-white/15 hover:bg-white/25 border border-white/25 rounded px-2 py-[4px]"
      title="Quay lại trang làm việc"
    >← <span class="hidden sm:inline">Quay lại</span></button>
    <div class="w-[30px] h-[30px] rounded-[5px] bg-white p-0.5 box-border flex items-center justify-center shrink-0">
      <img src="/logo-bvhv.jpg" alt="Logo Bệnh viện Đa khoa Hùng Vương" class="w-full h-full object-contain" />
    </div>
    <div class="leading-tight min-w-0">
      <div class="font-extrabold text-[11px] sm:text-[12.5px] truncate">Bệnh viện Đa khoa Hùng Vương</div>
      <div class="text-[9px] text-[#cfe4fb] font-medium hidden sm:block">Tận tâm · Liêm chính · Nhân văn</div>
    </div>
    <div class="w-px h-6 bg-white/30 hidden sm:block"></div>
    <span
      class="shrink-0 hidden sm:inline text-[10px] font-extrabold tracking-wide bg-white/15 border border-white/25 rounded px-1.5 py-[2px]"
      title="HV-RFM · Hệ thống điều phối hàng chờ"
    >HV-RFM</span>
    <div class="font-bold text-[12px] sm:text-[13px] truncate">{{ tieuDe }}</div>
    <div class="flex-1"></div>
    <div
      v-if="gioCapNhat"
      class="flex items-center gap-1.5 text-[10.5px] sm:text-[11.5px] font-semibold bg-emerald-500/25 border border-emerald-200/50 px-2 sm:px-2.5 py-[3px] rounded shrink-0"
    >
      <span class="w-[7px] h-[7px] rounded-full bg-emerald-400"></span><span class="hidden sm:inline">SSE · </span>{{ gioCapNhat }}
    </div>
    <div v-if="tenHienThi" class="text-[12px] font-semibold ml-1 shrink-0 hidden md:block">{{ tenHienThi }}</div>
    <button
      v-if="auth.daDangNhap"
      @click="dangXuat"
      class="shrink-0 text-[11px] sm:text-[12px] font-semibold bg-white/15 hover:bg-white/25 border border-white/25 rounded px-2 py-[4px]"
      title="Đăng xuất"
    >Thoát</button>
  </header>

  <!-- Thanh điều hướng theo vai trò (ẩn ở màn hình TV) -->
  <nav v-if="dieuHuong && menu.length > 1"
       class="bg-[#0f5aa0] border-t border-white/10 flex items-center gap-1 px-2 sm:px-3 overflow-x-auto">
    <RouterLink v-for="m in menu" :key="m.route" :to="{ name: m.route }"
                class="whitespace-nowrap text-[12px] sm:text-[12.5px] font-semibold px-3 py-2 border-b-2 transition-colors shrink-0"
                :class="route.name === m.route
                  ? 'text-white border-white'
                  : 'text-[#cfe4fb] border-transparent hover:text-white hover:bg-white/10'">
      {{ m.ten }}
    </RouterLink>
  </nav>
 </div>
</template>
