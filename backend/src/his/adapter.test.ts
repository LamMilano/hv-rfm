import { describe, it, expect } from 'vitest'
import { anhXaPayload, goiYNhanUuTien, khopLuat, type AnhXaTruong, type DuLieuUuTien } from './adapter'

// Dữ liệu ca mặc định rỗng — từng test chỉ đặt trường cần.
const CA: DuLieuUuTien = {
  tuoi: null, phong: null, khoa: null, doi_tuong: null,
  loai_dieu_tri: null, gioi_tinh: null, dich_vu: null, ghi_chu: null,
}
const ca = (p: Partial<DuLieuUuTien>): DuLieuUuTien => ({ ...CA, ...p })

const anhXa: AnhXaTruong = {
  ma_his: 'orderCode',
  ho_ten: 'patient.name',
  ma_bn: 'patient.code',
  tuoi: 'patient.age',
  sdt: 'patient.phone',
  ma_hh: 'serviceId',
}

describe('anhXaPayload', () => {
  it('ánh xạ đủ trường theo dot-path', () => {
    const r = anhXaPayload({
      orderCode: 'HIS-001',
      serviceId: 'MRI_SONAO',
      patient: { name: 'Nguyễn Văn A', code: 'BN123', age: 63, phone: '0900000000' },
    }, anhXa)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.order).toEqual({
        ma_his: 'HIS-001', ho_ten: 'Nguyễn Văn A', ma_bn: 'BN123',
        tuoi: 63, sdt: '0900000000', ma_hh: 'MRI_SONAO',
      })
    }
  })

  it('thiếu ma_his hoặc ho_ten → báo rõ trường thiếu', () => {
    const r = anhXaPayload({ serviceId: 'MRI_KHOP' }, anhXa)
    expect(r).toEqual({ ok: false, thieu: ['ma_his', 'ho_ten'] })
  })

  it('trường tùy chọn vắng → null, không sập', () => {
    const r = anhXaPayload({ orderCode: 'HIS-2', patient: { name: 'B' } }, anhXa)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.order).toMatchObject({ ma_bn: null, tuoi: null, sdt: null, ma_hh: null })
  })

  it('tuổi không phải số → null', () => {
    const r = anhXaPayload({ orderCode: 'H', patient: { name: 'C', age: 'abc' } }, anhXa)
    if (r.ok) expect(r.order.tuoi).toBeNull()
  })
})

describe('khopLuat', () => {
  it('số: toán tử so sánh tuổi', () => {
    expect(khopLuat(ca({ tuoi: 78 }), 'tuoi >= 75')).toBe(true)
    expect(khopLuat(ca({ tuoi: 75 }), 'tuoi >= 75')).toBe(true)
    expect(khopLuat(ca({ tuoi: 40 }), 'tuoi >= 75')).toBe(false)
    expect(khopLuat(ca({ tuoi: 5 }), 'tuoi < 6')).toBe(true)
    expect(khopLuat(ca({ tuoi: null }), 'tuoi >= 75')).toBe(false)
  })
  it('chuỗi chứa (~): bỏ dấu, không phân biệt hoa thường', () => {
    expect(khopLuat(ca({ phong: 'PK TT cấp cứu 115' }), 'phong ~ "cap cuu"')).toBe(true)
    expect(khopLuat(ca({ phong: 'Phòng khám Nội' }), 'phong ~ "cap cuu"')).toBe(false)
    expect(khopLuat(ca({ phong: null }), 'phong ~ "cap cuu"')).toBe(false)
  })
  it('chuỗi bằng (==) và khác (!=)', () => {
    expect(khopLuat(ca({ gioi_tinh: 'Nam' }), 'gioi_tinh == "nam"')).toBe(true)
    expect(khopLuat(ca({ gioi_tinh: 'Nữ' }), 'gioi_tinh != "nam"')).toBe(true)
  })
  it('in [...]: khớp một trong danh sách', () => {
    expect(khopLuat(ca({ khoa: 'Hồi sức' }), 'khoa in ["Cấp cứu", "Hồi sức", "ICU"]')).toBe(true)
    expect(khopLuat(ca({ khoa: 'Nội tổng hợp' }), 'khoa in ["Cấp cứu", "Hồi sức"]')).toBe(false)
  })
  it('nhiều mệnh đề nối && (VÀ)', () => {
    const d = ca({ doi_tuong: 'BHYT', tuoi: 80 })
    expect(khopLuat(d, 'doi_tuong ~ "bhyt" && tuoi >= 75')).toBe(true)
    expect(khopLuat(d, 'doi_tuong ~ "bhyt" && tuoi >= 90')).toBe(false)
  })
  it('biểu thức rỗng / sai cú pháp / field lạ → không khớp', () => {
    expect(khopLuat(ca({ phong: 'x' }), null)).toBe(false)
    expect(khopLuat(ca({ phong: 'x' }), '')).toBe(false)
    expect(khopLuat(ca({ phong: 'x' }), 'HIS gắn cờ cấp cứu')).toBe(false)
    expect(khopLuat(ca({ tuoi: 80 }), 'tuoi ~ "80"')).toBe(false)      // số không dùng ~
    expect(khopLuat(ca({ phong: 'x' }), 'linh_tinh == "x"')).toBe(false) // field ngoài whitelist
  })
})

describe('goiYNhanUuTien', () => {
  const ds = [
    { ma: 'cap_cuu', quy_tac_goi_y: 'phong ~ "cap cuu"' },
    { ma: 'cao_tuoi', quy_tac_goi_y: 'tuoi >= 75' },
    { ma: 'khac', quy_tac_goi_y: null },
  ]
  it('khớp phòng cấp cứu → cap_cuu', () => {
    expect(goiYNhanUuTien(ca({ phong: 'PK TT cấp cứu 115', tuoi: 30 }), ds)).toBe('cap_cuu')
  })
  it('chỉ cao tuổi → cao_tuoi', () => {
    expect(goiYNhanUuTien(ca({ tuoi: 78 }), ds)).toBe('cao_tuoi')
  })
  it('khớp cả hai → nhóm đứng trước (cap_cuu) thắng', () => {
    expect(goiYNhanUuTien(ca({ phong: 'PK TT cấp cứu 115', tuoi: 80 }), ds)).toBe('cap_cuu')
  })
  it('không khớp gì → null', () => {
    expect(goiYNhanUuTien(ca({ tuoi: 40 }), ds)).toBeNull()
  })
})
