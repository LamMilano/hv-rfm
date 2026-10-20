<script setup lang="ts">
import { computed, onMounted } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import { useHangDoi } from '@/stores/hangDoi'
import { useStream } from '@/composables/useStream'

// Màn hình tổng tại khoa khám (TV, chỉ xem): toàn cảnh hàng đợi các phòng.
const store = useHangDoi()
onMounted(() => store.tai())
useStream(() => store.tai())

const theoPhong = computed(() =>
  store.rooms.map((r) => {
    const ds = store.orders.filter((o) => o.room_id === r.id)
    return {
      ten: r.ten,
      dangGoi: ds.find((o) => o.status === 'dang_goi') ?? null,
      cho: ds.filter((o) => o.status === 'cho' && !o.giu_hang).sort((a, b) => a.queue_pos - b.queue_pos),
      quaLuot: ds.filter((o) => o.status === 'qua_luot').length,
    }
  }),
)
const stt = (n: number) => String(n).padStart(3, '0')
</script>

<template>
  <div class="h-screen flex flex-col bg-[#eef1f5]">
    <AppHeader tieu-de="Màn hình điều hành — Khoa khám" :gio-cap-nhat="store.capNhatLuc" :dieu-huong="false" quay-lai />
    <div class="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 p-3 sm:p-4 min-h-0 overflow-y-auto lg:overflow-hidden">
      <section v-for="p in theoPhong" :key="p.ten" class="bg-white rounded-xl border border-[#d6dde6] flex flex-col lg:overflow-hidden">
        <div class="bg-hv text-white px-5 py-3 flex items-center justify-between">
          <span class="text-lg font-bold">{{ p.ten }}</span>
          <span class="text-sm font-semibold text-[#cfe4fb]">{{ p.cho.length }} chờ · {{ p.quaLuot }} quá lượt</span>
        </div>
        <div class="bg-hv-soft px-4 py-3 border-b border-[#d6dde6]">
          <div class="text-[11px] font-extrabold text-hv uppercase tracking-wide">Đang gọi</div>
          <div v-if="p.dangGoi" class="flex items-baseline gap-3 mt-1">
            <span class="tnum text-2xl font-black text-hv">{{ stt(p.dangGoi.stt) }}</span>
            <span class="text-lg font-bold truncate">{{ p.dangGoi.ho_ten }}</span>
          </div>
          <div v-else class="text-slate-400 mt-1">— trống —</div>
        </div>
        <div class="lg:flex-1 lg:overflow-y-auto">
          <div v-for="o in p.cho" :key="o.id" class="flex items-center gap-4 px-5 py-2.5 border-b border-[#eef2f6]">
            <span class="tnum text-xl font-extrabold text-slate-700 w-12">{{ stt(o.stt) }}</span>
            <span class="text-base font-semibold flex-1 truncate">{{ o.ho_ten }}</span>
            <span class="text-sm text-slate-500">{{ o.chi_dinh }}</span>
            <span class="tnum text-sm font-bold text-slate-700">{{ o.gio_hen ?? '' }}</span>
          </div>
          <div v-if="!p.cho.length" class="px-5 py-4 text-slate-400">Không có ca chờ.</div>
        </div>
      </section>
      <div v-if="!theoPhong.length" class="text-slate-400 p-6">Đang tải…</div>
    </div>
  </div>
</template>
