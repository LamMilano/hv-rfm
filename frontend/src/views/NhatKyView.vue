<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import { apiConfig, type DongNhatKy } from '@/api/endpoints'
import { thongDiepLoi } from '@/api/client'

// Trang Nhật ký hệ thống (admin): dòng thời gian sự kiện ngoài phạm vi ca — đăng nhập,
// đổi cấu hình, kéo HIS, quản trị user, lỗi. Lọc theo nhóm/mức độ + khoảng ngày, phân
// trang. Bấm 1 dòng để xem chi tiết giá trị cũ → mới. Responsive co theo bề ngang.
const dong = ref<DongNhatKy[]>([])
const tong = ref(0)
const loi = ref('')
const dangTai = ref(false)
const moRong = ref<number | null>(null)

const LIMIT = 50
const offset = ref(0)
const fNhom = ref('')
const fMucDo = ref('')
const fTu = ref('')
const fDen = ref('')

const NHOM: Record<string, string> = {
  auth: 'Đăng nhập', config: 'Cấu hình', his: 'HIS', user: 'Người dùng', he_thong: 'Hệ thống',
}
const MUC_DO: Record<string, { ten: string; lop: string }> = {
  info: { ten: 'Thông tin', lop: 'bg-slate-100 text-slate-600' },
  warn: { ten: 'Cảnh báo', lop: 'bg-amber-100 text-amber-700' },
  error: { ten: 'Lỗi', lop: 'bg-rose-100 text-rose-700' },
}

async function tai() {
  dangTai.value = true
  try {
    const kq = await apiConfig.taiNhatKy({
      nhom: fNhom.value || undefined, muc_do: fMucDo.value || undefined,
      tu_ngay: fTu.value || undefined, den_ngay: fDen.value || undefined,
      limit: LIMIT, offset: offset.value,
    })
    dong.value = kq.dong; tong.value = kq.tong; loi.value = ''
  } catch (e) { loi.value = thongDiepLoi(e, 'Không đọc được nhật ký.') }
  finally { dangTai.value = false }
}
onMounted(tai)

function loc() { offset.value = 0; moRong.value = null; tai() }
function trang(buoc: number) {
  const moi = offset.value + buoc * LIMIT
  if (moi < 0 || moi >= tong.value) return
  offset.value = moi; moRong.value = null; tai()
}

const tuTrang = computed(() => (tong.value ? offset.value + 1 : 0))
const denTrang = computed(() => Math.min(offset.value + LIMIT, tong.value))

function gio(iso: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(iso))
}
function json(v: unknown): string {
  if (v === null || v === undefined) return '—'
  return typeof v === 'string' ? v : JSON.stringify(v, null, 2)
}
function coChiTiet(d: DongNhatKy): boolean {
  return d.gia_tri_cu != null || d.gia_tri_moi != null || d.ip != null || d.doi_tuong != null
}
// Dòng "Lỗi" luôn mở sẵn chi tiết (không cần bấm) để hồi cứu nhanh.
const laLoi = (d: DongNhatKy) => d.muc_do === 'error'
const dangMo = (d: DongNhatKy) => laLoi(d) || moRong.value === d.id
function bamDong(d: DongNhatKy) {
  if (laLoi(d)) return
  moRong.value = moRong.value === d.id ? null : d.id
}

// Lỗi gốc (backend chiTietLoi): tên, mã, thông điệp + chuỗi nguyên nhân (err.cause).
interface LoiGoc {
  ten_loi?: string | null; thong_diep?: string | null; ma?: string | null
  nguyen_nhan?: LoiGoc | null; stack?: string | null
}
// Trải chuỗi nguyên nhân thành danh sách cấp để hiển thị lần lượt.
function chuoiLoi(l: LoiGoc | null | undefined): LoiGoc[] {
  const out: LoiGoc[] = []
  for (let c = l; c && out.length < 5; c = c.nguyen_nhan) out.push(c)
  return out
}

// Chi tiết lỗi HIS (ghi vào gia_tri_moi): nhận diện qua các trường url/http_status để
// hiển thị dạng nhãn dễ đọc thay cho khối "Mới" chung. Trả null nếu không phải.
interface ChiTietLoiHIS {
  nguon?: string; loai_loi?: string; url?: string; tuNgay?: string; denNgay?: string
  http_status?: number | null; timeout_ms?: number
  his_success?: boolean | null; his_statusCode?: number | null
  his_message?: string | null; his_errors?: unknown
  his_timeStamp?: string | null; thoi_luong_ms?: number; headers?: Record<string, string>
  loi_goc?: LoiGoc | null
}
function chiTietLoiHis(d: DongNhatKy): ChiTietLoiHIS | null {
  if (d.nhom !== 'his' || d.muc_do !== 'error') return null
  const v = d.gia_tri_moi
  if (v && typeof v === 'object' && ('http_status' in v || 'url' in v)) return v as ChiTietLoiHIS
  return null
}
// Lỗi không phải lỗi gọi HIS (DB, lập trình…): gia_tri_moi = { nguon?, loi_goc }.
function chiTietLoiChung(d: DongNhatKy): { nguon?: string; loi_goc: LoiGoc } | null {
  const v = d.gia_tri_moi
  if (v && typeof v === 'object' && 'loi_goc' in v && !chiTietLoiHis(d)) return v as { nguon?: string; loi_goc: LoiGoc }
  return null
}
const NGUON_LOI: Record<string, string> = {
  poller: 'Vòng kéo tự động', lam_moi_thu_cong: 'Làm mới thủ công',
}
const LOAI_LOI: Record<string, string> = {
  http: 'HIS phản hồi lỗi', timeout: 'Quá thời gian chờ (timeout)', mang: 'Không kết nối được (mạng)',
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-[#eef1f5]">
    <AppHeader tieu-de="Nhật ký hệ thống" />

    <div class="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-4 py-4 space-y-4">
      <!-- Bộ lọc -->
      <div class="bg-white rounded-xl border border-[#d6dde6] p-3 sm:p-4 flex flex-wrap items-end gap-3">
        <div>
          <label class="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Nhóm</label>
          <select v-model="fNhom" class="border border-[#d6dde6] rounded-lg px-2.5 py-1.5 text-[13px]">
            <option value="">Tất cả</option>
            <option v-for="(ten, ma) in NHOM" :key="ma" :value="ma">{{ ten }}</option>
          </select>
        </div>
        <div>
          <label class="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Mức độ</label>
          <select v-model="fMucDo" class="border border-[#d6dde6] rounded-lg px-2.5 py-1.5 text-[13px]">
            <option value="">Tất cả</option>
            <option value="info">Thông tin</option>
            <option value="warn">Cảnh báo</option>
            <option value="error">Lỗi</option>
          </select>
        </div>
        <div>
          <label class="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Từ ngày</label>
          <input v-model="fTu" type="date" class="border border-[#d6dde6] rounded-lg px-2.5 py-1.5 text-[13px]" />
        </div>
        <div>
          <label class="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Đến ngày</label>
          <input v-model="fDen" type="date" class="border border-[#d6dde6] rounded-lg px-2.5 py-1.5 text-[13px]" />
        </div>
        <button @click="loc" :disabled="dangTai"
                class="bg-hv text-white font-semibold text-[13px] rounded-lg px-4 py-1.5 disabled:opacity-60">
          {{ dangTai ? 'Đang tải…' : 'Lọc' }}
        </button>
      </div>

      <p v-if="loi" class="bg-rose-50 border border-rose-200 text-rose-700 text-[13px] rounded-lg px-3 py-2">{{ loi }}</p>

      <!-- Danh sách -->
      <div class="bg-white rounded-xl border border-[#d6dde6] overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2.5 border-b border-[#eef2f6] text-[12.5px]">
          <span class="font-semibold text-slate-600">
            {{ tong ? `${tuTrang}–${denTrang} / ${tong} dòng` : 'Không có dòng nào' }}
          </span>
          <div class="flex gap-1.5">
            <button @click="trang(-1)" :disabled="offset === 0"
                    class="border border-[#d6dde6] rounded-lg px-2.5 py-1 font-semibold text-slate-600 disabled:opacity-40">← Trước</button>
            <button @click="trang(1)" :disabled="denTrang >= tong"
                    class="border border-[#d6dde6] rounded-lg px-2.5 py-1 font-semibold text-slate-600 disabled:opacity-40">Sau →</button>
          </div>
        </div>

        <div v-if="!dong.length && !dangTai" class="px-4 py-8 text-center text-slate-400 text-[13px]">
          Không có sự kiện nào khớp bộ lọc.
        </div>

        <ul v-else class="divide-y divide-[#f3f6f9]">
          <li v-for="d in dong" :key="d.id">
            <button type="button" @click="bamDong(d)"
                    class="w-full text-left px-4 py-2.5 flex items-start gap-3"
                    :class="laLoi(d) ? 'cursor-default bg-rose-50/40' : 'hover:bg-slate-50'">
              <span class="text-[11.5px] text-slate-400 tnum shrink-0 w-[92px] pt-0.5">{{ gio(d.thoi_diem) }}</span>
              <span class="shrink-0 text-[10px] font-extrabold uppercase tracking-wide px-1.5 py-[2px] rounded"
                    :class="MUC_DO[d.muc_do]?.lop ?? 'bg-slate-100 text-slate-600'">{{ MUC_DO[d.muc_do]?.ten ?? d.muc_do }}</span>
              <span class="min-w-0 flex-1">
                <span class="text-[11px] font-bold text-hv">{{ NHOM[d.nhom] ?? d.nhom }}</span>
                <span class="text-[11px] text-slate-400"> · {{ d.loai }}</span>
                <span class="block text-[13px] text-slate-700"
                      :class="laLoi(d) ? 'break-words' : 'truncate'">{{ d.mo_ta ?? d.doi_tuong ?? '—' }}</span>
              </span>
              <span v-if="d.actor_ten" class="shrink-0 text-[11.5px] text-slate-500 pt-0.5 hidden sm:block">{{ d.actor_ten }}</span>
              <span v-if="coChiTiet(d) && !laLoi(d)" class="shrink-0 text-slate-300 pt-0.5">{{ moRong === d.id ? '▾' : '▸' }}</span>
            </button>

            <div v-if="dangMo(d)" class="px-4 pb-3 pl-4 sm:pl-[119px] text-[12px] space-y-1.5 min-w-0"
                 :class="laLoi(d) ? 'bg-rose-50/40' : 'bg-slate-50/60'">
              <div v-if="d.actor_ten" class="text-slate-600"><b>Người:</b> {{ d.actor_ten }}
                <span v-if="d.actor_role" class="text-slate-400">({{ d.actor_role }})</span>
                <span v-if="d.ip" class="text-slate-400"> · IP {{ d.ip }}</span>
              </div>
              <div v-if="d.doi_tuong" class="text-slate-600"><b>Đối tượng:</b> <code class="text-[11.5px]">{{ d.doi_tuong }}</code></div>

              <!-- Lỗi HIS: hiển thị chi tiết chẩn đoán dạng nhãn để hồi cứu -->
              <template v-if="chiTietLoiHis(d)">
                <div class="text-slate-700 font-semibold">Chi tiết lỗi HIS</div>
                <div v-if="chiTietLoiHis(d)!.nguon" class="text-slate-600">
                  <b>Nguồn:</b> {{ NGUON_LOI[chiTietLoiHis(d)!.nguon!] ?? chiTietLoiHis(d)!.nguon }}
                </div>
                <div v-if="chiTietLoiHis(d)!.loai_loi" class="text-slate-600">
                  <b>Loại lỗi:</b> <span class="text-rose-700 font-semibold">{{ LOAI_LOI[chiTietLoiHis(d)!.loai_loi!] ?? chiTietLoiHis(d)!.loai_loi }}</span>
                  <span v-if="chiTietLoiHis(d)!.timeout_ms != null" class="text-slate-500">
                    · ngưỡng timeout {{ chiTietLoiHis(d)!.timeout_ms }} ms</span>
                </div>
                <div v-if="chiTietLoiHis(d)!.http_status != null" class="text-slate-600">
                  <b>HTTP:</b> <code class="text-[11.5px] text-rose-700">{{ chiTietLoiHis(d)!.http_status }}</code>
                  <span v-if="chiTietLoiHis(d)!.his_statusCode != null" class="text-slate-500">
                    · statusCode HIS: {{ chiTietLoiHis(d)!.his_statusCode }}</span>
                  <span v-if="chiTietLoiHis(d)!.his_success != null" class="text-slate-500">
                    · success: {{ chiTietLoiHis(d)!.his_success }}</span>
                </div>
                <div v-if="chiTietLoiHis(d)!.his_message" class="text-slate-600">
                  <b>Thông điệp HIS:</b> {{ chiTietLoiHis(d)!.his_message }}
                </div>
                <div v-if="chiTietLoiHis(d)!.tuNgay || chiTietLoiHis(d)!.denNgay" class="text-slate-600">
                  <b>Khoảng kéo:</b>
                  <code class="text-[11.5px]">{{ chiTietLoiHis(d)!.tuNgay }}</code> →
                  <code class="text-[11.5px]">{{ chiTietLoiHis(d)!.denNgay }}</code>
                </div>
                <div v-if="chiTietLoiHis(d)!.his_timeStamp" class="text-slate-600">
                  <b>timeStamp HIS:</b> <code class="text-[11.5px]">{{ chiTietLoiHis(d)!.his_timeStamp }}</code>
                </div>
                <div v-if="chiTietLoiHis(d)!.thoi_luong_ms != null" class="text-slate-600">
                  <b>Thời lượng:</b> {{ chiTietLoiHis(d)!.thoi_luong_ms }} ms
                </div>
                <div v-if="chiTietLoiHis(d)!.url" class="text-slate-600">
                  <b>URL gọi:</b> <code class="text-[11.5px] break-all">{{ chiTietLoiHis(d)!.url }}</code>
                </div>
                <div v-if="chiTietLoiHis(d)!.headers && Object.keys(chiTietLoiHis(d)!.headers!).length" class="text-slate-600">
                  <b>Header phản hồi:</b>
                  <pre class="inline whitespace-pre-wrap break-words text-[11.5px]">{{ json(chiTietLoiHis(d)!.headers) }}</pre>
                </div>
                <div v-if="chiTietLoiHis(d)!.his_errors != null" class="text-slate-600">
                  <b>errors:</b> <pre class="inline whitespace-pre-wrap break-words text-[11.5px] text-rose-700">{{ json(chiTietLoiHis(d)!.his_errors) }}</pre>
                </div>
                <template v-if="chiTietLoiHis(d)!.loi_goc">
                  <div v-for="(c, i) in chuoiLoi(chiTietLoiHis(d)!.loi_goc)" :key="i" class="text-slate-600 break-words">
                    <b>{{ i === 0 ? 'Lỗi gốc:' : '↳ Nguyên nhân:' }}</b>
                    <code class="text-[11.5px] text-rose-700">{{ c.ten_loi ?? 'Error' }}<template v-if="c.ma"> [{{ c.ma }}]</template></code>
                    — {{ c.thong_diep ?? '—' }}
                  </div>
                  <pre v-if="chiTietLoiHis(d)!.loi_goc!.stack"
                       class="whitespace-pre-wrap break-words text-[11px] text-slate-500 bg-white border border-[#eef2f6] rounded p-2">{{ chiTietLoiHis(d)!.loi_goc!.stack }}</pre>
                </template>
              </template>

              <!-- Lỗi khác (DB, lập trình…): tên/mã/nguyên nhân/stack -->
              <template v-else-if="chiTietLoiChung(d)">
                <div class="text-slate-700 font-semibold">Chi tiết lỗi</div>
                <div v-if="chiTietLoiChung(d)!.nguon" class="text-slate-600">
                  <b>Nguồn:</b> {{ NGUON_LOI[chiTietLoiChung(d)!.nguon!] ?? chiTietLoiChung(d)!.nguon }}
                </div>
                <div v-for="(c, i) in chuoiLoi(chiTietLoiChung(d)!.loi_goc)" :key="i" class="text-slate-600 break-words">
                  <b>{{ i === 0 ? 'Lỗi:' : '↳ Nguyên nhân:' }}</b>
                  <code class="text-[11.5px] text-rose-700">{{ c.ten_loi ?? 'Error' }}<template v-if="c.ma"> [{{ c.ma }}]</template></code>
                  — {{ c.thong_diep ?? '—' }}
                </div>
                <pre v-if="chiTietLoiChung(d)!.loi_goc.stack"
                     class="whitespace-pre-wrap break-words text-[11px] text-slate-500 bg-white border border-[#eef2f6] rounded p-2">{{ chiTietLoiChung(d)!.loi_goc.stack }}</pre>
              </template>

              <div v-else-if="laLoi(d) && d.gia_tri_cu == null && d.gia_tri_moi == null" class="text-slate-500 italic">
                Không có chi tiết lỗi — bản ghi cũ, tạo trước khi hệ thống bổ sung ghi chi tiết.
              </div>

              <template v-else>
                <div v-if="d.gia_tri_cu != null" class="text-slate-600">
                  <b>Cũ:</b> <pre class="inline whitespace-pre-wrap break-words text-[11.5px] text-rose-700">{{ json(d.gia_tri_cu) }}</pre>
                </div>
                <div v-if="d.gia_tri_moi != null" class="text-slate-600">
                  <b>Mới:</b> <pre class="inline whitespace-pre-wrap break-words text-[11.5px] text-emerald-700">{{ json(d.gia_tri_moi) }}</pre>
                </div>
              </template>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
