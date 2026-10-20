// Adapter tiếp nhận chỉ định từ HIS — HÀM THUẦN (test trọn vẹn). §7 bản thiết kế.
//
// HIS có thể đổi format / chưa chốt chính xác → KHÔNG hardcode tên trường trong
// code lõi. Khai báo "trường payload HIS → trường hệ thống" qua cấu hình (anhXa),
// để đổi mapping không phải sửa code.

export interface AnhXaTruong {
  // Mỗi khóa = trường hệ thống; giá trị = đường dẫn (dot-path) trong payload HIS.
  ma_his: string
  ho_ten: string
  ma_bn?: string
  tuoi?: string
  sdt?: string
  ma_hh?: string
}

export interface OrderTiepNhan {
  ma_his: string
  ho_ten: string
  ma_bn: string | null
  tuoi: number | null
  sdt: string | null
  ma_hh: string | null
}

export type KetQuaAnhXa =
  | { ok: true; order: OrderTiepNhan }
  | { ok: false; thieu: string[] }

// Lấy giá trị theo dot-path ('benhNhan.hoTen') — an toàn với undefined.
function layTheoDuong(obj: unknown, duong: string): unknown {
  return duong.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}

function chuoiHoacNull(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  return String(v).trim()
}

function soHoacNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Ánh xạ payload HIS → order chuẩn hệ thống. ma_his và ho_ten là bắt buộc.
export function anhXaPayload(payload: unknown, anhXa: AnhXaTruong): KetQuaAnhXa {
  const ma_his = chuoiHoacNull(layTheoDuong(payload, anhXa.ma_his))
  const ho_ten = chuoiHoacNull(layTheoDuong(payload, anhXa.ho_ten))

  const thieu: string[] = []
  if (!ma_his) thieu.push('ma_his')
  if (!ho_ten) thieu.push('ho_ten')
  if (thieu.length) return { ok: false, thieu }

  return {
    ok: true,
    order: {
      ma_his: ma_his!,
      ho_ten: ho_ten!,
      ma_bn: anhXa.ma_bn ? chuoiHoacNull(layTheoDuong(payload, anhXa.ma_bn)) : null,
      tuoi: anhXa.tuoi ? soHoacNull(layTheoDuong(payload, anhXa.tuoi)) : null,
      sdt: anhXa.sdt ? chuoiHoacNull(layTheoDuong(payload, anhXa.sdt)) : null,
      ma_hh: anhXa.ma_hh ? chuoiHoacNull(layTheoDuong(payload, anhXa.ma_hh)) : null,
    },
  }
}

// ── Gợi ý nhãn ưu tiên ────────────────────────────────────────────────────────
// Hệ thống CHỈ gắn nhãn gợi ý (KTV duyệt). Bộ luật TỔNG QUÁT, an toàn (KHÔNG eval):
// mỗi nhóm có một biểu thức gồm các mệnh đề nối bằng "&&" (VÀ). Mỗi mệnh đề là
// "field op value", trong đó field nằm trong whitelist (xem FIELD_KIND) ánh xạ sang
// dữ liệu ca. Trả mã nhóm khớp đầu tiên (theo thứ tự truyền vào), hoặc null.
//
// Cú pháp:
//   • số (tuoi):   tuoi >= 75 | tuoi < 6 | tuoi == 40 | tuoi != 0 (> < >= <= == !=)
//   • chuỗi:       phong == "..." | phong != "..." | phong ~ "..." (chứa) |
//                  phong !~ "..." (không chứa) | khoa in ["A", "B", ...]
// Chuỗi so khớp KHÔNG phân biệt hoa/thường và BỎ DẤU tiếng Việt → bền khi HIS đổi tên.
// Mệnh đề sai cú pháp / field lạ → coi như KHÔNG khớp (an toàn, không gắn nhầm).
export interface NhomUuTien { ma: string; quy_tac_goi_y: string | null }

// Dữ liệu một ca để xét luật — gom từ cột orders + his_meta (xem orderRepo.chenOrder).
export interface DuLieuUuTien {
  tuoi: number | null
  phong: string | null          // phong_chi_dinh
  khoa: string | null           // khoa_chi_dinh
  doi_tuong: string | null
  loai_dieu_tri: string | null
  gioi_tinh: string | null
  dich_vu: string | null        // ten_dich_vu
  ghi_chu: string | null        // ghi chú lâm sàng (his_meta.ghi_chu)
}

// Whitelist field + kiểu. Frontend có bản tương ứng (types.ts FIELD_UU_TIEN) để dựng form.
const FIELD_KIND: Record<keyof DuLieuUuTien, 'so' | 'chuoi'> = {
  tuoi: 'so', phong: 'chuoi', khoa: 'chuoi', doi_tuong: 'chuoi',
  loai_dieu_tri: 'chuoi', gioi_tinh: 'chuoi', dich_vu: 'chuoi', ghi_chu: 'chuoi',
}

// Chuẩn hóa chuỗi để so khớp: thường hóa + bỏ dấu tiếng Việt (gồm đ→d) + gộp khoảng trắng.
export function chuanHoaSo(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .trim().replace(/\s+/g, ' ')
}

const RE_SO    = /^(\w+)\s*(>=|<=|==|!=|>|<)\s*(-?\d+)$/
const RE_IN    = /^(\w+)\s+in\s+\[(.*)\]$/i
const RE_CHUOI = /^(\w+)\s*(==|!=|~|!~)\s*"([^"]*)"$/

// Xét một mệnh đề đơn với dữ liệu ca. Sai cú pháp / field sai kiểu → false.
function khopMenhDe(d: DuLieuUuTien, menh: string): boolean {
  let m = RE_SO.exec(menh)
  if (m) {
    const [, field, op, nStr] = m
    if (FIELD_KIND[field as keyof DuLieuUuTien] !== 'so') return false
    const gt = d[field as keyof DuLieuUuTien]
    if (typeof gt !== 'number') return false
    const n = Number(nStr)
    return op === '>=' ? gt >= n : op === '<=' ? gt <= n : op === '>' ? gt > n
         : op === '<'  ? gt < n  : op === '==' ? gt === n : gt !== n
  }
  m = RE_IN.exec(menh)
  if (m) {
    const [, field, ds] = m
    if (FIELD_KIND[field as keyof DuLieuUuTien] !== 'chuoi') return false
    const gt = d[field as keyof DuLieuUuTien]
    if (typeof gt !== 'string') return false
    const items = [...ds.matchAll(/"([^"]*)"/g)].map((x) => chuanHoaSo(x[1]))
    return items.includes(chuanHoaSo(gt))
  }
  m = RE_CHUOI.exec(menh)
  if (m) {
    const [, field, op, val] = m
    if (FIELD_KIND[field as keyof DuLieuUuTien] !== 'chuoi') return false
    const gt = d[field as keyof DuLieuUuTien]
    if (typeof gt !== 'string') return false
    const a = chuanHoaSo(gt), b = chuanHoaSo(val)
    return op === '==' ? a === b : op === '!=' ? a !== b
         : op === '~'  ? a.includes(b) : !a.includes(b)
  }
  return false
}

// Một ca có khớp biểu thức luật không (tất cả mệnh đề nối "&&" phải đúng). HÀM THUẦN.
export function khopLuat(d: DuLieuUuTien, bieuThuc: string | null): boolean {
  if (!bieuThuc || !bieuThuc.trim()) return false
  const menhDe = bieuThuc.split('&&').map((s) => s.trim()).filter(Boolean)
  if (!menhDe.length) return false
  return menhDe.every((menh) => khopMenhDe(d, menh))
}

export function goiYNhanUuTien(
  d: DuLieuUuTien,
  dsNhom: NhomUuTien[],
): string | null {
  for (const nhom of dsNhom) {
    if (khopLuat(d, nhom.quy_tac_goi_y)) return nhom.ma
  }
  return null
}
