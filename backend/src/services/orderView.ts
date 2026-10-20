// Chuyển bản ghi orders (đã join routing + nhóm ưu tiên) thành "OrderView" — đúng
// shape frontend dùng (khớp src/types.ts). HÀM THUẦN để test trọn vẹn; route chỉ
// truy vấn DB rồi gọi hàm này. Giờ hẹn hiển thị dạng "HH:mm" theo giờ Việt Nam.

import { canTiemThuoc } from '../uoctinh/lamSang'

export type TrangThai = 'cho' | 'dang_goi' | 'qua_luot' | 'hoan_thanh' | 'huy'

export interface NhanUuTien {
  ma: string
  ten: string
  kieu: 'uu_tien' | 'gio_sua_tay' | 'qua_luot'
  viet_tat?: string | null   // mã viết tắt hiện trên chip (trống → FE tự rút gọn từ ten)
  mau?: string | null        // khóa bảng màu: do/cam/vang/xanh/tim/luc
}

export interface OrderView {
  id: number
  stt: number
  ho_ten: string
  tuoi: number | null
  chi_dinh: string
  room_id: number | null
  status: TrangThai
  queue_pos: number
  gio_hen: string | null
  gio_hen_goc?: string | null      // giờ hẹn ban đầu "HH:mm" (để đối chiếu/tooltip)
  cham_phut?: number | null        // số phút chậm so với lịch gốc (null = chưa xác định)
  gio_hen_thu_cong: boolean
  nhan: NhanUuTien | null
  ghi_chu?: string
  ma_bs?: string
  ten_bs?: string      // tên bác sĩ chỉ định (HIS kéo chỉ trả tên, không có mã)
  doi_gio?: boolean
  chua_xep?: boolean   // mã HH chưa cấu hình → không xếp được phòng/số, cần Admin bổ sung
  giu_hang?: boolean   // ca hàng GIỮ (nội trú): chờ KTV đưa vào hàng thời gian, không tự hẹn giờ
  ma_hh?: string
  nguon?: 'his' | 'thu_cong' | 'dat_truoc'   // 'thu_cong' = nhập tay; 'dat_truoc' = phiếu đặt lịch hẹn trước
  // Gợi ý ghép phiếu đặt trước ↔ ca HIS (route gắn; xem [[ghepDatTruoc]]). Chip cho KTV xác nhận.
  ghep?: { doi_id: number; vai: 'dat_truoc' | 'his'; do_tin: 'ma_bn' | 'sdt' | 'ten' }
  thoi_luong_phut?: number | null  // thời lượng dự kiến (ca này)
  can_tiem?: boolean               // loại chụp có tiêm thuốc tương phản (nhắc lâm sàng)
  // ── Thông tin HIS đầy đủ (màn điều phối hiển thị cột chính / panel chi tiết) ──
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

// Dữ liệu tối thiểu từ DB (đã join). gio_hen/updated_at có thể là Date (pg) hoặc chuỗi ISO.
export interface OrderRowLike {
  id: number
  stt_ngay?: number | null   // STT tiếp nhận theo phòng/ngày; chưa xếp phòng → null
  ho_ten: string
  tuoi: number | null
  ma_hh: string | null
  ten_dich_vu: string | null
  hh_mo_ta: string | null
  room_id: number | null
  giu_hang?: boolean
  status: TrangThai
  queue_pos: number | null
  gio_hen?: Date | string | null
  gio_hen_goc?: Date | string | null
  cham_phut_khi_goi?: number | null
  gio_hen_thu_cong: boolean
  pt_ma: string | null
  pt_ten: string | null
  pt_viet_tat?: string | null
  pt_mau?: string | null
  ma_bs: string | null
  ten_bs_chi_dinh?: string | null
  ma_bn?: string | null
  sdt?: string | null
  gio_chi_dinh?: Date | string | null
  his_meta?: Record<string, unknown> | null
  nguon?: string | null
  thoi_luong_phut?: number | null
  updated_at: Date | string | null
}

const TZ = 'Asia/Ho_Chi_Minh'
const DINH_DANG_GIO = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ,
})

// Định dạng thời điểm → "HH:mm" (giờ VN). null/không hợp lệ → null.
export function gioHM(v: Date | string | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return null
  const d = v instanceof Date ? v : new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return DINH_DANG_GIO.format(d)
}

// Chuyển Date|string|null → mốc ms, hoặc null nếu không hợp lệ.
function moc(v: Date | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}

// Số phút chậm so với lịch GỐC. Ca đã rời hàng chờ (đang gọi/quá lượt/đã chụp) dùng
// snapshot chốt lúc gọi (cham_phut_khi_goi). Ca còn chờ tính SỐNG: giờ hẹn hiện tại −
// giờ hẹn gốc (kẹp sàn 0). Thiếu mốc → null (FE hiện "—").
function chamPhut(row: OrderRowLike): number | null {
  const daRoi = row.status === 'dang_goi' || row.status === 'qua_luot' || row.status === 'hoan_thanh'
  if (daRoi && row.cham_phut_khi_goi != null) return row.cham_phut_khi_goi
  const hen = moc(row.gio_hen), goc = moc(row.gio_hen_goc)
  if (hen != null && goc != null) return Math.max(0, Math.round((hen - goc) / 60_000))
  return null
}

function nhanCho(row: OrderRowLike): NhanUuTien | null {
  if (row.pt_ma && row.pt_ten) {
    return { ma: row.pt_ma, ten: row.pt_ten, kieu: 'uu_tien', viet_tat: row.pt_viet_tat ?? null, mau: row.pt_mau ?? null }
  }
  if (row.gio_hen_thu_cong) return { ma: 'gio_sua_tay', ten: 'Giờ sửa tay', kieu: 'gio_sua_tay' }
  return null
}

// gioHenStr: giờ hẹn hiển thị đã tính sẵn ở route (ước tính cho ca 'cho', hoặc giờ
// sửa tay). Truyền null nếu không áp dụng.
export function taoOrderView(row: OrderRowLike, gioHenStr: string | null): OrderView {
  const chi_dinh = row.ten_dich_vu || row.hh_mo_ta || row.ma_hh || '—'
  const v: OrderView = {
    id: row.id,
    stt: row.stt_ngay ?? 0,   // số tiếp nhận theo phòng/ngày; chưa xếp phòng (0) → FE hiện "—"
    ho_ten: row.ho_ten,
    tuoi: row.tuoi,
    chi_dinh,
    room_id: row.room_id,
    status: row.status,
    queue_pos: row.queue_pos ?? 0,
    gio_hen: gioHenStr,
    gio_hen_thu_cong: row.gio_hen_thu_cong,
    nhan: nhanCho(row),
  }
  const cp = chamPhut(row)
  if (cp != null) v.cham_phut = cp
  const goc = gioHM(row.gio_hen_goc)
  if (goc) v.gio_hen_goc = goc
  if (row.status === 'qua_luot') {
    const luc = gioHM(row.updated_at)
    v.ghi_chu = luc ? `Quá lượt ${luc}` : 'Quá lượt'
  }
  if (row.ma_bs) v.ma_bs = row.ma_bs
  if (row.ten_bs_chi_dinh) v.ten_bs = row.ten_bs_chi_dinh
  if (row.room_id === null) v.chua_xep = true
  if (row.giu_hang) v.giu_hang = true
  if (row.ma_hh) v.ma_hh = row.ma_hh
  if (row.nguon === 'thu_cong' || row.nguon === 'dat_truoc') v.nguon = row.nguon
  if (row.thoi_luong_phut != null) v.thoi_luong_phut = row.thoi_luong_phut
  // Nhắc lâm sàng: loại chụp có tiêm thuốc tương phản (suy từ mô tả danh mục).
  if (canTiemThuoc(row.hh_mo_ta)) v.can_tiem = true
  // ── Thông tin HIS đầy đủ ────────────────────────────────────────────────────
  if (row.ma_bn) v.ma_bn = row.ma_bn
  if (row.sdt) v.sdt = row.sdt
  const gcd = gioHM(row.gio_chi_dinh)
  if (gcd) v.gio_chi_dinh = gcd
  const m = row.his_meta ?? null
  if (m && typeof m === 'object') {
    const g = (k: string): string | undefined => {
      const x = (m as Record<string, unknown>)[k]
      return typeof x === 'string' && x.trim() ? x.trim() : undefined
    }
    const gioiTinh = g('gioi_tinh'); if (gioiTinh) v.gioi_tinh = gioiTinh
    const doiTuong = g('doi_tuong'); if (doiTuong) v.doi_tuong = doiTuong
    const khoa = g('khoa_chi_dinh'); if (khoa) v.khoa_chi_dinh = khoa
    const phong = g('phong_chi_dinh'); if (phong) v.phong_chi_dinh = phong
    const loai = g('loai_dieu_tri'); if (loai) v.loai_dieu_tri = loai
    const ghiChu = g('ghi_chu'); if (ghiChu) v.ghi_chu_his = ghiChu
  }
  return v
}
