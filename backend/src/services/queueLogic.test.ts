import { describe, it, expect } from 'vitest'
import {
  trangThaiKeTiep, hanhDongHopLe, danhSoThuTu, dichChuyen, viTriCuoiHang,
} from './queueLogic'

describe('trangThaiKeTiep — vòng đời hợp lệ', () => {
  it('cho →gọi→ dang_goi →đóng ca (HIS/thủ công)→ hoan_thanh ("Đã chụp")', () => {
    expect(trangThaiKeTiep('cho', 'goi')).toBe('dang_goi')
    expect(trangThaiKeTiep('dang_goi', 'hoan_thanh')).toBe('hoan_thanh')
  })
  it('nhánh quá lượt: dang_goi →quá lượt→ qua_luot →gọi lại→ dang_goi', () => {
    expect(trangThaiKeTiep('dang_goi', 'qua_luot')).toBe('qua_luot')
    expect(trangThaiKeTiep('qua_luot', 'goi_lai')).toBe('dang_goi')
  })
  it('đóng được ca quá lượt (gọi lại rồi vẫn chụp)', () => {
    expect(trangThaiKeTiep('qua_luot', 'hoan_thanh')).toBe('hoan_thanh')
  })
  it('hủy được từ mọi trạng thái đang hoạt động', () => {
    expect(trangThaiKeTiep('cho', 'huy')).toBe('huy')
    expect(trangThaiKeTiep('dang_goi', 'huy')).toBe('huy')
    expect(trangThaiKeTiep('qua_luot', 'huy')).toBe('huy')
  })
})

describe('trangThaiKeTiep — chặn thao tác sai vòng đời', () => {
  it('không thể đóng ca khi chưa gọi', () => {
    expect(trangThaiKeTiep('cho', 'hoan_thanh')).toBeNull()
  })
  it('không thể quá lượt khi đang chờ (phải gọi trước)', () => {
    expect(trangThaiKeTiep('cho', 'qua_luot')).toBeNull()
  })
  it('ca đã đóng / đã hủy không chuyển tiếp được', () => {
    expect(trangThaiKeTiep('hoan_thanh', 'goi')).toBeNull()
    expect(trangThaiKeTiep('huy', 'goi_lai')).toBeNull()
  })
  it('hanhDongHopLe phản ánh đúng', () => {
    expect(hanhDongHopLe('cho', 'goi')).toBe(true)
    expect(hanhDongHopLe('cho', 'hoan_thanh')).toBe(false)
  })
})

describe('danhSoThuTu', () => {
  it('đánh lại 1..n liên tục', () => {
    expect(danhSoThuTu([30, 10, 20])).toEqual([
      { id: 30, queue_pos: 1 },
      { id: 10, queue_pos: 2 },
      { id: 20, queue_pos: 3 },
    ])
  })
})

describe('dichChuyen — chen / kéo đổi thứ tự', () => {
  it('chen ca ưu tiên lên đầu', () => {
    expect(dichChuyen([1, 2, 3, 4], 3, 0)).toEqual([3, 1, 2, 4])
  })
  it('kéo xuống cuối', () => {
    expect(dichChuyen([1, 2, 3, 4], 1, 3)).toEqual([2, 3, 4, 1])
  })
  it('vị trí vượt biên → kẹp vào cuối', () => {
    expect(dichChuyen([1, 2, 3], 1, 99)).toEqual([2, 3, 1])
  })
  it('id không có trong hàng → giữ nguyên', () => {
    expect(dichChuyen([1, 2, 3], 9, 0)).toEqual([1, 2, 3])
  })
})

describe('viTriCuoiHang', () => {
  it('hàng rỗng → 1', () => {
    expect(viTriCuoiHang([])).toBe(1)
  })
  it('xếp sau vị trí lớn nhất', () => {
    expect(viTriCuoiHang([1, 2, 5])).toBe(6)
  })
})
