// Router tiếp nhận chỉ định MRI từ HIS (một chiều HIS → MRI). Bảo vệ bằng API key
// riêng ([[middleware]].xacThucApiKey), KHÔNG dùng JWT người dùng. Ánh xạ trường
// cấu hình được (app_settings 'his_anh_xa') để HIS đổi format không phải sửa code.
// Xem [[adapter]], [[orderRepo]], tài liệu docs/yeu-cau-tich-hop-HIS-push-chi-dinh-MRI.md.

import { Router } from 'express'
import { xacThucApiKey, yeuCauDangNhap, yeuCauVaiTro } from '../auth/middleware'
import { anhXaPayload, type AnhXaTruong } from '../his/adapter'
import { themTuHIS } from '../repos/orderRepo'
import { laySettings } from '../repos/configRepo'
import { chayMotVong } from '../services/hisPoller'
import { LoiHIS } from '../services/hisPull'
import { phat } from '../realtime/bus'
import { ghiAudit, boiCanhTuReq, chiTietLoi } from '../repos/auditRepo'

export const hisRouter = Router()

// KÉO thủ công: KTV/Admin bấm "Làm mới" → chạy ngay một vòng lấy chỉ định từ HIS
// (không chờ chu kỳ tự động). Trả số ca mới / đóng để hiển thị phản hồi.
hisRouter.post('/lam-moi', yeuCauDangNhap, yeuCauVaiTro('ktv', 'admin'), async (req, res) => {
  try {
    const kq = await chayMotVong(req.nguoiDung!.uid)
    res.json(kq)
  } catch (err: any) {
    console.error('[his] làm mới thủ công lỗi:', err.message)
    await ghiAudit({
      nhom: 'his', loai: 'loi_ket_noi', muc_do: 'error', boi_canh: boiCanhTuReq(req),
      mo_ta: `Làm mới HIS thủ công lỗi: ${err.message ?? 'lỗi kết nối'}`,
      // Chi tiết chẩn đoán để hồi cứu: LoiHIS → status/errors/url/timeout; lỗi khác → tên/mã/stack.
      gia_tri_moi: err instanceof LoiHIS
        ? { nguon: 'lam_moi_thu_cong', ...err.chi_tiet }
        : { nguon: 'lam_moi_thu_cong', loi_goc: chiTietLoi(err) },
    })
    res.status(502).json({ error: `Không lấy được chỉ định từ HIS: ${err.message ?? 'lỗi kết nối'}` })
  }
})

// Ánh xạ mặc định (tên trường dự kiến) — ghi đè bằng app_settings 'his_anh_xa' (JSON).
const ANH_XA_MAC_DINH: AnhXaTruong & { ten_dich_vu?: string; ma_bs?: string } = {
  ma_his: 'ma_chi_dinh',
  ho_ten: 'ho_ten',
  ma_bn: 'ma_bn',
  tuoi: 'tuoi',
  sdt: 'sdt',
  ma_hh: 'ma_hh',
  ten_dich_vu: 'ten_dich_vu',
  ma_bs: 'ma_bs',
}

function layTheoDuong(obj: unknown, duong?: string): unknown {
  if (!duong) return undefined
  return duong.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}

function chuoiHoacNull(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  return String(v).trim()
}

async function docAnhXa(): Promise<AnhXaTruong & { ten_dich_vu?: string; ma_bs?: string }> {
  try {
    const s = await laySettings()
    const raw = s.find((x) => x.khoa === 'his_anh_xa')?.gia_tri
    if (raw) return { ...ANH_XA_MAC_DINH, ...JSON.parse(raw) }
  } catch { /* lỗi cấu hình → dùng mặc định */ }
  return ANH_XA_MAC_DINH
}

hisRouter.post('/orders', xacThucApiKey, async (req, res) => {
  const body = req.body
  const ds: unknown[] = Array.isArray(body) ? body
    : Array.isArray(body?.orders) ? body.orders
    : body && typeof body === 'object' ? [body]
    : []
  if (!ds.length) { res.status(400).json({ error: 'Không có chỉ định nào trong payload.' }); return }

  const anhXa = await docAnhXa()
  let moi = 0, trung = 0
  // Ca mới có mã HH chưa cấu hình → vẫn lưu nhưng chưa xếp được phòng/số (KTV/BS thấy cảnh báo).
  const chua_xep: { index: number; ma_hh: string | null }[] = []
  const loi: { index: number; thieu: string[] }[] = []

  for (let i = 0; i < ds.length; i++) {
    const kq = anhXaPayload(ds[i], anhXa)
    if (!kq.ok) { loi.push({ index: i, thieu: kq.thieu }); continue }
    const ma_bs = chuoiHoacNull(layTheoDuong(ds[i], anhXa.ma_bs))
    const ten_dich_vu = chuoiHoacNull(layTheoDuong(ds[i], anhXa.ten_dich_vu))
    try {
      const r = await themTuHIS(kq.order, ma_bs, ten_dich_vu)
      r.moi ? moi++ : trung++
      if (r.moi && r.room_id === null) chua_xep.push({ index: i, ma_hh: kq.order.ma_hh })
    } catch (err: any) {
      console.error('[his] lỗi lưu order:', err.message)
      loi.push({ index: i, thieu: ['_loi_luu'] })
    }
  }

  if (moi > 0) phat(null)
  if (chua_xep.length) console.warn('[his] mã HH chưa cấu hình:', chua_xep.map((c) => c.ma_hh ?? '(trống)').join(', '))
  res.json({ nhan_duoc: ds.length, moi, trung, chua_xep, loi })
})
