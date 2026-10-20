<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import { apiConfig, type ThongKeAdmin } from '@/api/endpoints'
import { thongDiepLoi } from '@/api/client'

// Bảng điều khiển quản trị (§12 mở rộng). Thẻ KPI, hàng đợi theo phòng, trạng thái
// kết nối, số người dùng theo vai trò, công tắc tự tạo tài khoản (JIT). Tự làm mới
// mỗi 20s. Responsive: lưới co theo bề ngang điện thoại.
const tk = ref<ThongKeAdmin | null>(null)
const loi = ref('')
const bao = ref('')
let hen: ReturnType<typeof setInterval> | null = null

async function tai() {
  try { tk.value = await apiConfig.taiDashboard(); loi.value = '' }
  catch (e) { loi.value = thongDiepLoi(e, 'Không tải được số liệu tổng quan.') }
}
onMounted(() => { tai(); hen = setInterval(tai, 20000) })
onUnmounted(() => { if (hen) clearInterval(hen) })

const KPI = computed(() => tk.value ? [
  { ten: 'Ca hôm nay', so: tk.value.ca_hom_nay, mau: 'text-hv' },
  { ten: 'Đang chờ', so: tk.value.dang_cho, mau: 'text-amber-600' },
  { ten: 'Đang gọi', so: tk.value.dang_phuc_vu, mau: 'text-sky-600' },
  { ten: 'Đã chụp hôm nay', so: tk.value.da_chup_hom_nay, mau: 'text-emerald-600' },
] : [])

const maxPhong = computed(() =>
  Math.max(1, ...(tk.value?.theo_phong.map((p) => p.dang_cho + p.dang_phuc_vu) ?? [1])))

function khiNao(iso: string | null): string {
  if (!iso) return 'chưa có'
  const phut = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (phut < 1) return 'vừa xong'
  if (phut < 60) return `${phut} phút trước`
  const gio = Math.round(phut / 60)
  return gio < 24 ? `${gio} giờ trước` : `${Math.round(gio / 24)} ngày trước`
}

async function doiJit() {
  if (!tk.value) return
  const moi = !tk.value.jit_tu_tao
  try {
    await apiConfig.luuSetting('jit_tu_tao', moi ? 'true' : 'false')
    tk.value.jit_tu_tao = moi
    bao.value = moi ? 'Đã bật tự tạo tài khoản khi đăng nhập HIS.' : 'Đã tắt tự tạo tài khoản.'
    setTimeout(() => { bao.value = '' }, 2500)
  } catch (e) { loi.value = thongDiepLoi(e) }
}

const VAI_TRO = [
  { ma: 'ktv', ten: 'KTV' }, { ma: 'bac_si', ten: 'Bác sĩ' }, { ma: 'admin', ten: 'Quản trị' },
]
</script>

<template>
  <div class="min-h-screen flex flex-col bg-[#eef1f5]">
    <AppHeader tieu-de="Tổng quan điều hành" />

    <div class="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-4 py-4 space-y-4">
      <p v-if="loi" class="bg-rose-50 border border-rose-200 text-rose-700 text-[13px] rounded-lg px-3 py-2">{{ loi }}</p>
      <p v-if="bao" class="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[13px] rounded-lg px-3 py-2">{{ bao }}</p>
      <div v-if="!tk" class="text-slate-400 text-[13px]">Đang tải số liệu…</div>

      <template v-else>
        <!-- Thẻ KPI -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div v-for="k in KPI" :key="k.ten" class="bg-white rounded-xl border border-[#d6dde6] px-4 py-3">
            <div class="text-[11px] uppercase tracking-wide text-slate-500 font-bold">{{ k.ten }}</div>
            <div class="text-3xl font-extrabold mt-1 tnum" :class="k.mau">{{ k.so }}</div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- Hàng đợi theo phòng -->
          <div class="bg-white rounded-xl border border-[#d6dde6] p-4">
            <h3 class="font-bold text-slate-800 mb-3">Hàng chờ theo phòng</h3>
            <div v-if="!tk.theo_phong.length" class="text-slate-400 text-[13px]">Chưa có phòng nào hoạt động.</div>
            <div v-for="p in tk.theo_phong" :key="p.id" class="mb-2.5 last:mb-0">
              <div class="flex items-center justify-between text-[13px] mb-1">
                <span class="font-semibold text-slate-700">{{ p.ten }}</span>
                <span class="text-slate-500 tnum">
                  chờ <b class="text-amber-600">{{ p.dang_cho }}</b>
                  · thực hiện <b class="text-sky-600">{{ p.dang_phuc_vu }}</b>
                </span>
              </div>
              <div class="h-2.5 rounded-full bg-slate-100 overflow-hidden flex">
                <div class="bg-sky-500 h-full" :style="{ width: (p.dang_phuc_vu / maxPhong * 100) + '%' }"></div>
                <div class="bg-amber-400 h-full" :style="{ width: (p.dang_cho / maxPhong * 100) + '%' }"></div>
              </div>
            </div>
          </div>

          <!-- Trạng thái kết nối -->
          <div class="bg-white rounded-xl border border-[#d6dde6] p-4">
            <h3 class="font-bold text-slate-800 mb-3">Trạng thái kết nối</h3>
            <ul class="space-y-2.5 text-[13px]">
              <li class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full" :class="tk.his_bat ? 'bg-emerald-500' : 'bg-slate-300'"></span>
                <span class="font-semibold text-slate-700">Xác thực apihrm</span>
                <span class="text-slate-500 ml-auto">{{ tk.his_bat ? 'Đang bật' : 'Chưa cấu hình' }}</span>
              </li>
              <li class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span class="font-semibold text-slate-700">Realtime (SSE)</span>
                <span class="text-slate-500 ml-auto">Đang chạy</span>
              </li>
              <li class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full"
                      :class="tk.his_cuoi ? 'bg-emerald-500' : 'bg-slate-300'"></span>
                <span class="font-semibold text-slate-700">HIS đẩy chỉ định</span>
                <span class="text-slate-500 ml-auto">Gần nhất: {{ khiNao(tk.his_cuoi) }}</span>
              </li>
            </ul>
          </div>

          <!-- Người dùng theo vai trò -->
          <div class="bg-white rounded-xl border border-[#d6dde6] p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-slate-800">Người dùng ({{ tk.tong_user }})</h3>
              <RouterLink :to="{ name: 'admin' }" class="text-hv text-[12px] font-semibold">Quản lý →</RouterLink>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div v-for="v in VAI_TRO" :key="v.ma" class="border border-[#d6dde6] rounded-lg px-3 py-2 text-center">
                <div class="text-2xl font-extrabold text-slate-800 tnum">{{ tk.so_user[v.ma] ?? 0 }}</div>
                <div class="text-[11px] text-slate-500 font-semibold">{{ v.ten }}</div>
              </div>
            </div>
            <label class="flex items-center gap-2.5 mt-3 pt-3 border-t border-[#eef2f6] cursor-pointer">
              <input type="checkbox" :checked="tk.jit_tu_tao" @change="doiJit" class="w-4 h-4 accent-[#1366b1]" />
              <span class="text-[12.5px] text-slate-700">
                <b>Tự tạo tài khoản Bác sĩ</b> khi nhân viên đăng nhập HIS hợp lệ mà chưa có bản ghi
                <span class="text-slate-400">(JIT — admin nâng quyền sau)</span>
              </span>
            </label>
          </div>

          <!-- Lối tắt -->
          <div class="bg-white rounded-xl border border-[#d6dde6] p-4">
            <h3 class="font-bold text-slate-800 mb-3">Truy cập nhanh</h3>
            <div class="grid grid-cols-2 gap-2 text-[13px]">
              <RouterLink :to="{ name: 'admin' }" class="border border-[#d6dde6] rounded-lg px-3 py-2.5 font-semibold text-slate-700 hover:bg-slate-50">Cấu hình &amp; người dùng</RouterLink>
              <RouterLink :to="{ name: 'thong-ke' }" class="border border-[#d6dde6] rounded-lg px-3 py-2.5 font-semibold text-slate-700 hover:bg-slate-50">Thống kê &amp; hiệu quả</RouterLink>
              <RouterLink :to="{ name: 'nhat-ky' }" class="border border-[#d6dde6] rounded-lg px-3 py-2.5 font-semibold text-slate-700 hover:bg-slate-50">Nhật ký hệ thống</RouterLink>
              <RouterLink :to="{ name: 'ktv' }" class="border border-[#d6dde6] rounded-lg px-3 py-2.5 font-semibold text-slate-700 hover:bg-slate-50">Điều phối hàng chờ</RouterLink>
              <RouterLink :to="{ name: 'tong' }" class="border border-[#d6dde6] rounded-lg px-3 py-2.5 font-semibold text-slate-700 hover:bg-slate-50">Màn hình điều hành</RouterLink>
              <RouterLink :to="{ name: 'sanh' }" class="border border-[#d6dde6] rounded-lg px-3 py-2.5 font-semibold text-slate-700 hover:bg-slate-50">Màn hình sảnh</RouterLink>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
