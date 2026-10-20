<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import ChiTietChiSo from '@/components/ChiTietChiSo.vue'
import { apiConfig, type ThongKeVanHanh, type LoaiChiTiet } from '@/api/endpoints'
import { thongDiepLoi } from '@/api/client'

// Trang Thống kê (admin): vận hành + đánh giá hiệu quả triển khai theo khoảng ngày.
// Thời gian chờ/chụp/trễ hẹn, mức dùng HIS tự động, tỷ lệ KTV sửa giờ tay, năng suất
// theo phòng/KTV, công bằng giữa các nhóm ưu tiên. Responsive co theo bề ngang.
const tk = ref<ThongKeVanHanh | null>(null)
const loi = ref('')
const dangTai = ref(false)

function ngayVN(lech = 0): string {
  const d = new Date(Date.now() + lech * 86400000)
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
  }).format(d)
}
const tuNgay = ref(ngayVN(-6))   // mặc định 7 ngày gần nhất
const denNgay = ref(ngayVN(0))

async function tai() {
  dangTai.value = true
  try { tk.value = await apiConfig.taiThongKe(tuNgay.value, denNgay.value); loi.value = '' }
  catch (e) { loi.value = thongDiepLoi(e, 'Không tải được số liệu thống kê.') }
  finally { dangTai.value = false }
}
onMounted(tai)

function nhanh(soNgay: number) {
  denNgay.value = ngayVN(0); tuNgay.value = ngayVN(-(soNgay - 1)); tai()
}

const phut = (v: number | null) => (v === null || v === undefined ? '—' : `${v} phút`)
const tren = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

// Panel "Chi tiết": rút một chỉ số xuống danh sách ca/sự kiện. Dùng khoảng ngày của
// số liệu ĐANG HIỂN THỊ (tk.khoang), không phải ô ngày đang sửa dở chưa bấm Xem.
const chiTiet = ref<{ loai: LoaiChiTiet; tieuDe: string; khoa?: string | null; loc?: string } | null>(null)
function xem(loai: LoaiChiTiet, tieuDe: string, khoa: string | null = null, loc?: string) {
  chiTiet.value = { loai, tieuDe, khoa, loc }
}

const KPI = computed(() => tk.value ? [
  { ten: 'Ca tiếp nhận', so: tk.value.ca.tiep_nhan, mau: 'text-hv', phu: '', loai: 'tiep_nhan' as const },
  { ten: 'Đã chụp', so: tk.value.ca.hoan_thanh, mau: 'text-emerald-600', phu: '', loai: 'hoan_thanh' as const },
  { ten: 'Hủy', so: tk.value.ca.huy, mau: 'text-rose-600',
    phu: `${tren(tk.value.ca.huy, tk.value.ca.tiep_nhan)}%`, loai: 'huy' as const },
  { ten: 'Quá lượt', so: tk.value.ca.qua_luot, mau: 'text-amber-600', phu: '', loai: 'qua_luot' as const },
] : [])

// Tỷ lệ dùng HIS tự động (adoption) — càng cao vận hành càng trơn.
const tyLeHis = computed(() => {
  if (!tk.value) return 0
  const t = tk.value.nguon.his + tk.value.nguon.thu_cong
  return tren(tk.value.nguon.his, t)
})
// Tỷ lệ ca bị sửa giờ tay — càng thấp luật tự động càng khớp.
const tyLeSuaGio = computed(() =>
  tk.value ? tren(tk.value.sua_gio_tay.so_ca_sua, tk.value.sua_gio_tay.tong_ca) : 0)

const maxCaPhong = computed(() =>
  Math.max(1, ...(tk.value?.theo_phong.map((p) => p.hoan_thanh) ?? [1])))
const maxCaKtv = computed(() =>
  Math.max(1, ...(tk.value?.theo_ktv.map((k) => k.hoan_thanh + k.goi) ?? [1])))
const maxChoNhom = computed(() =>
  Math.max(1, ...(tk.value?.theo_nhom_uu_tien.map((n) => n.cho_tb ?? 0) ?? [1])))
const maxGioCC = computed(() =>
  Math.max(1, ...(tk.value?.cap_cuu.theo_gio.map((g) => g.so_ca) ?? [1])))
const maxChamNgay = computed(() =>
  Math.max(1, ...(tk.value?.cham_hen.theo_ngay.map((d) => d.cham_tb ?? 0) ?? [1])))
const ngayNgan = (s: string) => { const [, m, d] = s.split('-'); return d && m ? `${d}/${m}` : s }
</script>

<template>
  <div class="min-h-screen flex flex-col bg-[#eef1f5]">
    <AppHeader tieu-de="Thống kê & hiệu quả" />

    <div class="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-4 py-4 space-y-4">
      <!-- Bộ lọc khoảng ngày -->
      <div class="bg-white rounded-xl border border-[#d6dde6] p-3 sm:p-4 flex flex-wrap items-end gap-3">
        <div>
          <label class="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Từ ngày</label>
          <input v-model="tuNgay" type="date" class="border border-[#d6dde6] rounded-lg px-2.5 py-1.5 text-[13px]" />
        </div>
        <div>
          <label class="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Đến ngày</label>
          <input v-model="denNgay" type="date" class="border border-[#d6dde6] rounded-lg px-2.5 py-1.5 text-[13px]" />
        </div>
        <button @click="tai" :disabled="dangTai"
                class="bg-hv text-white font-semibold text-[13px] rounded-lg px-4 py-1.5 disabled:opacity-60">
          {{ dangTai ? 'Đang tải…' : 'Xem' }}
        </button>
        <div class="flex gap-1.5 ml-auto">
          <button v-for="n in [{ t: 'Hôm nay', d: 1 }, { t: '7 ngày', d: 7 }, { t: '30 ngày', d: 30 }]" :key="n.d"
                  @click="nhanh(n.d)"
                  class="text-[12px] font-semibold border border-[#d6dde6] rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-50">
            {{ n.t }}
          </button>
        </div>
      </div>

      <p v-if="loi" class="bg-rose-50 border border-rose-200 text-rose-700 text-[13px] rounded-lg px-3 py-2">{{ loi }}</p>
      <div v-if="!tk && !loi" class="text-slate-400 text-[13px]">Đang tải số liệu…</div>

      <template v-if="tk">
        <!-- KPI ca -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button v-for="k in KPI" :key="k.ten" type="button" @click="xem(k.loai, k.ten)"
                  class="group text-left bg-white rounded-xl border border-[#d6dde6] px-4 py-3 hover:border-hv hover:shadow-sm transition">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[11px] uppercase tracking-wide text-slate-500 font-bold">{{ k.ten }}</span>
              <span class="ct-link">Chi tiết ›</span>
            </div>
            <div class="flex items-baseline gap-2 mt-1">
              <span class="text-3xl font-extrabold tnum" :class="k.mau">{{ k.so }}</span>
              <span v-if="k.phu" class="text-[12px] font-bold text-slate-400">{{ k.phu }}</span>
            </div>
          </button>
        </div>

        <!-- Thời gian + hiệu quả -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-white rounded-xl border border-[#d6dde6] p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-slate-800">Thời gian trung bình</h3>
              <button type="button" class="ct-link" @click="xem('thoi_gian', 'Thời gian chờ / chụp / lệch hẹn từng ca')">Chi tiết ›</button>
            </div>
            <div class="grid grid-cols-3 gap-3 text-center">
              <div class="border border-[#d6dde6] rounded-lg px-2 py-3">
                <div class="text-2xl font-extrabold text-amber-600 tnum">{{ phut(tk.thoi_gian.cho_tb) }}</div>
                <div class="text-[11px] text-slate-500 font-semibold mt-0.5">Chờ (vào hàng → gọi)</div>
              </div>
              <div class="border border-[#d6dde6] rounded-lg px-2 py-3">
                <div class="text-2xl font-extrabold text-sky-600 tnum">{{ phut(tk.thoi_gian.chup_tb) }}</div>
                <div class="text-[11px] text-slate-500 font-semibold mt-0.5">Chụp (gọi → xong)</div>
              </div>
              <div class="border border-[#d6dde6] rounded-lg px-2 py-3">
                <div class="text-2xl font-extrabold tnum"
                     :class="(tk.thoi_gian.tre_hen_tb ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-600'">
                  {{ phut(tk.thoi_gian.tre_hen_tb) }}
                </div>
                <div class="text-[11px] text-slate-500 font-semibold mt-0.5">Lệch giờ hẹn (+ = trễ)</div>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-xl border border-[#d6dde6] p-4">
            <h3 class="font-bold text-slate-800 mb-3">Hiệu quả triển khai</h3>
            <div class="space-y-3">
              <div>
                <div class="flex justify-between text-[12.5px] mb-1">
                  <span class="font-semibold text-slate-700">Dùng HIS tự động
                    <button type="button" class="ct-link ml-1.5" @click="xem('nguon', 'Nguồn ca (HIS / nhập tay)')">Chi tiết ›</button>
                  </span>
                  <span class="tnum text-slate-500">
                    <b class="text-emerald-600">{{ tyLeHis }}%</b>
                    · {{ tk.nguon.his }} HIS / {{ tk.nguon.thu_cong }} nhập tay
                  </span>
                </div>
                <div class="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div class="bg-emerald-500 h-full" :style="{ width: tyLeHis + '%' }"></div>
                </div>
              </div>
              <div>
                <div class="flex justify-between text-[12.5px] mb-1">
                  <span class="font-semibold text-slate-700">Ca bị sửa giờ tay
                    <button type="button" class="ct-link ml-1.5" @click="xem('sua_gio', 'Ca bị sửa giờ tay')">Chi tiết ›</button>
                  </span>
                  <span class="tnum text-slate-500">
                    <b :class="tyLeSuaGio > 20 ? 'text-rose-600' : 'text-slate-700'">{{ tyLeSuaGio }}%</b>
                    · {{ tk.sua_gio_tay.so_ca_sua }} ca / {{ tk.sua_gio_tay.so_lan_doi_gio }} lần
                  </span>
                </div>
                <div class="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div class="h-full" :class="tyLeSuaGio > 20 ? 'bg-rose-500' : 'bg-amber-400'"
                       :style="{ width: tyLeSuaGio + '%' }"></div>
                </div>
                <p class="text-[11px] text-slate-400 mt-1">Càng thấp, giờ hẹn tự tính càng sát — ít phải can thiệp tay.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Theo phòng + theo nhóm ưu tiên -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-white rounded-xl border border-[#d6dde6] p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-slate-800">Năng suất theo phòng</h3>
              <button type="button" class="ct-link" @click="xem('phong', 'Ca đã chụp — mọi phòng', null, 'hoan_thanh')">Chi tiết ›</button>
            </div>
            <div v-if="!tk.theo_phong.length" class="text-slate-400 text-[13px]">Chưa có dữ liệu.</div>
            <div v-for="p in tk.theo_phong" :key="p.ten" class="ct-dong mb-2.5 last:mb-0"
                 role="button" tabindex="0" title="Xem chi tiết phòng này"
                 @click="xem('phong', `Ca đã chụp — ${p.ten}`, p.ten, 'hoan_thanh')"
                 @keydown.enter="xem('phong', `Ca đã chụp — ${p.ten}`, p.ten, 'hoan_thanh')">
              <div class="flex justify-between text-[13px] mb-1">
                <span class="font-semibold text-slate-700">{{ p.ten }}</span>
                <span class="text-slate-500 tnum">{{ p.hoan_thanh }} ca · chờ {{ phut(p.cho_tb) }}</span>
              </div>
              <div class="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div class="bg-sky-500 h-full" :style="{ width: (p.hoan_thanh / maxCaPhong * 100) + '%' }"></div>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-xl border border-[#d6dde6] p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-slate-800">Chờ theo nhóm ưu tiên</h3>
              <button type="button" class="ct-link" @click="xem('nhom', 'Ca theo nhóm ưu tiên — mọi nhóm')">Chi tiết ›</button>
            </div>
            <div v-if="!tk.theo_nhom_uu_tien.length" class="text-slate-400 text-[13px]">Chưa có dữ liệu.</div>
            <div v-for="n in tk.theo_nhom_uu_tien" :key="n.ten" class="ct-dong mb-2.5 last:mb-0"
                 role="button" tabindex="0" title="Xem chi tiết nhóm này"
                 @click="xem('nhom', `Nhóm ${n.ten}`, n.ten)" @keydown.enter="xem('nhom', `Nhóm ${n.ten}`, n.ten)">
              <div class="flex justify-between text-[13px] mb-1">
                <span class="font-semibold text-slate-700">{{ n.ten }}</span>
                <span class="text-slate-500 tnum">{{ n.so_ca }} ca · chờ {{ phut(n.cho_tb) }}</span>
              </div>
              <div class="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div class="bg-indigo-500 h-full" :style="{ width: ((n.cho_tb ?? 0) / maxChoNhom * 100) + '%' }"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Tầng sâu: Cấp cứu chen hàng + Xu hướng độ chậm so với lịch gốc -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- Cấp cứu chen hàng -->
          <div class="bg-white rounded-xl border border-[#d6dde6] p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-slate-800">Cấp cứu chen hàng</h3>
              <div class="text-[12px] text-slate-500 tnum">
                <b class="text-rose-600">{{ tk.cap_cuu.tong }}</b> ca ·
                <b class="text-amber-600">{{ tk.cap_cuu.chen }}</b> lượt chen
                <button type="button" class="ct-link ml-1.5" @click="xem('cap_cuu', 'Ca cấp cứu')">Chi tiết ›</button>
              </div>
            </div>
            <div v-if="!tk.cap_cuu.theo_gio.length" class="text-slate-400 text-[13px]">
              Chưa có ca cấp cứu trong khoảng này.
            </div>
            <div v-else>
              <div class="text-[11px] text-slate-500 font-semibold mb-1.5">Phân bố theo khung giờ (giờ VN)</div>
              <div v-for="g in tk.cap_cuu.theo_gio" :key="g.gio" class="ct-dong flex items-center gap-2 mb-1 last:mb-0"
                   role="button" tabindex="0" title="Xem ca cấp cứu trong khung giờ này"
                   @click="xem('cap_cuu', `Ca cấp cứu khung ${String(g.gio).padStart(2, '0')}h`, String(g.gio))"
                   @keydown.enter="xem('cap_cuu', `Ca cấp cứu khung ${String(g.gio).padStart(2, '0')}h`, String(g.gio))">
                <span class="w-10 shrink-0 text-right text-[12px] tnum text-slate-500">{{ String(g.gio).padStart(2, '0') }}h</span>
                <div class="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div class="bg-rose-500 h-full" :style="{ width: (g.so_ca / maxGioCC * 100) + '%' }"></div>
                </div>
                <span class="w-6 shrink-0 text-[12px] tnum font-bold text-slate-600">{{ g.so_ca }}</span>
              </div>
              <p class="mt-2 text-[11px] text-slate-400">Khung giờ cấp cứu dày → nên tăng <b>đệm cấp cứu</b> cho khung đó.</p>
            </div>
          </div>

          <!-- Xu hướng độ chậm so với lịch gốc -->
          <div class="bg-white rounded-xl border border-[#d6dde6] p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-slate-800">Độ chậm so với lịch gốc</h3>
              <div class="text-[12px] text-slate-500 tnum">
                TB <b :class="(tk.cham_hen.tb ?? 0) > 15 ? 'text-rose-600' : 'text-slate-700'">{{ phut(tk.cham_hen.tb) }}</b>
                · P90 <b class="text-amber-600">{{ phut(tk.cham_hen.p90) }}</b>
                · tối đa <b class="text-rose-600">{{ phut(tk.cham_hen.max) }}</b>
                <button type="button" class="ct-link ml-1.5" @click="xem('cham', 'Độ chậm so với lịch gốc từng ca')">Chi tiết ›</button>
              </div>
            </div>
            <div v-if="!tk.cham_hen.theo_ngay.length" class="text-slate-400 text-[13px]">
              Chưa có dữ liệu độ chậm (chốt khi ca được gọi).
            </div>
            <div v-else>
              <div class="text-[11px] text-slate-500 font-semibold mb-1.5">Chậm trung bình theo ngày (phút)</div>
              <div v-for="d in tk.cham_hen.theo_ngay" :key="d.ngay" class="ct-dong flex items-center gap-2 mb-1 last:mb-0"
                   role="button" tabindex="0" title="Xem các ca của ngày này"
                   @click="xem('cham', `Độ chậm ngày ${ngayNgan(d.ngay)}`, d.ngay)"
                   @keydown.enter="xem('cham', `Độ chậm ngày ${ngayNgan(d.ngay)}`, d.ngay)">
                <span class="w-10 shrink-0 text-right text-[12px] tnum text-slate-500">{{ ngayNgan(d.ngay) }}</span>
                <div class="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div class="h-full" :class="(d.cham_tb ?? 0) > 15 ? 'bg-rose-500' : 'bg-amber-400'"
                       :style="{ width: ((d.cham_tb ?? 0) / maxChamNgay * 100) + '%' }"></div>
                </div>
                <span class="w-10 shrink-0 text-[12px] tnum font-bold text-slate-600">{{ d.cham_tb ?? 0 }}′</span>
              </div>
              <p class="mt-2 text-[11px] text-slate-400">Độ trễ thực tế bệnh nhân gánh (lúc được gọi) so với giờ hẹn ban đầu.</p>
            </div>
          </div>
        </div>

        <!-- Theo KTV -->
        <div class="bg-white rounded-xl border border-[#d6dde6] p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-slate-800">Năng suất theo người thao tác</h3>
            <button type="button" class="ct-link" @click="xem('ktv', 'Thao tác của mọi người')">Chi tiết ›</button>
          </div>
          <div v-if="!tk.theo_ktv.length" class="text-slate-400 text-[13px]">Chưa có thao tác nào trong khoảng này.</div>
          <table v-else class="w-full text-[13px]">
            <thead>
              <tr class="text-[11px] uppercase tracking-wide text-slate-500 border-b border-[#eef2f6]">
                <th class="text-left font-bold py-1.5">Người</th>
                <th class="text-right font-bold py-1.5">Gọi</th>
                <th class="text-right font-bold py-1.5">Hoàn thành</th>
                <th class="text-right font-bold py-1.5">Sửa giờ</th>
                <th class="w-[35%] pl-3 hidden sm:table-cell"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="k in tk.theo_ktv" :key="k.ho_ten" class="ct-dong border-b border-[#f3f6f9] last:border-0"
                  tabindex="0" title="Xem thao tác của người này"
                  @click="xem('ktv', `Thao tác — ${k.ho_ten}`, k.ho_ten)" @keydown.enter="xem('ktv', `Thao tác — ${k.ho_ten}`, k.ho_ten)">
                <td class="py-1.5 font-semibold text-slate-700">{{ k.ho_ten }}</td>
                <td class="py-1.5 text-right tnum text-slate-600">{{ k.goi }}</td>
                <td class="py-1.5 text-right tnum font-bold text-emerald-600">{{ k.hoan_thanh }}</td>
                <td class="py-1.5 text-right tnum text-amber-600">{{ k.doi_gio }}</td>
                <td class="py-1.5 pl-3 hidden sm:table-cell">
                  <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div class="bg-sky-500 h-full"
                         :style="{ width: ((k.hoan_thanh + k.goi) / maxCaKtv * 100) + '%' }"></div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <ChiTietChiSo v-if="chiTiet && tk"
                  :loai="chiTiet.loai" :khoa="chiTiet.khoa" :tieu-de="chiTiet.tieuDe"
                  :loc-trang-thai="chiTiet.loc"
                  :tu-ngay="tk.khoang.tu_ngay" :den-ngay="tk.khoang.den_ngay"
                  @dong="chiTiet = null" />
  </div>
</template>

<style scoped>
.ct-link {
  font-size: 11.5px; font-weight: 700; color: var(--color-hv); white-space: nowrap;
  border-radius: 6px; padding: 1px 4px; margin-right: -4px;
}
button.ct-link:hover, .group:hover .ct-link { text-decoration: underline; }
/* Dòng con bấm được (phòng/nhóm/giờ/ngày/người) → mở chi tiết đã lọc */
.ct-dong { cursor: pointer; border-radius: 6px; }
.ct-dong:hover { background: #f5f8fc; }
.ct-dong:focus-visible { outline: 2px solid var(--color-hv); outline-offset: 2px; }
</style>
