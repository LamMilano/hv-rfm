// Nhật ký hệ thống (audit_log): lưu vết sự kiện ngoài phạm vi một ca — đăng nhập,
// đổi cấu hình, kéo HIS, quản trị người dùng, lỗi hệ thống. Bổ trợ change_log
// ([[orderRepo]]). ghiAudit KHÔNG bao giờ ném lỗi ra ngoài: ghi nhật ký hỏng thì chỉ
// log console, tuyệt đối không làm hỏng luồng nghiệp vụ (đăng nhập, lưu cấu hình…).
// Xem migration 015_audit_log.sql.

import { pool, query } from '../db/pool'

export type NhomAudit = 'auth' | 'config' | 'his' | 'user' | 'he_thong'
export type MucDo = 'info' | 'warn' | 'error'

// Ngữ cảnh "ai, từ đâu" rút từ request. actor_ten/role giữ lại cả khi user bị xóa.
export interface BoiCanh {
  actor_id: number | null
  actor_ten: string | null
  actor_role: string | null
  ip: string | null
}

// Hình tối thiểu của request cần để rút ngữ cảnh (để test được, không phụ thuộc express).
interface ReqToiThieu {
  nguoiDung?: { uid: number; role: string; ho_ten: string } | null
  ip?: string
  headers?: Record<string, unknown>
}

// IP phiên: ưu tiên req.ip (express đã xử lý trust proxy = loopback), lùi về hop đầu
// của X-Forwarded-For, cuối cùng null. HÀM THUẦN.
export function layIp(req: ReqToiThieu): string | null {
  if (typeof req.ip === 'string' && req.ip.trim()) return req.ip.trim()
  const xff = req.headers?.['x-forwarded-for']
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim() || null
  return null
}

// Rút {actor, ip} từ request đã qua yeuCauDangNhap (req.nguoiDung). Khi chưa đăng nhập
// (vd màn login) → actor rỗng, chỉ còn IP. HÀM THUẦN.
export function boiCanhTuReq(req: ReqToiThieu): BoiCanh {
  const u = req.nguoiDung ?? null
  return {
    actor_id: u?.uid ?? null,
    actor_ten: u?.ho_ten ?? null,
    actor_role: u?.role ?? null,
    ip: layIp(req),
  }
}

export interface GhiAuditInput {
  nhom: NhomAudit
  loai: string
  muc_do?: MucDo
  boi_canh?: Partial<BoiCanh>
  doi_tuong?: string | null
  gia_tri_cu?: unknown
  gia_tri_moi?: unknown
  mo_ta?: string | null
}

// Chi tiết một lỗi bất kỳ (Error / lỗi fetch của Node / lỗi pg) để ghi vào gia_tri_moi
// của dòng muc_do='error' — mọi dòng Lỗi đều phải có chi tiết hồi cứu. Lấy cả chuỗi
// nguyên nhân (err.cause, vd ECONNREFUSED/ETIMEDOUT của undici). HÀM THUẦN.
export interface ChiTietLoiChung {
  ten_loi: string | null
  thong_diep: string | null
  ma?: string | null
  nguyen_nhan?: ChiTietLoiChung | null
  stack?: string | null
}
export function chiTietLoi(err: unknown, sau = 0): ChiTietLoiChung {
  if (err === null || err === undefined || typeof err !== 'object') {
    return { ten_loi: null, thong_diep: err == null ? null : String(err) }
  }
  const e = err as any
  const ma = e.code ?? e.errno ?? null
  return {
    ten_loi: typeof e.name === 'string' ? e.name : null,
    thong_diep: typeof e.message === 'string' ? e.message : null,
    ma: ma == null ? null : String(ma),
    nguyen_nhan: e.cause && sau < 3 ? chiTietLoi(e.cause, sau + 1) : null,
    // Chỉ giữ ~8 dòng stack đầu — đủ định vị, không phình bảng.
    stack: sau === 0 && typeof e.stack === 'string' ? e.stack.split('\n').slice(0, 8).join('\n') : null,
  }
}

const jsonb = (v: unknown): string | null =>
  v === undefined || v === null ? null : JSON.stringify(v)

// Ghi một dòng nhật ký. Nuốt mọi lỗi (append-only, phụ trợ) để không chặn nghiệp vụ.
export async function ghiAudit(input: GhiAuditInput): Promise<void> {
  const bc = input.boi_canh ?? {}
  try {
    await pool.query(
      `INSERT INTO audit_log
         (nhom, loai, muc_do, actor_id, actor_ten, actor_role, ip, doi_tuong, gia_tri_cu, gia_tri_moi, mo_ta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)`,
      [
        input.nhom, input.loai, input.muc_do ?? 'info',
        bc.actor_id ?? null, bc.actor_ten ?? null, bc.actor_role ?? null, bc.ip ?? null,
        input.doi_tuong ?? null, jsonb(input.gia_tri_cu), jsonb(input.gia_tri_moi), input.mo_ta ?? null,
      ],
    )
  } catch (err: any) {
    console.error('[audit] không ghi được nhật ký:', err?.message)
  }
}

// ── Đọc nhật ký (trang "Nhật ký" của admin) ─────────────────────────────────
export interface LocNhatKy {
  nhom?: string
  loai?: string
  muc_do?: string
  tu_ngay?: string   // 'YYYY-MM-DD' (giờ VN) — bao gồm cả ngày
  den_ngay?: string  // 'YYYY-MM-DD' (giờ VN) — bao gồm cả ngày
  limit?: number
  offset?: number
}

export interface DongNhatKy {
  id: number
  thoi_diem: Date
  nhom: string
  loai: string
  muc_do: string
  actor_id: number | null
  actor_ten: string | null
  actor_role: string | null
  ip: string | null
  doi_tuong: string | null
  gia_tri_cu: unknown
  gia_tri_moi: unknown
  mo_ta: string | null
}

export async function layNhatKy(loc: LocNhatKy = {}): Promise<{ dong: DongNhatKy[]; tong: number }> {
  const dieu_kien: string[] = []
  const val: unknown[] = []
  const them = (sql: string, v: unknown) => { val.push(v); dieu_kien.push(sql.replace('$?', `$${val.length}`)) }

  if (loc.nhom) them('nhom = $?', loc.nhom)
  if (loc.loai) them('loai = $?', loc.loai)
  if (loc.muc_do) them('muc_do = $?', loc.muc_do)
  if (loc.tu_ngay) them(`(thoi_diem AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= $?::date`, loc.tu_ngay)
  if (loc.den_ngay) them(`(thoi_diem AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= $?::date`, loc.den_ngay)

  const where = dieu_kien.length ? `WHERE ${dieu_kien.join(' AND ')}` : ''
  const limit = Math.min(Math.max(Number(loc.limit) || 100, 1), 500)
  const offset = Math.max(Number(loc.offset) || 0, 0)

  const dong = await query<DongNhatKy>(
    `SELECT id, thoi_diem, nhom, loai, muc_do, actor_id, actor_ten, actor_role, ip,
            doi_tuong, gia_tri_cu, gia_tri_moi, mo_ta
       FROM audit_log ${where}
      ORDER BY thoi_diem DESC, id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    val,
  )
  const dem = await query<{ tong: number }>(`SELECT COUNT(*)::int AS tong FROM audit_log ${where}`, val)
  return { dong, tong: dem[0]?.tong ?? 0 }
}
