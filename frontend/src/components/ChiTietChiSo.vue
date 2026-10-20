<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { apiConfig, type LoaiChiTiet, type DongChiTiet, type KetQuaChiTiet } from '@/api/endpoints'
import { thongDiepLoi } from '@/api/client'

// Panel "Chi tiết" của trang Thống kê: rút một chỉ số xuống danh sách ca/sự kiện
// tạo nên con số đó (cùng khoảng ngày). Bảng trên màn rộng, thẻ trên điện thoại;
// tìm theo tên/mã BN, lọc trạng thái, tải CSV. Xem [[thongKeRepo]] chiTietThongKe.
const props = defineProps<{
  loai: LoaiChiTiet
  khoa?: string | null
  tieuDe: string
  tuNgay: string
  denNgay: string
  locTrangThai?: string        // lọc trạng thái mặc định (vd phòng → chỉ ca đã chụp)
}>()
const emit = defineEmits<{ dong: [] }>()

const kq = ref<KetQuaChiTiet | null>(null)
const loi = ref('')
const dangTai = ref(false)
const tim = ref('')
const trangThai = ref(props.locTrangThai ?? '')

async function tai() {
  dangTai.value = true
  try {
    kq.value = await apiConfig.taiChiTietThongKe(props.loai, props.tuNgay, props.denNgay, props.khoa)
    loi.value = ''
  } catch (e) { loi.value = thongDiepLoi(e, 'Không tải được chi tiết.') }
  finally { dangTai.value = false }
}
onMounted(tai)
watch(() => [props.loai, props.khoa, props.tuNgay, props.denNgay], () => {
  trangThai.value = props.locTrangThai ?? ''; tai()
})

function phimEsc(e: KeyboardEvent) { if (e.key === 'Escape') emit('dong') }
onMounted(() => window.addEventListener('keydown', phimEsc))
onBeforeUnmount(() => window.removeEventListener('keydown', phimEsc))

// ── Định dạng ────────────────────────────────────────────────────────────────
const fmtGio = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })
const fmtNgay = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })
const nhieuNgay = computed(() => props.tuNgay !== props.denNgay)
function luc(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return nhieuNgay.value ? `${fmtGio.format(d)} ${fmtNgay.format(d)}` : fmtGio.format(d)
}
const phut = (v: number | null) => (v === null || v === undefined ? '—' : `${v}′`)

const TRANG_THAI: Record<string, { ten: string; mau: string }> = {
  cho:        { ten: 'Đang chờ', mau: 'bg-amber-100 text-amber-800' },
  dang_goi:   { ten: 'Đang gọi', mau: 'bg-blue-100 text-hv' },
  dang_chup:  { ten: 'Đang chụp', mau: 'bg-blue-100 text-hv' },
  qua_luot:   { ten: 'Quá lượt', mau: 'bg-orange-100 text-orange-700' },
  hoan_thanh: { ten: 'Đã chụp', mau: 'bg-green-100 text-green-700' },
  huy:        { ten: 'Đã hủy', mau: 'bg-slate-100 text-slate-500' },
}
const tt = (s: string) => TRANG_THAI[s] ?? { ten: s, mau: 'bg-slate-100 text-slate-600' }
const NGUON: Record<string, string> = { his: 'HIS', thu_cong: 'Nhập tay', dat_truoc: 'Đặt trước' }
const THAO_TAC: Record<string, string> = {
  goi: 'Gọi', hoan_thanh: 'Hoàn thành', doi_gio: 'Sửa giờ', qua_luot: 'Quá lượt',
  huy: 'Hủy tay', his_huy: 'HIS hủy',
}

// ── Cột theo từng chỉ số ─────────────────────────────────────────────────────
interface Cot {
  nhan: string
  gt: (d: DongChiTiet) => string
  lop?: (d: DongChiTiet) => string
  so?: (d: DongChiTiet) => number | null     // cột phút → tính TB ở dòng tổng kết
}
const C: Record<string, Cot> = {
  phong: { nhan: 'Phòng', gt: (d) => d.phong ?? '—' },
  nhom: { nhan: 'Nhóm', gt: (d) => d.nhom ?? '—' },
  nguon: { nhan: 'Nguồn', gt: (d) => NGUON[d.nguon] ?? d.nguon,
    lop: (d) => (d.nguon === 'his' ? 'text-emerald-700' : 'text-amber-700') },
  vao: { nhan: 'Vào hàng', gt: (d) => luc(d.tao_luc) },
  goi: { nhan: 'Gọi', gt: (d) => luc(d.lan_goi_dau) },
  xong: { nhan: 'Xong', gt: (d) => luc(d.luc_xong) },
  cho: { nhan: 'Chờ', gt: (d) => phut(d.cho_phut), so: (d) => d.cho_phut, lop: () => 'text-amber-700 font-bold' },
  chup: { nhan: 'Chụp', gt: (d) => phut(d.chup_phut), so: (d) => d.chup_phut, lop: () => 'text-sky-700 font-bold' },
  lech: { nhan: 'Lệch hẹn', gt: (d) => (d.lech_hen_phut === null ? '—' : `${d.lech_hen_phut > 0 ? '+' : ''}${d.lech_hen_phut}′`),
    so: (d) => d.lech_hen_phut,
    lop: (d) => ((d.lech_hen_phut ?? 0) > 0 ? 'text-rose-600 font-bold' : 'text-emerald-700 font-bold') },
  hen_goc: { nhan: 'Hẹn gốc', gt: (d) => luc(d.gio_hen_goc) },
  hen: { nhan: 'Hẹn hiện tại', gt: (d) => luc(d.gio_hen) },
  so_sua: { nhan: 'Lần sửa', gt: (d) => String(d.so_doi_gio), so: (d) => d.so_doi_gio, lop: () => 'text-amber-700 font-bold' },
  cham: { nhan: 'Chậm', gt: (d) => phut(d.cham_phut), so: (d) => d.cham_phut,
    lop: (d) => ((d.cham_phut ?? 0) > 15 ? 'text-rose-600 font-bold' : 'text-slate-700 font-bold') },
  chen: { nhan: 'Lượt chen', gt: (d) => (d.chen ? String(d.chen) : '—'), lop: (d) => (d.chen ? 'text-amber-700 font-bold' : '') },
  su_kien: { nhan: 'Lúc', gt: (d) => luc(d.su_kien_luc) },
  nguoi: { nhan: 'Người', gt: (d) => d.nguoi ?? 'Hệ thống' },
  bo_huy: { nhan: 'Hủy bởi', gt: (d) => d.nguoi ?? (d.su_kien_loai === 'his_huy' ? 'HIS' : '—') },
  ly_do: { nhan: 'Lý do', gt: (d) => d.ly_do ?? '—' },
  thao_tac: { nhan: 'Thao tác', gt: (d) => {
    const t = THAO_TAC[d.su_kien_loai ?? ''] ?? d.su_kien_loai ?? '—'
    return d.su_kien_loai === 'doi_gio' ? `${t}: ${luc(d.gia_tri_cu)} → ${luc(d.gia_tri_moi)}` : t
  } },
}
const COT_THEO_LOAI: Record<LoaiChiTiet, string[]> = {
  tiep_nhan: ['phong', 'nhom', 'nguon', 'vao', 'goi', 'xong', 'cho', 'chup'],
  hoan_thanh: ['phong', 'nhom', 'vao', 'goi', 'xong', 'cho', 'chup'],
  huy: ['phong', 'nhom', 'nguon', 'vao', 'su_kien', 'bo_huy', 'ly_do'],
  qua_luot: ['phong', 'nhom', 'su_kien', 'nguoi'],
  thoi_gian: ['phong', 'vao', 'goi', 'xong', 'cho', 'chup', 'lech'],
  nguon: ['phong', 'nhom', 'nguon', 'vao'],
  sua_gio: ['phong', 'nhom', 'hen_goc', 'hen', 'so_sua'],
  phong: ['nhom', 'vao', 'goi', 'xong', 'cho', 'chup'],
  nhom: ['phong', 'vao', 'goi', 'cho', 'chup', 'lech'],
  cap_cuu: ['phong', 'vao', 'chen', 'goi', 'cho', 'chup'],
  cham: ['phong', 'nhom', 'hen_goc', 'goi', 'cham'],
  ktv: ['su_kien', 'nguoi', 'thao_tac', 'phong'],
}
const cot = computed(() => COT_THEO_LOAI[props.loai].map((k) => C[k]!))

// ── Lọc + tổng kết ───────────────────────────────────────────────────────────
const boDau = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
const dsTrangThai = computed(() => [...new Set((kq.value?.dong ?? []).map((d) => d.status))])
const dongLoc = computed(() => {
  const q = boDau(tim.value.trim())
  return (kq.value?.dong ?? []).filter((d) =>
    (!trangThai.value || d.status === trangThai.value) &&
    (!q || boDau(`${d.ho_ten} ${d.ma_bn ?? ''} ${d.ten_dich_vu ?? ''} ${d.nguoi ?? ''}`).includes(q)))
})
const tongKet = computed(() => cot.value.filter((c) => c.so).map((c) => {
  const v = dongLoc.value.map((d) => c.so!(d)).filter((x): x is number => x !== null && x !== undefined)
  return { nhan: c.nhan, tb: v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null, n: v.length }
}))
const stt = (d: DongChiTiet) => (d.stt_ngay ? String(d.stt_ngay).padStart(3, '0') : '—')
const benhNhan = (d: DongChiTiet) => [d.ma_bn, d.tuoi !== null ? `${d.tuoi}t` : null].filter(Boolean).join(' · ')

function taiCsv() {
  const tieuDe = ['STT', 'Họ tên', 'Mã BN', 'Tuổi', 'Dịch vụ', 'Trạng thái', ...cot.value.map((c) => c.nhan)]
  const dong = dongLoc.value.map((d) => [
    stt(d), d.ho_ten, d.ma_bn ?? '', d.tuoi ?? '', d.ten_dich_vu ?? '', tt(d.status).ten,
    ...cot.value.map((c) => c.gt(d)),
  ])
  const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`
  const csv = '﻿' + [tieuDe, ...dong].map((r) => r.map(esc).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `chi-tiet-${props.loai}${props.khoa ? '-' + boDau(props.khoa).replace(/[^a-z0-9]+/g, '-') : ''}_${props.tuNgay}_${props.denNgay}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex justify-end" @click.self="emit('dong')">
    <div class="absolute inset-0 bg-black/30" @click="emit('dong')"></div>
    <div class="relative bg-white w-full sm:max-w-[960px] h-full shadow-xl flex flex-col animate-[slideIn_.15s_ease-out]">
      <!-- Đầu panel -->
      <div class="shrink-0 flex items-start justify-between gap-2 px-4 py-3 border-b border-[#eef2f6] bg-hv-soft">
        <div class="min-w-0">
          <div class="text-[11px] uppercase tracking-wide font-bold text-slate-500">Chi tiết</div>
          <h3 class="font-bold text-[15px] text-slate-800 truncate">{{ tieuDe }}</h3>
          <div class="text-[12px] text-slate-500 tnum">
            {{ tuNgay === denNgay ? tuNgay.split('-').reverse().join('/') :
               `${tuNgay.split('-').reverse().join('/')} → ${denNgay.split('-').reverse().join('/')}` }}
            <template v-if="kq"> · {{ dongLoc.length }} dòng</template>
          </div>
        </div>
        <button @click="emit('dong')" class="shrink-0 text-slate-400 hover:text-slate-700 text-[22px] leading-none font-bold" aria-label="Đóng">×</button>
      </div>

      <!-- Thanh lọc -->
      <div class="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-[#eef2f6]">
        <input v-model="tim" type="search" placeholder="Tìm tên, mã BN, dịch vụ, người…"
               class="flex-1 min-w-[160px] border border-[#d6dde6] rounded-lg px-2.5 py-1.5 text-[13px]" />
        <select v-if="dsTrangThai.length > 1 || trangThai" v-model="trangThai"
                class="border border-[#d6dde6] rounded-lg px-2 py-1.5 text-[13px] bg-white">
          <option value="">Mọi trạng thái</option>
          <option v-for="s in dsTrangThai" :key="s" :value="s">{{ tt(s).ten }}</option>
        </select>
        <button @click="taiCsv" :disabled="!dongLoc.length"
                class="text-[12px] font-semibold border border-[#d6dde6] rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          Tải CSV
        </button>
      </div>

      <!-- Tổng kết nhanh trên tập đang lọc -->
      <div v-if="kq && tongKet.length" class="shrink-0 flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 bg-slate-50 border-b border-[#eef2f6] text-[12px] text-slate-600 tnum">
        <span v-for="t in tongKet" :key="t.nhan">
          {{ t.nhan }} TB <b class="text-slate-800">{{ t.tb === null ? '—' : t.tb + '′' }}</b>
          <span class="text-slate-400">({{ t.n }} mẫu)</span>
        </span>
      </div>

      <div class="flex-1 overflow-auto">
        <p v-if="loi" class="m-4 bg-rose-50 border border-rose-200 text-rose-700 text-[13px] rounded-lg px-3 py-2">{{ loi }}</p>
        <div v-else-if="!kq" class="p-4 text-slate-400 text-[13px]">Đang tải…</div>
        <div v-else-if="!dongLoc.length" class="p-4 text-slate-400 text-[13px]">Không có dòng nào.</div>
        <template v-else>
          <p v-if="kq.tong > kq.gioi_han" class="mx-4 mt-3 bg-amber-50 border border-amber-200 text-amber-800 text-[12px] rounded-lg px-3 py-1.5">
            Chỉ hiển thị {{ kq.gioi_han }} dòng đầu — thu hẹp khoảng ngày để xem đủ.
          </p>

          <!-- Màn rộng: bảng -->
          <table class="hidden sm:table w-full text-[12.5px]">
            <thead class="sticky top-0 bg-white z-10">
              <tr class="text-[11px] uppercase tracking-wide text-slate-500 border-b border-[#d6dde6]">
                <th class="text-left font-bold py-2 pl-4 pr-2">STT</th>
                <th class="text-left font-bold py-2 px-2">Bệnh nhân</th>
                <th class="text-left font-bold py-2 px-2">Trạng thái</th>
                <th v-for="c in cot" :key="c.nhan" class="text-left font-bold py-2 px-2 whitespace-nowrap">{{ c.nhan }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(d, i) in dongLoc" :key="`${d.id}-${d.su_kien_luc ?? ''}-${i}`"
                  class="border-b border-[#f3f6f9] hover:bg-slate-50 align-top">
                <td class="py-1.5 pl-4 pr-2 tnum font-bold text-hv">{{ stt(d) }}</td>
                <td class="py-1.5 px-2 min-w-[160px]">
                  <div class="font-semibold text-slate-800">{{ d.ho_ten }}</div>
                  <div class="text-[11px] text-slate-500 tnum">{{ benhNhan(d) }}</div>
                  <div v-if="d.ten_dich_vu" class="text-[11px] text-slate-400 truncate max-w-[240px]" :title="d.ten_dich_vu">{{ d.ten_dich_vu }}</div>
                </td>
                <td class="py-1.5 px-2">
                  <span class="text-[11px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap" :class="tt(d.status).mau">{{ tt(d.status).ten }}</span>
                </td>
                <td v-for="c in cot" :key="c.nhan" class="py-1.5 px-2 tnum" :class="[c.lop?.(d), c.nhan === 'Lý do' || c.nhan === 'Thao tác' ? '' : 'whitespace-nowrap']">
                  {{ c.gt(d) }}
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Điện thoại: thẻ -->
          <div class="sm:hidden divide-y divide-[#eef2f6]">
            <div v-for="(d, i) in dongLoc" :key="`m-${d.id}-${d.su_kien_luc ?? ''}-${i}`" class="px-4 py-2.5">
              <div class="flex items-center gap-2">
                <span class="tnum font-extrabold text-hv text-[13px]">{{ stt(d) }}</span>
                <span class="font-semibold text-slate-800 text-[13px] truncate flex-1">{{ d.ho_ten }}</span>
                <span class="text-[10.5px] font-bold px-1.5 py-0.5 rounded shrink-0" :class="tt(d.status).mau">{{ tt(d.status).ten }}</span>
              </div>
              <div class="text-[11px] text-slate-500 tnum">{{ benhNhan(d) }}</div>
              <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1 text-[12px]">
                <div v-for="c in cot" :key="c.nhan" class="flex gap-1 min-w-0" :class="c.nhan === 'Lý do' || c.nhan === 'Thao tác' ? 'col-span-2' : ''">
                  <span class="text-slate-400 shrink-0">{{ c.nhan }}:</span>
                  <span class="tnum break-words min-w-0" :class="c.lop?.(d)">{{ c.gt(d) }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
        <div v-if="dangTai && kq" class="px-4 py-2 text-[12px] text-slate-400">Đang tải lại…</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes slideIn { from { transform: translateX(16px); opacity: .6 } to { transform: translateX(0); opacity: 1 } }
</style>
