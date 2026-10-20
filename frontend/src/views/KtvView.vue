<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import { useHangDoi } from '@/stores/hangDoi'
import { useStream } from '@/composables/useStream'
import { thongDiepLoi } from '@/api/client'
import { apiHangDoi, apiHis, type KtvChon } from '@/api/endpoints'
import type { Order, HanhDong } from '@/types'
import { COT_DIEU_PHOI, kieuMau, chipNhan } from '@/types'

const store = useHangDoi()

const phongChon = ref(0)
const tab = ref<'hang_cho' | 'noi_tru' | 'qua_luot' | 'hoan_thanh'>('hang_cho')
const chonId = ref<number | null>(null)
const tuKhoa = ref('')
const thongBao = ref('')

// ── Làm mới thủ công: kéo chỉ định MRI từ HIS ngay (không chờ chu kỳ tự động) ──
const dangLamMoi = ref(false)
async function lamMoi() {
  if (dangLamMoi.value) return
  dangLamMoi.value = true
  thongBao.value = ''
  try {
    const kq = await apiHis.lamMoi()
    await store.tai()
    thongBao.value = kq.moi || kq.dong || kq.huy
      ? `Đã đồng bộ HIS: +${kq.moi} ca mới, ${kq.dong} ca đã chụp xong${kq.huy ? `, ${kq.huy} ca HIS đã hủy` : ''}${kq.loi ? `, ${kq.loi} lỗi` : ''}.`
      : 'Đã đồng bộ HIS — không có thay đổi.'
  } catch (e) { thongBao.value = thongDiepLoi(e) }
  finally { dangLamMoi.value = false }
}

onMounted(async () => {
  await store.tai()
  if (!phongChon.value && store.rooms[0]) phongChon.value = store.rooms[0].id
})
useStream(() => store.tai())

const cuaPhong = computed(() => store.orders.filter((o) => o.room_id === phongChon.value))
const dangGoi = computed(() => cuaPhong.value.find((o) => o.status === 'dang_goi') ?? null)

function loc(ds: Order[]): Order[] {
  const k = tuKhoa.value.trim().toLowerCase()
  if (!k) return ds
  return ds.filter((o) => o.ho_ten.toLowerCase().includes(k) || String(o.stt).includes(k))
}
const hangCho = computed(() =>
  loc(cuaPhong.value.filter((o) => o.status === 'cho' && !o.giu_hang).sort((a, b) => a.queue_pos - b.queue_pos)),
)
// Hàng GIỮ: ca nội trú chờ KTV xếp vào hàng thời gian (chụp buổi chiều). Không tự hẹn giờ.
// Gồm ca đã tra sẵn phòng này + ca chưa xác định phòng (mã HH chưa cấu hình) để không bỏ sót.
const noiTru = computed(() =>
  loc(store.orders.filter((o) => o.giu_hang && (o.room_id === phongChon.value || o.room_id === null))),
)
const quaLuot = computed(() => loc(cuaPhong.value.filter((o) => o.status === 'qua_luot')))
const hoanThanhDem = computed(() => store.hoanThanh.filter((o) => o.room_id === phongChon.value).length)
const hoanThanhDs = computed(() => store.hoanThanh.filter((o) => o.room_id === phongChon.value))

// ── Thao tác vòng đời (ngữ cảnh) ────────────────────────────────────────────
async function chay(id: number | undefined | null, hd: HanhDong) {
  if (!id) { thongBao.value = 'Không có ca phù hợp để thao tác.'; return }
  thongBao.value = ''
  try { await store.hanhDong(id, hd) }
  catch (e) { thongBao.value = thongDiepLoi(e) }
}
// KTV chỉ điều phối HÀNG CHỜ. Trạng thái ca chụp do HIS quyết định: khi HIS báo đã
// chụp (TrangThai 2/3/4) ca tự đóng → "Đã chụp". Nút "Gọi" đưa ca kế tiếp (đang chọn
// hoặc đầu hàng) sang "Đang gọi". "Quá lượt" áp cho ca đang gọi mà bệnh nhân vắng.
function caKeTiep(): Order | null {
  if (chonId.value) {
    const sel = hangCho.value.find((o) => o.id === chonId.value)
    if (sel) return sel
  }
  return hangCho.value[0] ?? null
}
const goiCa = () => chay(caKeTiep()?.id, 'goi')
const datQuaLuot = () => chay(dangGoi.value?.id, 'qua_luot')
const goiLai = (id: number) => chay(id, 'goi_lai')
// Đóng ca thủ công ("Đã chụp") — chỉ dùng cho ca NHẬP TAY (ca HIS do HIS tự đóng).
const daChup = () => chay(dangGoi.value?.id, 'hoan_thanh')

// Nút theo máy trạng thái — tự mờ/khóa khi chưa tới lượt để KTV nhìn là biết bước
// nào đang dùng được (tránh cảm giác "bấm không ăn").
const congCu = computed(() => [
  { nhan: 'Gọi', chinh: true, co: hangCho.value.length > 0, fn: goiCa },
  { nhan: 'Quá lượt', chinh: false, mau: 'text-orange-800', co: !!dangGoi.value, fn: datQuaLuot },
  // "Đã chụp" thủ công chỉ hiện với ca KHÔNG có trạng thái HIS để tự đóng: nhập tay
  // hoặc phiếu đặt trước chưa ghép với ca HIS.
  ...(dangGoi.value?.nguon === 'thu_cong' || dangGoi.value?.nguon === 'dat_truoc'
    ? [{ nhan: 'Đã chụp', chinh: false, mau: 'text-green-800', co: true, fn: daChup }]
    : []),
])

// ── Kéo đổi thứ tự hàng chờ ─────────────────────────────────────────────────
// Thả LÊN một dòng → ca chèn vào ĐÚNG vị trí dòng đó (đẩy dòng đó + các ca sau
// xuống), nhất quán dù kéo lên hay kéo xuống. Thả vào VÙNG CUỐI danh sách → xuống
// cuối hàng. Giờ hẹn tính lại cho cả phòng sau khi lưu ([[capNhatGioHenPhong]]).
const keoIdx = ref<number | null>(null)
function batDauKeo(i: number) { keoIdx.value = i }
function huyKeo() { keoIdx.value = null }
async function luuThuTu(ids: number[]) {
  keoIdx.value = null
  try { await store.sapXep(phongChon.value, ids) }
  catch (e) { thongBao.value = thongDiepLoi(e) }
}
// Thả lên dòng index i → chèn ngay TRƯỚC ca đang ở dòng đó.
async function thaKeo(i: number) {
  if (keoIdx.value === null) return
  if (keoIdx.value === i) { keoIdx.value = null; return }
  const ids = hangCho.value.map((o) => o.id)
  const di = ids[keoIdx.value]
  const target = ids[i]
  const con = ids.filter((x) => x !== di)
  con.splice(con.indexOf(target), 0, di)
  await luuThuTu(con)
}
// Thả vào vùng trống cuối danh sách → xuống CUỐI hàng chờ.
async function thaCuoi() {
  if (keoIdx.value === null) return
  const ids = hangCho.value.map((o) => o.id)
  const di = ids[keoIdx.value]
  await luuThuTu([...ids.filter((x) => x !== di), di])
}

// ── Modal sửa giờ ────────────────────────────────────────────────────────────
const suaGio = ref<{ id: number; ten: string; gtri: string } | null>(null)
function moSuaGio(o?: Order) {
  const muc = o || (chonId.value ? hangCho.value.find((x) => x.id === chonId.value) : null) || hangCho.value[0]
  if (!muc) { thongBao.value = 'Chọn một ca trong hàng chờ để sửa giờ.'; return }
  suaGio.value = { id: muc.id, ten: muc.ho_ten, gtri: '' }
}
async function luuGio(xoa = false) {
  if (!suaGio.value) return
  const iso = xoa || !suaGio.value.gtri ? null : new Date(suaGio.value.gtri).toISOString()
  const id = suaGio.value.id
  suaGio.value = null
  try { await store.gioHen(id, iso) }
  catch (e) { thongBao.value = thongDiepLoi(e) }
}

// ── Modal chuyển phòng ───────────────────────────────────────────────────────
const chuyen = ref<{ id: number; ten: string; room: number } | null>(null)
function moChuyen(o?: Order) {
  const muc = o || (chonId.value ? cuaPhong.value.find((x) => x.id === chonId.value) : null)
  if (!muc) { thongBao.value = 'Chọn một ca để chuyển phòng.'; return }
  const khac = store.rooms.find((r) => r.id !== muc.room_id)
  chuyen.value = { id: muc.id, ten: muc.ho_ten, room: khac?.id ?? phongChon.value }
}
async function luuChuyen() {
  if (!chuyen.value) return
  const { id, room } = chuyen.value
  chuyen.value = null
  try { await store.chuyenPhong(id, room) }
  catch (e) { thongBao.value = thongDiepLoi(e) }
}

// ── Đưa ca nội trú (hàng giữ) vào hàng thời gian của phòng ───────────────────
// Phòng đích mặc định = phòng tra sẵn theo mã HH (o.room_id); thiếu thì dùng phòng
// đang xem. Sau khi vào hàng, ca được cấp STT + tự tính giờ hẹn như mọi ca thường.
async function duaVaoHang(o: Order) {
  const rid = o.room_id ?? phongChon.value
  if (!rid) { thongBao.value = 'Chưa xác định phòng cho ca nội trú này.'; return }
  thongBao.value = ''
  try { await store.vaoHang(o.id, rid) }
  catch (e) { thongBao.value = thongDiepLoi(e) }
}

// ── Nhập tay (dự phòng khi mất kết nối HIS) ─────────────────────────────────
const THOI_LUONG_NHANH = [15, 20, 30]
const nhapTay = ref<{ ho_ten: string; tuoi: string; sdt: string; room_id: number; ten_dich_vu: string; ma_bs: string; thoi_luong: string; tuyChon: boolean } | null>(null)
function moNhapTay() {
  nhapTay.value = { ho_ten: '', tuoi: '', sdt: '', room_id: phongChon.value || (store.rooms[0]?.id ?? 0), ten_dich_vu: '', ma_bs: '', thoi_luong: '20', tuyChon: false }
}
function chonThoiLuong(phut: number) {
  if (!nhapTay.value) return
  nhapTay.value.thoi_luong = String(phut); nhapTay.value.tuyChon = false
}
async function luuNhapTay() {
  if (!nhapTay.value) return
  const f = nhapTay.value
  if (!f.ho_ten.trim()) { thongBao.value = 'Nhập họ tên bệnh nhân.'; return }
  const payload = {
    ho_ten: f.ho_ten.trim(),
    tuoi: f.tuoi.trim() ? Number(f.tuoi) : null,
    sdt: f.sdt.trim() || null,
    room_id: f.room_id || null,
    ten_dich_vu: f.ten_dich_vu.trim() || null,
    ma_bs: f.ma_bs.trim() || null,
    ma_hh: null,
    thoi_luong_phut: f.thoi_luong.trim() ? Number(f.thoi_luong) : null,
  }
  nhapTay.value = null
  try { await store.themThuCong(payload) }
  catch (e) { thongBao.value = thongDiepLoi(e) }
}

// ── Đặt lịch hẹn trước ───────────────────────────────────────────────────────
// Phiếu vào hàng chờ ngay, giờ hẹn KTV điền (đóng băng). Khi HIS đẩy chỉ định thật
// sẽ gợi ý ghép (banner bên dưới). Họ tên + SĐT + phòng + giờ hẹn bắt buộc.
const datTruoc = ref<{ ho_ten: string; tuoi: string; sdt: string; ma_bn: string; room_id: number; ten_dich_vu: string; ma_bs: string; gio_hen: string } | null>(null)
function moDatTruoc() {
  datTruoc.value = { ho_ten: '', tuoi: '', sdt: '', ma_bn: '', room_id: phongChon.value || (store.rooms[0]?.id ?? 0), ten_dich_vu: '', ma_bs: '', gio_hen: '' }
}
async function luuDatTruoc() {
  if (!datTruoc.value) return
  const f = datTruoc.value
  if (!f.ho_ten.trim()) { thongBao.value = 'Nhập họ tên bệnh nhân.'; return }
  if (!f.sdt.trim()) { thongBao.value = 'Nhập số điện thoại (để ghép & nhắc hẹn).'; return }
  if (!f.gio_hen) { thongBao.value = 'Chọn giờ hẹn.'; return }
  const payload = {
    ho_ten: f.ho_ten.trim(),
    tuoi: f.tuoi.trim() ? Number(f.tuoi) : null,
    sdt: f.sdt.trim(),
    ma_bn: f.ma_bn.trim() || null,
    room_id: f.room_id,
    ten_dich_vu: f.ten_dich_vu.trim() || null,
    ma_hh: null,
    ma_bs: f.ma_bs.trim() || null,
    gio_hen: new Date(f.gio_hen).toISOString(),
  }
  datTruoc.value = null
  try { await store.datTruoc(payload) }
  catch (e) { thongBao.value = thongDiepLoi(e) }
}

// ── Gợi ý ghép phiếu đặt trước ↔ ca HIS (KTV xác nhận) ───────────────────────
// Mỗi cặp hiện một lần, lấy dòng phiếu đặt trước làm đại diện. Ghép → giữ ca HIS,
// lấy giờ hẹn từ phiếu, xóa phiếu. Để riêng → bỏ gợi ý (phiếu sống độc lập).
const goiYGhep = computed(() => {
  const ds: { phieu: Order; his: Order; do_tin: string }[] = []
  for (const o of store.orders) {
    if (o.ghep?.vai === 'dat_truoc') {
      const his = store.orders.find((x) => x.id === o.ghep!.doi_id)
      if (his) ds.push({ phieu: o, his, do_tin: o.ghep.do_tin })
    }
  }
  return ds
})
const moGhep = ref(true)
function nhanDoTin(d: string) { return d === 'ma_bn' ? 'mã BN' : d === 'sdt' ? 'SĐT' : 'tên + tuổi' }
async function ghepCap(phieuId: number, hisId: number) {
  thongBao.value = ''
  try { await store.ghep(phieuId, hisId) }
  catch (e) { thongBao.value = thongDiepLoi(e) }
}
async function deRiengPhieu(phieuId: number) {
  thongBao.value = ''
  try { await store.deRieng(phieuId) }
  catch (e) { thongBao.value = thongDiepLoi(e) }
}

// ── Kíp KTV trực hôm nay ─────────────────────────────────────────────────────
// Tên lấy từ danh sách KTV trong hệ thống; chọn tên là tự điền SĐT từ hồ sơ.
const kip = ref<{ ho_ten: string; sdt: string }[] | null>(null)
const dsKtv = ref<KtvChon[]>([])
function moKip() {
  kip.value = store.kipTruc.length
    ? store.kipTruc.map((k) => ({ ho_ten: k.ho_ten, sdt: k.sdt ?? '' }))
    : [{ ho_ten: '', sdt: '' }]
  apiHangDoi.dsKtv().then((ds) => { dsKtv.value = ds }).catch(() => {})
}
const themDongKip = () => { kip.value?.push({ ho_ten: '', sdt: '' }); kipMo.value = (kip.value?.length ?? 1) - 1 }
const xoaDongKip = (i: number) => { kip.value?.splice(i, 1); kipMo.value = null }

// Dropdown gợi ý tên KTV tự vẽ (đẹp & lọc theo chữ gõ) — kipMo = chỉ số dòng đang mở.
const kipMo = ref<number | null>(null)
const boDau = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
function goiYKtv(dong: { ho_ten: string }): KtvChon[] {
  const q = boDau(dong.ho_ten.trim())
  const ds = q ? dsKtv.value.filter((k) => boDau(k.ho_ten).includes(q)) : dsKtv.value
  return ds.slice(0, 50)
}
function chonKtv(dong: { ho_ten: string; sdt: string }, k: KtvChon) {
  dong.ho_ten = k.ho_ten
  dong.sdt = k.sdt ?? ''
  kipMo.value = null
}
// Khi gõ tay tên trùng đúng một KTV: tự điền SĐT từ hồ sơ (nếu có).
function apSdtTheoTen(dong: { ho_ten: string; sdt: string }) {
  const ten = boDau(dong.ho_ten.trim())
  const kt = dsKtv.value.find((k) => boDau(k.ho_ten.trim()) === ten)
  if (kt?.sdt) dong.sdt = kt.sdt
}
async function luuKip() {
  if (!kip.value) return
  const ds = kip.value
    .filter((k) => k.ho_ten.trim())
    .map((k) => ({ ho_ten: k.ho_ten.trim(), sdt: k.sdt.trim() || null }))
  kip.value = null
  try { await store.luuKip(ds) }
  catch (e) { thongBao.value = thongDiepLoi(e) }
}

// ── Trạng thái kết nối HIS (nhắc nhập tay khi gián đoạn) ─────────────────────
const hisCuoiGio = computed(() => store.hisCuoi
  ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(store.hisCuoi))
  : null)
const hisTre = computed(() =>
  !store.hisCuoi || (Date.now() - new Date(store.hisCuoi).getTime()) > 30 * 60 * 1000)

// Màu nhãn ưu tiên của ca (chỉ áp cho nhóm ưu tiên thật — bỏ 'gio_sua_tay'): tô chip
// cạnh tên + nền dòng + vạch màu trái. null → ca thường, không tô.
function nhanMau(o: Order) { return o.nhan?.kieu === 'uu_tien' ? kieuMau(o.nhan.mau) : null }

// Cột "Lệch hẹn" so với lịch hẹn ban đầu: sớm/đúng giờ xanh; muộn xám <10′, vàng 10–30′, đỏ >30′.
function chamHienThi(o: Order): { chu: string; mau: string } {
  const c = o.cham_phut
  if (c === null || c === undefined) return { chu: '—', mau: 'text-slate-300' }
  if (c < 0) return { chu: `Sớm ${-c}′`, mau: 'text-emerald-600 font-semibold' }
  if (c === 0) return { chu: 'đúng giờ', mau: 'text-emerald-600 font-semibold' }
  const mau = c > 30 ? 'text-rose-700 font-bold' : c >= 10 ? 'text-amber-700 font-semibold' : 'text-slate-600'
  return { chu: `Muộn ${c}′`, mau }
}
const moCanhBao = ref(false)

// ── Cột chính cấu hình được (app_settings 'dieu_phoi_cot_chinh' → store.cotChinh) ──
// STT + thao tác luôn hiển thị. Cột chọn lấy từ danh mục COT_DIEU_PHOI theo đúng
// thứ tự admin cấu hình; key lạ (cấu hình cũ) bị bỏ qua.
const cotChinh = computed(() =>
  store.cotChinh
    .map((k) => COT_DIEU_PHOI.find((c) => c.key === k))
    .filter((c): c is (typeof COT_DIEU_PHOI)[number] => !!c),
)
// ── Kéo chỉnh rộng cột (ghi đè bề rộng, lưu theo máy — localStorage) ──────────
const KEY_RONG = 'dieu_phoi_cot_rong'
const rongGhiDe = ref<Record<string, number>>({})
try { const raw = localStorage.getItem(KEY_RONG); if (raw) rongGhiDe.value = JSON.parse(raw) } catch { /* bỏ qua */ }
function luuRong() { try { localStorage.setItem(KEY_RONG, JSON.stringify(rongGhiDe.value)) } catch { /* bỏ qua */ } }

let chinhKey = ''
let chinhX0 = 0
let chinhW0 = 0
function keoChinh(e: MouseEvent) {
  const w = Math.max(40, Math.round(chinhW0 + (e.clientX - chinhX0)))
  rongGhiDe.value = { ...rongGhiDe.value, [chinhKey]: w }
}
function ketThucChinh() {
  window.removeEventListener('mousemove', keoChinh)
  window.removeEventListener('mouseup', ketThucChinh)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
  luuRong()
}
function batDauChinh(e: MouseEvent, key: string) {
  e.preventDefault(); e.stopPropagation()
  const cell = (e.currentTarget as HTMLElement).parentElement
  chinhKey = key; chinhX0 = e.clientX
  chinhW0 = cell ? cell.getBoundingClientRect().width : 80
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
  window.addEventListener('mousemove', keoChinh)
  window.addEventListener('mouseup', ketThucChinh)
}
function datLaiCot(key: string) {
  const o = { ...rongGhiDe.value }; delete o[key]; rongGhiDe.value = o; luuRong()
}

// grid: ô trạng-thái-trái (26px) + STT (44px) + các cột chính + ô thao tác (56px).
const colTemplate = computed(() =>
  ['26px', '44px',
    ...cotChinh.value.map((c) => (rongGhiDe.value[c.key] ? `${rongGhiDe.value[c.key]}px` : c.width)),
    '56px'].join(' '),
)
// Có hiển thị "BS chỉ định" như một cột riêng không (nếu không, ghép dưới tên).
const coCotBs = computed(() => cotChinh.value.some((c) => c.key === 'ten_bs'))

// Giá trị hiển thị cho cột văn bản chung (các trường HIS phụ).
function giaTriCot(o: Order, key: string): string {
  const v = (o as unknown as Record<string, unknown>)[key]
  return v === null || v === undefined || v === '' ? '—' : String(v)
}

// Dòng của tab đang xem (gộp 1 vòng lặp bảng cho 3 tab).
const rowsHienThi = computed<Order[]>(() =>
  tab.value === 'hang_cho' ? hangCho.value
    : tab.value === 'noi_tru' ? noiTru.value
      : tab.value === 'qua_luot' ? quaLuot.value
        : hoanThanhDs.value,
)

// Huy hiệu trạng thái theo tình trạng ca (dùng chung cho cột 'trang_thai').
function huyHieu(o: Order): { chu: string; cham: string; mau: string } {
  if (o.status === 'qua_luot') return { chu: 'Quá lượt', cham: 'bg-orange-600', mau: 'text-orange-700 font-bold' }
  if (o.status === 'hoan_thanh') return { chu: 'Đã chụp', cham: 'bg-green-600', mau: 'text-green-700 font-semibold' }
  if (o.status === 'dang_goi') return { chu: 'Đang gọi', cham: 'bg-hv', mau: 'text-hv font-bold' }
  return { chu: 'Chờ', cham: 'bg-amber-500', mau: 'text-amber-700 font-semibold' }
}

// ── Panel chi tiết: xem ĐẦY ĐỦ thông tin HIS của một ca ──────────────────────
const chiTiet = ref<Order | null>(null)
function moChiTiet(o: Order) { chiTiet.value = o }
function chiTietSuaGio() { if (chiTiet.value) { moSuaGio(chiTiet.value); chiTiet.value = null } }
function chiTietChuyen() { if (chiTiet.value) { moChuyen(chiTiet.value); chiTiet.value = null } }
function chiTietVaoHang() { if (chiTiet.value) { const o = chiTiet.value; chiTiet.value = null; duaVaoHang(o) } }

// Rút ca đang chờ ngược về hàng GIỮ (nội trú xếp chờ) — ngược của "Vào hàng".
// Có xác nhận: loại 1 ca khỏi hàng chờ đang chạy là thao tác nguy hiểm
// (ca mất lượt, lùi lại hàng giữ). Không dùng confirm() vì chặn extension.
const xacNhanXepCho = ref<Order | null>(null)
function chuyenVeXepCho(o: Order) { xacNhanXepCho.value = o }
async function luuXepCho() {
  const o = xacNhanXepCho.value
  xacNhanXepCho.value = null
  if (!o) return
  thongBao.value = ''
  try { await store.roiHang(o.id) }
  catch (e) { thongBao.value = thongDiepLoi(e) }
}
function chiTietXepCho() { if (chiTiet.value) { const o = chiTiet.value; chiTiet.value = null; chuyenVeXepCho(o) } }

// ── Hủy ca khỏi hàng đợi (có xác nhận; không dùng confirm() vì chặn extension) ──
// Dùng khi ca bị kẹt/ca thử/bệnh nhân bỏ về. Chỉ hủy ca chưa chụp xong (cho/quá
// lượt/đang gọi). Ca HIS đã hủy sẽ không bị poller hồi sinh (idempotent theo ma_his).
const xacNhanHuy = ref<Order | null>(null)
// Nguồn ca để hủy: ca truyền vào → panel chi tiết → ca đang chọn trong phòng →
// ca đang gọi. Nhờ vậy nút "Hủy ca" trên thanh công cụ dùng được không cần mở panel.
function moHuy(o?: Order) {
  const muc = o || chiTiet.value
    || (chonId.value ? cuaPhong.value.find((x) => x.id === chonId.value) : null)
    || dangGoi.value
  if (!muc) { thongBao.value = 'Chọn một ca (bấm vào dòng) để hủy.'; return }
  if (muc.status === 'hoan_thanh') { thongBao.value = 'Ca đã chụp xong, không hủy được.'; return }
  xacNhanHuy.value = muc
  chiTiet.value = null
}
async function luuHuy() {
  const o = xacNhanHuy.value
  xacNhanHuy.value = null
  if (!o) return
  await chay(o.id, 'huy')
  if (!thongBao.value) thongBao.value = `Đã hủy ca ${String(o.stt).padStart(3, '0')} — ${o.ho_ten}.`
}
// Các dòng thông tin hiển thị trong panel (bỏ trường trống).
const chiTietDong = computed<{ nhan: string; gtri: string }[]>(() => {
  const o = chiTiet.value
  if (!o) return []
  const raw: [string, string | number | null | undefined][] = [
    ['Mã BN', o.ma_bn], ['Giới tính', o.gioi_tinh], ['Tuổi', o.tuoi ?? undefined],
    ['Số điện thoại', o.sdt], ['Đối tượng', o.doi_tuong],
    ['Chỉ định', o.chi_dinh], ['Mã HH', o.ma_hh],
    ['BS chỉ định', o.ten_bs], ['Giờ chỉ định', o.gio_chi_dinh],
    ['Khoa chỉ định', o.khoa_chi_dinh], ['Phòng chỉ định', o.phong_chi_dinh],
    ['Loại điều trị', o.loai_dieu_tri], ['Giờ hẹn', o.gio_hen],
    ['Giờ hẹn gốc', o.gio_hen_goc],
    ['Lệch hẹn', o.cham_phut != null ? (o.cham_phut > 0 ? `Muộn ${o.cham_phut} phút` : o.cham_phut < 0 ? `Sớm ${-o.cham_phut} phút` : 'đúng giờ') : undefined],
    ['Ghi chú', o.ghi_chu_his],
  ]
  return raw
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([nhan, v]) => ({ nhan, gtri: String(v) }))
})
</script>

<template>
  <div class="h-screen flex flex-col text-slate-900 bg-[#eef1f5] overflow-hidden text-[13px]">
    <AppHeader tieu-de="Điều phối hàng chờ MRI" :gio-cap-nhat="store.capNhatLuc" />

    <!-- Toolbar -->
    <div class="shrink-0 min-h-[42px] box-border bg-white border-b border-[#d6dde6] flex items-center flex-wrap px-3 py-1.5 gap-2">
      <div class="flex border border-slate-300 rounded-[5px] overflow-hidden">
        <button
          v-for="r in store.rooms" :key="r.id" @click="phongChon = r.id"
          class="border-none px-3.5 py-1.5 text-[12.5px]"
          :class="phongChon === r.id ? 'bg-hv text-white font-bold' : 'bg-white text-slate-600 font-semibold border-l border-slate-300'"
        >{{ r.ten }}</button>
      </div>
      <div class="w-px h-[22px] bg-slate-200"></div>
      <button
        v-for="c in congCu" :key="c.nhan" @click="c.fn()" :disabled="!c.co"
        class="rounded-[5px] px-2.5 py-1.5 text-[12.5px] border disabled:opacity-40 disabled:cursor-not-allowed"
        :class="c.chinh ? 'bg-hv border-hv-dark text-white font-bold' : ['bg-slate-50 border-slate-300 font-semibold', c.mau || 'text-slate-800']"
      >{{ c.nhan }}</button>
      <div class="w-px h-[22px] bg-slate-200"></div>
      <button @click="moSuaGio()" class="bg-slate-50 border border-slate-300 rounded-[5px] px-2.5 py-1.5 font-semibold text-[12.5px] text-slate-800">Sửa giờ</button>
      <button @click="moChuyen()" class="bg-slate-50 border border-slate-300 rounded-[5px] px-2.5 py-1.5 font-semibold text-[12.5px] text-slate-800">Chuyển phòng</button>
      <button @click="moHuy()" title="Hủy ca đang chọn khỏi hàng đợi (ca thử / bỏ về)" class="bg-rose-50 border border-rose-300 rounded-[5px] px-2.5 py-1.5 font-semibold text-[12.5px] text-rose-700">Hủy ca</button>
      <div class="w-px h-[22px] bg-slate-200"></div>
      <button @click="moNhapTay()" class="bg-emerald-600 border border-emerald-700 text-white rounded-[5px] px-2.5 py-1.5 font-bold text-[12.5px]">+ Nhập tay</button>
      <button @click="moDatTruoc()" title="Tạo phiếu đặt lịch hẹn trước (vào hàng chờ ngay)" class="bg-sky-600 border border-sky-700 text-white rounded-[5px] px-2.5 py-1.5 font-bold text-[12.5px]">+ Đặt lịch hẹn</button>
      <button @click="moKip()" class="bg-slate-50 border border-slate-300 rounded-[5px] px-2.5 py-1.5 font-semibold text-[12.5px] text-slate-800">
        Kíp trực<span v-if="store.kipTruc.length" class="ml-1 text-hv font-bold">({{ store.kipTruc.length }})</span>
      </button>
      <div class="w-px h-[22px] bg-slate-200"></div>
      <button @click="lamMoi()" :disabled="dangLamMoi" title="Lấy chỉ định mới từ HIS ngay"
        class="bg-hv/10 border border-hv text-hv-dark rounded-[5px] px-2.5 py-1.5 font-bold text-[12.5px] disabled:opacity-50 disabled:cursor-wait">
        {{ dangLamMoi ? 'Đang làm mới…' : '↻ Làm mới' }}
      </button>
      <div class="flex-1 min-w-2"></div>
      <input v-model="tuKhoa" type="text" placeholder="Tìm tên / STT…"
             class="text-[12.5px] border border-slate-300 rounded-[5px] px-2.5 py-1.5 w-[190px] outline-none" />
    </div>

    <!-- Nhắc mất kết nối HIS → nhập tay (chỉ hiện khi lâu chưa nhận ca từ HIS) -->
    <div v-if="hisTre" class="shrink-0 bg-amber-50 border-b border-amber-200 px-3 py-1.5 text-[12px] text-amber-800 flex items-center flex-wrap gap-x-2 gap-y-1">
      <span class="font-bold">⚠ Chưa nhận ca mới từ HIS<span v-if="hisCuoiGio"> (lần cuối {{ hisCuoiGio }})</span>.</span>
      <span>Nếu HIS gián đoạn, dùng nút <b>+ Nhập tay</b> để tiếp nhận bệnh nhân thủ công.</span>
      <button @click="moNhapTay()" class="ml-auto font-bold underline text-amber-900">Nhập tay ngay</button>
    </div>

    <!-- Cảnh báo: chỉ định HIS có mã HH chưa cấu hình → không xếp được số -->
    <div v-if="store.chuaXep.length" class="shrink-0 bg-rose-50 border-b border-rose-200 px-3 py-1.5 text-[12.5px] text-rose-800">
      <div class="flex items-center flex-wrap gap-x-2 gap-y-1">
        <span class="font-extrabold">⚠ {{ store.chuaXep.length }} chỉ định chưa xếp được số</span>
        <span>— mã HH chưa có trong cấu hình. Vui lòng liên hệ Admin bổ sung.</span>
        <button @click="moCanhBao = !moCanhBao" class="ml-auto font-bold underline text-rose-700">{{ moCanhBao ? 'Ẩn' : 'Xem chi tiết' }}</button>
      </div>
      <ul v-if="moCanhBao" class="mt-1.5 mb-0.5 space-y-0.5">
        <li v-for="o in store.chuaXep" :key="o.id" class="flex flex-wrap gap-x-2">
          <b>{{ o.ho_ten }}</b><span v-if="o.tuoi" class="text-rose-600">{{ o.tuoi }}t</span>
          <span>· Mã HH <b class="font-mono">{{ o.ma_hh || '(trống)' }}</b></span>
          <span class="text-rose-700/80 truncate">· {{ o.chi_dinh }}</span>
        </li>
      </ul>
    </div>

    <!-- Gợi ý ghép phiếu đặt trước với ca HIS vừa đẩy sang (KTV xác nhận) -->
    <div v-if="goiYGhep.length" class="shrink-0 bg-sky-50 border-b border-sky-200 px-3 py-1.5 text-[12.5px] text-sky-900">
      <div class="flex items-center flex-wrap gap-x-2 gap-y-1">
        <span class="font-extrabold">⚠ {{ goiYGhep.length }} gợi ý ghép phiếu đặt trước với ca HIS</span>
        <span class="text-sky-700/80">— HIS vừa đẩy chỉ định trùng bệnh nhân đã đặt lịch. Xác nhận để gộp (giữ giờ đã hẹn).</span>
        <button @click="moGhep = !moGhep" class="ml-auto font-bold underline text-sky-700">{{ moGhep ? 'Ẩn' : 'Xem' }}</button>
      </div>
      <ul v-if="moGhep" class="mt-1.5 mb-0.5 space-y-1.5">
        <li v-for="g in goiYGhep" :key="g.phieu.id" class="flex items-center flex-wrap gap-x-2 gap-y-1 bg-white border border-sky-200 rounded-lg px-2.5 py-1.5">
          <span class="text-[11px] font-bold px-[6px] py-[2px] rounded bg-sky-100 text-sky-700">Phiếu</span>
          <b>{{ g.phieu.ho_ten }}</b>
          <span v-if="g.phieu.tuoi" class="text-sky-700/80">{{ g.phieu.tuoi }}t</span>
          <span v-if="g.phieu.gio_hen" class="tnum text-sky-800">· hẹn {{ g.phieu.gio_hen }}</span>
          <span class="text-slate-400">↔</span>
          <span class="text-[11px] font-bold px-[6px] py-[2px] rounded bg-emerald-100 text-emerald-700">HIS</span>
          <b>{{ g.his.ho_ten }}</b>
          <span v-if="g.his.tuoi" class="text-slate-500">{{ g.his.tuoi }}t</span>
          <span class="text-slate-400">·</span><span class="text-slate-500">khớp theo {{ nhanDoTin(g.do_tin) }}</span>
          <span class="flex-1 min-w-2"></span>
          <button @click="ghepCap(g.phieu.id, g.his.id)" class="bg-sky-600 text-white border border-sky-700 rounded px-2.5 py-1 font-bold text-[12px]">Ghép</button>
          <button @click="deRiengPhieu(g.phieu.id)" class="bg-slate-50 text-slate-700 border border-slate-300 rounded px-2.5 py-1 font-semibold text-[12px]">Để riêng</button>
        </li>
      </ul>
    </div>

    <!-- Đang gọi (phục vụ) -->
    <div class="shrink-0 bg-[#d6dde6] border-b border-[#d6dde6]">
      <div class="bg-hv-soft border-l-4 border-hv px-3.5 py-2 flex items-center gap-3.5">
        <span class="text-[10.5px] font-extrabold text-hv tracking-wider w-16">ĐANG GỌI</span>
        <template v-if="dangGoi">
          <span class="tnum text-[20px] font-extrabold text-hv">{{ String(dangGoi.stt).padStart(3, '0') }}</span>
          <span class="font-bold text-[14px]">{{ dangGoi.ho_ten }}</span>
          <span class="text-[12px] text-slate-500">{{ dangGoi.tuoi }}t · {{ dangGoi.chi_dinh }}</span>
          <span v-if="dangGoi.nguon === 'thu_cong'" class="text-[10.5px] font-bold px-[7px] py-0.5 rounded bg-emerald-100 text-emerald-700">Nhập tay</span>
        </template>
        <span v-else class="text-slate-400 text-[12px]">— trống —</span>
      </div>
    </div>

    <!-- Tabs -->
    <div class="shrink-0 bg-white border-b border-[#d6dde6] flex items-stretch px-3">
      <button @click="tab = 'hang_cho'" class="border-none py-[9px] px-4 text-[12.5px]"
              :class="tab === 'hang_cho' ? 'border-b-[2.5px] border-hv font-bold text-hv' : 'border-b-[2.5px] border-transparent font-semibold text-slate-600'">
        Hàng chờ <span class="bg-blue-100 text-hv rounded px-1.5 text-[11px] ml-1">{{ hangCho.length }}</span>
      </button>
      <button @click="tab = 'noi_tru'" class="border-none py-[9px] px-4 text-[12.5px]"
              :class="tab === 'noi_tru' ? 'border-b-[2.5px] border-indigo-500 font-bold text-indigo-700' : 'border-b-[2.5px] border-transparent font-semibold text-indigo-700/80'">
        Nội trú (chờ xếp) <span class="bg-indigo-100 text-indigo-700 rounded px-1.5 text-[11px] ml-1">{{ noiTru.length }}</span>
      </button>
      <button @click="tab = 'qua_luot'" class="border-none py-[9px] px-4 text-[12.5px]"
              :class="tab === 'qua_luot' ? 'border-b-[2.5px] border-orange-500 font-bold text-orange-700' : 'border-b-[2.5px] border-transparent font-semibold text-orange-800'">
        Quá lượt <span class="bg-orange-100 text-orange-700 rounded px-1.5 text-[11px] ml-1">{{ quaLuot.length }}</span>
      </button>
      <button @click="tab = 'hoan_thanh'" class="border-none py-[9px] px-4 text-[12.5px]"
              :class="tab === 'hoan_thanh' ? 'border-b-[2.5px] border-green-600 font-bold text-green-700' : 'border-b-[2.5px] border-transparent font-semibold text-green-700'">
        Đã chụp <span class="bg-green-100 text-green-700 rounded px-1.5 text-[11px] ml-1">{{ hoanThanhDem }}</span>
      </button>
      <div class="flex-1"></div>
      <div class="flex items-center text-[11.5px] text-slate-400 font-semibold">Kéo ⠿ để đổi thứ tự · chọn dòng rồi bấm thao tác</div>
    </div>

    <!-- Bảng (cột chính cấu hình được; bấm ⓘ để xem đầy đủ thông tin HIS) -->
    <div class="flex-1 overflow-auto bg-white min-h-0">
      <div class="min-w-[640px]">
      <div class="grid sticky top-0 bg-slate-100 border-b border-slate-300 text-[10.5px] font-bold text-slate-500 uppercase tracking-wide z-10"
           :style="{ gridTemplateColumns: colTemplate }">
        <div class="py-[7px] px-1"></div>
        <div class="py-[7px] px-1.5">STT</div>
        <div v-for="c in cotChinh" :key="c.key" class="relative py-[7px] px-1.5 truncate">
          {{ c.nhan }}
          <span class="cot-nam" title="Kéo để chỉnh rộng · nhấp đúp để đặt lại"
                @mousedown="batDauChinh($event, c.key)" @dblclick="datLaiCot(c.key)"></span>
        </div>
        <div class="py-[7px] px-1 text-center">Xem</div>
      </div>

      <!-- Tiêu đề phụ tab quá lượt -->
      <div v-if="tab === 'qua_luot' && quaLuot.length" class="flex items-center gap-2 bg-orange-50 border-b border-orange-200 px-3 py-[5px] text-[10.5px] font-extrabold text-orange-800 tracking-wide uppercase">
        ⚠ Quá lượt · chờ gọi lại ({{ quaLuot.length }})
      </div>

      <!-- Tiêu đề phụ tab nội trú (chờ xếp buổi chiều) -->
      <div v-if="tab === 'noi_tru'" class="flex items-center flex-wrap gap-x-2 bg-indigo-50 border-b border-indigo-200 px-3 py-[5px] text-[11px] font-semibold text-indigo-800">
        🌙 <b class="font-extrabold">Nội trú — ưu tiên chụp buổi chiều.</b>
        <span class="text-indigo-700/80">Chưa tự hẹn giờ. Bấm <b>Đưa vào hàng</b> để xếp ca vào hàng thời gian (cấp số + tính giờ).</span>
      </div>

      <!-- Thân bảng: một vòng lặp dùng chung cho cả 3 tab -->
      <div v-for="(o, i) in rowsHienThi" :key="o.id"
           :draggable="tab === 'hang_cho'"
           @dragstart="tab === 'hang_cho' && batDauKeo(i)" @dragover.prevent @drop="tab === 'hang_cho' && thaKeo(i)" @dragend="huyKeo()"
           @click="chonId = o.id"
           class="grid items-center border-b border-[#eef2f6] text-[13px]"
           :class="[
             tab === 'hang_cho' ? 'cursor-pointer' : '',
             nhanMau(o) ? [nhanMau(o)!.row, nhanMau(o)!.bar]
               : tab === 'qua_luot' ? 'bg-[#fffaf4]'
               : tab === 'hang_cho' && o.gio_hen_thu_cong ? 'bg-[#fafbfc]' : '',
             chonId === o.id ? 'ring-2 ring-hv ring-inset' : '',
           ]"
           :style="{ gridTemplateColumns: colTemplate }">
        <!-- Ô trái: tay kéo (hàng chờ) hoặc biểu tượng trạng thái -->
        <div class="px-1 text-center"
             :class="tab === 'hang_cho' ? (o.nhan?.kieu === 'uu_tien' ? 'text-slate-400 cursor-grab' : 'text-slate-300 cursor-grab')
               : tab === 'noi_tru' ? 'text-indigo-500' : tab === 'qua_luot' ? 'text-orange-600' : 'text-green-600'">
          {{ tab === 'hang_cho' ? '⠿' : tab === 'noi_tru' ? '🌙' : tab === 'qua_luot' ? '↻' : '✓' }}
        </div>
        <!-- STT -->
        <div class="tnum py-[9px] px-1.5 font-extrabold" :class="tab === 'qua_luot' ? 'text-orange-800' : ''">
          {{ o.stt ? String(o.stt).padStart(3, '0') : '—' }}
        </div>
        <!-- Cột chính động -->
        <template v-for="c in cotChinh" :key="c.key">
          <div v-if="c.key === 'ho_ten'" class="py-[9px] px-1.5 min-w-0"
               :class="o.nhan?.kieu === 'uu_tien' ? 'font-bold' : 'font-semibold'">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="truncate" :title="o.ho_ten">{{ o.ho_ten }}</span>
              <!-- Chip nhóm ưu tiên (viết tắt) ngay sau tên -->
              <span v-if="nhanMau(o)" class="shrink-0 text-[10px] font-extrabold leading-none px-[6px] py-[3px] rounded"
                    :class="nhanMau(o)!.chip" :title="o.nhan!.ten">{{ chipNhan(o.nhan) }}</span>
              <!-- Ca nhập tay (mất HIS) -->
              <span v-if="o.nguon === 'thu_cong'" class="shrink-0 text-[10px] font-bold leading-none px-[6px] py-[3px] rounded bg-emerald-100 text-emerald-700">Tay</span>
              <!-- Phiếu đặt lịch hẹn trước -->
              <span v-if="o.nguon === 'dat_truoc'" class="shrink-0 text-[10px] font-bold leading-none px-[6px] py-[3px] rounded bg-sky-100 text-sky-700">Đặt trước</span>
              <!-- Có gợi ý ghép (phiếu ↔ HIS) -->
              <span v-if="o.ghep" title="Có gợi ý ghép phiếu đặt trước — xem banner phía trên" class="shrink-0 text-[10px] font-bold leading-none px-[6px] py-[3px] rounded bg-amber-100 text-amber-700">⚠ khớp</span>
            </div>
            <span v-if="!coCotBs && o.ten_bs" class="block text-[11px] text-slate-400 font-normal truncate">BS: {{ o.ten_bs }}</span>
            <span v-if="tab === 'qua_luot' && o.ghi_chu" class="block text-[11px] text-orange-700 font-normal truncate">{{ o.ghi_chu }}</span>
          </div>
          <div v-else-if="c.key === 'chi_dinh'" class="py-[9px] px-1.5 text-slate-700 truncate min-w-0" :title="o.chi_dinh">{{ o.chi_dinh }}</div>
          <div v-else-if="c.key === 'tuoi'" class="tnum py-[9px] px-1.5 text-slate-600">{{ o.tuoi ?? '—' }}</div>
          <div v-else-if="c.key === 'gio_hen'" class="tnum py-[9px] px-1.5"
               :class="o.gio_hen_thu_cong ? 'font-bold text-orange-700' : 'font-semibold'">{{ o.gio_hen ?? '—' }}</div>
          <div v-else-if="c.key === 'cham_phut'" class="tnum py-[9px] px-1.5" :class="chamHienThi(o).mau"
               :title="o.gio_hen_goc ? `Hẹn gốc ${o.gio_hen_goc} → dự kiến ${o.gio_hen ?? '—'}` : 'Lệch so với giờ hẹn ban đầu'">
            {{ chamHienThi(o).chu }}
          </div>
          <div v-else-if="c.key === 'trang_thai'" class="py-[9px] px-1.5">
            <span class="inline-flex items-center gap-1.5 text-[12px]" :class="huyHieu(o).mau">
              <span class="w-[7px] h-[7px] rounded-full" :class="huyHieu(o).cham"></span>{{ huyHieu(o).chu }}
            </span>
          </div>
          <div v-else class="py-[9px] px-1.5 text-slate-600 truncate min-w-0" :title="giaTriCot(o, c.key)">{{ giaTriCot(o, c.key) }}</div>
        </template>
        <!-- Ô phải: gọi lại (quá lượt) + xem chi tiết -->
        <div class="px-1 flex items-center justify-center gap-1.5">
          <button v-if="tab === 'qua_luot'" @click.stop="goiLai(o.id)" class="bg-orange-600 text-white border-none rounded text-[10px] font-bold px-1.5 py-[3px]">Gọi</button>
          <button v-if="tab === 'noi_tru'" @click.stop="duaVaoHang(o)" title="Đưa vào hàng thời gian của phòng" class="bg-indigo-600 text-white border-none rounded text-[10px] font-bold px-1.5 py-[3px] whitespace-nowrap">Vào hàng</button>
          <button v-if="tab === 'hang_cho'" @click.stop="chuyenVeXepCho(o)" title="Chuyển về xếp chờ (Nội trú)" class="text-indigo-500 hover:text-indigo-700 text-[14px] leading-none">🌙</button>
          <button @click.stop="moChiTiet(o)" title="Xem đầy đủ thông tin" class="text-slate-400 hover:text-hv font-extrabold text-[14px] leading-none">ⓘ</button>
        </div>
      </div>

      <div v-if="!rowsHienThi.length" class="p-6 text-slate-400 text-[13px]">
        {{ tab === 'hang_cho' ? 'Hàng chờ trống.' : tab === 'noi_tru' ? 'Không có ca nội trú chờ xếp.' : tab === 'qua_luot' ? 'Không có ca quá lượt.' : 'Chưa có ca đã chụp hôm nay.' }}
      </div>

      <!-- Vùng thả cuối danh sách: kéo ca vào đây để đưa xuống CUỐI hàng chờ -->
      <div v-if="tab === 'hang_cho' && rowsHienThi.length"
           @dragover.prevent @drop="thaCuoi()"
           class="min-h-[52px] transition-colors"
           :class="keoIdx !== null ? 'border-t-2 border-dashed border-hv/50 bg-hv-soft/50' : ''">
        <div v-if="keoIdx !== null" class="px-3 py-3 text-[11.5px] font-semibold text-hv">⇩ Thả vào đây để đưa xuống cuối hàng chờ</div>
      </div>
      </div>
    </div>

    <!-- Status bar -->
    <footer class="min-h-[30px] shrink-0 bg-slate-100 border-t border-[#d6dde6] flex items-center flex-wrap px-3.5 py-1 gap-x-3 sm:gap-x-[18px] gap-y-0.5 text-[11px] sm:text-[11.5px] text-slate-600 font-semibold">
      <span><b class="tnum text-amber-700">{{ hangCho.length }}</b> chờ</span>
      <span><b class="tnum text-orange-700">{{ quaLuot.length }}</b> quá lượt</span>
      <span><b class="tnum text-hv">{{ dangGoi ? 1 : 0 }}</b> đang gọi</span>
      <span><b class="tnum text-green-700">{{ hoanThanhDem }}</b> đã chụp</span>
      <span v-if="thongBao" class="text-rose-600">· {{ thongBao }}</span>
      <div class="flex-1 hidden sm:block"></div>
      <span class="text-slate-300 hidden lg:inline">|</span>
      <span class="hidden lg:inline">Phát triển bởi <b>Nguyễn Thành Lâm</b></span>
    </footer>

    <!-- Modal sửa giờ -->
    <div v-if="suaGio" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4" @click.self="suaGio = null">
      <div class="bg-white rounded-xl p-5 w-full max-w-[340px]">
        <h3 class="font-bold text-slate-800 mb-1">Sửa giờ hẹn</h3>
        <p class="text-[12px] text-slate-500 mb-3">{{ suaGio.ten }}</p>
        <input v-model="suaGio.gtri" type="datetime-local"
               class="w-full border border-slate-300 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-hv" />
        <div class="flex gap-2 mt-4">
          <button @click="luuGio(false)" class="flex-1 bg-hv text-white font-bold rounded-lg py-2 text-[13px]">Lưu giờ</button>
          <button @click="luuGio(true)" class="bg-slate-100 text-slate-700 font-semibold rounded-lg py-2 px-3 text-[13px]">Bỏ giờ tay</button>
          <button @click="suaGio = null" class="bg-slate-100 text-slate-700 font-semibold rounded-lg py-2 px-3 text-[13px]">Hủy</button>
        </div>
      </div>
    </div>

    <!-- Modal chuyển phòng -->
    <div v-if="chuyen" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4" @click.self="chuyen = null">
      <div class="bg-white rounded-xl p-5 w-full max-w-[340px]">
        <h3 class="font-bold text-slate-800 mb-1">Chuyển phòng</h3>
        <p class="text-[12px] text-slate-500 mb-3">{{ chuyen.ten }}</p>
        <select v-model.number="chuyen.room" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-hv">
          <option v-for="r in store.rooms" :key="r.id" :value="r.id">{{ r.ten }}</option>
        </select>
        <div class="flex gap-2 mt-4">
          <button @click="luuChuyen" class="flex-1 bg-hv text-white font-bold rounded-lg py-2 text-[13px]">Chuyển</button>
          <button @click="chuyen = null" class="bg-slate-100 text-slate-700 font-semibold rounded-lg py-2 px-3 text-[13px]">Hủy</button>
        </div>
      </div>
    </div>

    <!-- Modal xác nhận hủy ca -->
    <div v-if="xacNhanHuy" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4" @click.self="xacNhanHuy = null">
      <div class="bg-white rounded-xl p-5 w-full max-w-[360px]">
        <h3 class="font-bold text-slate-800 mb-1">Hủy ca khỏi hàng đợi?</h3>
        <p class="text-[13px] text-slate-600 mb-1">
          <b class="tnum">{{ String(xacNhanHuy.stt).padStart(3, '0') }}</b> · {{ xacNhanHuy.ho_ten }}
        </p>
        <p class="text-[12px] text-slate-500 mb-4">Ca sẽ bị gỡ khỏi hàng đợi và các màn hình. Thao tác này không hoàn tác được.</p>
        <div class="flex gap-2">
          <button @click="luuHuy" class="flex-1 bg-rose-600 text-white font-bold rounded-lg py-2 text-[13px]">Hủy ca</button>
          <button @click="xacNhanHuy = null" class="bg-slate-100 text-slate-700 font-semibold rounded-lg py-2 px-3 text-[13px]">Không</button>
        </div>
      </div>
    </div>

    <!-- Modal xác nhận chuyển về xếp chờ (Nội trú) -->
    <div v-if="xacNhanXepCho" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4" @click.self="xacNhanXepCho = null">
      <div class="bg-white rounded-xl p-5 w-full max-w-[360px]">
        <h3 class="font-bold text-slate-800 mb-1">🌙 Chuyển về xếp chờ (Nội trú)?</h3>
        <p class="text-[13px] text-slate-600 mb-1">
          <b class="tnum">{{ String(xacNhanXepCho.stt).padStart(3, '0') }}</b> · {{ xacNhanXepCho.ho_ten }}
        </p>
        <p class="text-[12px] text-slate-500 mb-4">Ca sẽ bị <b>gỡ khỏi hàng chờ đang chạy</b> và đưa về hàng giữ (chờ xếp lại). Ca sẽ mất lượt hiện tại. Chỉ làm khi chắc chắn.</p>
        <div class="flex gap-2">
          <button @click="luuXepCho" class="flex-1 bg-indigo-600 text-white font-bold rounded-lg py-2 text-[13px]">Chuyển về xếp chờ</button>
          <button @click="xacNhanXepCho = null" class="bg-slate-100 text-slate-700 font-semibold rounded-lg py-2 px-3 text-[13px]">Không</button>
        </div>
      </div>
    </div>

    <!-- Modal nhập tay (dự phòng khi mất HIS) -->
    <div v-if="nhapTay" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4" @click.self="nhapTay = null">
      <div class="bg-white rounded-xl p-5 w-full max-w-[420px] max-h-[90vh] overflow-auto">
        <h3 class="font-bold text-slate-800 mb-0.5">Tiếp nhận thủ công</h3>
        <p class="text-[12px] text-slate-500 mb-3">Dùng khi HIS gián đoạn. Ca sẽ gắn nhãn <b>Nhập tay</b>.</p>
        <div class="space-y-2.5">
          <label class="block">
            <span class="text-[12px] font-semibold text-slate-600">Họ tên <span class="text-rose-500">*</span></span>
            <input v-model="nhapTay.ho_ten" type="text" placeholder="Nguyễn Văn A"
                   class="w-full border border-slate-300 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-hv" />
          </label>
          <div class="flex gap-2">
            <label class="block w-24">
              <span class="text-[12px] font-semibold text-slate-600">Tuổi</span>
              <input v-model="nhapTay.tuoi" type="number" min="0" max="150"
                     class="w-full border border-slate-300 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-hv" />
            </label>
            <label class="block flex-1">
              <span class="text-[12px] font-semibold text-slate-600">Số điện thoại</span>
              <input v-model="nhapTay.sdt" type="tel" inputmode="tel" placeholder="09xx…"
                     class="w-full border border-slate-300 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-hv" />
            </label>
          </div>
          <label class="block">
            <span class="text-[12px] font-semibold text-slate-600">Phòng</span>
            <select v-model.number="nhapTay.room_id" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-hv">
              <option v-for="r in store.rooms" :key="r.id" :value="r.id">{{ r.ten }}</option>
            </select>
          </label>
          <div>
            <span class="text-[12px] font-semibold text-slate-600">Thời lượng dự kiến</span>
            <div class="flex flex-wrap gap-1.5 mt-1">
              <button v-for="p in THOI_LUONG_NHANH" :key="p" type="button" @click="chonThoiLuong(p)"
                      class="px-3.5 py-1.5 rounded-lg border text-[13px] font-semibold"
                      :class="!nhapTay.tuyChon && nhapTay.thoi_luong === String(p) ? 'bg-hv border-hv text-white' : 'bg-slate-50 border-slate-300 text-slate-700'">
                {{ p }} phút
              </button>
              <button type="button" @click="nhapTay.tuyChon = true"
                      class="px-3.5 py-1.5 rounded-lg border text-[13px] font-semibold"
                      :class="nhapTay.tuyChon ? 'bg-hv border-hv text-white' : 'bg-slate-50 border-slate-300 text-slate-700'">
                Tùy chọn
              </button>
              <input v-if="nhapTay.tuyChon" v-model="nhapTay.thoi_luong" type="number" min="1" max="240" placeholder="phút" autofocus
                     class="w-24 border border-slate-300 rounded-lg px-3 py-1.5 text-[14px] outline-none focus:border-hv" />
            </div>
          </div>
          <label class="block">
            <span class="text-[12px] font-semibold text-slate-600">Loại chụp / chỉ định</span>
            <input v-model="nhapTay.ten_dich_vu" type="text" placeholder="VD: MRI sọ não không tiêm"
                   class="w-full border border-slate-300 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-hv" />
          </label>
          <label class="block">
            <span class="text-[12px] font-semibold text-slate-600">Mã BS chỉ định <span class="text-slate-400 font-normal">(để BS thấy ở "ca của tôi")</span></span>
            <input v-model="nhapTay.ma_bs" type="text" placeholder="Tùy chọn"
                   class="w-full border border-slate-300 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-hv" />
          </label>
        </div>
        <div class="flex gap-2 mt-4">
          <button @click="luuNhapTay" class="flex-1 bg-emerald-600 text-white font-bold rounded-lg py-2 text-[13px]">Thêm vào hàng chờ</button>
          <button @click="nhapTay = null" class="bg-slate-100 text-slate-700 font-semibold rounded-lg py-2 px-3 text-[13px]">Hủy</button>
        </div>
      </div>
    </div>

    <!-- Modal đặt lịch hẹn trước -->
    <div v-if="datTruoc" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4" @click.self="datTruoc = null">
      <div class="bg-white rounded-xl p-5 w-full max-w-[420px] max-h-[90vh] overflow-auto">
        <h3 class="font-bold text-slate-800 mb-0.5">Đặt lịch hẹn trước</h3>
        <p class="text-[12px] text-slate-500 mb-3">Phiếu vào hàng chờ ngay với giờ hẹn bên dưới. Khi HIS đẩy chỉ định của bệnh nhân, hệ thống sẽ <b>gợi ý ghép</b> để giữ đúng giờ đã hẹn.</p>
        <div class="space-y-2.5">
          <label class="block">
            <span class="text-[12px] font-semibold text-slate-600">Họ tên <span class="text-rose-500">*</span></span>
            <input v-model="datTruoc.ho_ten" type="text" placeholder="Nguyễn Văn A"
                   class="w-full border border-slate-300 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-hv" />
          </label>
          <div class="flex gap-2">
            <label class="block w-24">
              <span class="text-[12px] font-semibold text-slate-600">Tuổi</span>
              <input v-model="datTruoc.tuoi" type="number" min="0" max="150"
                     class="w-full border border-slate-300 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-hv" />
            </label>
            <label class="block flex-1">
              <span class="text-[12px] font-semibold text-slate-600">Số điện thoại <span class="text-rose-500">*</span></span>
              <input v-model="datTruoc.sdt" type="tel" inputmode="tel" placeholder="09xx…"
                     class="w-full border border-slate-300 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-hv" />
            </label>
          </div>
          <div class="flex gap-2">
            <label class="block flex-1">
              <span class="text-[12px] font-semibold text-slate-600">Mã BN <span class="text-slate-400 font-normal">(nếu có — ghép chính xác hơn)</span></span>
              <input v-model="datTruoc.ma_bn" type="text" placeholder="Tùy chọn"
                     class="w-full border border-slate-300 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-hv" />
            </label>
            <label class="block w-36">
              <span class="text-[12px] font-semibold text-slate-600">Phòng <span class="text-rose-500">*</span></span>
              <select v-model.number="datTruoc.room_id" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-hv">
                <option v-for="r in store.rooms" :key="r.id" :value="r.id">{{ r.ten }}</option>
              </select>
            </label>
          </div>
          <label class="block">
            <span class="text-[12px] font-semibold text-slate-600">Giờ hẹn <span class="text-rose-500">*</span></span>
            <input v-model="datTruoc.gio_hen" type="datetime-local"
                   class="w-full border border-slate-300 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-hv" />
          </label>
          <label class="block">
            <span class="text-[12px] font-semibold text-slate-600">Loại chụp / chỉ định</span>
            <input v-model="datTruoc.ten_dich_vu" type="text" placeholder="VD: MRI sọ não không tiêm"
                   class="w-full border border-slate-300 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-hv" />
          </label>
          <label class="block">
            <span class="text-[12px] font-semibold text-slate-600">Mã BS chỉ định <span class="text-slate-400 font-normal">(để BS thấy ở "ca của tôi")</span></span>
            <input v-model="datTruoc.ma_bs" type="text" placeholder="Tùy chọn"
                   class="w-full border border-slate-300 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-hv" />
          </label>
        </div>
        <div class="flex gap-2 mt-4">
          <button @click="luuDatTruoc" class="flex-1 bg-sky-600 text-white font-bold rounded-lg py-2 text-[13px]">Tạo phiếu hẹn</button>
          <button @click="datTruoc = null" class="bg-slate-100 text-slate-700 font-semibold rounded-lg py-2 px-3 text-[13px]">Hủy</button>
        </div>
      </div>
    </div>

    <!-- Modal kíp KTV trực hôm nay -->
    <div v-if="kip" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4" @click.self="kip = null">
      <div class="bg-white rounded-xl p-5 w-full max-w-[460px] max-h-[90vh] overflow-auto">
        <h3 class="font-bold text-slate-800 mb-0.5">Kíp KTV trực hôm nay</h3>
        <p class="text-[12px] text-slate-500 mb-3">Chọn tên từ danh sách KTV (tự điền SĐT), hoặc tự gõ. Để bác sĩ biết hôm nay ai làm, liên hệ thế nào.</p>
        <div class="space-y-2">
          <div v-for="(k, i) in kip" :key="i" class="flex gap-1.5 items-center">
            <!-- Ô tên + dropdown gợi ý KTV tự vẽ -->
            <div class="relative flex-1 min-w-0">
              <input v-model="k.ho_ten" type="text" placeholder="Họ tên KTV" autocomplete="off"
                     @focus="kipMo = i" @blur="kipMo = null; apSdtTheoTen(k)"
                     class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:border-hv" />
              <ul v-if="kipMo === i && goiYKtv(k).length"
                  class="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-auto py-1">
                <li v-for="opt in goiYKtv(k)" :key="opt.ho_ten"
                    @mousedown.prevent="chonKtv(k, opt)"
                    class="px-3 py-1.5 text-[13px] text-slate-700 cursor-pointer hover:bg-hv-soft flex items-center justify-between gap-2">
                  <span class="truncate">{{ opt.ho_ten }}</span>
                  <span v-if="opt.sdt" class="shrink-0 text-[11px] text-slate-400 tnum">{{ opt.sdt }}</span>
                </li>
              </ul>
            </div>
            <input v-model="k.sdt" type="tel" inputmode="tel" placeholder="SĐT"
                   class="w-32 border border-slate-300 rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:border-hv" />
            <button @click="xoaDongKip(i)" class="shrink-0 text-rose-500 font-bold px-1.5 text-[16px]" title="Xóa dòng">×</button>
          </div>
        </div>
        <button @click="themDongKip" class="mt-2 text-[12.5px] font-semibold text-hv">+ Thêm người</button>
        <div class="flex gap-2 mt-4">
          <button @click="luuKip" class="flex-1 bg-hv text-white font-bold rounded-lg py-2 text-[13px]">Lưu kíp</button>
          <button @click="kip = null" class="bg-slate-100 text-slate-700 font-semibold rounded-lg py-2 px-3 text-[13px]">Hủy</button>
        </div>
      </div>
    </div>

    <!-- Panel chi tiết: đầy đủ thông tin ca lấy từ HIS -->
    <div v-if="chiTiet" class="fixed inset-0 z-50 flex justify-end" @click.self="chiTiet = null">
      <div class="absolute inset-0 bg-black/30"></div>
      <div class="relative bg-white w-full sm:max-w-[400px] h-full shadow-xl flex flex-col animate-[slideIn_.15s_ease-out]">
        <div class="shrink-0 flex items-start justify-between gap-2 px-4 py-3 border-b border-[#eef2f6] bg-hv-soft">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="tnum text-[18px] font-extrabold text-hv">{{ String(chiTiet.stt).padStart(3, '0') }}</span>
              <span class="font-bold text-[15px] text-slate-800 truncate">{{ chiTiet.ho_ten }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-1.5 mt-1">
              <span class="inline-flex items-center gap-1.5 text-[11.5px]" :class="huyHieu(chiTiet).mau">
                <span class="w-[7px] h-[7px] rounded-full" :class="huyHieu(chiTiet).cham"></span>{{ huyHieu(chiTiet).chu }}
              </span>
              <span v-if="nhanMau(chiTiet)" class="text-[10.5px] font-extrabold px-[7px] py-0.5 rounded" :class="nhanMau(chiTiet)!.chip">{{ chiTiet.nhan!.ten }}</span>
              <span v-if="chiTiet.nguon === 'thu_cong'" class="text-[10.5px] font-bold px-[7px] py-0.5 rounded bg-emerald-100 text-emerald-700">Nhập tay</span>
              <span v-if="chiTiet.can_tiem" class="text-[10.5px] font-bold px-[7px] py-0.5 rounded bg-indigo-100 text-indigo-700">Có tiêm thuốc</span>
            </div>
          </div>
          <button @click="chiTiet = null" class="shrink-0 text-slate-400 hover:text-slate-700 text-[22px] leading-none font-bold">×</button>
        </div>

        <div class="flex-1 overflow-auto px-4 py-3">
          <dl class="divide-y divide-[#eef2f6]">
            <div v-for="d in chiTietDong" :key="d.nhan" class="flex gap-3 py-2 text-[13px]">
              <dt class="w-32 shrink-0 text-slate-500 font-semibold">{{ d.nhan }}</dt>
              <dd class="flex-1 text-slate-800 break-words">{{ d.gtri }}</dd>
            </div>
          </dl>
        </div>

        <!-- Thao tác nhanh: ca chưa chụp xong (cho/đang gọi/quá lượt) -->
        <div v-if="chiTiet.status !== 'hoan_thanh'" class="shrink-0 border-t border-[#eef2f6]">
          <div v-if="chiTiet.giu_hang" class="px-4 pt-3">
            <button @click="chiTietVaoHang()" class="w-full bg-indigo-600 text-white font-bold rounded-lg py-2 text-[13px] hover:bg-indigo-700">
              🌙 Đưa vào hàng thời gian
            </button>
          </div>
          <template v-else-if="chiTiet.status === 'cho'">
            <div class="flex gap-2 px-4 pt-3">
              <button @click="chiTietSuaGio()" class="flex-1 bg-slate-100 text-slate-700 font-semibold rounded-lg py-2 text-[13px]">Sửa giờ</button>
              <button @click="chiTietChuyen()" class="flex-1 bg-slate-100 text-slate-700 font-semibold rounded-lg py-2 text-[13px]">Chuyển phòng</button>
            </div>
            <div class="px-4 pt-2">
              <button @click="chiTietXepCho()" class="w-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold rounded-lg py-2 text-[13px] hover:bg-indigo-100">
                🌙 Chuyển sang xếp chờ (Nội trú)
              </button>
            </div>
          </template>
          <div class="px-4 py-3">
            <button @click="moHuy()" class="w-full bg-rose-50 text-rose-700 border border-rose-200 font-bold rounded-lg py-2 text-[13px] hover:bg-rose-100">
              Hủy ca khỏi hàng đợi
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes slideIn { from { transform: translateX(16px); opacity: .6 } to { transform: translateX(0); opacity: 1 } }

/* Tay nắm kéo chỉnh rộng cột — nằm ở mép phải tiêu đề cột */
.cot-nam {
  position: absolute; top: 0; right: -4px; width: 9px; height: 100%;
  cursor: col-resize; z-index: 20;
}
.cot-nam::after {
  content: ''; position: absolute; top: 4px; bottom: 4px; right: 4px; width: 2px;
  border-radius: 2px; background: transparent;
}
.cot-nam:hover::after { background: var(--color-hv); }
</style>
