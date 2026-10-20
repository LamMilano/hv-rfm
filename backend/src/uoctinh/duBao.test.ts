import { describe, it, expect } from 'vitest'
import { duBaoCacPhong, type CaRut, type DemVip } from './duBao'

const now = new Date('2026-10-13T07:00:00.000Z')

describe('duBaoCacPhong', () => {
  it('phòng rỗng → bắt đầu ngay, khoảng = now..now+daoĐộng', () => {
    const r = duBaoCacPhong([1], [], [], now, 15)[0]
    expect(r.so_ca_truoc).toBe(0)
    expect(r.phut_cho).toBe(0)
    expect(r.eta_som).toBe('2026-10-13T07:00:00.000Z')
    expect(r.eta_muon).toBe('2026-10-13T07:15:00.000Z')
    expect(r.som_nhat).toBe(true)
  })

  it('cộng dồn thời lượng các ca chờ/đang gọi/quá lượt phía trước', () => {
    const cases: CaRut[] = [
      { room_id: 1, status: 'dang_goi', thoi_luong_phut: 20 },
      { room_id: 1, status: 'cho', thoi_luong_phut: 25 },
      { room_id: 1, status: 'qua_luot', thoi_luong_phut: 15 },
      { room_id: 2, status: 'cho', thoi_luong_phut: 30 }, // phòng khác, không tính
    ]
    const r = duBaoCacPhong([1], cases, [], now, 15)[0]
    expect(r.so_ca_truoc).toBe(3)
    expect(r.phut_cho).toBe(60)
    expect(r.bat_dau).toBe('2026-10-13T08:00:00.000Z')
  })

  it('ca đang chụp chỉ tính thời lượng CÒN LẠI (trừ phần đã chụp)', () => {
    const cases: CaRut[] = [
      // bắt đầu chụp lúc 06:50, thời lượng 20 → còn 10 phút lúc 07:00
      { room_id: 1, status: 'dang_chup', thoi_luong_phut: 20, bat_dau_chup: '2026-10-13T06:50:00.000Z' },
    ]
    const r = duBaoCacPhong([1], cases, [], now, 15)[0]
    expect(r.phut_cho).toBe(10)
  })

  it('ca đang chụp đã quá thời lượng → còn lại = 0', () => {
    const cases: CaRut[] = [
      { room_id: 1, status: 'dang_chup', thoi_luong_phut: 20, bat_dau_chup: '2026-10-13T06:00:00.000Z' },
    ]
    expect(duBaoCacPhong([1], cases, [], now, 15)[0].phut_cho).toBe(0)
  })

  it('suất đệm VIP đẩy giờ bắt đầu ra sau (Cách 2)', () => {
    const cases: CaRut[] = [{ room_id: 1, status: 'cho', thoi_luong_phut: 20 }]
    const dem: DemVip[] = [{ room_id: 1, thoi_luong_phut: 20 }, { room_id: 1, thoi_luong_phut: 25 }]
    const r = duBaoCacPhong([1], cases, dem, now, 15)[0]
    expect(r.so_dem_vip).toBe(2)
    expect(r.phut_cho).toBe(65) // 20 (ca chờ) + 20 + 25 (2 đệm)
  })

  it('đánh dấu phòng trống sớm nhất', () => {
    const cases: CaRut[] = [
      { room_id: 1, status: 'cho', thoi_luong_phut: 40 },
      { room_id: 2, status: 'cho', thoi_luong_phut: 20 },
    ]
    const r = duBaoCacPhong([1, 2], cases, [], now, 15)
    expect(r.find((x) => x.room_id === 1)!.som_nhat).toBe(false)
    expect(r.find((x) => x.room_id === 2)!.som_nhat).toBe(true)
  })

  it('thời lượng null → dùng mặc định 20 phút', () => {
    const cases: CaRut[] = [{ room_id: 1, status: 'cho', thoi_luong_phut: null }]
    expect(duBaoCacPhong([1], cases, [], now, 15)[0].phut_cho).toBe(20)
  })
})
