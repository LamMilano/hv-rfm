// Router cấu hình cho trang quản trị (chỉ admin). Đọc toàn bộ cấu hình trong một
// lần; ghi từng mục (tuyến mã HH, nhóm ưu tiên, người dùng, mẫu thông báo).
// Xem [[configRepo]].

import { Router } from 'express'
import { yeuCauDangNhap, yeuCauVaiTro } from '../auth/middleware'
import {
  layRooms, layHhRouting, luuHhRouting, xoaHhRouting, layMaHhChuaCauHinh,
  layPriorityTypes, luuPriorityType,
  layUsers, taoUser, taoNhieuUser, capNhatUser, datTrangThaiUser,
  demDashboard, hangDoiTheoPhong, demUserTheoVaiTro, laySettingDon,
  laySettings, luuSetting,
} from '../repos/configRepo'
import { hisDangBat } from '../services/hisAuth'
import { phat } from '../realtime/bus'
import { ghiAudit, boiCanhTuReq, layNhatKy } from '../repos/auditRepo'
import { thongKe, chiTietThongKe, LOAI_CHI_TIET, type LoaiChiTiet } from '../repos/thongKeRepo'
import { LoiHRM, ketNoiHRM, dsKhoaHRM, dsNhanVienHRM, coTaiKhoanDichVu } from '../services/hrmApi'

export const configRouter = Router()

const admin = [yeuCauDangNhap, yeuCauVaiTro('admin')]
const VAI_TRO_HOP_LE = ['ktv', 'bac_si', 'admin']

configRouter.get('/', ...admin, async (_req, res) => {
  try {
    const [rooms, hh_routing, priority_types, users, settings, hh_chua_cau_hinh] = await Promise.all([
      layRooms(), layHhRouting(), layPriorityTypes(), layUsers(), laySettings(), layMaHhChuaCauHinh(),
    ])
    const mau: Record<string, string | null> = {}
    for (const s of settings) mau[s.khoa] = s.gia_tri
    res.json({ rooms, hh_routing, priority_types, users, settings: mau, hh_chua_cau_hinh })
  } catch (err: any) {
    console.error('[config] lỗi đọc:', err.message)
    res.status(500).json({ error: 'Không đọc được cấu hình.' })
  }
})

configRouter.put('/hh-routing', ...admin, async (req, res) => {
  const { ma_hh, room_id, thoi_luong_phut, mo_ta } = req.body ?? {}
  if (typeof ma_hh !== 'string' || !ma_hh.trim() || !Number.isInteger(room_id) || !Number.isInteger(thoi_luong_phut) || thoi_luong_phut <= 0) {
    res.status(400).json({ error: 'Dữ liệu tuyến mã HH không hợp lệ.' }); return
  }
  const da_xep = await luuHhRouting(ma_hh.trim(), room_id, thoi_luong_phut, mo_ta ?? null)
  if (da_xep > 0) phat(room_id)
  await ghiAudit({
    nhom: 'config', loai: 'doi_cau_hinh', boi_canh: boiCanhTuReq(req),
    doi_tuong: `hh_routing:${ma_hh.trim()}`,
    gia_tri_moi: { room_id, thoi_luong_phut, mo_ta: mo_ta ?? null },
    mo_ta: `Lưu tuyến mã HH (xếp ${da_xep} ca treo)`,
  })
  res.json({ ok: true, da_xep })
})

configRouter.delete('/hh-routing/:ma_hh', ...admin, async (req, res) => {
  const ma_hh = String(req.params.ma_hh)
  await xoaHhRouting(ma_hh)
  await ghiAudit({
    nhom: 'config', loai: 'xoa_cau_hinh', boi_canh: boiCanhTuReq(req),
    doi_tuong: `hh_routing:${ma_hh}`, mo_ta: 'Xóa tuyến mã HH',
  })
  res.json({ ok: true })
})

const MAU_HOP_LE = ['do', 'cam', 'vang', 'xanh', 'tim', 'luc']
configRouter.put('/priority-types', ...admin, async (req, res) => {
  const { ma, ten, viet_tat, mau, quy_tac_goi_y, thu_tu } = req.body ?? {}
  if (typeof ma !== 'string' || !ma.trim() || typeof ten !== 'string' || !ten.trim()) {
    res.status(400).json({ error: 'Dữ liệu nhóm ưu tiên không hợp lệ.' }); return
  }
  const tt = Number.isInteger(thu_tu) ? thu_tu : 100
  // Viết tắt: giữ gọn (≤4 ký tự hiển thị) — trống thì để null cho FE tự rút gọn từ tên.
  const vt = typeof viet_tat === 'string' && viet_tat.trim() ? viet_tat.trim().slice(0, 4) : null
  const mu = typeof mau === 'string' && MAU_HOP_LE.includes(mau) ? mau : null
  await luuPriorityType(ma.trim(), ten.trim(), vt, mu, quy_tac_goi_y ?? null, tt)
  await ghiAudit({
    nhom: 'config', loai: 'doi_cau_hinh', boi_canh: boiCanhTuReq(req),
    doi_tuong: `priority_types:${ma.trim()}`,
    gia_tri_moi: { ten: ten.trim(), viet_tat: vt, mau: mu, quy_tac_goi_y: quy_tac_goi_y ?? null, thu_tu: tt },
    mo_ta: 'Lưu nhóm ưu tiên',
  })
  res.json({ ok: true })
})

configRouter.post('/users', ...admin, async (req, res) => {
  const { ma_nv, ho_ten, sdt, role, ma_bs, nguon_xac_thuc, mat_khau } = req.body ?? {}
  if (typeof ho_ten !== 'string' || !ho_ten.trim() || !['ktv', 'bac_si', 'admin'].includes(role)) {
    res.status(400).json({ error: 'Dữ liệu người dùng không hợp lệ.' }); return
  }
  const nguon = nguon_xac_thuc === 'noi_bo' ? 'noi_bo' : 'hrm'
  if (nguon === 'noi_bo' && (typeof mat_khau !== 'string' || mat_khau.length < 6)) {
    res.status(400).json({ error: 'Tài khoản nội bộ cần mật khẩu ≥ 6 ký tự.' }); return
  }
  try {
    await taoUser({
      ma_nv: ma_nv?.trim() || null, ho_ten: ho_ten.trim(),
      sdt: typeof sdt === 'string' && sdt.trim() ? sdt.trim() : null, role,
      ma_bs: ma_bs?.trim() || null, nguon_xac_thuc: nguon, mat_khau: mat_khau ?? null,
    })
    await ghiAudit({
      nhom: 'user', loai: 'them_user', boi_canh: boiCanhTuReq(req),
      doi_tuong: `users:${ma_nv?.trim() || ho_ten.trim()}`,
      gia_tri_moi: { ho_ten: ho_ten.trim(), role, nguon_xac_thuc: nguon },
      mo_ta: 'Thêm người dùng',
    })
    res.json({ ok: true })
  } catch (err: any) {
    if (err.code === '23505') { res.status(409).json({ error: 'Mã nhân viên đã tồn tại.' }); return }
    console.error('[config] lỗi tạo user:', err.message)
    res.status(500).json({ error: 'Không tạo được người dùng.' })
  }
})

// Thêm hàng loạt người dùng HIS (chọn từ hệ nhân sự apihrm). Mỗi phần tử cần mã NV +
// họ tên + vai trò hợp lệ; mã BS tùy chọn. Trùng mã NV thì bỏ qua.
configRouter.post('/users/bulk', ...admin, async (req, res) => {
  const ds = Array.isArray(req.body?.users) ? req.body.users : null
  if (!ds || !ds.length) { res.status(400).json({ error: 'Danh sách trống.' }); return }
  const sach: { ma_nv: string; ho_ten: string; role: string; ma_bs: string | null }[] = []
  for (let i = 0; i < ds.length; i++) {
    const r = ds[i] ?? {}
    const ma_nv = typeof r.ma_nv === 'string' ? r.ma_nv.trim() : ''
    const ho_ten = typeof r.ho_ten === 'string' ? r.ho_ten.trim() : ''
    const role = r.role
    if (!ma_nv || !ho_ten || !VAI_TRO_HOP_LE.includes(role)) {
      res.status(400).json({ error: `Dòng ${i + 1} thiếu mã NV / họ tên / vai trò hợp lệ.` }); return
    }
    sach.push({ ma_nv, ho_ten, role, ma_bs: typeof r.ma_bs === 'string' && r.ma_bs.trim() ? r.ma_bs.trim() : null })
  }
  try {
    const kq = await taoNhieuUser(sach)
    await ghiAudit({
      nhom: 'user', loai: 'them_user_hang_loat', boi_canh: boiCanhTuReq(req),
      gia_tri_moi: kq, mo_ta: `Thêm hàng loạt (tạo ${kq.tao_moi}, bỏ qua ${kq.bo_qua})`,
    })
    res.json({ ok: true, ...kq })
  } catch (err: any) {
    console.error('[config] lỗi tạo user hàng loạt:', err.message)
    res.status(500).json({ error: 'Không tạo được danh sách người dùng.' })
  }
})

// ── Nguồn tạo hàng loạt: hệ nhân sự bệnh viện (apihrm) ──────────────────────
// Không trả 401 khi HRM từ chối (frontend coi 401 là hết phiên app) → dùng 400/502.
function traLoiHRM(res: any, err: any, macDinh: string) {
  if (err instanceof LoiHRM) {
    res.status(err.ly_do === 'khong_ket_noi' ? 502 : 400).json({ error: err.message, ly_do: err.ly_do }); return
  }
  console.error('[config] lỗi hệ nhân sự:', err?.message)
  res.status(500).json({ error: macDinh })
}

configRouter.get('/hrm/trang-thai', ...admin, (_req, res) => {
  res.json({ co_tai_khoan_dich_vu: coTaiKhoanDichVu() })
})

// Kết nối (đăng nhập HRM bằng tài khoản admin nhập hoặc tài khoản dịch vụ) rồi
// trả danh sách khoa để lọc.
configRouter.post('/hrm/ket-noi', ...admin, async (req, res) => {
  const { ma_nv, mat_khau } = req.body ?? {}
  try {
    await ketNoiHRM(req.nguoiDung!.uid,
      typeof ma_nv === 'string' && ma_nv.trim() ? ma_nv : undefined,
      typeof mat_khau === 'string' && mat_khau ? mat_khau : undefined)
    res.json({ khoa: await dsKhoaHRM(req.nguoiDung!.uid) })
  } catch (err) { traLoiHRM(res, err, 'Không kết nối được hệ nhân sự.') }
})

configRouter.get('/hrm/nhan-vien', ...admin, async (req, res) => {
  const makhoa = typeof req.query.makhoa === 'string' ? req.query.makhoa.trim() : ''
  const tu_khoa = typeof req.query.tu_khoa === 'string' ? req.query.tu_khoa.trim() : ''
  try {
    res.json({ nhan_vien: await dsNhanVienHRM(req.nguoiDung!.uid, { makhoa, tu_khoa }) })
  } catch (err) { traLoiHRM(res, err, 'Không lấy được danh sách nhân viên.') }
})

configRouter.patch('/users/:id', ...admin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'ID không hợp lệ.' }); return }
  const b = req.body ?? {}
  const d: { role?: string; sdt?: string | null; ma_bs?: string | null; active?: boolean } = {}
  if (b.role !== undefined) {
    if (!VAI_TRO_HOP_LE.includes(b.role)) { res.status(400).json({ error: 'Vai trò không hợp lệ.' }); return }
    d.role = b.role
  }
  if (b.sdt !== undefined) d.sdt = typeof b.sdt === 'string' && b.sdt.trim() ? b.sdt.trim() : null
  if (b.ma_bs !== undefined) d.ma_bs = typeof b.ma_bs === 'string' && b.ma_bs.trim() ? b.ma_bs.trim() : null
  if (b.active !== undefined) {
    if (typeof b.active !== 'boolean') { res.status(400).json({ error: 'Trạng thái không hợp lệ.' }); return }
    d.active = b.active
  }
  if (!Object.keys(d).length) { res.status(400).json({ error: 'Không có trường nào để cập nhật.' }); return }
  await capNhatUser(id, d)
  // Đổi vai trò là sự kiện phân quyền quan trọng → tách loại riêng để lọc/đếm.
  await ghiAudit({
    nhom: 'user', loai: d.role !== undefined ? 'doi_quyen' : 'cap_nhat_user',
    boi_canh: boiCanhTuReq(req), doi_tuong: `users:${id}`, gia_tri_moi: d,
    mo_ta: 'Cập nhật người dùng',
  })
  res.json({ ok: true })
})

// Bảng điều khiển quản trị: đếm ca theo trạng thái, hàng đợi theo phòng, số user,
// trạng thái kết nối HIS/apihrm. Dùng cho trang Tổng quan.
configRouter.get('/dashboard', ...admin, async (_req, res) => {
  try {
    const [dem, phong, vaiTro, jit] = await Promise.all([
      demDashboard(), hangDoiTheoPhong(), demUserTheoVaiTro(), laySettingDon('jit_tu_tao'),
    ])
    const so_user: Record<string, number> = { ktv: 0, bac_si: 0, admin: 0 }
    let tong_user = 0
    for (const v of vaiTro) { so_user[v.role] = v.so; tong_user += v.so }
    res.json({
      ...dem, theo_phong: phong, so_user, tong_user,
      his_bat: hisDangBat(), jit_tu_tao: jit?.gia_tri === 'true',
      gio_server: new Date().toISOString(),
    })
  } catch (err: any) {
    console.error('[config] lỗi dashboard:', err.message)
    res.status(500).json({ error: 'Không đọc được số liệu tổng quan.' })
  }
})

configRouter.put('/settings', ...admin, async (req, res) => {
  const { khoa, gia_tri } = req.body ?? {}
  if (typeof khoa !== 'string' || !khoa.trim() || typeof gia_tri !== 'string') {
    res.status(400).json({ error: 'Thiếu khóa/giá trị cài đặt.' }); return
  }
  const k = khoa.trim()
  const cu = (await laySettingDon(k))?.gia_tri ?? null   // giá trị cũ để ghi vết cũ→mới
  await luuSetting(k, gia_tri)
  await ghiAudit({
    nhom: 'config', loai: 'doi_cau_hinh', boi_canh: boiCanhTuReq(req),
    doi_tuong: `app_settings:${k}`, gia_tri_cu: cu, gia_tri_moi: gia_tri,
    mo_ta: `Đổi cài đặt "${k}"`,
  })
  res.json({ ok: true })
})

// Nhật ký hệ thống — đọc có lọc/phân trang (trang "Nhật ký" của admin). Lọc theo
// nhóm/loại/mức độ + khoảng ngày (giờ VN). Chỉ đọc; chỉ admin. Xem [[auditRepo]].
const RE_NGAY_NK = /^\d{4}-\d{2}-\d{2}$/
configRouter.get('/nhat-ky', ...admin, async (req, res) => {
  const chuoi = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const ngay = (v: unknown) => { const s = chuoi(v); return s && RE_NGAY_NK.test(s) ? s : undefined }
  try {
    const kq = await layNhatKy({
      nhom: chuoi(req.query.nhom), loai: chuoi(req.query.loai), muc_do: chuoi(req.query.muc_do),
      tu_ngay: ngay(req.query.tu_ngay), den_ngay: ngay(req.query.den_ngay),
      limit: Number(req.query.limit) || undefined, offset: Number(req.query.offset) || undefined,
    })
    res.json(kq)
  } catch (err: any) {
    console.error('[config] lỗi đọc nhật ký:', err.message)
    res.status(500).json({ error: 'Không đọc được nhật ký hệ thống.' })
  }
})

// Thống kê vận hành & hiệu quả theo khoảng ngày (giờ VN). Mặc định hôm nay nếu thiếu.
// Chỉ đọc; chỉ admin. Xem [[thongKeRepo]].
configRouter.get('/thong-ke', ...admin, async (req, res) => {
  const homNay = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date())
  const ngay = (v: unknown, md: string) => {
    const s = typeof v === 'string' ? v.trim() : ''
    return RE_NGAY_NK.test(s) && !Number.isNaN(new Date(s).getTime()) ? s : md
  }
  const tu = ngay(req.query.tu_ngay, homNay)
  const den = ngay(req.query.den_ngay, homNay)
  try {
    res.json(await thongKe(tu, den))
  } catch (err: any) {
    console.error('[config] lỗi thống kê:', err.message)
    res.status(500).json({ error: 'Không tính được số liệu thống kê.' })
  }
})

// Chi tiết một chỉ số thống kê: danh sách ca/sự kiện tạo nên con số đó, cùng khoảng
// ngày. `khoa` (tuỳ chọn) thu hẹp theo phòng/nhóm/giờ/ngày/người/nguồn.
configRouter.get('/thong-ke/chi-tiet', ...admin, async (req, res) => {
  const homNay = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date())
  const ngay = (v: unknown, md: string) => {
    const s = typeof v === 'string' ? v.trim() : ''
    return RE_NGAY_NK.test(s) && !Number.isNaN(new Date(s).getTime()) ? s : md
  }
  const loai = typeof req.query.loai === 'string' ? req.query.loai : ''
  if (!(LOAI_CHI_TIET as readonly string[]).includes(loai)) {
    return res.status(400).json({ error: 'Loại chỉ số không hợp lệ.' })
  }
  const khoa = typeof req.query.khoa === 'string' && req.query.khoa.trim()
    ? req.query.khoa.trim().slice(0, 200) : null
  try {
    res.json(await chiTietThongKe(
      loai as LoaiChiTiet, ngay(req.query.tu_ngay, homNay), ngay(req.query.den_ngay, homNay), khoa,
    ))
  } catch (err: any) {
    console.error('[config] lỗi chi tiết thống kê:', err.message)
    res.status(500).json({ error: 'Không tải được chi tiết chỉ số.' })
  }
})
