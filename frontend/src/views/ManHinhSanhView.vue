<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useHangDoi } from '@/stores/hangDoi'
import { useAuth, trangMacDinh } from '@/stores/auth'
import { useStream } from '@/composables/useStream'

// Màn hình chờ tại sảnh (TV công khai, CHỈ XEM). §11/§14: chỉ HỌ TÊN + SỐ THỨ TỰ,
// KHÔNG thông tin y khoa.
const store = useHangDoi()
const auth = useAuth()
const router = useRouter()
const veTrangChinh = () => router.push(trangMacDinh(auth.vaiTro))
onMounted(() => store.tai())
useStream(() => store.tai())

// Đồng hồ thời gian thực.
const gio = ref('')
function capNhatGio() {
  gio.value = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
}
let hen: ReturnType<typeof setInterval> | undefined
onMounted(() => { capNhatGio(); hen = setInterval(capNhatGio, 15_000) })
onBeforeUnmount(() => clearInterval(hen))

const theoPhong = computed(() =>
  store.rooms.map((r) => {
    const ds = store.orders.filter((o) => o.room_id === r.id)
    return {
      phong: r.ten,
      dangChup: ds.find((o) => o.status === 'dang_goi') ?? null,
      tiepTheo: ds.filter((o) => o.status === 'cho' && !o.giu_hang).sort((a, b) => a.queue_pos - b.queue_pos).slice(0, 3),
    }
  }),
)
const stt = (n: number) => String(n).padStart(3, '0')
</script>

<template>
  <div class="min-h-screen bg-hv text-white flex flex-col">
    <header class="flex items-center gap-3 sm:gap-4 px-4 sm:px-8 py-4 sm:py-5 border-b border-white/15">
      <!-- Nút quay lại để mờ, không gây chú ý trên TV công khai -->
      <button
        @click="veTrangChinh"
        class="shrink-0 text-xs sm:text-sm font-semibold text-white/50 hover:text-white bg-white/5 hover:bg-white/15 border border-white/15 rounded-lg px-2.5 py-1.5"
        title="Quay lại trang làm việc"
      >← <span class="hidden sm:inline">Quay lại</span></button>
      <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-white p-1 flex items-center justify-center shrink-0">
        <img src="/logo-bvhv.jpg" alt="BVĐK Hùng Vương" class="w-full h-full object-contain" />
      </div>
      <div class="min-w-0">
        <div class="text-lg sm:text-2xl font-extrabold truncate">Bệnh viện Đa khoa Hùng Vương</div>
        <div class="text-xs sm:text-sm text-[#cfe4fb]">Khu vực chờ chụp cộng hưởng từ (MRI)</div>
      </div>
      <div class="flex-1"></div>
      <div class="text-2xl sm:text-3xl font-extrabold tnum shrink-0">{{ gio }}</div>
    </header>

    <div class="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 p-4 sm:p-8">
      <section v-for="p in theoPhong" :key="p.phong" class="bg-white/10 rounded-2xl p-4 sm:p-7 flex flex-col">
        <div class="text-base sm:text-xl font-bold text-[#cfe4fb] mb-3 sm:mb-5">{{ p.phong }}</div>

        <div class="bg-white text-hv rounded-xl px-4 sm:px-7 py-4 sm:py-6 mb-4 sm:mb-6">
          <div class="text-xs sm:text-sm font-bold text-slate-500 uppercase tracking-wide mb-1">Đang vào chụp</div>
          <template v-if="p.dangChup">
            <div class="flex items-baseline gap-3 sm:gap-5">
              <div class="text-4xl sm:text-6xl font-black tnum">{{ stt(p.dangChup.stt) }}</div>
              <div class="text-2xl sm:text-4xl font-extrabold truncate">{{ p.dangChup.ho_ten }}</div>
            </div>
          </template>
          <div v-else class="text-xl sm:text-3xl font-bold text-slate-400 py-2">— đang trống —</div>
        </div>

        <div class="text-sm sm:text-base font-bold text-[#cfe4fb] uppercase tracking-wide mb-2 sm:mb-3">Tiếp theo</div>
        <div class="flex flex-col gap-2 sm:gap-3">
          <div v-for="o in p.tiepTheo" :key="o.id" class="flex items-center gap-3 sm:gap-5 bg-white/5 rounded-lg px-3 sm:px-5 py-2 sm:py-3">
            <div class="text-2xl sm:text-4xl font-black tnum text-[#cfe4fb]">{{ stt(o.stt) }}</div>
            <div class="text-xl sm:text-3xl font-semibold truncate">{{ o.ho_ten }}</div>
          </div>
          <div v-if="!p.tiepTheo.length" class="text-lg text-[#cfe4fb]/70">— chưa có —</div>
        </div>
      </section>
    </div>

    <footer class="px-4 sm:px-8 py-3 text-xs sm:text-sm text-[#cfe4fb]/80 border-t border-white/15">
      Vui lòng chú ý màn hình và lượt gọi · Phát triển bởi Nguyễn Thành Lâm
    </footer>
  </div>
</template>
