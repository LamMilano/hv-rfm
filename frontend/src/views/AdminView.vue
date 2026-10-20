<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import { apiConfig, type CauHinh, type KhoaHRM, type NhanVienHRM } from '@/api/endpoints'
import { thongDiepLoi } from '@/api/client'
import { COT_DIEU_PHOI, COT_CHINH_MAC_DINH,
  FIELD_UU_TIEN, TOAN_TU_SO, TOAN_TU_CHUOI, kieuField, dungLuat, docLuat,
  MAU_NHAN_CHON, kieuMau, chipNhan,
  type MenhDeUuTien } from '@/types'

// Trang quản trị — Cấu hình (§12). Nối API: tuyến mã HH, nhóm ưu tiên, mẫu thông
// báo (app_settings), người dùng. Responsive: menu ngang trên phone.
const muc = ref<'hh' | 'uu_tien' | 'thong_bao' | 'tich_hop' | 'cap_cuu' | 'hien_thi' | 'users'>('hh')
const MUC = [
  { ma: 'hh', ten: 'Ánh xạ mã HH → phòng' },
  { ma: 'uu_tien', ten: 'Nhóm ưu tiên' },
  { ma: 'thong_bao', ten: 'Mẫu thông báo' },
  { ma: 'tich_hop', ten: 'Tích hợp HIS' },
  { ma: 'cap_cuu', ten: 'Điều phối cấp cứu' },
  { ma: 'hien_thi', ten: 'Hiển thị màn điều phối' },
  { ma: 'users', ten: 'Người dùng' },
] as const

const cfg = ref<CauHinh | null>(null)
const loi = ref('')
const bao = ref('')

async function tai() {
  try { cfg.value = await apiConfig.tai(); loi.value = '' }
  catch (e) { loi.value = thongDiepLoi(e, 'Không tải được cấu hình.') }
}
onMounted(tai)

function nhan(msg: string) { bao.value = msg; setTimeout(() => { if (bao.value === msg) bao.value = '' }, 2500) }
async function lam(fn: () => Promise<unknown>, okMsg: string) {
  try { await fn(); await tai(); nhan(okMsg) }
  catch (e) { loi.value = thongDiepLoi(e) }
}

// ── Tuyến mã HH ──────────────────────────────────────────────────────────────
const formHh = reactive({ hien: false, ma_hh: '', room_id: 0, thoi_luong_phut: 20, mo_ta: '' })
// Mở form: trống (thêm mới), điền từ tuyến có sẵn (sửa), hoặc từ mã HH HIS vừa gửi mà chưa cấu hình.
function moFormHh(d?: { ma_hh: string; room_id?: number; thoi_luong_phut?: number; mo_ta?: string | null }) {
  Object.assign(formHh, {
    hien: true, ma_hh: d?.ma_hh ?? '', room_id: d?.room_id ?? cfg.value?.rooms[0]?.id ?? 0,
    thoi_luong_phut: d?.thoi_luong_phut ?? 20, mo_ta: d?.mo_ta ?? '',
  })
}
async function luuHh() {
  try {
    const kq = await apiConfig.luuHhRouting({
      ma_hh: formHh.ma_hh.trim(), room_id: formHh.room_id,
      thoi_luong_phut: Number(formHh.thoi_luong_phut), mo_ta: formHh.mo_ta.trim() || null,
    })
    formHh.hien = false
    await tai()
    nhan(kq.da_xep ? `Đã lưu tuyến mã HH — xếp số cho ${kq.da_xep} ca đang chờ.` : 'Đã lưu tuyến mã HH.')
  } catch (e) { loi.value = thongDiepLoi(e) }
}
const locHh = ref('')
const hhHienThi = computed(() => {
  const k = locHh.value.trim().toLowerCase()
  const ds = cfg.value?.hh_routing ?? []
  return k ? ds.filter((h) => h.ma_hh.toLowerCase().includes(k) || (h.mo_ta ?? '').toLowerCase().includes(k)) : ds
})

// ── Nhóm ưu tiên (builder luật theo field) ───────────────────────────────────
type PtRow = CauHinh['priority_types'][number]
const formPt = reactive<{ hien: boolean; suaMa: boolean; ma: string; ten: string; viet_tat: string; mau: string; thu_tu: number; menhDe: MenhDeUuTien[] }>(
  { hien: false, suaMa: true, ma: '', ten: '', viet_tat: '', mau: 'do', thu_tu: 100, menhDe: [] },
)
// Xem trước chip viết tắt (dùng chữ admin gõ, hoặc tự rút gọn từ tên khi để trống).
const xemChip = computed(() => chipNhan({ ten: formPt.ten, viet_tat: formPt.viet_tat }))
function themMenhDe() { formPt.menhDe.push({ field: 'phong', op: '~', value: '' }) }
function xoaMenhDe(i: number) { formPt.menhDe.splice(i, 1) }
// Đổi field giữa nhóm số/chuỗi → đặt lại toán tử cho hợp lệ.
function doiField(m: MenhDeUuTien) {
  const hople = kieuField(m.field) === 'so' ? TOAN_TU_SO : TOAN_TU_CHUOI
  if (!hople.some((t) => t.op === m.op)) m.op = hople[0].op
}
function moFormPt(n?: PtRow) {
  Object.assign(formPt, {
    hien: true, suaMa: !n, ma: n?.ma ?? '', ten: n?.ten ?? '',
    viet_tat: n?.viet_tat ?? '', mau: n?.mau ?? 'do',
    thu_tu: n?.thu_tu ?? 100, menhDe: n ? docLuat(n.quy_tac_goi_y) : [],
  })
  if (!formPt.menhDe.length) themMenhDe()
}
const xemLuat = computed(() => dungLuat(formPt.menhDe) || '— (chưa có điều kiện, nhóm sẽ không tự gắn)')
function luuPt() {
  lam(() => apiConfig.luuPriorityType({
    ma: formPt.ma.trim(), ten: formPt.ten.trim(),
    viet_tat: formPt.viet_tat.trim() || null, mau: formPt.mau || null,
    quy_tac_goi_y: dungLuat(formPt.menhDe) || null, thu_tu: Number(formPt.thu_tu) || 100,
  }), 'Đã lưu nhóm ưu tiên.').then(() => { formPt.hien = false })
}

// ── Mẫu thông báo ────────────────────────────────────────────────────────────
const mauDat = ref('')
const mauDoi = ref('')
function dongBoMau() {
  mauDat.value = cfg.value?.settings?.mau_dat_gio ?? ''
  mauDoi.value = cfg.value?.settings?.mau_doi_gio ?? ''
}
function luuMau() {
  lam(async () => {
    await apiConfig.luuSetting('mau_dat_gio', mauDat.value)
    await apiConfig.luuSetting('mau_doi_gio', mauDoi.value)
  }, 'Đã lưu mẫu thông báo.')
}

// ── Tích hợp HIS: chu kỳ tự gọi API lấy chỉ định MRI ────────────────────────
const chuKy = ref('20')
const theoKhungGio = ref(false)
const gioHcTu = ref('7')
const gioHcDen = ref('17')
const chuKyNgoaiGio = ref('600')
function dongBoTichHop() {
  const s = cfg.value?.settings
  chuKy.value = s?.his_pull_chu_ky_giay ?? '20'
  theoKhungGio.value = s?.his_pull_theo_khung_gio === '1'
  gioHcTu.value = s?.his_pull_gio_hc_tu ?? '7'
  gioHcDen.value = s?.his_pull_gio_hc_den ?? '17'
  chuKyNgoaiGio.value = s?.his_pull_chu_ky_ngoai_gio_giay ?? '600'
}
function luuTichHop() {
  const g = Number(chuKy.value)
  if (!Number.isFinite(g) || g < 5 || g > 600) { loi.value = 'Chu kỳ trong giờ phải từ 5 đến 600 giây.'; return }
  if (theoKhungGio.value) {
    const tu = Number(gioHcTu.value), den = Number(gioHcDen.value), ng = Number(chuKyNgoaiGio.value)
    if (!Number.isInteger(tu) || tu < 0 || tu > 23) { loi.value = 'Giờ bắt đầu hành chính phải từ 0 đến 23.'; return }
    if (!Number.isInteger(den) || den < 1 || den > 24) { loi.value = 'Giờ kết thúc hành chính phải từ 1 đến 24.'; return }
    if (tu >= den) { loi.value = 'Giờ bắt đầu phải nhỏ hơn giờ kết thúc.'; return }
    if (!Number.isFinite(ng) || ng < 10 || ng > 3600) { loi.value = 'Chu kỳ ngoài giờ phải từ 10 đến 3600 giây.'; return }
  }
  lam(async () => {
    await apiConfig.luuSetting('his_pull_chu_ky_giay', String(Math.round(g)))
    await apiConfig.luuSetting('his_pull_theo_khung_gio', theoKhungGio.value ? '1' : '0')
    if (theoKhungGio.value) {
      await apiConfig.luuSetting('his_pull_gio_hc_tu', String(Math.round(Number(gioHcTu.value))))
      await apiConfig.luuSetting('his_pull_gio_hc_den', String(Math.round(Number(gioHcDen.value))))
      await apiConfig.luuSetting('his_pull_chu_ky_ngoai_gio_giay', String(Math.round(Number(chuKyNgoaiGio.value))))
    }
  }, 'Đã lưu cấu hình tự gọi HIS.')
}

// ── Điều phối cấp cứu: đệm công suất + ngưỡng báo lùi giờ + nhãn nhóm cấp cứu ──
const demCC = ref('0')          // phút/giờ chừa cho cấp cứu (0 = tắt)
const nguongTre = ref('0')      // ngưỡng báo lùi giờ, phút (0 = tắt)
const nhomCC = ref('cap_cuu')   // mã nhóm ưu tiên coi là cấp cứu
function dongBoCapCuu() {
  demCC.value = cfg.value?.settings?.dem_cap_cuu_phut_moi_gio ?? '0'
  nguongTre.value = cfg.value?.settings?.nguong_bao_tre_phut ?? '0'
  nhomCC.value = cfg.value?.settings?.nhom_cap_cuu_ma ?? 'cap_cuu'
}
function luuCapCuu() {
  const d = Number(demCC.value), n = Number(nguongTre.value)
  if (!Number.isFinite(d) || d < 0 || d > 55) { loi.value = 'Đệm cấp cứu phải từ 0 đến 55 phút/giờ.'; return }
  if (!Number.isFinite(n) || n < 0 || n > 240) { loi.value = 'Ngưỡng báo lùi giờ phải từ 0 đến 240 phút.'; return }
  if (!nhomCC.value.trim()) { loi.value = 'Nhập mã nhóm cấp cứu.'; return }
  lam(async () => {
    await apiConfig.luuSetting('dem_cap_cuu_phut_moi_gio', String(Math.round(d)))
    await apiConfig.luuSetting('nguong_bao_tre_phut', String(Math.round(n)))
    await apiConfig.luuSetting('nhom_cap_cuu_ma', nhomCC.value.trim())
  }, 'Đã lưu cấu hình điều phối cấp cứu.')
}

// ── Hiển thị màn điều phối: chọn cột nào ra "cột chính" (còn lại ở panel chi tiết) ──
const COT_DANH_MUC = COT_DIEU_PHOI
const cotChon = ref<string[]>([...COT_CHINH_MAC_DINH])
function dongBoHienThi() {
  const raw = cfg.value?.settings?.dieu_phoi_cot_chinh
  try {
    const ds = raw ? JSON.parse(raw) : null
    cotChon.value = Array.isArray(ds) && ds.length ? ds.filter((k: unknown) => typeof k === 'string') : [...COT_CHINH_MAC_DINH]
  } catch { cotChon.value = [...COT_CHINH_MAC_DINH] }
}
function bapCot(key: string) {
  const i = cotChon.value.indexOf(key)
  if (i >= 0) cotChon.value.splice(i, 1)
  else cotChon.value.push(key)
}
// Lưu theo đúng thứ tự danh mục để bảng luôn gọn.
function luuHienThi() {
  if (!cotChon.value.length) { loi.value = 'Chọn ít nhất một cột.'; return }
  const theoThuTu = COT_DANH_MUC.filter((c) => cotChon.value.includes(c.key)).map((c) => c.key)
  lam(() => apiConfig.luuSetting('dieu_phoi_cot_chinh', JSON.stringify(theoThuTu)), 'Đã lưu cột hiển thị. KTV tải lại trang để áp dụng.')
}

// ── Người dùng ───────────────────────────────────────────────────────────────
const formU = reactive({ hien: false, ma_nv: '', ho_ten: '', sdt: '', role: 'ktv', ma_bs: '', nguon_xac_thuc: 'hrm', mat_khau: '' })
function moFormU() { Object.assign(formU, { hien: true, ma_nv: '', ho_ten: '', sdt: '', role: 'ktv', ma_bs: '', nguon_xac_thuc: 'hrm', mat_khau: '' }) }
function luuU() {
  lam(() => apiConfig.taoUser({
    ma_nv: formU.ma_nv.trim() || null, ho_ten: formU.ho_ten.trim(), sdt: formU.sdt.trim() || null, role: formU.role,
    ma_bs: formU.ma_bs.trim() || null, nguon_xac_thuc: formU.nguon_xac_thuc,
    mat_khau: formU.nguon_xac_thuc === 'noi_bo' ? formU.mat_khau : null,
  }), 'Đã tạo người dùng.').then(() => { formU.hien = false })
}
const VAI_TRO: Record<string, string> = { ktv: 'KTV', bac_si: 'Bác sĩ', admin: 'Quản trị' }
const xoaHh = (ma_hh: string) => lam(() => apiConfig.xoaHhRouting(ma_hh), 'Đã xóa tuyến.')
const datTrangThaiUser = (id: number, active: boolean) => lam(() => apiConfig.datTrangThaiUser(id, active), 'Đã cập nhật.')

// ── Phân quyền trực tiếp trên lưới (đổi vai trò / mã BS từng người) ───────────
const doiVaiTro = (id: number, role: string) => lam(() => apiConfig.capNhatUser(id, { role }), 'Đã đổi vai trò.')
const doiSdt = (id: number, sdt: string) => lam(() => apiConfig.capNhatUser(id, { sdt: sdt.trim() || null }), 'Đã lưu SĐT.')
function doiMaBs(id: number, ma_bs: string) {
  lam(() => apiConfig.capNhatUser(id, { ma_bs: ma_bs.trim() || null }), 'Đã lưu mã BS.')
}

// ── Thêm hàng loạt: lấy danh sách từ hệ nhân sự bệnh viện (apihrm) ────────────
// Kết nối (mã NV + mật khẩu My HungVuong, hoặc tài khoản dịch vụ trên server) →
// lọc theo khoa / tìm mã-tên → tích chọn → phân vai trò → tạo.
interface DongNhap extends NhanVienHRM { chon: boolean; role: string; ma_bs: string | null; da_co: boolean }
const nhap = reactive({
  hien: false, daKetNoi: false, coDichVu: false, dangTai: false,
  ma_nv: '', mat_khau: '', khoa: [] as KhoaHRM[], makhoa: '', tu_khoa: '', loc: '', ds: [] as DongNhap[],
})
async function moNhap() {
  nhap.hien = true
  if (nhap.daKetNoi) return
  try { nhap.coDichVu = (await apiConfig.hrmTrangThai()).co_tai_khoan_dich_vu } catch { nhap.coDichVu = false }
}
async function ketNoiHRM() {
  nhap.dangTai = true
  try {
    const kq = await apiConfig.hrmKetNoi(nhap.ma_nv.trim() ? { ma_nv: nhap.ma_nv.trim(), mat_khau: nhap.mat_khau } : {})
    Object.assign(nhap, { khoa: kq.khoa, daKetNoi: true, mat_khau: '' })
    loi.value = ''
  } catch (e) { loi.value = thongDiepLoi(e, 'Không kết nối được hệ nhân sự.') }
  finally { nhap.dangTai = false }
}
// Gợi ý vai trò theo chức danh HRM; admin chỉnh lại trên lưới.
const goiYVaiTro = (chucDanh: string | null) => (/bác\s*sĩ|bac\s*si/i.test(chucDanh ?? '') ? 'bac_si' : 'ktv')
async function timNhanVien() {
  nhap.dangTai = true
  try {
    const { nhan_vien } = await apiConfig.hrmNhanVien({ makhoa: nhap.makhoa || undefined, tu_khoa: nhap.tu_khoa.trim() || undefined })
    const daCo = new Set((cfg.value?.users ?? []).map((u) => u.ma_nv).filter(Boolean))
    nhap.ds = nhan_vien.map((n) => ({
      ...n, da_co: daCo.has(n.ma_nv), chon: false, role: goiYVaiTro(n.chuc_danh), ma_bs: null,
    }))
    loi.value = nhan_vien.length ? '' : 'Không tìm thấy nhân viên phù hợp.'
  } catch (e) {
    loi.value = thongDiepLoi(e, 'Không lấy được danh sách nhân viên.')
    if ((e as { response?: { data?: { ly_do?: string } } })?.response?.data?.ly_do === 'chua_cau_hinh') nhap.daKetNoi = false
  } finally { nhap.dangTai = false }
}
// Lọc nhanh trên danh sách đã tải (không dấu, theo mã/tên/khoa/chức danh).
const boDau = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
const dongHien = computed(() => {
  const q = boDau(nhap.loc.trim())
  if (!q) return nhap.ds
  return nhap.ds.filter((d) => boDau([d.ma_nv, d.ho_ten, d.tenkhoa, d.chuc_danh].filter(Boolean).join(' ')).includes(q))
})
const dongChon = computed(() => nhap.ds.filter((d) => d.chon && !d.da_co))
// "Chọn tất cả" áp cho các dòng đang hiện (sau lọc nhanh).
const coTheChon = computed(() => dongHien.value.filter((d) => !d.da_co))
const chonTatCa = computed({
  get: () => coTheChon.value.length > 0 && coTheChon.value.every((d) => d.chon),
  set: (v: boolean) => coTheChon.value.forEach((d) => { d.chon = v }),
})
const datTatCaVaiTro = (role: string) => dongChon.value.forEach((d) => { d.role = role })
async function luuNhap() {
  if (!dongChon.value.length) { loi.value = 'Chưa chọn nhân viên nào.'; return }
  try {
    const kq = await apiConfig.taoNhieuUser(dongChon.value.map((d) => ({
      ma_nv: d.ma_nv, ho_ten: d.ho_ten, role: d.role, ma_bs: d.role === 'bac_si' ? d.ma_bs?.trim() || null : null,
    })))
    await tai()
    nhan(`Đã tạo ${kq.tao_moi} tài khoản, bỏ qua ${kq.bo_qua} trùng.`)
    const daCo = new Set((cfg.value?.users ?? []).map((u) => u.ma_nv))
    nhap.ds.forEach((d) => { if (daCo.has(d.ma_nv)) { d.da_co = true; d.chon = false } })
  } catch (e) { loi.value = thongDiepLoi(e) }
}

// Khi đổi sang tab mẫu thông báo thì đồng bộ ô nhập.
function chonMuc(m: typeof muc.value) {
  muc.value = m
  if (m === 'thong_bao') dongBoMau()
  if (m === 'tich_hop') dongBoTichHop()
  if (m === 'cap_cuu') dongBoCapCuu()
  if (m === 'hien_thi') dongBoHienThi()
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-[#eef1f5]">
    <AppHeader tieu-de="Cấu hình hệ thống" />

    <div class="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-4 py-4 flex flex-col lg:flex-row gap-4">
      <nav class="flex lg:flex-col gap-1 overflow-x-auto lg:w-56 shrink-0 -mx-1 px-1">
        <button v-for="m in MUC" :key="m.ma" @click="chonMuc(m.ma)"
                class="text-left whitespace-nowrap px-3 py-2 rounded-lg text-[13px] font-semibold shrink-0"
                :class="muc === m.ma ? 'bg-hv text-white' : 'bg-white text-slate-600 border border-[#d6dde6]'">
          {{ m.ten }}
        </button>
      </nav>

      <section class="flex-1 min-w-0">
        <p v-if="loi" class="bg-rose-50 border border-rose-200 text-rose-700 text-[13px] rounded-lg px-3 py-2 mb-3">{{ loi }}</p>
        <p v-if="bao" class="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[13px] rounded-lg px-3 py-2 mb-3">{{ bao }}</p>
        <div v-if="!cfg" class="text-slate-400 text-[13px]">Đang tải cấu hình…</div>

        <!-- Ánh xạ mã HH -->
        <div v-else-if="muc === 'hh'" class="bg-white rounded-xl border border-[#d6dde6] overflow-hidden">
          <div class="px-4 py-3 border-b border-[#eef2f6] flex items-center justify-between">
            <h3 class="font-bold text-slate-800">Ánh xạ mã HH → phòng + thời lượng <span class="text-slate-400 font-semibold">({{ cfg.hh_routing.length }})</span></h3>
            <button @click="moFormHh()" class="bg-hv text-white text-[12px] font-bold px-3 py-1.5 rounded-lg">+ Thêm</button>
          </div>
          <div v-if="cfg.hh_chua_cau_hinh.length" class="px-4 py-3 bg-rose-50 border-b border-rose-200 text-[12.5px] text-rose-800">
            <div class="font-extrabold mb-1">⚠ HIS đã gửi mã HH chưa có trong cấu hình — các ca này chưa xếp được số</div>
            <div v-for="m in cfg.hh_chua_cau_hinh" :key="m.ma_hh" class="flex flex-wrap items-center gap-x-2 py-0.5">
              <b class="font-mono">{{ m.ma_hh }}</b>
              <span class="text-rose-700/80">{{ m.ten_dich_vu || '(không có tên dịch vụ)' }}</span>
              <span class="tnum">· {{ m.so_ca }} ca chờ</span>
              <button @click="moFormHh({ ma_hh: m.ma_hh, mo_ta: m.ten_dich_vu })" class="ml-auto font-bold text-hv underline">Cấu hình</button>
            </div>
          </div>
          <div v-if="formHh.hien" class="px-4 py-3 bg-slate-50 border-b border-[#eef2f6] grid grid-cols-2 sm:grid-cols-5 gap-2 items-end text-[12px]">
            <label class="font-semibold text-slate-600">Mã HH<input v-model="formHh.ma_hh" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
            <label class="font-semibold text-slate-600">Phòng
              <select v-model.number="formHh.room_id" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5">
                <option v-for="r in cfg.rooms" :key="r.id" :value="r.id">{{ r.ten }}</option>
              </select>
            </label>
            <label class="font-semibold text-slate-600">Phút<input v-model.number="formHh.thoi_luong_phut" type="number" min="1" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
            <label class="font-semibold text-slate-600 sm:col-span-2">Mô tả<input v-model="formHh.mo_ta" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
            <div class="col-span-2 sm:col-span-5 flex gap-2">
              <button @click="luuHh" class="bg-hv text-white font-bold px-3 py-1.5 rounded">Lưu</button>
              <button @click="formHh.hien = false" class="bg-slate-200 text-slate-700 font-semibold px-3 py-1.5 rounded">Hủy</button>
            </div>
          </div>
          <div class="px-4 py-2 border-b border-[#eef2f6]">
            <input v-model="locHh" type="text" placeholder="Lọc theo mã HH / mô tả…"
                   class="w-full sm:w-72 text-[12.5px] border border-slate-300 rounded px-2.5 py-1.5 outline-none focus:border-hv" />
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-[13px] min-w-[520px]">
              <thead class="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                <tr>
                  <th class="text-left px-4 py-2 font-bold">Mã HH</th>
                  <th class="text-left px-4 py-2 font-bold">Phòng</th>
                  <th class="text-left px-4 py-2 font-bold">Thời lượng</th>
                  <th class="text-left px-4 py-2 font-bold">Mô tả</th>
                  <th class="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="h in hhHienThi" :key="h.ma_hh" class="border-t border-[#eef2f6]">
                  <td class="px-4 py-2.5 font-mono font-semibold">{{ h.ma_hh }}</td>
                  <td class="px-4 py-2.5">{{ h.ten_phong }}</td>
                  <td class="px-4 py-2.5 tnum">{{ h.thoi_luong_phut }} phút</td>
                  <td class="px-4 py-2.5 text-slate-600">{{ h.mo_ta }}</td>
                  <td class="px-4 py-2.5 text-right whitespace-nowrap">
                    <button @click="moFormHh(h)" class="text-hv text-[12px] font-semibold mr-3">Sửa</button>
                    <button @click="xoaHh(h.ma_hh)" class="text-rose-600 text-[12px] font-semibold">Xóa</button>
                  </td>
                </tr>
                <tr v-if="!cfg.hh_routing.length"><td colspan="5" class="px-4 py-4 text-slate-400">Chưa có tuyến mã HH nào.</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Nhóm ưu tiên -->
        <div v-else-if="muc === 'uu_tien'" class="bg-white rounded-xl border border-[#d6dde6] p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-slate-800">Danh mục nhóm ưu tiên (gợi ý từ HIS)</h3>
            <button @click="moFormPt()" class="bg-hv text-white text-[12px] font-bold px-3 py-1.5 rounded-lg">+ Thêm</button>
          </div>
          <p class="text-[12px] text-slate-500 mb-3">Hệ thống chỉ <b>gợi ý nhãn</b> — KTV vẫn duyệt. Ca khớp luật của nhiều nhóm thì nhóm có <b>thứ tự nhỏ hơn</b> thắng. So khớp chuỗi bỏ dấu, không phân biệt hoa/thường.</p>

          <!-- Form dựng luật -->
          <div v-if="formPt.hien" class="mb-4 bg-slate-50 rounded-lg p-3 text-[12px]">
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end mb-3">
              <label class="font-semibold text-slate-600">Mã
                <input v-model="formPt.ma" :disabled="!formPt.suaMa"
                       class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 font-mono disabled:bg-slate-100 disabled:text-slate-500" />
              </label>
              <label class="font-semibold text-slate-600 col-span-1 sm:col-span-2">Tên hiển thị
                <input v-model="formPt.ten" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" />
              </label>
              <label class="font-semibold text-slate-600">Thứ tự
                <input v-model.number="formPt.thu_tu" type="number" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" />
              </label>
            </div>

            <!-- Hiển thị gọn: chip viết tắt cạnh tên + màu tô dòng (thay cột "Nhãn" cũ) -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end mb-3">
              <label class="font-semibold text-slate-600">Viết tắt (trên chip)
                <input v-model="formPt.viet_tat" maxlength="4" placeholder="Tự rút gọn nếu trống"
                       class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" />
              </label>
              <label class="font-semibold text-slate-600">Màu
                <select v-model="formPt.mau" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 bg-white">
                  <option v-for="m in MAU_NHAN_CHON" :key="m.key" :value="m.key">{{ m.nhan }}</option>
                </select>
              </label>
              <div class="col-span-2 font-semibold text-slate-600">Xem trước
                <div class="mt-1 flex items-center gap-2 border border-slate-200 rounded px-2 py-1.5"
                     :class="kieuMau(formPt.mau).row">
                  <span class="font-semibold text-slate-900 text-[13px]">NGUYỄN VĂN A</span>
                  <span class="text-[10.5px] font-extrabold px-[6px] py-[2px] rounded" :class="kieuMau(formPt.mau).chip">{{ xemChip }}</span>
                </div>
              </div>
            </div>

            <div class="font-semibold text-slate-600 mb-1">Điều kiện (tất cả phải đúng — VÀ)</div>
            <div class="space-y-2">
              <div v-for="(m, i) in formPt.menhDe" :key="i" class="flex flex-wrap gap-2 items-center">
                <select v-model="m.field" @change="doiField(m)" class="border border-slate-300 rounded px-2 py-1.5 bg-white">
                  <option v-for="f in FIELD_UU_TIEN" :key="f.key" :value="f.key">{{ f.nhan }}</option>
                </select>
                <select v-model="m.op" class="border border-slate-300 rounded px-2 py-1.5 bg-white">
                  <template v-if="kieuField(m.field) === 'so'">
                    <option v-for="t in TOAN_TU_SO" :key="t.op" :value="t.op">{{ t.nhan }}</option>
                  </template>
                  <template v-else>
                    <option v-for="t in TOAN_TU_CHUOI" :key="t.op" :value="t.op">{{ t.nhan }}</option>
                  </template>
                </select>
                <input v-model="m.value" :type="kieuField(m.field) === 'so' ? 'number' : 'text'"
                       :placeholder="kieuField(m.field) === 'so' ? '75' : (m.op === 'in' ? 'Cấp cứu, Hồi sức, ICU' : 'cấp cứu')"
                       class="flex-1 min-w-[140px] border border-slate-300 rounded px-2 py-1.5" />
                <button @click="xoaMenhDe(i)" :disabled="formPt.menhDe.length <= 1"
                        class="text-rose-600 font-bold px-2 py-1 rounded hover:bg-rose-50 disabled:text-slate-300 disabled:hover:bg-transparent">✕</button>
              </div>
            </div>
            <button @click="themMenhDe" class="mt-2 text-hv font-bold">+ Thêm điều kiện</button>

            <div class="mt-3 text-slate-500">Quy tắc lưu: <span class="font-mono text-slate-700">{{ xemLuat }}</span></div>
            <div class="flex gap-2 mt-3">
              <button @click="luuPt" class="bg-hv text-white font-bold px-3 py-1.5 rounded">Lưu</button>
              <button @click="formPt.hien = false" class="bg-slate-200 text-slate-700 font-semibold px-3 py-1.5 rounded">Hủy</button>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div v-for="n in cfg.priority_types" :key="n.ma" class="border border-[#d6dde6] rounded-lg p-3">
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-[10.5px] font-extrabold px-[6px] py-[2px] rounded shrink-0" :class="kieuMau(n.mau).chip">{{ chipNhan(n) }}</span>
                  <div class="font-bold text-slate-800 truncate">{{ n.ten }}</div>
                </div>
                <button @click="moFormPt(n)" class="text-hv text-[12px] font-bold shrink-0">Sửa</button>
              </div>
              <div class="text-[12px] text-slate-500 mt-1">Mã: <span class="font-mono">{{ n.ma }}</span> · Thứ tự: {{ n.thu_tu }}</div>
              <div class="text-[12px] text-slate-500">Quy tắc: <span class="font-mono">{{ n.quy_tac_goi_y || '—' }}</span></div>
            </div>
          </div>
        </div>

        <!-- Mẫu thông báo -->
        <div v-else-if="muc === 'thong_bao'" class="bg-white rounded-xl border border-[#d6dde6] p-4 space-y-4">
          <h3 class="font-bold text-slate-800">Mẫu tin nhắn SMS/Zalo</h3>
          <p class="text-[12px] text-slate-500">Biến dùng được: <span class="font-mono">{ho_ten} {stt} {gio_hen} {phong} {ly_do}</span></p>
          <label class="block text-[13px] font-semibold text-slate-700">Mẫu "Đặt giờ hẹn"
            <textarea v-model="mauDat" rows="2" class="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-hv"></textarea>
          </label>
          <label class="block text-[13px] font-semibold text-slate-700">Mẫu "Đổi giờ hẹn"
            <textarea v-model="mauDoi" rows="2" class="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-hv"></textarea>
          </label>
          <button @click="luuMau" class="bg-hv text-white text-[13px] font-bold px-4 py-2 rounded-lg">Lưu mẫu</button>
        </div>

        <!-- Tích hợp HIS -->
        <div v-else-if="muc === 'tich_hop'" class="bg-white rounded-xl border border-[#d6dde6] p-4 space-y-4">
          <h3 class="font-bold text-slate-800">Tự lấy chỉ định MRI từ HIS</h3>
          <p class="text-[12px] text-slate-500 leading-relaxed">
            Hệ thống tự gọi API HIS (<span class="font-mono">/api/CanLamSang/mri</span>) theo chu kỳ để cập nhật hàng chờ.
            KTV có thể bấm <b>↻ Làm mới</b> ở màn điều phối để lấy ngay không cần chờ.
          </p>
          <label class="block text-[13px] font-semibold text-slate-700">Chu kỳ trong giờ hành chính (giây)
            <input v-model="chuKy" type="number" min="5" max="600" step="1"
                   class="mt-1 w-40 border border-slate-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-hv" />
            <span class="block text-[11.5px] text-slate-400 font-normal mt-1">Khoảng cho phép: 5–600 giây. Khuyến nghị 15–30 giây.</span>
          </label>

          <!-- Giãn chu kỳ ngoài giờ hành chính -->
          <div class="border-t border-[#eef2f6] pt-4 space-y-3">
            <label class="flex items-start gap-2.5 cursor-pointer">
              <input v-model="theoKhungGio" type="checkbox" class="mt-0.5 w-4 h-4 accent-[#1366b1]" />
              <span class="text-[13px] font-semibold text-slate-700">
                Giãn chu kỳ ngoài giờ hành chính
                <span class="block text-[11.5px] text-slate-400 font-normal mt-0.5">
                  Trong giờ hành chính gọi HIS dày như trên; ngoài giờ giãn ra để đỡ tải HIS/mạng ban đêm.
                  KTV vẫn bấm <b>↻ Làm mới</b> để lấy ngay bất cứ lúc nào.
                </span>
              </span>
            </label>

            <div v-if="theoKhungGio" class="pl-7 flex flex-wrap items-end gap-x-5 gap-y-3">
              <label class="block text-[13px] font-semibold text-slate-700">Giờ hành chính từ
                <div class="mt-1 flex items-center gap-2">
                  <input v-model="gioHcTu" type="number" min="0" max="23" step="1"
                         class="w-20 border border-slate-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-hv" />
                  <span class="text-slate-400 text-[13px]">giờ đến</span>
                  <input v-model="gioHcDen" type="number" min="1" max="24" step="1"
                         class="w-20 border border-slate-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-hv" />
                  <span class="text-slate-400 text-[13px]">giờ</span>
                </div>
                <span class="block text-[11.5px] text-slate-400 font-normal mt-1">Theo giờ Việt Nam (0–24), áp dụng mọi ngày trong tuần.</span>
              </label>
              <label class="block text-[13px] font-semibold text-slate-700">Chu kỳ ngoài giờ (giây)
                <input v-model="chuKyNgoaiGio" type="number" min="10" max="3600" step="10"
                       class="mt-1 w-40 border border-slate-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-hv" />
                <span class="block text-[11.5px] text-slate-400 font-normal mt-1">10–3600 giây. VD 600 = 10 phút/lần.</span>
              </label>
            </div>
          </div>

          <button @click="luuTichHop" class="bg-hv text-white text-[13px] font-bold px-4 py-2 rounded-lg">Lưu cấu hình</button>
        </div>

        <!-- Điều phối cấp cứu: đệm + ngưỡng báo lùi giờ + nhãn nhóm -->
        <div v-else-if="muc === 'cap_cuu'" class="bg-white rounded-xl border border-[#d6dde6] p-4 space-y-4">
          <h3 class="font-bold text-slate-800">Hấp thụ ca cấp cứu chen hàng</h3>
          <p class="text-[12px] text-slate-500 leading-relaxed">
            Giảm chuyện bệnh nhân bị lùi lịch đáng kể khi có 2–3 ca cấp cứu chen ngang: chừa sẵn
            công suất cho cấp cứu, và chủ động báo bệnh nhân khi lượt bị lùi.
          </p>
          <label class="block text-[13px] font-semibold text-slate-700">Đệm cấp cứu (phút / giờ)
            <input v-model="demCC" type="number" min="0" max="55" step="1"
                   class="mt-1 w-40 border border-slate-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-hv" />
            <span class="block text-[11.5px] text-slate-400 font-normal mt-1">
              Giờ hẹn được giãn để gói sẵn kỳ vọng cấp cứu → ít vỡ lịch. <b>0 = tắt</b>. Khuyến nghị bắt đầu 10–15′, chỉnh theo trang Thống kê.
            </span>
          </label>
          <label class="block text-[13px] font-semibold text-slate-700">Ngưỡng báo lùi giờ (phút)
            <input v-model="nguongTre" type="number" min="0" max="240" step="1"
                   class="mt-1 w-40 border border-slate-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-hv" />
            <span class="block text-[11.5px] text-slate-400 font-normal mt-1">
              Ca chậm vượt ngưỡng này so với giờ hẹn gốc → xếp thông báo lùi giờ (cần SĐT). <b>0 = tắt</b>.
            </span>
          </label>
          <label class="block text-[13px] font-semibold text-slate-700">Mã nhóm "Cấp cứu"
            <input v-model="nhomCC" type="text"
                   class="mt-1 w-56 border border-slate-300 rounded-lg px-3 py-2 text-[13px] font-mono outline-none focus:border-hv" />
            <span class="block text-[11.5px] text-slate-400 font-normal mt-1">
              Mã nhóm ưu tiên dùng để đếm cấp cứu chen hàng & xu hướng (khớp mục Nhóm ưu tiên). Mặc định <span class="font-mono">cap_cuu</span>.
            </span>
          </label>
          <button @click="luuCapCuu" class="bg-hv text-white text-[13px] font-bold px-4 py-2 rounded-lg">Lưu cấu hình</button>
        </div>

        <!-- Hiển thị màn điều phối: chọn cột chính -->
        <div v-else-if="muc === 'hien_thi'" class="bg-white rounded-xl border border-[#d6dde6] p-4 space-y-4">
          <div>
            <h3 class="font-bold text-slate-800">Cột chính ở màn điều phối</h3>
            <p class="text-[12px] text-slate-500 mt-1 leading-relaxed">
              Tích chọn các cột hiện ngay trên bảng hàng chờ. Những trường không chọn vẫn xem được đầy đủ
              khi bấm <b>ⓘ</b> ở mỗi ca. Cột <b>STT</b> và nút thao tác luôn hiển thị.
            </p>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label v-for="c in COT_DANH_MUC" :key="c.key"
                   class="flex items-center gap-2 border rounded-lg px-3 py-2 text-[13px] cursor-pointer select-none"
                   :class="cotChon.includes(c.key) ? 'border-hv bg-hv-soft text-slate-800 font-semibold' : 'border-slate-200 text-slate-600'">
              <input type="checkbox" :checked="cotChon.includes(c.key)" @change="bapCot(c.key)" class="accent-hv" />
              {{ c.nhan }}
            </label>
          </div>
          <div class="flex items-center gap-3">
            <button @click="luuHienThi" class="bg-hv text-white text-[13px] font-bold px-4 py-2 rounded-lg">Lưu cột hiển thị</button>
            <button @click="cotChon = [...COT_CHINH_MAC_DINH]" class="text-[12.5px] font-semibold text-slate-500">Khôi phục mặc định</button>
            <span class="text-[12px] text-slate-400">Đã chọn {{ cotChon.length }} cột</span>
          </div>
        </div>

        <!-- Người dùng -->
        <div v-else class="bg-white rounded-xl border border-[#d6dde6] overflow-hidden">
          <div class="px-4 py-3 border-b border-[#eef2f6] flex items-center justify-between gap-2">
            <h3 class="font-bold text-slate-800">Người dùng</h3>
            <div class="flex gap-2 shrink-0">
              <button @click="moNhap" class="bg-white text-hv border border-hv text-[12px] font-bold px-3 py-1.5 rounded-lg">Thêm từ HRM</button>
              <button @click="moFormU" class="bg-hv text-white text-[12px] font-bold px-3 py-1.5 rounded-lg">+ Thêm</button>
            </div>
          </div>
          <div v-if="formU.hien" class="px-4 py-3 bg-slate-50 border-b border-[#eef2f6] grid grid-cols-2 sm:grid-cols-3 gap-2 items-end text-[12px]">
            <label class="font-semibold text-slate-600">Mã NV<input v-model="formU.ma_nv" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" placeholder="để trống nếu nội bộ" /></label>
            <label class="font-semibold text-slate-600">Họ tên<input v-model="formU.ho_ten" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
            <label class="font-semibold text-slate-600">SĐT<input v-model="formU.sdt" type="tel" inputmode="tel" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" placeholder="để KTV trực dùng" /></label>
            <label class="font-semibold text-slate-600">Vai trò
              <select v-model="formU.role" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5">
                <option value="ktv">KTV</option><option value="bac_si">Bác sĩ</option><option value="admin">Quản trị</option>
              </select>
            </label>
            <label class="font-semibold text-slate-600">Mã BS (lọc ca)<input v-model="formU.ma_bs" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
            <label class="font-semibold text-slate-600">Nguồn xác thực
              <select v-model="formU.nguon_xac_thuc" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5">
                <option value="hrm">HIS (apihrm)</option><option value="noi_bo">Nội bộ (mật khẩu)</option>
              </select>
            </label>
            <label v-if="formU.nguon_xac_thuc === 'noi_bo'" class="font-semibold text-slate-600">Mật khẩu (≥6)<input v-model="formU.mat_khau" type="password" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
            <div class="col-span-2 sm:col-span-3 flex gap-2">
              <button @click="luuU" class="bg-hv text-white font-bold px-3 py-1.5 rounded">Tạo</button>
              <button @click="formU.hien = false" class="bg-slate-200 text-slate-700 font-semibold px-3 py-1.5 rounded">Hủy</button>
            </div>
          </div>
          <!-- Thêm hàng loạt: kết nối hệ nhân sự → lọc khoa / tìm → chọn + phân quyền → tạo -->
          <div v-if="nhap.hien" class="px-4 py-3 bg-sky-50 border-b border-sky-100 space-y-3 text-[12px]">
            <div class="flex items-center justify-between gap-2">
              <span class="font-bold text-slate-700">Lấy từ hệ nhân sự bệnh viện (My HungVuong)</span>
              <button @click="nhap.hien = false" class="text-slate-500 font-semibold">Đóng</button>
            </div>

            <!-- Bước 1: kết nối -->
            <div v-if="!nhap.daKetNoi" class="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
              <p class="col-span-2 sm:col-span-4 text-slate-600">
                Đăng nhập bằng tài khoản My HungVuong có quyền xem danh sách nhân viên. Mật khẩu chỉ dùng để lấy phiên truy cập, không được lưu.
                <template v-if="nhap.coDichVu"> Server đã có tài khoản dịch vụ — có thể để trống và bấm Kết nối.</template>
              </p>
              <label class="font-semibold text-slate-600">Mã NV<input v-model="nhap.ma_nv" inputmode="numeric" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
              <label class="font-semibold text-slate-600">Mật khẩu<input v-model="nhap.mat_khau" type="password" autocomplete="off" @keyup.enter="ketNoiHRM" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
              <button @click="ketNoiHRM" :disabled="nhap.dangTai || (!nhap.coDichVu && (!nhap.ma_nv.trim() || !nhap.mat_khau))"
                      class="bg-hv text-white font-bold px-3 py-1.5 rounded disabled:opacity-50">
                {{ nhap.dangTai ? 'Đang kết nối…' : 'Kết nối' }}
              </button>
            </div>

            <!-- Bước 2: lọc / tìm -->
            <div v-else class="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
              <label class="font-semibold text-slate-600">Khoa / phòng
                <select v-model="nhap.makhoa" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 bg-white">
                  <option value="">— Tất cả khoa —</option>
                  <option v-for="k in nhap.khoa" :key="k.makhoa" :value="k.makhoa">{{ k.tenkhoa }}</option>
                </select>
              </label>
              <label class="font-semibold text-slate-600">Mã NV hoặc tên
                <input v-model="nhap.tu_khoa" @keyup.enter="timNhanVien" placeholder="Để trống = lấy toàn bộ"
                       class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" />
              </label>
              <button @click="timNhanVien" :disabled="nhap.dangTai" class="bg-slate-700 text-white font-bold px-3 py-1.5 rounded disabled:opacity-50">
                {{ nhap.dangTai ? 'Đang tải…' : (nhap.makhoa || nhap.tu_khoa.trim() ? 'Lấy danh sách' : 'Lấy toàn bộ') }}
              </button>
            </div>

            <!-- Bước 3: chọn + phân quyền -->
            <div v-if="nhap.ds.length">
              <div class="flex flex-wrap items-center gap-2 mb-2">
                <span class="font-bold text-slate-700">{{ nhap.ds.length }} nhân viên · đã chọn {{ dongChon.length }}</span>
                <input v-model="nhap.loc" placeholder="Lọc nhanh: tên, mã, khoa, chức danh…"
                       class="w-full sm:w-64 border border-slate-300 rounded px-2 py-1 bg-white" />
                <button @click="chonTatCa = true" :disabled="!coTheChon.length"
                        class="border border-hv text-hv bg-white px-2 py-1 rounded font-semibold disabled:opacity-50">
                  Chọn {{ coTheChon.length }} dòng đang hiện
                </button>
                <span class="text-slate-500 sm:ml-auto">Đặt vai trò cho dòng đã chọn:</span>
                <button @click="datTatCaVaiTro('ktv')" class="border border-slate-300 bg-white px-2 py-1 rounded font-semibold">KTV</button>
                <button @click="datTatCaVaiTro('bac_si')" class="border border-slate-300 bg-white px-2 py-1 rounded font-semibold">Bác sĩ</button>
              </div>
              <div class="overflow-x-auto max-h-80 overflow-y-auto border border-sky-100 rounded-lg bg-white">
                <table class="w-full text-[12px] min-w-[620px]">
                  <thead class="bg-slate-50 text-slate-500 text-[11px] uppercase sticky top-0">
                    <tr>
                      <th class="px-3 py-1.5 w-8"><input type="checkbox" v-model="chonTatCa" :disabled="!coTheChon.length" /></th>
                      <th class="text-left px-3 py-1.5 font-bold">Mã NV</th><th class="text-left px-3 py-1.5 font-bold">Họ tên</th>
                      <th class="text-left px-3 py-1.5 font-bold">Khoa · chức danh</th>
                      <th class="text-left px-3 py-1.5 font-bold">Vai trò</th><th class="text-left px-3 py-1.5 font-bold">Mã BS</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="d in dongHien" :key="d.ma_nv" class="border-t border-[#eef2f6]" :class="d.da_co ? 'opacity-50' : d.chon ? 'bg-sky-50/60' : ''">
                      <td class="px-3 py-1.5 text-center"><input type="checkbox" v-model="d.chon" :disabled="d.da_co" /></td>
                      <td class="px-3 py-1.5 font-mono">{{ d.ma_nv }}</td>
                      <td class="px-3 py-1.5 font-semibold">{{ d.ho_ten }}
                        <span v-if="d.da_co" class="ml-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Đã có</span>
                      </td>
                      <td class="px-3 py-1.5 text-slate-500">{{ [d.tenkhoa, d.chuc_danh].filter(Boolean).join(' · ') || '—' }}</td>
                      <td class="px-3 py-1.5">
                        <select v-model="d.role" :disabled="d.da_co" class="border border-slate-300 rounded px-1.5 py-1">
                          <option value="ktv">KTV</option><option value="bac_si">Bác sĩ</option><option value="admin">Quản trị</option>
                        </select>
                      </td>
                      <td class="px-3 py-1.5">
                        <input v-model="d.ma_bs" :disabled="d.da_co || d.role !== 'bac_si'" placeholder="—"
                               class="w-20 border border-slate-300 rounded px-1.5 py-1 disabled:bg-slate-100" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <button @click="luuNhap" :disabled="!dongChon.length"
                      class="mt-2 bg-hv text-white font-bold px-4 py-2 rounded-lg disabled:opacity-50">Tạo {{ dongChon.length }} tài khoản</button>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-[13px] min-w-[560px]">
              <thead class="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                <tr>
                  <th class="text-left px-4 py-2 font-bold">Mã NV</th><th class="text-left px-4 py-2 font-bold">Họ tên</th>
                  <th class="text-left px-4 py-2 font-bold">SĐT</th>
                  <th class="text-left px-4 py-2 font-bold">Vai trò</th><th class="text-left px-4 py-2 font-bold">Mã BS</th>
                  <th class="text-left px-4 py-2 font-bold">Nguồn</th><th class="text-left px-4 py-2 font-bold">Trạng thái</th><th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in cfg.users" :key="u.id" class="border-t border-[#eef2f6]" :class="u.active ? '' : 'opacity-50'">
                  <td class="px-4 py-2.5 font-mono">{{ u.ma_nv || '—' }}</td>
                  <td class="px-4 py-2.5 font-semibold">{{ u.ho_ten }}</td>
                  <td class="px-4 py-2.5">
                    <input :value="u.sdt ?? ''" type="tel" inputmode="tel" placeholder="—"
                           @change="doiSdt(u.id, ($event.target as HTMLInputElement).value)"
                           class="w-28 border border-slate-300 rounded px-1.5 py-1 text-[12px]" />
                  </td>
                  <td class="px-4 py-2.5">
                    <select :value="u.role" @change="doiVaiTro(u.id, ($event.target as HTMLSelectElement).value)"
                            class="border border-slate-300 rounded px-1.5 py-1 text-[12px]">
                      <option value="ktv">KTV</option><option value="bac_si">Bác sĩ</option><option value="admin">Quản trị</option>
                    </select>
                  </td>
                  <td class="px-4 py-2.5">
                    <input :value="u.ma_bs ?? ''" :disabled="u.role !== 'bac_si'" placeholder="—"
                           @change="doiMaBs(u.id, ($event.target as HTMLInputElement).value)"
                           class="w-20 border border-slate-300 rounded px-1.5 py-1 text-[12px] disabled:bg-slate-100 disabled:placeholder-slate-300" />
                  </td>
                  <td class="px-4 py-2.5">{{ u.nguon_xac_thuc === 'noi_bo' ? 'Nội bộ' : 'HIS' }}</td>
                  <td class="px-4 py-2.5">{{ u.active ? 'Hoạt động' : 'Khóa' }}</td>
                  <td class="px-4 py-2.5 text-right">
                    <button @click="datTrangThaiUser(u.id, !u.active)"
                            class="text-[12px] font-semibold" :class="u.active ? 'text-rose-600' : 'text-emerald-600'">
                      {{ u.active ? 'Khóa' : 'Mở' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
