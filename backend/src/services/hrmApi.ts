// Đọc danh mục từ hệ nhân sự bệnh viện (apihrm / My HungVuong) để admin tạo tài
// khoản hàng loạt: danh sách khoa (GET /api/Khoa) và nhân viên (GET /api/NhanVien).
// Các API này cần Bearer token → đăng nhập POST /api/v2/Auth/login trước.
//
// Nguồn tài khoản gọi API: (1) admin nhập mã NV + mật khẩu My HungVuong ngay trên
// trang quản trị (token giữ trong bộ nhớ theo phiên admin, không ghi DB), hoặc
// (2) tài khoản dịch vụ trong .env (HRM_API_MANV / HRM_API_MAT_KHAU).
// Chỉ trả về vài trường cần thiết — NhanVienDTO có nhiều dữ liệu cá nhân/nhạy cảm.

import { chuanHoaMaNV, docKetQuaHIS } from './hisAuth'

const TIMEOUT_MS = 15000
const PAGE_SIZE = 200
const TOI_DA_TRANG = 30

export interface KhoaHRM { makhoa: string; tenkhoa: string }
export interface NhanVienHRM {
  ma_nv: string; ho_ten: string; makhoa: string | null; tenkhoa: string | null; chuc_danh: string | null
}

export class LoiHRM extends Error {
  constructor(public ly_do: 'sai_thong_tin' | 'khong_ket_noi' | 'chua_cau_hinh', message: string) { super(message) }
}

// Gốc API: HRM_API_BASE, mặc định lấy origin của HIS_AUTH_URL.
function gocApi(): string | null {
  if (process.env.HRM_API_BASE) return process.env.HRM_API_BASE.replace(/\/+$/, '')
  try { return new URL(process.env.HIS_AUTH_URL ?? '').origin } catch { return null }
}

export const coTaiKhoanDichVu = () => !!(process.env.HRM_API_MANV && process.env.HRM_API_MAT_KHAU)

async function goi(url: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    return { status: res.status, body: await res.json().catch(() => null) }
  } catch (err: any) {
    console.error('[hrm-api] không gọi được:', err.message, err.cause?.code ?? '')
    throw new LoiHRM('khong_ket_noi', 'Không kết nối được hệ nhân sự bệnh viện. Vui lòng thử lại.')
  } finally {
    clearTimeout(timer)
  }
}

// v2 trả data là object {accessToken, expiresAt}; v1 trả mảng token — chịu cả hai.
export function docToken(body: any): { token: string; het_han: number } | null {
  const d = Array.isArray(body?.data) ? body.data[0] : body?.data
  const token = typeof d?.accessToken === 'string' ? d.accessToken : null
  if (!token) return null
  const t = d?.expiresAt ? Date.parse(d.expiresAt) : NaN
  // Không đọc được hạn → coi như 30 phút. Trừ 1 phút dự phòng.
  return { token, het_han: (Number.isFinite(t) ? t : Date.now() + 30 * 60_000) - 60_000 }
}

export async function dangNhapHRM(maNV: string, matKhau: string): Promise<{ token: string; het_han: number }> {
  const url = process.env.HIS_AUTH_URL
  if (!url) throw new LoiHRM('chua_cau_hinh', 'Chưa cấu hình HIS_AUTH_URL trên server.')
  const { status, body } = await goi(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ manv: chuanHoaMaNV(maNV.trim()), passwordHash: matKhau }),
  })
  const kq = docKetQuaHIS(status, body)
  if (!kq.ok) {
    if (kq.ly_do === 'khong_ket_noi') throw new LoiHRM('khong_ket_noi', 'Hệ nhân sự bệnh viện không phản hồi. Vui lòng thử lại.')
    throw new LoiHRM('sai_thong_tin', kq.thong_bao ?? 'Mã nhân viên hoặc mật khẩu My HungVuong không đúng.')
  }
  const tk = docToken(body)
  if (!tk) throw new LoiHRM('khong_ket_noi', 'Hệ nhân sự không trả token truy cập.')
  return tk
}

// Token theo phiên admin (uid) — chỉ trong bộ nhớ tiến trình. 'dich_vu' cho .env.
const boNhoToken = new Map<string, { token: string; het_han: number }>()

export async function ketNoiHRM(uid: number, maNV?: string, matKhau?: string): Promise<void> {
  if (maNV && matKhau) { boNhoToken.set(String(uid), await dangNhapHRM(maNV, matKhau)); return }
  if (!coTaiKhoanDichVu()) throw new LoiHRM('chua_cau_hinh', 'Nhập mã NV + mật khẩu My HungVuong để kết nối hệ nhân sự.')
  await layToken(uid)
}

// Token tài khoản dịch vụ (.env HRM_API_MANV/MAT_KHAU) — dùng chung cho poller lấy
// chỉ định MRI ([[hisPull]]). Trả null nếu chưa cấu hình tài khoản dịch vụ (endpoint
// có thể không yêu cầu token). Dùng lại cache 'dich_vu' với token HR để khỏi login lặp.
export async function layTokenDichVu(): Promise<string | null> {
  if (!coTaiKhoanDichVu()) return null
  const dv = boNhoToken.get('dich_vu')
  if (dv && dv.het_han > Date.now()) return dv.token
  const tk = await dangNhapHRM(process.env.HRM_API_MANV!, process.env.HRM_API_MAT_KHAU!)
  boNhoToken.set('dich_vu', tk)
  return tk.token
}
export function xoaTokenDichVu(): void { boNhoToken.delete('dich_vu') }

async function layToken(uid: number): Promise<string> {
  const rieng = boNhoToken.get(String(uid))
  if (rieng && rieng.het_han > Date.now()) return rieng.token
  const dv = boNhoToken.get('dich_vu')
  if (dv && dv.het_han > Date.now()) return dv.token
  if (!coTaiKhoanDichVu()) throw new LoiHRM('chua_cau_hinh', 'Chưa kết nối hệ nhân sự hoặc phiên đã hết hạn. Vui lòng kết nối lại.')
  const tk = await dangNhapHRM(process.env.HRM_API_MANV!, process.env.HRM_API_MAT_KHAU!)
  boNhoToken.set('dich_vu', tk)
  return tk.token
}

async function getHRM(uid: number, duongDan: string, query: Record<string, string | number | undefined> = {}): Promise<any[]> {
  const goc = gocApi()
  if (!goc) throw new LoiHRM('chua_cau_hinh', 'Chưa cấu hình địa chỉ hệ nhân sự (HRM_API_BASE / HIS_AUTH_URL).')
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') qs.set(k, String(v))
  const chuoi = qs.toString()
  const url = `${goc}${duongDan}${chuoi ? `?${chuoi}` : ''}`
  const { status, body } = await goi(url, { headers: { Authorization: `Bearer ${await layToken(uid)}` } })
  if (status === 401) {
    boNhoToken.delete(String(uid)); boNhoToken.delete('dich_vu')
    throw new LoiHRM('chua_cau_hinh', 'Phiên kết nối hệ nhân sự đã hết hạn. Vui lòng kết nối lại.')
  }
  if (status === 403) throw new LoiHRM('sai_thong_tin', 'Tài khoản My HungVuong này không có quyền xem danh sách nhân viên.')
  if (status >= 400 || body?.success === false) {
    throw new LoiHRM('khong_ket_noi', body?.message ? `Hệ nhân sự báo lỗi: ${body.message}` : `Hệ nhân sự trả lỗi HTTP ${status}.`)
  }
  return Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : []
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

// Hàm thuần — chỉ giữ trường cần, bỏ người đã nghỉ việc, chuẩn hóa mã NV.
export function locNhanVien(ds: any[]): NhanVienHRM[] {
  const out: NhanVienHRM[] = []
  const daCo = new Set<string>()
  for (const r of ds) {
    const ma = str(r?.manv)
    const ten = str(r?.tennv)
    if (!ma || !ten || str(r?.ngayNghiViec)) continue
    const ma_nv = chuanHoaMaNV(ma)
    if (daCo.has(ma_nv)) continue
    daCo.add(ma_nv)
    out.push({
      ma_nv, ho_ten: ten, makhoa: str(r?.makhoa), tenkhoa: str(r?.tenkhoa),
      chuc_danh: str(r?.tenchucdanh) ?? str(r?.tencv),
    })
  }
  return out
}

export async function dsKhoaHRM(uid: number): Promise<KhoaHRM[]> {
  const ds = await getHRM(uid, '/api/Khoa', { PageSize: 1000 })
  return ds
    .filter((k) => str(k?.makhoa) && k?.trangThaiSuDung !== false)
    .map((k) => ({ makhoa: str(k.makhoa)!, tenkhoa: str(k.tenkhoa) ?? str(k.makhoa)! }))
    .sort((a, b) => a.tenkhoa.localeCompare(b.tenkhoa, 'vi'))
}

// Lọc theo khoa và/hoặc từ khóa (mã NV hoặc tên). Phân trang phía HRM → gom đủ.
export async function dsNhanVienHRM(uid: number, loc: { makhoa?: string; tu_khoa?: string }): Promise<NhanVienHRM[]> {
  const tk = loc.tu_khoa?.trim() ?? ''
  const laMa = /^\d{1,5}$/.test(tk)
  const query = {
    Makhoa: loc.makhoa || undefined,
    Manv: laMa ? chuanHoaMaNV(tk) : undefined,
    Tennv: tk && !laMa ? tk : undefined,
    PageSize: PAGE_SIZE,
  }
  const gom: any[] = []
  for (let trang = 1; trang <= TOI_DA_TRANG; trang++) {
    const ds = await getHRM(uid, '/api/NhanVien', { ...query, Page: trang })
    gom.push(...ds)
    if (ds.length < PAGE_SIZE) break
  }
  return locNhanVien(gom)
}
