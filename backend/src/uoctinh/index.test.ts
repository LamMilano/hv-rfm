import { describe, it, expect } from 'vitest'
import { UocTinhTinh, congPhut, tinhBatDauPhong, heSoDem, type CaTrongHang } from './index'

const batDau = new Date('2026-10-12T09:00:00.000Z')

describe('congPhut', () => {
  it('cộng phút đúng', () => {
    expect(congPhut(batDau, 20).toISOString()).toBe('2026-10-12T09:20:00.000Z')
  })
})

describe('tinhBatDauPhong', () => {
  const now = new Date('2026-10-12T09:00:00.000Z')
  it('phòng rảnh (không ca đang chụp) → now', () => {
    expect(tinhBatDauPhong(null, now).toISOString()).toBe(now.toISOString())
  })
  it('ca đang chụp chưa quá giờ dự kiến → giờ bắt đầu + thời lượng', () => {
    // bắt đầu 08:50, 20′ → xong 09:10 > now 09:00
    const r = tinhBatDauPhong({ bat_dau: new Date('2026-10-12T08:50:00.000Z'), thoi_luong_phut: 20 }, now)
    expect(r.toISOString()).toBe('2026-10-12T09:10:00.000Z')
  })
  it('ca đang chụp đã quá giờ dự kiến → now (không lùi về quá khứ)', () => {
    // bắt đầu 08:30, 20′ → xong 08:50 < now 09:00
    const r = tinhBatDauPhong({ bat_dau: new Date('2026-10-12T08:30:00.000Z'), thoi_luong_phut: 20 }, now)
    expect(r.toISOString()).toBe(now.toISOString())
  })
})

describe('UocTinhTinh.tinhChoHang', () => {
  const uoc = new UocTinhTinh()

  it('ca đầu = giờ bắt đầu; ca sau cộng dồn thời lượng ca trước', () => {
    const hang: CaTrongHang[] = [
      { id: 1, thoi_luong_phut: 20, gio_hen_thu_cong: false },
      { id: 2, thoi_luong_phut: 25, gio_hen_thu_cong: false },
      { id: 3, thoi_luong_phut: 30, gio_hen_thu_cong: false },
    ]
    const r = uoc.tinhChoHang(batDau, hang)
    expect(r).toEqual([
      { id: 1, gio_hen: '2026-10-12T09:00:00.000Z' },
      { id: 2, gio_hen: '2026-10-12T09:20:00.000Z' },
      { id: 3, gio_hen: '2026-10-12T09:45:00.000Z' },
    ])
  })

  it('ca có giờ sửa tay giữ nguyên giờ đó, và MỐC chạy tiếp từ giờ sửa tay nếu muộn hơn', () => {
    const hang: CaTrongHang[] = [
      { id: 1, thoi_luong_phut: 20, gio_hen_thu_cong: false },
      { id: 2, thoi_luong_phut: 25, gio_hen_thu_cong: true, gio_hen: '2026-10-12T11:00:00.000Z' },
      { id: 3, thoi_luong_phut: 30, gio_hen_thu_cong: false },
    ]
    const r = uoc.tinhChoHang(batDau, hang)
    expect(r[0].gio_hen).toBe('2026-10-12T09:00:00.000Z')
    expect(r[1].gio_hen).toBe('2026-10-12T11:00:00.000Z') // giữ nguyên giờ sửa tay (11:00)
    // Ca 2 sửa tay sang 11:00 (muộn hơn dòng tự động 09:20) → mốc dời theo 11:00:
    // ca 3 = 11:00 + 25′ = 11:25 (bị đẩy lùi theo ca sửa tay).
    expect(r[2].gio_hen).toBe('2026-10-12T11:25:00.000Z')
  })

  it('sửa giờ tay MUỘN hơn → đẩy lùi các ca phía sau (tình huống Liễu/Công)', () => {
    // Liễu sửa tay 08:01, thời lượng 20′; Công đứng ngay sau, tự tính.
    // Công phải = 08:01 + 20′ = 08:21, KHÔNG được sát 08:01.
    const bd = new Date('2026-10-20T00:30:00.000Z') // 07:30 VN
    const hang: CaTrongHang[] = [
      { id: 1, thoi_luong_phut: 20, gio_hen_thu_cong: true, gio_hen: '2026-10-20T01:01:00.000Z' }, // Liễu 08:01
      { id: 2, thoi_luong_phut: 20, gio_hen_thu_cong: false },                                     // Công
    ]
    const r = uoc.tinhChoHang(bd, hang)
    expect(r[0].gio_hen).toBe('2026-10-20T01:01:00.000Z') // Liễu giữ 08:01
    expect(r[1].gio_hen).toBe('2026-10-20T01:21:00.000Z') // Công lùi về 08:21
  })

  it('sửa giờ tay SỚM hơn dòng tự động → KHÔNG kéo ca sau sớm lên', () => {
    // batDau 09:00; ca 1 sửa tay 08:00 (sớm hơn) → không được kéo ca 2 về trước 09:20.
    const hang: CaTrongHang[] = [
      { id: 1, thoi_luong_phut: 20, gio_hen_thu_cong: true, gio_hen: '2026-10-12T08:00:00.000Z' },
      { id: 2, thoi_luong_phut: 20, gio_hen_thu_cong: false },
    ]
    const r = uoc.tinhChoHang(batDau, hang)
    expect(r[0].gio_hen).toBe('2026-10-12T08:00:00.000Z') // ca 1 giữ giờ sửa tay (sớm)
    expect(r[1].gio_hen).toBe('2026-10-12T09:20:00.000Z') // ca 2 vẫn theo dòng tự nhiên
  })

  it('hàng rỗng → mảng rỗng', () => {
    expect(uoc.tinhChoHang(batDau, [])).toEqual([])
  })

  it('đệm cấp cứu giãn mốc các ca sau (15′/giờ → hệ số 60/45)', () => {
    const hang: CaTrongHang[] = [
      { id: 1, thoi_luong_phut: 30, gio_hen_thu_cong: false },
      { id: 2, thoi_luong_phut: 30, gio_hen_thu_cong: false },
    ]
    // ca 1 ở mốc đầu; ca 2 lùi 30×(60/45)=40′ → 09:40 (so với 09:30 khi không đệm)
    const r = uoc.tinhChoHang(batDau, hang, 15)
    expect(r[0].gio_hen).toBe('2026-10-12T09:00:00.000Z')
    expect(r[1].gio_hen).toBe('2026-10-12T09:40:00.000Z')
  })

  it('đệm = 0 → không đổi so với không truyền đệm', () => {
    const hang: CaTrongHang[] = [{ id: 1, thoi_luong_phut: 20, gio_hen_thu_cong: false }, { id: 2, thoi_luong_phut: 20, gio_hen_thu_cong: false }]
    expect(uoc.tinhChoHang(batDau, hang, 0)).toEqual(uoc.tinhChoHang(batDau, hang))
  })
})

describe('heSoDem', () => {
  it('0 hoặc âm → 1 (không giãn)', () => {
    expect(heSoDem(0)).toBe(1)
    expect(heSoDem(-5)).toBe(1)
  })
  it('15′/giờ → 60/45', () => {
    expect(heSoDem(15)).toBeCloseTo(60 / 45)
  })
  it('kẹp trần 55′/giờ (không cho mẫu số về 0)', () => {
    expect(heSoDem(60)).toBe(60 / 5)
  })
})
