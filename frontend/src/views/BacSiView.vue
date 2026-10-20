<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import { useHangDoi } from '@/stores/hangDoi'
import { useAuth } from '@/stores/auth'
import { useStream } from '@/composables/useStream'
import { apiHangDoi } from '@/api/endpoints'
import { thongDiepLoi } from '@/api/client'
import { kieuMau, chipNhan, type Order, type TrangThai } from '@/types'

// Màu nhãn ưu tiên của ca (chỉ nhóm ưu tiên thật) — chip cạnh tên + nền dòng nhạt.
function nhanMau(o: Order) { return o.nhan?.kieu === 'uu_tien' ? kieuMau(o.nhan.mau) : null }

const gioVN = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' })
const hhmm = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : gioVN.format(d) }

// Màn theo dõi chung cho bác sĩ — xem danh sách bệnh nhân (mọi trạng thái) theo từng
// phòng chụp MRI, kèm số trực + kíp KTV. Nút "Ca của tôi" lọc theo mã BS chỉ định.
const store = useHangDoi()
const auth = useAuth()

// store.tai(): lấy kíp trực + dự báo (của hôm nay). Danh sách ca luôn lọc theo NGÀY
// đã chọn qua taiNgay() — kể cả hôm nay — để không lẫn ca tồn đọng từ ngày khác.
onMounted(() => { store.tai(); taiNgay() })
// SSE là sự kiện của hôm nay → chỉ làm mới khi đang xem hôm nay.
useStream(() => { if (laHomNay.value) { store.tai(); taiNgay() } })

const maBs = computed(() => auth.user?.ma_bs ?? null)

// ── Bộ lọc ngày (mặc định hôm nay, giờ VN) ───────────────────────────────────
const homNayVN = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
const ngay = ref(homNayVN())
const laHomNay = computed(() => ngay.value === homNayVN())
const ngayVN = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}
const ordersNgay = ref<Order[]>([])
const dangTaiNgay = ref(false)
const loiNgay = ref('')
async function taiNgay() {
  dangTaiNgay.value = true
  try { ordersNgay.value = (await apiHangDoi.theoNgay(ngay.value)).orders; loiNgay.value = '' }
  catch (e) { loiNgay.value = thongDiepLoi(e, 'Không tải được danh sách ngày đã chọn.'); ordersNgay.value = [] }
  finally { dangTaiNgay.value = false }
}
watch(ngay, taiNgay)

// Bộ lọc
const chiCuaToi = ref(false)
const tuKhoa = ref('')

const stt = (n: number) => String(n).padStart(3, '0')
const boDau = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

const TRANG_THAI: Record<TrangThai, { ten: string; mau: string; cham: string }> = {
  cho:        { ten: 'Đang chờ',   mau: 'bg-amber-100 text-amber-800',     cham: 'bg-amber-500' },
  dang_goi:   { ten: 'Đang gọi',   mau: 'bg-blue-100 text-hv',             cham: 'bg-hv' },
  qua_luot:   { ten: 'Quá lượt',   mau: 'bg-orange-100 text-orange-700',   cham: 'bg-orange-600' },
  hoan_thanh: { ten: 'Đã chụp',    mau: 'bg-green-100 text-green-700',     cham: 'bg-green-600' },
  huy:        { ten: 'Đã hủy',     mau: 'bg-slate-100 text-slate-500',     cham: 'bg-slate-400' },
}
const tt = (o: Order) => TRANG_THAI[o.status]

// Lệch so với lịch hẹn ban đầu (ẩn khi đúng giờ). Sớm → xanh; muộn vàng 10–30′, đỏ >30′.
function chamBS(o: Order): { chu: string; mau: string } | null {
  const c = o.cham_phut
  if (c === null || c === undefined || c === 0) return null
  if (c < 0) return { chu: `Sớm ${-c}′`, mau: 'text-emerald-600' }
  const mau = c > 30 ? 'text-rose-700' : c >= 10 ? 'text-amber-700' : 'text-slate-500'
  return { chu: `Muộn ${c}′`, mau }
}

// Nơi chỉ định hiển thị trong danh sách: Ngoại trú → Tên phòng chỉ định; Nội trú →
// Tên khoa chỉ định. Có fallback chéo khi HIS thiếu trường tương ứng.
function noiChiDinh(o: Order): string | null {
  const noiTru = (o.loai_dieu_tri ?? '').toLowerCase().includes('nội trú')
  return noiTru
    ? (o.khoa_chi_dinh || o.phong_chi_dinh || null)
    : (o.phong_chi_dinh || o.khoa_chi_dinh || null)
}

// Danh sách ca của NGÀY đã chọn (ordersNgay, lọc theo created_at giờ VN), bỏ ca hủy.
// Hôm nay được taiNgay() làm mới theo SSE nên vẫn cập nhật trực tiếp.
const tatCa = computed<Order[]>(() =>
  ordersNgay.value.filter((o) => o.status !== 'huy'),
)

function locChung(ds: Order[]): Order[] {
  let kq = ds
  if (chiCuaToi.value) kq = kq.filter((o) => maBs.value && o.ma_bs === maBs.value)
  const k = boDau(tuKhoa.value.trim())
  if (k) kq = kq.filter((o) => boDau(o.ho_ten).includes(k) || String(o.stt).includes(k))
  return kq
}

// Thứ tự hiển thị trong 1 phòng: đang gọi → chờ (theo queue) → quá lượt → đã chụp.
const UU_TIEN: Record<TrangThai, number> = {
  dang_goi: 0, cho: 1, qua_luot: 2, hoan_thanh: 3, huy: 4,
}
function sapXep(ds: Order[]): Order[] {
  return [...ds].sort((a, b) =>
    UU_TIEN[a.status] - UU_TIEN[b.status] ||
    a.queue_pos - b.queue_pos ||
    (a.gio_hen ?? '').localeCompare(b.gio_hen ?? ''),
  )
}

// Nhóm theo phòng (giữ thứ tự phòng trong cấu hình) + nhóm "Chưa xếp phòng".
const dsLoc = computed(() => locChung(tatCa.value))
const theoPhong = computed(() =>
  store.rooms.map((r) => ({
    room: r,
    ds: sapXep(dsLoc.value.filter((o) => o.room_id === r.id && !o.giu_hang)),
  })),
)
const chuaXepPhong = computed(() => sapXep(dsLoc.value.filter((o) => o.room_id === null && !o.giu_hang)))
// Ca nội trú đang ở hàng GIỮ — chụp buổi chiều, KTV chưa xếp vào hàng thời gian (chưa có giờ hẹn).
const choXepChieu = computed(() => sapXep(dsLoc.value.filter((o) => o.giu_hang)))

const tongHienThi = computed(() => dsLoc.value.length)
const demCuaToi = computed(() =>
  maBs.value ? tatCa.value.filter((o) => o.ma_bs === maBs.value).length : 0,
)

// ── Dự báo "chỉ định ngay" theo phòng (Mức 1) ───────────────────────────────
// Giữ ĐÚNG thứ tự phòng như danh sách bên dưới (1.5T thẳng cột 1.5T, 0.4T thẳng 0.4T)
// để dễ đối chiếu trên–dưới. Phòng trống sớm nhất chỉ gắn nhãn "Trống sớm nhất" (som_nhat
// do backend tính), không đổi vị trí.
const duBao = computed(() =>
  store.rooms
    .map((r) => {
      const d = store.duBao.find((x) => x.room_id === r.id)
      return d ? { ...d, ten: r.ten } : null
    })
    .filter((d): d is NonNullable<typeof d> => d !== null),
)

// ── Thông tin lâm sàng: chống chỉ định MRI (tham khảo nhanh) ─────────────────
const hienChongCD = ref(false)
const CHONG_CHI_DINH = [
  'Máy tạo nhịp tim / máy khử rung (ICD)',
  'Cấy ghép ốc tai điện tử',
  'Clip phình mạch não bằng kim loại từ tính',
  'Mảnh kim loại / dị vật kim loại trong mắt hoặc cơ thể',
  'Máy bơm thuốc, van tim nhân tạo loại từ tính',
  'Có thai — cân nhắc kỹ, nhất là 3 tháng đầu',
  'Suy thận nặng (eGFR thấp) — thận trọng khi tiêm thuốc tương phản',
]
</script>

<template>
  <div class="min-h-screen flex flex-col bg-[#eef1f5]">
    <AppHeader tieu-de="Theo dõi hàng chờ MRI" :gio-cap-nhat="store.capNhatLuc" />

    <div class="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
      <!-- Số trực MRI + kíp KTV trực hôm nay (chỉ khi đang xem hôm nay) -->
      <div v-if="laHomNay" class="mb-3 bg-white border border-[#d6dde6] rounded-xl p-3">
        <div class="flex items-center justify-between mb-2">
          <div class="text-[11px] font-extrabold text-hv tracking-wide uppercase">
            Số trực MRI · Kíp KTV hôm nay
          </div>
          <span class="text-[11px] text-slate-400 font-semibold">{{ store.kipTruc.length }} người</span>
        </div>
        <div v-if="store.kipTruc.length" class="flex flex-wrap gap-2">
          <div v-for="k in store.kipTruc" :key="k.id"
               class="flex items-center gap-2 bg-hv-soft border border-blue-100 rounded-lg pl-3 pr-2 py-1.5">
            <div class="font-bold text-[13px] text-slate-800 truncate">{{ k.ho_ten }}</div>
            <a v-if="k.sdt" :href="`tel:${k.sdt}`"
               class="shrink-0 inline-flex items-center gap-1 bg-hv text-white font-bold text-[12px] rounded-md px-2.5 py-1.5">
              📞 <span class="tnum">{{ k.sdt }}</span>
            </a>
          </div>
        </div>
        <div v-else class="text-[12.5px] text-slate-400">Chưa có kíp trực nào được khai báo hôm nay.</div>
      </div>

      <!-- Dự báo "nếu chỉ định ngay" theo phòng (Mức 1) — chỉ áp cho hôm nay -->
      <div v-if="laHomNay && duBao.length" class="mb-3 bg-white border border-[#d6dde6] rounded-xl p-3">
        <div class="flex items-center justify-between mb-2">
          <div class="text-[11px] font-extrabold text-hv tracking-wide uppercase">Nếu chỉ định ngay</div>
          <span class="text-[10.5px] text-slate-400 font-semibold">ước tính · khoảng giờ, có thể đổi</span>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-2">
          <div v-for="d in duBao" :key="d.room_id"
               class="rounded-lg border px-3 py-2"
               :class="d.som_nhat ? 'border-emerald-300 bg-emerald-50' : 'border-[#e3e9f0] bg-slate-50'">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="font-bold text-[13px] text-slate-800">🏥 {{ d.ten }}</span>
              <span v-if="d.som_nhat" class="text-[10px] font-bold text-emerald-700 bg-emerald-100 rounded px-1.5 py-px">Trống sớm nhất</span>
            </div>
            <div class="text-[13px] text-slate-700">
              Đứng sau <b class="text-slate-900">~{{ d.so_ca_truoc }}</b> ca<span v-if="d.so_dem_vip"> <span class="text-rose-600">(+{{ d.so_dem_vip }} VIP đặt trước)</span></span>
            </div>
            <div class="text-[13px] text-slate-700">
              Dự kiến bắt đầu <b class="tnum text-hv">{{ hhmm(d.eta_som) }}–{{ hhmm(d.eta_muon) }}</b>
            </div>
          </div>
        </div>
        <p class="mt-2 text-[11px] text-slate-400">
          Nên báo bệnh nhân <b>khoảng giờ</b>, không hứa giờ chính xác — số có thể nhích nếu phòng khác chỉ định cùng lúc.
        </p>
      </div>

      <!-- Thanh lọc: Tất cả / Ca của tôi + tìm kiếm -->
      <div class="mb-3 flex items-center flex-wrap gap-2">
        <div class="inline-flex bg-white border border-[#d6dde6] rounded-lg p-0.5">
          <button @click="chiCuaToi = false"
                  class="px-3 py-1.5 text-[12.5px] font-semibold rounded-md"
                  :class="!chiCuaToi ? 'bg-hv text-white' : 'text-slate-600'">
            Tất cả ca
          </button>
          <button @click="chiCuaToi = true"
                  class="px-3 py-1.5 text-[12.5px] font-semibold rounded-md"
                  :class="chiCuaToi ? 'bg-hv text-white' : 'text-slate-600'">
            Ca của tôi<span v-if="maBs" class="ml-1 opacity-80">({{ demCuaToi }})</span>
          </button>
        </div>
        <input v-model="tuKhoa" type="text" placeholder="Tìm tên / STT…"
               class="text-[12.5px] border border-slate-300 rounded-lg px-3 py-1.5 w-[160px] sm:w-[200px] outline-none focus:border-hv" />
        <!-- Chọn ngày (mặc định hôm nay) — nhãn ép định dạng dd/mm/yyyy; input date phủ trong suốt để mở lịch -->
        <div class="inline-flex items-center gap-1.5">
          <label class="relative inline-flex items-center gap-1.5 border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white cursor-pointer hover:border-hv">
            <span class="text-[12.5px] tnum text-slate-700">{{ ngayVN(ngay) }}</span>
            <span class="text-slate-400 text-[12px]">📅</span>
            <input v-model="ngay" type="date" :max="homNayVN()"
                   class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          </label>
          <button v-if="!laHomNay" @click="ngay = homNayVN()"
                  class="text-[12px] font-semibold text-hv border border-hv/40 rounded-lg px-2.5 py-1.5 hover:bg-hv-soft">Hôm nay</button>
        </div>
        <div class="flex-1"></div>
        <span class="text-[12px] text-slate-500 font-semibold">
          <span v-if="dangTaiNgay" class="text-slate-400">Đang tải…</span>
          <template v-else>Hiển thị <b class="text-slate-700">{{ tongHienThi }}</b> ca</template>
        </span>
      </div>

      <!-- Nhãn khi xem ngày quá khứ (ảnh chụp tĩnh) -->
      <div v-if="!laHomNay" class="mb-3 bg-slate-100 border border-slate-200 text-slate-600 rounded-xl px-3.5 py-2 text-[12.5px] flex items-center flex-wrap gap-x-2">
        <span class="font-semibold">📅 Đang xem ngày {{ ngayVN(ngay) }}</span>
        <span class="text-slate-400">— ảnh chụp, không cập nhật trực tiếp.</span>
        <span v-if="loiNgay" class="text-rose-600 font-semibold">· {{ loiNgay }}</span>
      </div>

      <!-- Cảnh báo khi lọc "Ca của tôi" mà tài khoản chưa gắn mã BS -->
      <div v-if="chiCuaToi && !maBs"
           class="mb-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-[13px]">
        Tài khoản của bạn chưa gắn mã bác sĩ chỉ định nên chưa lọc được "ca của tôi".
        Vui lòng liên hệ quản trị để bổ sung mã bác sĩ. (Vẫn có thể xem <b>Tất cả ca</b>.)
      </div>

      <!-- Danh sách bệnh nhân theo từng phòng chụp -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <section v-for="grp in theoPhong" :key="grp.room.id"
                 class="bg-white border border-[#d6dde6] rounded-xl overflow-hidden flex flex-col">
          <div class="flex items-center justify-between gap-2 bg-slate-50 border-b border-[#e3e9f0] px-3.5 py-2">
            <div class="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap min-w-0">
              <span class="font-bold text-[13.5px] text-slate-800">🏥 {{ grp.room.ten }}</span>
              <a v-if="grp.room.lien_he" :href="`tel:${grp.room.lien_he.replace(/\s+/g, '')}`"
                 class="text-[11.5px] font-semibold text-hv whitespace-nowrap">Liên hệ: {{ grp.room.lien_he }}</a>
            </div>
            <span class="text-[11.5px] font-semibold text-slate-500 shrink-0">{{ grp.ds.length }} ca</span>
          </div>

          <ul v-if="grp.ds.length" class="divide-y divide-[#eef2f6]">
            <li v-for="o in grp.ds" :key="o.id"
                class="flex items-center gap-3 px-3.5 py-2.5"
                :class="[
                  nhanMau(o) ? [nhanMau(o)!.row, nhanMau(o)!.bar]
                    : o.status === 'dang_goi' ? 'bg-hv-soft' : '',
                  !nhanMau(o) && o.ma_bs && o.ma_bs === maBs ? 'shadow-[inset_3px_0_0_var(--color-hv)]' : '',
                ]">
              <div v-if="o.chua_xep" class="tnum text-[18px] font-black text-rose-400 leading-none w-11 shrink-0 text-center">—</div>
              <div v-else class="tnum text-[18px] font-black text-hv leading-none w-11 shrink-0 text-center">{{ stt(o.stt) }}</div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <span class="font-semibold text-[13.5px] text-slate-900 truncate">{{ o.ho_ten }}</span>
                  <span v-if="nhanMau(o)" class="shrink-0 text-[10px] font-extrabold leading-none px-[6px] py-[3px] rounded"
                        :class="nhanMau(o)!.chip" :title="o.nhan!.ten">{{ chipNhan(o.nhan) }}</span>
                  <span v-if="o.ma_bs && o.ma_bs === maBs"
                        class="shrink-0 text-[10px] font-bold text-hv bg-blue-100 rounded px-1.5 py-px">Của tôi</span>
                </div>
                <div class="text-[12px] text-slate-500 truncate">
                  {{ o.tuoi ? o.tuoi + 't · ' : '' }}{{ o.chi_dinh }}
                </div>
                <div v-if="noiChiDinh(o) || o.can_tiem || o.thoi_luong_phut || o.doi_gio"
                     class="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11.5px] mt-0.5">
                  <span v-if="noiChiDinh(o)" class="text-slate-500 truncate min-w-0">
                    📍 <span class="font-semibold text-slate-600">{{ noiChiDinh(o) }}</span>
                  </span>
                  <span v-if="o.can_tiem" class="shrink-0 font-bold text-rose-600">💉 Tiêm thuốc</span>
                  <span v-if="o.thoi_luong_phut" class="shrink-0 text-slate-500 tnum">~{{ o.thoi_luong_phut }}′</span>
                  <span v-if="o.doi_gio" class="shrink-0 text-orange-700 font-semibold">⚠ đổi giờ</span>
                </div>
              </div>
              <!-- Giờ hẹn: nổi bật, canh phải -->
              <div class="shrink-0 w-[62px] text-center leading-none">
                <template v-if="o.gio_hen">
                  <div class="text-[9px] font-bold uppercase tracking-wide text-slate-400">Giờ hẹn</div>
                  <div class="tnum text-[18px] font-black mt-0.5"
                       :class="o.doi_gio ? 'text-orange-700' : 'text-hv'">{{ o.gio_hen }}</div>
                  <div v-if="chamBS(o)" class="text-[10px] font-bold tnum leading-tight" :class="chamBS(o)!.mau"
                       :title="o.gio_hen_goc ? `Hẹn gốc ${o.gio_hen_goc}` : ''">{{ chamBS(o)!.chu }}</div>
                </template>
                <div v-else class="text-[11px] text-slate-300">—</div>
              </div>
              <span class="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded"
                    :class="tt(o).mau">
                <span class="w-[6px] h-[6px] rounded-full" :class="tt(o).cham"></span>{{ tt(o).ten }}
              </span>
            </li>
          </ul>
          <div v-else class="px-3.5 py-6 text-center text-slate-400 text-[12.5px]">
            {{ chiCuaToi ? 'Không có ca của bạn trong phòng này.' : 'Chưa có ca nào.' }}
          </div>
        </section>
      </div>

      <!-- Ca nội trú chờ xếp buổi chiều (hàng giữ — chưa có giờ hẹn) -->
      <section v-if="choXepChieu.length"
               class="mt-3 bg-white border border-indigo-200 rounded-xl overflow-hidden">
        <div class="bg-indigo-50 border-b border-indigo-200 px-3.5 py-2 text-[12.5px] font-bold text-indigo-800 flex items-center flex-wrap gap-x-2">
          🌙 Nội trú · chờ xếp buổi chiều ({{ choXepChieu.length }})
          <span class="font-semibold text-indigo-700/80">— ưu tiên Ngoại trú & Cấp cứu buổi sáng; giờ hẹn có khi KTV xếp vào hàng.</span>
        </div>
        <ul class="divide-y divide-indigo-100">
          <li v-for="o in choXepChieu" :key="o.id" class="flex items-center gap-3 px-3.5 py-2.5"
              :class="o.ma_bs && o.ma_bs === maBs ? 'shadow-[inset_3px_0_0_var(--color-hv)]' : ''">
            <div class="text-[16px] leading-none w-11 shrink-0 text-center">🌙</div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="font-semibold text-[13.5px] text-slate-900 truncate">{{ o.ho_ten }}</span>
                <span v-if="o.ma_bs && o.ma_bs === maBs" class="shrink-0 text-[10px] font-bold text-hv bg-blue-100 rounded px-1.5 py-px">Của tôi</span>
              </div>
              <div class="text-[12px] text-slate-500 truncate">
                {{ o.tuoi ? o.tuoi + 't · ' : '' }}{{ o.chi_dinh }}
                <span v-if="o.khoa_chi_dinh"> · {{ o.khoa_chi_dinh }}</span>
              </div>
            </div>
            <span class="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">Chờ xếp chiều</span>
          </li>
        </ul>
      </section>

      <!-- Ca chưa xếp được phòng (mã HH chưa cấu hình) -->
      <section v-if="chuaXepPhong.length"
               class="mt-3 bg-white border border-rose-200 rounded-xl overflow-hidden">
        <div class="bg-rose-50 border-b border-rose-200 px-3.5 py-2 text-[12.5px] font-bold text-rose-800">
          ⚠ Chưa xếp được phòng — mã HH chưa có trong cấu hình ({{ chuaXepPhong.length }})
        </div>
        <ul class="divide-y divide-rose-100">
          <li v-for="o in chuaXepPhong" :key="o.id" class="flex items-center gap-3 px-3.5 py-2.5">
            <div class="tnum text-[18px] font-black text-rose-400 leading-none w-11 shrink-0 text-center">—</div>
            <div class="min-w-0 flex-1">
              <div class="font-semibold text-[13.5px] text-slate-900 truncate">{{ o.ho_ten }}</div>
              <div class="text-[12px] text-slate-500 truncate">
                {{ o.tuoi ? o.tuoi + 't · ' : '' }}{{ o.chi_dinh }} · Mã HH
                <b class="font-mono">{{ o.ma_hh || '(trống)' }}</b>
              </div>
            </div>
            <span class="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-700">Chưa xếp</span>
          </li>
        </ul>
      </section>

      <!-- Lưu ý lâm sàng: chống chỉ định MRI (tham khảo nhanh) -->
      <section class="mt-3 bg-white border border-[#d6dde6] rounded-xl overflow-hidden">
        <button @click="hienChongCD = !hienChongCD"
                class="w-full flex items-center justify-between px-3.5 py-2.5 text-left">
          <span class="font-bold text-[13px] text-slate-800">⚠️ Lưu ý chống chỉ định MRI</span>
          <span class="text-[12px] text-hv font-semibold">{{ hienChongCD ? 'Ẩn' : 'Xem' }}</span>
        </button>
        <div v-if="hienChongCD" class="px-3.5 pb-3 border-t border-[#eef2f6] pt-2">
          <ul class="space-y-1">
            <li v-for="(c, i) in CHONG_CHI_DINH" :key="i" class="flex gap-2 text-[12.5px] text-slate-700">
              <span class="text-rose-500 shrink-0">•</span><span>{{ c }}</span>
            </li>
          </ul>
          <p class="mt-2 text-[11px] text-slate-400">
            Ca <b class="text-rose-600">💉 Tiêm thuốc</b> cần khai thác chức năng thận (eGFR) và tiền sử dị ứng thuốc tương phản.
          </p>
        </div>
      </section>

      <p class="mt-6 text-center text-[11px] text-slate-400">Phát triển bởi Nguyễn Thành Lâm</p>
    </div>
  </div>
</template>
