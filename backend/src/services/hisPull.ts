// Lấy chỉ định MRI từ HIS theo mô hình KÉO (pull): GET /api/CanLamSang/mri?tuNgay=&denNgay=
// (host apihrm). App tự gọi theo chu kỳ ([[hisPoller]]) + nút "Làm mới" thủ công.
//
// Hàm chuẩn hóa là HÀM THUẦN (có unit test). Quy ước đã chốt với IT (2026-10-13):
//  - TrangThai (int): 1=Chờ thực hiện → VÀO hàng đợi; 2=Chờ duyệt KQ, 3=Chờ trả KQ,
//    4=Đã làm → đều ĐÃ CHỤP XONG → đóng ca. Không có trạng thái "Hủy".
//  - makcb KHÔNG duy nhất (1 BN có thể nhiều MRI cùng makcb) → khóa chống trùng ghép
//    ma_his = makcb + '-' + mahh.
//  - Bác sĩ chỉ định: HIS chỉ trả TÊN (NguoiChiDinh), không có mã NV → lưu tên hiển thị.

import { layTokenDichVu, xoaTokenDichVu } from './hrmApi'
import { chiTietLoi, type ChiTietLoiChung } from '../repos/auditRepo'

export interface ChiDinhMRI {
  ma_his: string
  ma_bn: string | null
  ho_ten: string
  tuoi: number | null
  ngay_sinh: string | null    // ngaysinh (ISO) — giữ bản gốc để hiển thị
  gioi_tinh: string | null    // gioitinh
  sdt: string | null
  doi_tuong: string | null    // doituong (Tự nguyện / BHYT…)
  ma_hh: string | null
  ten_dich_vu: string | null
  ten_bs: string | null       // NguoiChiDinh — tên bác sĩ chỉ định (hiển thị)
  khoa_chi_dinh: string | null   // KhoaChiDinh
  phong_chi_dinh: string | null  // PhongChiDinh
  loai_dieu_tri: string | null   // LoaiDieuTri (Ngoại trú / Nội trú)
  ghi_chu: string | null         // Ghichu (ghi chú lâm sàng)
  gio_chi_dinh: string | null // NgayChiDinh (ISO)
  trang_thai: number | null   // TrangThai (int)
}

export const TRANG_THAI_CHO = 1                    // Chờ thực hiện → vào hàng đợi
export const TRANG_THAI_DA_XONG = new Set([2, 3, 4]) // đã chụp xong → đóng ca

const TIMEOUT_MS = 15000

// Chi tiết lỗi khi gọi HIS — để ghi Nhật ký phục vụ hồi cứu. KHÔNG chứa trường `data`
// (danh sách bệnh nhân): chỉ giữ các trường chẩn đoán của HIS + ngữ cảnh request.
export interface ChiTietLoiHIS {
  nguon?: 'poller' | 'lam_moi_thu_cong'  // điền ở lớp gọi
  // 'http' = HIS có phản hồi nhưng báo lỗi; 'timeout' = quá TIMEOUT_MS chưa phản hồi;
  // 'mang' = không kết nối được (DNS, từ chối kết nối, TLS…).
  loai_loi?: 'http' | 'timeout' | 'mang'
  url: string
  tuNgay: string           // khoảng ngày đang kéo (đã giải mã) — để IT dò log HIS
  denNgay: string
  http_status: number | null    // null khi không nhận được phản hồi (timeout/mạng)
  timeout_ms?: number
  loi_goc?: ChiTietLoiChung     // lỗi gốc của fetch (tên, mã, nguyên nhân) khi timeout/mạng
  his_success?: boolean | null
  his_statusCode?: number | null
  his_message?: string | null
  his_errors?: unknown         // nguyên trường `errors` của HIS (đã cắt độ dài)
  his_timeStamp?: string | null // trường timeStamp do chính server HIS sinh (đối chiếu log)
  thoi_luong_ms?: number        // thời lượng request tới khi nhận phản hồi
  headers?: Record<string, string> // vài header phản hồi hữu ích (trace/correlation id…)
}

// Lỗi gọi HIS mang theo chi tiết chẩn đoán (status, errors, url) để ghi Nhật ký.
export class LoiHIS extends Error {
  constructor(message: string, public chi_tiet: ChiTietLoiHIS) {
    super(message)
    this.name = 'LoiHIS'
  }
}

// Cắt gọn giá trị bất kỳ về chuỗi ≤ gioiHan ký tự — tránh phình Nhật ký khi HIS trả
// errors dài (stack trace…). Giữ nguyên kiểu nếu là chuỗi/số/mảng ngắn.
function catGon(v: unknown, gioiHan = 2000): unknown {
  if (v === null || v === undefined) return null
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  if (s === undefined) return null
  return s.length <= gioiHan ? v : `${s.slice(0, gioiHan)}… (đã cắt ${s.length - gioiHan} ký tự)`
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function soInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isInteger(n) ? n : null
}

// Tính tuổi (năm tròn) từ ngày sinh. Mốc mặc định = hiện tại. null nếu không đọc được.
export function tinhTuoi(ngaysinh: string | null, moc: Date = new Date()): number | null {
  if (!ngaysinh) return null
  const d = new Date(ngaysinh)
  if (Number.isNaN(d.getTime())) return null
  let tuoi = moc.getFullYear() - d.getFullYear()
  const m = moc.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && moc.getDate() < d.getDate())) tuoi--
  return tuoi >= 0 && tuoi <= 150 ? tuoi : null
}

// Chuẩn hóa 1 bản ghi HIS → ChiDinhMRI. Bắt buộc có makcb, hoten, mahh (để ghép khóa
// và định tuyến phòng). Trả null nếu thiếu → poller bỏ qua và đếm.
export function chuanHoaChiDinh(raw: any, moc: Date = new Date()): ChiDinhMRI | null {
  const makcb = str(raw?.makcb)
  const ho_ten = str(raw?.hoten)
  const ma_hh = raw?.mahh === null || raw?.mahh === undefined || raw?.mahh === ''
    ? null : String(raw.mahh).trim()
  if (!makcb || !ho_ten || !ma_hh) return null
  return {
    ma_his: `${makcb}-${ma_hh}`,
    ma_bn: str(raw?.mabn),
    ho_ten,
    tuoi: tinhTuoi(str(raw?.ngaysinh), moc),
    ngay_sinh: str(raw?.ngaysinh),
    gioi_tinh: str(raw?.gioitinh),
    sdt: str(raw?.dienthoai),
    doi_tuong: str(raw?.doituong),
    ma_hh,
    ten_dich_vu: str(raw?.Tendichvu),
    ten_bs: str(raw?.NguoiChiDinh),
    khoa_chi_dinh: str(raw?.KhoaChiDinh),
    phong_chi_dinh: str(raw?.PhongChiDinh),
    loai_dieu_tri: str(raw?.LoaiDieuTri),
    ghi_chu: str(raw?.Ghichu),
    gio_chi_dinh: str(raw?.NgayChiDinh),
    trang_thai: soInt(raw?.TrangThai),
  }
}

export interface PhanLoai {
  vao_hang: ChiDinhMRI[]   // TrangThai = 1 → đưa vào hàng đợi
  da_xong: ChiDinhMRI[]    // TrangThai ∈ {2,3,4} → đóng ca nếu đang có
  bo_qua: number           // bản ghi thiếu trường bắt buộc / trạng thái lạ
}

// Phân loại danh sách thô theo TrangThai. HÀM THUẦN.
export function phanLoai(ds: any[], moc: Date = new Date()): PhanLoai {
  const vao_hang: ChiDinhMRI[] = []
  const da_xong: ChiDinhMRI[] = []
  let bo_qua = 0
  for (const raw of ds) {
    const c = chuanHoaChiDinh(raw, moc)
    if (!c) { bo_qua++; continue }
    if (c.trang_thai === TRANG_THAI_CHO) vao_hang.push(c)
    else if (c.trang_thai !== null && TRANG_THAI_DA_XONG.has(c.trang_thai)) da_xong.push(c)
    else bo_qua++   // trạng thái null hoặc ngoài {1,2,3,4} → không xử lý
  }
  return { vao_hang, da_xong, bo_qua }
}

// Tập ma_his CÒN HIỆU LỰC trong lần kéo: mọi ca HIS vừa trả (đang chờ + đã xong) —
// tức mọi ca HIS còn "biết tới". Ca KHÔNG thuộc tập này mà đang trong hàng đợi của ta
// nghĩa là đã bị hủy trên HIS (biến mất). Dùng cho đối soát hủy ([[orderRepo]]).
// HÀM THUẦN. (Bỏ bo_qua: bản ghi thiếu trường → không có ma_his tin cậy để so.)
export function maHisHieuLuc(phan: PhanLoai): string[] {
  return [...phan.vao_hang, ...phan.da_xong].map((c) => c.ma_his)
}

// ── Gọi API ───────────────────────────────────────────────────────────────────
// Gốc endpoint: HIS_PULL_URL, mặc định lấy origin của HIS_AUTH_URL + đường chuẩn.
function gocPull(): string | null {
  if (process.env.HIS_PULL_URL) return process.env.HIS_PULL_URL.replace(/\/+$/, '')
  try { return `${new URL(process.env.HIS_AUTH_URL ?? '').origin}/api/CanLamSang/mri` }
  catch { return null }
}

// Khoảng ngày hôm nay theo giờ Việt Nam → chuỗi 'YYYY-MM-DD HH:mm:ss' (định dạng HIS nhận).
export function khoangNgayHomNay(moc: Date = new Date()): { tuNgay: string; denNgay: string } {
  const ngay = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
  }).format(moc) // 'YYYY-MM-DD'
  return { tuNgay: `${ngay} 00:00:00`, denNgay: `${ngay} 23:59:59` }
}

// Header phản hồi đáng giữ để chẩn đoán: mã truy vết (trace/correlation/request id),
// thời điểm & danh tính server. Giúp IT tra đúng dòng log phía HIS.
const HEADER_HUU_ICH = /(^|-)(request|correlation|trace|trace-?id|x-amzn-trace|span|operation)(-|$)|^(date|server|x-powered-by)$/i
function locHeader(h: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  h.forEach((v, k) => { if (HEADER_HUU_ICH.test(k)) out[k] = v.length > 300 ? `${v.slice(0, 300)}…` : v })
  return out
}

async function goiMot(url: string, token: string | null, khoang: { tuNgay: string; denNgay: string }): Promise<{
  status: number; body: any; headers: Record<string, string>; thoi_luong_ms: number
}> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const batDau = Date.now()
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: ctrl.signal,
    })
    const body = await res.json().catch(() => null)
    return { status: res.status, body, headers: locHeader(res.headers), thoi_luong_ms: Date.now() - batDau }
  } catch (err: any) {
    // Không nhận được phản hồi: timeout (abort) hoặc lỗi mạng → bọc thành LoiHIS để
    // Nhật ký có đủ ngữ cảnh (url, khoảng ngày, thời lượng, lỗi gốc) mà hồi cứu.
    const timeout = ctrl.signal.aborted
    const thoi_luong_ms = Date.now() - batDau
    throw new LoiHIS(
      timeout
        ? `HIS không phản hồi sau ${Math.round(TIMEOUT_MS / 1000)} giây (timeout).`
        : `Không kết nối được HIS: ${err?.cause?.code ?? err?.cause?.message ?? err?.message ?? 'lỗi mạng'}`,
      {
        loai_loi: timeout ? 'timeout' : 'mang',
        url, ...khoang,
        http_status: null,
        thoi_luong_ms,
        timeout_ms: TIMEOUT_MS,
        loi_goc: chiTietLoi(err),
      },
    )
  } finally {
    clearTimeout(timer)
  }
}

// Lấy danh sách chỉ định MRI thô trong khoảng ngày. Gửi Bearer nếu có tài khoản dịch
// vụ (endpoint có thể không yêu cầu); 401 → làm mới token, thử lại một lần.
export async function layChiDinhMRI(tuNgay: string, denNgay: string): Promise<any[]> {
  const goc = gocPull()
  if (!goc) throw new Error('Chưa cấu hình HIS_PULL_URL / HIS_AUTH_URL trên server.')
  const url = `${goc}?tuNgay=${encodeURIComponent(tuNgay)}&denNgay=${encodeURIComponent(denNgay)}`

  let token = await layTokenDichVu().catch(() => null)
  let { status, body, headers, thoi_luong_ms } = await goiMot(url, token, { tuNgay, denNgay })
  if (status === 401 && token) {
    xoaTokenDichVu()
    token = await layTokenDichVu().catch(() => null)
    ;({ status, body, headers, thoi_luong_ms } = await goiMot(url, token, { tuNgay, denNgay }))
  }
  if (status >= 400 || body?.success === false) {
    const mo_ta = body?.message ? `HIS báo lỗi: ${body.message}` : `HIS trả HTTP ${status}.`
    throw new LoiHIS(mo_ta, {
      loai_loi: 'http',
      url,
      tuNgay,
      denNgay,
      http_status: status,
      his_success: typeof body?.success === 'boolean' ? body.success : null,
      his_statusCode: typeof body?.statusCode === 'number' ? body.statusCode : null,
      his_message: typeof body?.message === 'string' ? body.message : null,
      his_errors: catGon(body?.errors),
      his_timeStamp: typeof body?.timeStamp === 'string' ? body.timeStamp : null,
      thoi_luong_ms,
      headers: headers && Object.keys(headers).length ? headers : undefined,
    })
  }
  return Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : []
}
