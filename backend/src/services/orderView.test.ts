import { describe, it, expect } from 'vitest'
import { gioHM, taoOrderView, type OrderRowLike } from './orderView'

const base: OrderRowLike = {
  id: 19, stt_ngay: 3, ho_ten: 'Lê Thị Hồng', tuoi: 78, ma_hh: 'MRI_KHOP', ten_dich_vu: null,
  hh_mo_ta: 'MRI khớp', room_id: 1, status: 'cho', queue_pos: 1,
  gio_hen_thu_cong: false, pt_ma: null, pt_ten: null, ma_bs: null, updated_at: null,
}

describe('gioHM', () => {
  it('ISO → HH:mm theo giờ VN (+07)', () => {
    // 02:55Z = 09:55 giờ VN
    expect(gioHM('2026-10-12T02:55:00Z')).toBe('09:55')
  })
  it('null / rỗng / không hợp lệ → null', () => {
    expect(gioHM(null)).toBeNull()
    expect(gioHM('')).toBeNull()
    expect(gioHM('not-a-date')).toBeNull()
  })
})

describe('taoOrderView', () => {
  it('stt = stt_ngay (số tiếp nhận phòng/ngày), chi_dinh ưu tiên ten_dich_vu > mô tả tuyến > mã HH', () => {
    const v = taoOrderView(base, '09:55')
    expect(v.stt).toBe(3)
    expect(v.chi_dinh).toBe('MRI khớp')
    expect(v.gio_hen).toBe('09:55')
    expect(v.nhan).toBeNull()
  })
  it('chưa xếp phòng (stt_ngay null) → stt = 0 (FE hiện "—")', () => {
    const v = taoOrderView({ ...base, stt_ngay: null, room_id: null }, null)
    expect(v.stt).toBe(0)
  })
  it('ten_dich_vu lấn át mô tả tuyến', () => {
    const v = taoOrderView({ ...base, ten_dich_vu: 'MRI khớp gối phải' }, null)
    expect(v.chi_dinh).toBe('MRI khớp gối phải')
  })
  it('có nhóm ưu tiên → nhãn kiểu uu_tien', () => {
    const v = taoOrderView({ ...base, pt_ma: 'cao_tuoi', pt_ten: 'Ưu tiên ≥75t', pt_viet_tat: '75+', pt_mau: 'cam' }, '09:55')
    expect(v.nhan).toEqual({ ma: 'cao_tuoi', ten: 'Ưu tiên ≥75t', kieu: 'uu_tien', viet_tat: '75+', mau: 'cam' })
  })
  it('giờ sửa tay (không ưu tiên) → nhãn gio_sua_tay', () => {
    const v = taoOrderView({ ...base, gio_hen_thu_cong: true }, '10:25')
    expect(v.nhan?.kieu).toBe('gio_sua_tay')
  })
  it('quá lượt → ghi_chu kèm giờ cập nhật', () => {
    const v = taoOrderView({ ...base, status: 'qua_luot', updated_at: '2026-10-12T01:30:00Z' }, null)
    expect(v.ghi_chu).toBe('Quá lượt 08:30')
  })
  it('có ma_bs → giữ để lọc ca của tôi', () => {
    const v = taoOrderView({ ...base, ma_bs: 'BS07' }, null)
    expect(v.ma_bs).toBe('BS07')
  })
  it('mã HH chưa cấu hình (room_id NULL) → cờ chua_xep + giữ ma_hh để báo Admin', () => {
    const v = taoOrderView({ ...base, ma_hh: '9999', hh_mo_ta: null, room_id: null }, null)
    expect(v.chua_xep).toBe(true)
    expect(v.ma_hh).toBe('9999')
    expect(v.room_id).toBeNull()
  })
  it('đã định tuyến → không có cờ chua_xep', () => {
    expect(taoOrderView(base, null).chua_xep).toBeUndefined()
  })

  it('ca chờ: cham_phut = giờ hẹn − giờ hẹn gốc (sống)', () => {
    const v = taoOrderView(
      { ...base, gio_hen: '2026-10-12T02:30:00Z', gio_hen_goc: '2026-10-12T02:00:00Z' }, '09:30',
    )
    expect(v.cham_phut).toBe(30)
    expect(v.gio_hen_goc).toBe('09:00')
  })

  it('ca chờ sớm hơn gốc → kẹp sàn 0', () => {
    const v = taoOrderView(
      { ...base, gio_hen: '2026-10-12T01:30:00Z', gio_hen_goc: '2026-10-12T02:00:00Z' }, '08:30',
    )
    expect(v.cham_phut).toBe(0)
  })

  it('ca đã rời hàng (đang gọi) → dùng snapshot cham_phut_khi_goi', () => {
    const v = taoOrderView(
      { ...base, status: 'dang_goi', cham_phut_khi_goi: 42,
        gio_hen: '2026-10-12T02:30:00Z', gio_hen_goc: '2026-10-12T02:00:00Z' }, '09:30',
    )
    expect(v.cham_phut).toBe(42)   // snapshot lấn át, không tính lại theo giờ hẹn
  })

  it('thiếu mốc gốc → cham_phut undefined', () => {
    expect(taoOrderView(base, null).cham_phut).toBeUndefined()
  })
})
