// Kiểu dữ liệu miền — khớp mô hình §5 bản thiết kế (dùng chung FE).

export type TrangThai = 'cho' | 'dang_goi' | 'qua_luot' | 'hoan_thanh' | 'huy'

export interface NhanUuTien {
  ma: string
  ten: string
  kieu: 'uu_tien' | 'gio_sua_tay' | 'qua_luot'
  viet_tat?: string | null   // mã viết tắt hiện trên chip (trống → tự rút gọn từ ten)
  mau?: string | null        // khóa bảng màu MAU_NHAN: do/cam/vang/xanh/tim/luc
}

export interface Order {
  id: number
  stt: number            // số thứ tự hiển thị
  ho_ten: string
  tuoi: number | null
  chi_dinh: string       // mô tả loại chụp (hiển thị)
  room_id: number | null  // null = mã HH chưa cấu hình, chưa xếp được phòng/số
  status: TrangThai
  queue_pos: number
  gio_hen: string | null // "HH:mm"
  gio_hen_goc?: string | null // giờ hẹn ban đầu "HH:mm" (đối chiếu độ chậm)
  cham_phut?: number | null   // số phút chậm so với lịch gốc (null/undefined = chưa xác định)
  gio_hen_thu_cong: boolean
  nhan?: NhanUuTien | null
  ghi_chu?: string       // vd "vắng 08:30" cho ca quá lượt
  ma_bs?: string         // bác sĩ chỉ định (lọc "ca của tôi")
  ten_bs?: string        // tên bác sĩ chỉ định (HIS kéo chỉ trả tên, không có mã)
  doi_gio?: boolean      // giờ hẹn vừa bị dời/chen → báo bác sĩ biết
  chua_xep?: boolean     // HIS gửi mã HH chưa có trong cấu hình → cần Admin bổ sung
  giu_hang?: boolean     // ca hàng GIỮ (nội trú): chờ KTV đưa vào hàng thời gian, không tự hẹn giờ
  ma_hh?: string
  nguon?: 'his' | 'thu_cong' | 'dat_truoc'  // 'thu_cong' = nhập tay; 'dat_truoc' = phiếu đặt lịch hẹn trước
  // Gợi ý ghép phiếu đặt trước ↔ ca HIS (KTV xác nhận). vai = vai của chính dòng này.
  ghep?: { doi_id: number; vai: 'dat_truoc' | 'his'; do_tin: 'ma_bn' | 'sdt' | 'ten' }
  thoi_luong_phut?: number | null  // thời lượng dự kiến (ca này)
  can_tiem?: boolean               // loại chụp có tiêm thuốc tương phản (nhắc lâm sàng)
  // ── Thông tin HIS đầy đủ (hiển thị cột chính / panel chi tiết) ──
  ma_bn?: string
  gioi_tinh?: string
  sdt?: string
  doi_tuong?: string               // Tự nguyện / BHYT…
  khoa_chi_dinh?: string
  phong_chi_dinh?: string
  loai_dieu_tri?: string           // Ngoại trú / Nội trú
  ghi_chu_his?: string             // ghi chú lâm sàng từ HIS
  gio_chi_dinh?: string            // giờ bác sĩ chỉ định (HH:mm)
}

// Danh mục cột có thể đưa ra "cột chính" ở màn điều phối. key khớp field của Order
// (trừ 'trang_thai'/'nhan' là ô đặc biệt). Admin chọn cột nào ra chính; còn lại luôn
// xem được trong panel chi tiết. STT + thao tác luôn hiển thị, không cấu hình.
export interface CotDieuPhoi { key: string; nhan: string; width: string }
export const COT_DIEU_PHOI: CotDieuPhoi[] = [
  { key: 'ho_ten', nhan: 'Họ tên', width: 'minmax(110px,1.7fr)' },
  { key: 'tuoi', nhan: 'Tuổi', width: '48px' },
  { key: 'gioi_tinh', nhan: 'Giới', width: '52px' },
  { key: 'chi_dinh', nhan: 'Chỉ định', width: 'minmax(140px,1.4fr)' },
  { key: 'ten_bs', nhan: 'BS chỉ định', width: 'minmax(110px,1.1fr)' },
  { key: 'khoa_chi_dinh', nhan: 'Khoa CĐ', width: 'minmax(100px,1fr)' },
  { key: 'phong_chi_dinh', nhan: 'Phòng CĐ', width: 'minmax(110px,1.1fr)' },
  { key: 'loai_dieu_tri', nhan: 'Điều trị', width: '84px' },
  { key: 'doi_tuong', nhan: 'Đối tượng', width: '96px' },
  { key: 'sdt', nhan: 'SĐT', width: '104px' },
  { key: 'ma_bn', nhan: 'Mã BN', width: '92px' },
  { key: 'gio_chi_dinh', nhan: 'Giờ CĐ', width: '72px' },
  { key: 'ma_hh', nhan: 'Mã HH', width: '68px' },
  { key: 'gio_hen', nhan: 'Giờ hẹn', width: '86px' },
  { key: 'cham_phut', nhan: 'Lệch hẹn', width: '84px' },
  { key: 'trang_thai', nhan: 'Trạng thái', width: '116px' },
]
export const COT_CHINH_MAC_DINH = ['ho_ten', 'tuoi', 'chi_dinh', 'gio_hen', 'cham_phut', 'trang_thai']

// ── Bảng màu nhãn ưu tiên ────────────────────────────────────────────────────
// Nhãn ưu tiên giờ hiện bằng CHIP viết tắt cạnh tên + tô màu dòng (thay cột "Nhãn"
// cũ tốn chỗ). mau là khóa cố định; mỗi khóa gắn sẵn lớp Tailwind TĨNH (phải viết
// nguyên chuỗi để JIT giữ lại — không ghép động). chip=nền chip, ten=màu chữ tên,
// row=nền dòng nhạt, bar=vạch màu trái.
export interface KieuMauNhan { chip: string; ten: string; row: string; bar: string; cham: string }
export const MAU_NHAN: Record<string, KieuMauNhan> = {
  do:   { chip: 'bg-rose-600 text-white',    ten: 'text-rose-700',    row: 'bg-rose-50',    bar: 'shadow-[inset_3px_0_0_#e11d48]', cham: 'bg-rose-600' },
  cam:  { chip: 'bg-orange-600 text-white',  ten: 'text-orange-700',  row: 'bg-orange-50',  bar: 'shadow-[inset_3px_0_0_#ea580c]', cham: 'bg-orange-600' },
  vang: { chip: 'bg-amber-500 text-white',   ten: 'text-amber-700',   row: 'bg-amber-50',   bar: 'shadow-[inset_3px_0_0_#f59e0b]', cham: 'bg-amber-500' },
  xanh: { chip: 'bg-hv text-white',          ten: 'text-hv',          row: 'bg-hv-soft',    bar: 'shadow-[inset_3px_0_0_var(--color-hv)]', cham: 'bg-hv' },
  tim:  { chip: 'bg-violet-600 text-white',  ten: 'text-violet-700',  row: 'bg-violet-50',  bar: 'shadow-[inset_3px_0_0_#7c3aed]', cham: 'bg-violet-600' },
  luc:  { chip: 'bg-emerald-600 text-white', ten: 'text-emerald-700', row: 'bg-emerald-50', bar: 'shadow-[inset_3px_0_0_#059669]', cham: 'bg-emerald-600' },
}
export const MAU_NHAN_CHON: { key: string; nhan: string }[] = [
  { key: 'do', nhan: 'Đỏ (cấp cứu)' }, { key: 'cam', nhan: 'Cam' }, { key: 'vang', nhan: 'Vàng' },
  { key: 'xanh', nhan: 'Xanh' }, { key: 'tim', nhan: 'Tím' }, { key: 'luc', nhan: 'Lục' },
]
const MAU_MAC_DINH: KieuMauNhan = MAU_NHAN.xanh
export function kieuMau(key?: string | null): KieuMauNhan { return (key && MAU_NHAN[key]) || MAU_MAC_DINH }

// Chữ trên chip: ưu tiên viet_tat admin đặt; nếu trống thì rút gọn từ tên (chữ cái
// đầu mỗi từ có nghĩa, bỏ dấu, ≤3 ký tự). VD "Cấp cứu" → "CC", "Hồi sức tích cực" → "HST".
export function chipNhan(n?: { ten: string; viet_tat?: string | null } | null): string {
  if (!n || !n.ten) return ''
  const v = (n.viet_tat ?? '').trim()
  if (v) return v
  const tu = n.ten
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
    .split(/[\s/]+/).filter((t) => t && !/^[0-9≥<>+]+t?$/i.test(t))
  const chu = tu.map((t) => t[0]).join('').toUpperCase().slice(0, 3)
  return chu || n.ten.slice(0, 2).toUpperCase()
}

// ── Bộ luật nhóm ưu tiên (builder) ───────────────────────────────────────────
// Khớp whitelist field ở backend ([[adapter]] FIELD_KIND). Quy tắc lưu dưới dạng
// biểu thức DSL "field op value" nối bằng " && "; form dropdown dựng/đọc chuỗi này.
export interface FieldUuTien { key: string; nhan: string; kieu: 'so' | 'chuoi' }
export const FIELD_UU_TIEN: FieldUuTien[] = [
  { key: 'tuoi', nhan: 'Tuổi', kieu: 'so' },
  { key: 'phong', nhan: 'Phòng chỉ định', kieu: 'chuoi' },
  { key: 'khoa', nhan: 'Khoa chỉ định', kieu: 'chuoi' },
  { key: 'doi_tuong', nhan: 'Đối tượng', kieu: 'chuoi' },
  { key: 'loai_dieu_tri', nhan: 'Loại điều trị', kieu: 'chuoi' },
  { key: 'gioi_tinh', nhan: 'Giới tính', kieu: 'chuoi' },
  { key: 'dich_vu', nhan: 'Tên dịch vụ', kieu: 'chuoi' },
  { key: 'ghi_chu', nhan: 'Ghi chú lâm sàng', kieu: 'chuoi' },
]
export const TOAN_TU_SO = [
  { op: '>=', nhan: '≥' }, { op: '<=', nhan: '≤' }, { op: '>', nhan: '>' },
  { op: '<', nhan: '<' }, { op: '==', nhan: '=' }, { op: '!=', nhan: '≠' },
] as const
export const TOAN_TU_CHUOI = [
  { op: '~', nhan: 'chứa' }, { op: '!~', nhan: 'không chứa' },
  { op: '==', nhan: 'bằng đúng' }, { op: '!=', nhan: 'khác' },
  { op: 'in', nhan: 'thuộc danh sách' },
] as const

export interface MenhDeUuTien { field: string; op: string; value: string }

export function kieuField(key: string): 'so' | 'chuoi' {
  return FIELD_UU_TIEN.find((f) => f.key === key)?.kieu ?? 'chuoi'
}

// Một mệnh đề → chuỗi DSL. 'in' tách value theo dấu phẩy thành ["a","b",...].
export function menhDeThanhChuoi(m: MenhDeUuTien): string {
  if (kieuField(m.field) === 'so') return `${m.field} ${m.op} ${m.value.trim()}`
  if (m.op === 'in') {
    const items = m.value.split(',').map((s) => s.trim()).filter(Boolean)
    return `${m.field} in [${items.map((s) => `"${s}"`).join(', ')}]`
  }
  return `${m.field} ${m.op} "${m.value.trim()}"`
}

export function dungLuat(ds: MenhDeUuTien[]): string {
  return ds.filter((m) => m.field && m.value.trim()).map(menhDeThanhChuoi).join(' && ')
}

const RE_SO    = /^(\w+)\s*(>=|<=|==|!=|>|<)\s*(-?\d+)$/
const RE_IN    = /^(\w+)\s+in\s+\[(.*)\]$/i
const RE_CHUOI = /^(\w+)\s*(==|!=|~|!~)\s*"([^"]*)"$/

// Đọc biểu thức DSL → danh sách mệnh đề cho form. Mệnh đề lạ bị bỏ qua.
export function docLuat(bieuThuc: string | null): MenhDeUuTien[] {
  if (!bieuThuc || !bieuThuc.trim()) return []
  const ra: MenhDeUuTien[] = []
  for (const phan of bieuThuc.split('&&').map((s) => s.trim()).filter(Boolean)) {
    let m = RE_SO.exec(phan)
    if (m) { ra.push({ field: m[1], op: m[2], value: m[3] }); continue }
    m = RE_IN.exec(phan)
    if (m) {
      const items = [...m[2].matchAll(/"([^"]*)"/g)].map((x) => x[1])
      ra.push({ field: m[1], op: 'in', value: items.join(', ') }); continue
    }
    m = RE_CHUOI.exec(phan)
    if (m) ra.push({ field: m[1], op: m[2], value: m[3] })
  }
  return ra
}

// Dự báo "nếu chỉ định ngay vào phòng" — hiển thị cho bác sĩ (số ca trước + khoảng giờ).
export interface DuBaoPhong {
  room_id: number
  so_ca_truoc: number
  so_dem_vip: number
  phut_cho: number
  bat_dau: string   // ISO
  eta_som: string   // ISO
  eta_muon: string  // ISO
  som_nhat: boolean
}

// Kíp KTV trực hôm nay (hiển thị tên + SĐT cho bác sĩ).
export interface KipTruc {
  id: number
  ho_ten: string
  sdt: string | null
}

export interface Room {
  id: number
  ma_phong: string
  ten: string
  lien_he?: string | null
  active?: boolean
}

// ── Người dùng & phiên ────────────────────────────────────────────────────────
export type VaiTro = 'ktv' | 'bac_si' | 'admin'

export interface NguoiDung {
  id: number
  ho_ten: string
  role: VaiTro
  ma_bs: string | null
  ma_nv: string | null
}

export type HanhDong = 'goi' | 'hoan_thanh' | 'qua_luot' | 'goi_lai' | 'huy'
