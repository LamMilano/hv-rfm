// Router hàng đợi. Mọi màn hình vận hành đọc từ GET /api/hang-doi (một ảnh chụp
// nhất quán: phòng + ca đang hoạt động + ca hoàn thành trong ngày). Thao tác đổi
// vòng đời/thứ tự/giờ hẹn kiểm tra hợp lệ bằng [[queueLogic]] rồi ghi qua [[orderRepo]].
// Sau mỗi thay đổi phát sự kiện realtime ([[bus]]) để các màn hình refetch.

import { Router } from 'express'
import { yeuCauDangNhap, yeuCauVaiTro } from '../auth/middleware'
import {
  layTatCaDangHoatDong, layHoanThanhHomNay, layTheoId, layTheoNgay,
  datTrangThai, datThuTu, datGioHen, chuyenPhong, duyetUuTien,
  themThuCong, layHisCuoi, vaoHang, roiHang,
  themDatTruoc, ghepDatTruoc, boQuaGhep,
} from '../repos/orderRepo'
import { timCapGhepDatTruoc } from '../services/ghepDatTruoc'
import { layRooms, laySettingDon } from '../repos/configRepo'
import { layKipHomNay, datKipHomNay, layDanhSachKtv, type KipTrucNhap } from '../repos/kipTrucRepo'
import { dungDanhSach } from '../services/queueBuild'
import { trangThaiKeTiep, type HanhDong } from '../services/queueLogic'
import { duBaoCacPhong, type CaRut } from '../uoctinh/duBao'
import { phat } from '../realtime/bus'

export const hangDoiRouter = Router()

// Cột chính mặc định ở màn điều phối (khi cấu hình trống/hỏng).
const COT_CHINH_MAC_DINH = ['ho_ten', 'tuoi', 'chi_dinh', 'gio_hen', 'cham_phut', 'trang_thai', 'nhan']

// Đọc cấu hình cột chính (app_settings 'dieu_phoi_cot_chinh', JSON mảng key).
async function layCotChinh(): Promise<string[]> {
  try {
    const s = await laySettingDon('dieu_phoi_cot_chinh')
    if (s?.gia_tri) {
      const ds = JSON.parse(s.gia_tri)
      if (Array.isArray(ds) && ds.every((x) => typeof x === 'string') && ds.length) return ds
    }
  } catch { /* cấu hình hỏng → dùng mặc định */ }
  return COT_CHINH_MAC_DINH
}

// Đọc: mọi vai trò đã đăng nhập.
hangDoiRouter.get('/', yeuCauDangNhap, async (_req, res) => {
  try {
    const [rows, htRows, rooms, kip_truc, his, cot_chinh] = await Promise.all([
      layTatCaDangHoatDong(), layHoanThanhHomNay(), layRooms(), layKipHomNay(), layHisCuoi(), layCotChinh(),
    ])
    const now = new Date()
    // Dự báo "chỉ định ngay" cho từng phòng. Bỏ ca hàng GIỮ (nội trú chờ xếp) để không
    // thổi phồng ETA — chúng chưa nằm trong hàng thời gian. Suất đệm VIP bổ sung đợt sau.
    const cases: CaRut[] = rows.filter((r) => !r.giu_hang).map((r) => ({
      room_id: r.room_id,
      status: r.status,
      thoi_luong_phut: r.thoi_luong_phut,
      // Ca đang được gọi/phục vụ: trừ phần thời gian đã trôi từ lúc gọi (ước tính).
      bat_dau_chup: r.status === 'dang_goi' ? r.updated_at : null,
    }))
    const du_bao = duBaoCacPhong(rooms.map((r) => r.id), cases, [], now)
    // Gợi ý ghép phiếu đặt trước ↔ ca HIS (KTV xác nhận) — gắn vào OrderView theo id.
    const capGhep = timCapGhepDatTruoc(rows)
    const orders = dungDanhSach(rows, now)
    for (const o of orders) { const g = capGhep.get(o.id); if (g) o.ghep = g }
    res.json({
      rooms,
      orders,
      hoan_thanh: dungDanhSach(htRows, now),
      kip_truc,
      his_cuoi: his?.his_cuoi ? his.his_cuoi.toISOString() : null,
      du_bao,
      cot_chinh,
    })
  } catch (err: any) {
    console.error('[hang-doi] lỗi đọc:', err.message)
    res.status(500).json({ error: 'Không đọc được hàng đợi.' })
  }
})

// Danh sách ca theo một ngày (giờ VN, 'YYYY-MM-DD') — màn "Danh sách MRI" xem lại
// ngày quá khứ. Ảnh chụp tĩnh (không realtime, không dự báo). Mọi vai trò đã đăng nhập.
const RE_NGAY = /^\d{4}-\d{2}-\d{2}$/
hangDoiRouter.get('/theo-ngay', yeuCauDangNhap, async (req, res) => {
  const ngay = typeof req.query.ngay === 'string' ? req.query.ngay : ''
  if (!RE_NGAY.test(ngay) || Number.isNaN(new Date(ngay).getTime())) {
    res.status(400).json({ error: 'Ngày không hợp lệ (YYYY-MM-DD).' }); return
  }
  try {
    const [rows, rooms] = await Promise.all([layTheoNgay(ngay), layRooms()])
    res.json({ rooms, orders: dungDanhSach(rows, new Date()) })
  } catch (err: any) {
    console.error('[hang-doi] lỗi đọc theo ngày:', err.message)
    res.status(500).json({ error: 'Không đọc được danh sách theo ngày.' })
  }
})

// Ghi: chỉ KTV / admin.
const ghi = [yeuCauDangNhap, yeuCauVaiTro('ktv', 'admin')]

// Loại hành động hợp lệ (khớp HanhDong của queueLogic).
const HANH_DONG = new Set<HanhDong>(['goi', 'hoan_thanh', 'qua_luot', 'goi_lai', 'huy'])

hangDoiRouter.post('/:id/hanh-dong', ...ghi, async (req, res) => {
  const id = Number(req.params.id)
  const hd = req.body?.hanh_dong as HanhDong
  if (!Number.isInteger(id) || !HANH_DONG.has(hd)) {
    res.status(400).json({ error: 'Hành động không hợp lệ.' }); return
  }
  const order = await layTheoId(id)
  if (!order) { res.status(404).json({ error: 'Không tìm thấy ca.' }); return }

  const den = trangThaiKeTiep(order.status, hd)
  if (!den) {
    res.status(409).json({ error: `Không thể "${hd}" khi ca đang ở trạng thái "${order.status}".` }); return
  }
  await datTrangThai(id, order.status, den, hd, req.nguoiDung!.uid, order.room_id)
  phat(order.room_id)
  res.json({ ok: true, status: den })
})

hangDoiRouter.post('/sap-xep', ...ghi, async (req, res) => {
  const room_id = Number(req.body?.room_id)
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : null
  if (!Number.isInteger(room_id) || !ids || ids.some((n: number) => !Number.isInteger(n))) {
    res.status(400).json({ error: 'Dữ liệu sắp xếp không hợp lệ.' }); return
  }
  await datThuTu(room_id, ids, req.nguoiDung!.uid)
  phat(room_id)
  res.json({ ok: true })
})

hangDoiRouter.post('/:id/gio-hen', ...ghi, async (req, res) => {
  const id = Number(req.params.id)
  const giaTri = req.body?.gio_hen
  const iso = giaTri === null ? null : typeof giaTri === 'string' ? giaTri : undefined
  if (!Number.isInteger(id) || iso === undefined) {
    res.status(400).json({ error: 'Giờ hẹn không hợp lệ (ISO 8601 hoặc null).' }); return
  }
  if (iso !== null && Number.isNaN(new Date(iso).getTime())) {
    res.status(400).json({ error: 'Giờ hẹn không phải thời điểm hợp lệ.' }); return
  }
  const order = await layTheoId(id)
  if (!order) { res.status(404).json({ error: 'Không tìm thấy ca.' }); return }
  await datGioHen(id, iso, req.nguoiDung!.uid)
  phat(order.room_id)
  res.json({ ok: true })
})

// Đưa ca nội trú từ hàng GIỮ vào HÀNG THỜI GIAN của một phòng (KTV sắp buổi chiều).
hangDoiRouter.post('/:id/vao-hang', ...ghi, async (req, res) => {
  const id = Number(req.params.id)
  const room_id = Number(req.body?.room_id)
  if (!Number.isInteger(id) || !Number.isInteger(room_id)) {
    res.status(400).json({ error: 'Thiếu phòng đích.' }); return
  }
  const order = await layTheoId(id)
  if (!order) { res.status(404).json({ error: 'Không tìm thấy ca.' }); return }
  const phong = (await layRooms()).some((r) => r.id === room_id)
  if (!phong) { res.status(400).json({ error: 'Phòng không hợp lệ.' }); return }
  await vaoHang(id, room_id, req.nguoiDung!.uid)
  phat(null) // có thể ảnh hưởng 2 phòng
  res.json({ ok: true })
})

// Rút ca đang chờ ra khỏi hàng thời gian, đưa về hàng GIỮ (nội trú xếp chờ).
hangDoiRouter.post('/:id/roi-hang', ...ghi, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Mã ca không hợp lệ.' }); return }
  const order = await layTheoId(id)
  if (!order) { res.status(404).json({ error: 'Không tìm thấy ca.' }); return }
  if (order.status !== 'cho') {
    res.status(409).json({ error: 'Chỉ đưa về xếp chờ được ca đang ở hàng chờ.' }); return
  }
  await roiHang(id, req.nguoiDung!.uid)
  phat(order.room_id)
  res.json({ ok: true })
})

hangDoiRouter.post('/:id/chuyen-phong', ...ghi, async (req, res) => {
  const id = Number(req.params.id)
  const room_id_moi = Number(req.body?.room_id)
  if (!Number.isInteger(id) || !Number.isInteger(room_id_moi)) {
    res.status(400).json({ error: 'Thiếu phòng đích.' }); return
  }
  const order = await layTheoId(id)
  if (!order) { res.status(404).json({ error: 'Không tìm thấy ca.' }); return }
  await chuyenPhong(id, room_id_moi, req.nguoiDung!.uid)
  phat(null) // ảnh hưởng 2 phòng
  res.json({ ok: true })
})

// Nhập tay (dự phòng khi mất kết nối HIS). KTV chọn phòng trực tiếp; họ tên bắt buộc.
hangDoiRouter.post('/thu-cong', ...ghi, async (req, res) => {
  const b = req.body ?? {}
  const ho_ten = typeof b.ho_ten === 'string' ? b.ho_ten.trim() : ''
  if (!ho_ten) { res.status(400).json({ error: 'Thiếu họ tên bệnh nhân.' }); return }
  const room_id = Number.isInteger(b.room_id) ? b.room_id : null
  if (room_id !== null) {
    const phong = (await layRooms()).some((r) => r.id === room_id)
    if (!phong) { res.status(400).json({ error: 'Phòng không hợp lệ.' }); return }
  }
  const tuoi = Number.isInteger(b.tuoi) && b.tuoi >= 0 && b.tuoi <= 150 ? b.tuoi : null
  const thoi_luong_phut = Number.isInteger(b.thoi_luong_phut) && b.thoi_luong_phut > 0 && b.thoi_luong_phut <= 240
    ? b.thoi_luong_phut : null
  const chuoi = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  try {
    const kq = await themThuCong({
      ho_ten, tuoi, sdt: chuoi(b.sdt), room_id,
      ten_dich_vu: chuoi(b.ten_dich_vu), ma_bs: chuoi(b.ma_bs), ma_hh: chuoi(b.ma_hh),
      thoi_luong_phut,
    })
    phat(kq.room_id)
    res.json({ ok: true, id: kq.id, room_id: kq.room_id })
  } catch (err: any) {
    console.error('[hang-doi] lỗi nhập tay:', err.message)
    res.status(500).json({ error: 'Không thêm được ca nhập tay.' })
  }
})

// Đặt lịch hẹn trước: phiếu vào hàng chờ ngay, giờ hẹn KTV điền (đóng băng). Khi HIS
// đẩy chỉ định thật sẽ gợi ý ghép. Họ tên + SĐT + phòng + giờ hẹn bắt buộc.
hangDoiRouter.post('/dat-truoc', ...ghi, async (req, res) => {
  const b = req.body ?? {}
  const ho_ten = typeof b.ho_ten === 'string' ? b.ho_ten.trim() : ''
  if (!ho_ten) { res.status(400).json({ error: 'Thiếu họ tên bệnh nhân.' }); return }
  const sdt = typeof b.sdt === 'string' && b.sdt.trim() ? b.sdt.trim() : ''
  if (!sdt) { res.status(400).json({ error: 'Thiếu số điện thoại (cần để ghép & nhắc hẹn).' }); return }
  const room_id = Number.isInteger(b.room_id) ? b.room_id : null
  if (room_id === null || !(await layRooms()).some((r) => r.id === room_id)) {
    res.status(400).json({ error: 'Phòng không hợp lệ.' }); return
  }
  const gio_hen = typeof b.gio_hen === 'string' ? b.gio_hen : ''
  if (!gio_hen || Number.isNaN(new Date(gio_hen).getTime())) {
    res.status(400).json({ error: 'Giờ hẹn không hợp lệ (ISO 8601).' }); return
  }
  const tuoi = Number.isInteger(b.tuoi) && b.tuoi >= 0 && b.tuoi <= 150 ? b.tuoi : null
  const chuoi = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  try {
    const kq = await themDatTruoc({
      ho_ten, tuoi, sdt, ma_bn: chuoi(b.ma_bn), room_id,
      ten_dich_vu: chuoi(b.ten_dich_vu), ma_hh: chuoi(b.ma_hh), ma_bs: chuoi(b.ma_bs),
      gio_hen: new Date(gio_hen).toISOString(),
    }, req.nguoiDung!.uid)
    phat(kq.room_id)
    res.json({ ok: true, id: kq.id, room_id: kq.room_id })
  } catch (err: any) {
    console.error('[hang-doi] lỗi đặt lịch hẹn trước:', err.message)
    res.status(500).json({ error: 'Không tạo được phiếu đặt lịch hẹn trước.' })
  }
})

// Ghép phiếu đặt trước (:id) vào ca HIS thật (his_id) — KTV xác nhận gợi ý.
hangDoiRouter.post('/:id/ghep', ...ghi, async (req, res) => {
  const id = Number(req.params.id)
  const his_id = Number(req.body?.his_id)
  if (!Number.isInteger(id) || !Number.isInteger(his_id)) {
    res.status(400).json({ error: 'Thiếu ca để ghép.' }); return
  }
  try {
    const ok = await ghepDatTruoc(id, his_id, req.nguoiDung!.uid)
    if (!ok) { res.status(409).json({ error: 'Không ghép được (phiếu hoặc ca HIS không còn hợp lệ).' }); return }
    phat(null) // có thể ảnh hưởng 2 phòng
    res.json({ ok: true })
  } catch (err: any) {
    console.error('[hang-doi] lỗi ghép đặt trước:', err.message)
    res.status(500).json({ error: 'Không ghép được phiếu đặt trước.' })
  }
})

// "Để riêng": bỏ qua gợi ý ghép cho một phiếu đặt trước.
hangDoiRouter.post('/:id/de-rieng', ...ghi, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Mã phiếu không hợp lệ.' }); return }
  const order = await layTheoId(id)
  if (!order) { res.status(404).json({ error: 'Không tìm thấy phiếu.' }); return }
  await boQuaGhep(id, req.nguoiDung!.uid)
  phat(order.room_id)
  res.json({ ok: true })
})

// Danh sách KTV trong hệ thống — để chọn nhanh tên khi nhập kíp (tự điền SĐT).
hangDoiRouter.get('/ds-ktv', ...ghi, async (_req, res) => {
  try {
    res.json({ ds_ktv: await layDanhSachKtv() })
  } catch (err: any) {
    console.error('[hang-doi] lỗi đọc danh sách KTV:', err.message)
    res.status(500).json({ error: 'Không đọc được danh sách KTV.' })
  }
})

// Kíp KTV trực hôm nay — thay toàn bộ danh sách. Tên bắt buộc, SĐT tùy chọn.
hangDoiRouter.put('/kip-truc', ...ghi, async (req, res) => {
  const ds = Array.isArray(req.body?.kip) ? req.body.kip : null
  if (!ds) { res.status(400).json({ error: 'Danh sách kíp không hợp lệ.' }); return }
  const sach: KipTrucNhap[] = []
  for (const r of ds) {
    const ho_ten = typeof r?.ho_ten === 'string' ? r.ho_ten.trim() : ''
    if (!ho_ten) continue   // bỏ dòng trống
    sach.push({
      ho_ten,
      sdt: typeof r?.sdt === 'string' && r.sdt.trim() ? r.sdt.trim() : null,
    })
  }
  try {
    await datKipHomNay(sach)
    phat(null)   // mọi màn hình (bác sĩ, KTV) refetch để thấy kíp mới
    res.json({ ok: true, so_dong: sach.length })
  } catch (err: any) {
    console.error('[hang-doi] lỗi lưu kíp:', err.message)
    res.status(500).json({ error: 'Không lưu được kíp trực.' })
  }
})

hangDoiRouter.post('/:id/uu-tien', ...ghi, async (req, res) => {
  const id = Number(req.params.id)
  const pt = req.body?.priority_type_id
  const ptId = pt === null ? null : Number.isInteger(pt) ? pt : undefined
  if (!Number.isInteger(id) || ptId === undefined) {
    res.status(400).json({ error: 'Nhóm ưu tiên không hợp lệ.' }); return
  }
  const order = await layTheoId(id)
  if (!order) { res.status(404).json({ error: 'Không tìm thấy ca.' }); return }
  await duyetUuTien(id, ptId, req.nguoiDung!.uid)
  phat(order.room_id)
  res.json({ ok: true })
})
