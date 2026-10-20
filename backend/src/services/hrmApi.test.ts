import { describe, it, expect } from 'vitest'
import { docToken, locNhanVien } from './hrmApi'

describe('docToken', () => {
  it('v2: data là object', () => {
    const kq = docToken({ success: true, data: { accessToken: 'abc', expiresAt: '2030-01-01T00:00:00Z' } })
    expect(kq?.token).toBe('abc')
    expect(kq!.het_han).toBe(Date.parse('2030-01-01T00:00:00Z') - 60_000)
  })
  it('v1: data là mảng', () => {
    expect(docToken({ success: true, data: [{ accessToken: 'xyz' }] })?.token).toBe('xyz')
  })
  it('không có token → null', () => {
    expect(docToken({ success: true, data: null })).toBeNull()
    expect(docToken(null)).toBeNull()
  })
})

describe('locNhanVien', () => {
  it('chỉ giữ trường cần, đệm mã NV, bỏ người nghỉ việc và trùng', () => {
    const kq = locNhanVien([
      { manv: '1368', tennv: ' Nguyễn Văn A ', makhoa: 'CDHA', tenkhoa: 'Chẩn đoán hình ảnh', tenchucdanh: 'Bác sĩ', dienthoai1: '0909', donthuocquocgiaMatkhau: 'bí mật' },
      { manv: '01368', tennv: 'Trùng', makhoa: 'CDHA' },
      { manv: '02000', tennv: 'Đã nghỉ', ngayNghiViec: '2025-01-01' },
      { manv: '', tennv: 'Không mã' },
      { manv: '03000', tennv: 'Trần B', tencv: 'Kỹ thuật viên' },
    ])
    expect(kq).toEqual([
      { ma_nv: '01368', ho_ten: 'Nguyễn Văn A', makhoa: 'CDHA', tenkhoa: 'Chẩn đoán hình ảnh', chuc_danh: 'Bác sĩ' },
      { ma_nv: '03000', ho_ten: 'Trần B', makhoa: null, tenkhoa: null, chuc_danh: 'Kỹ thuật viên' },
    ])
  })
})
