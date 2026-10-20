import { describe, it, expect } from 'vitest'
import { nguonXacThuc, chuanHoaMaNV, docKetQuaHIS } from './hisAuth'

describe('nguonXacThuc', () => {
  it('mã NV 5 chữ số → his', () => {
    expect(nguonXacThuc('00101')).toBe('his')
    expect(nguonXacThuc('12345')).toBe('his')
  })
  it('admin / rỗng / mã khác → nội bộ', () => {
    expect(nguonXacThuc('admin')).toBe('noi_bo')
    expect(nguonXacThuc(null)).toBe('noi_bo')
    expect(nguonXacThuc('123456')).toBe('noi_bo') // 6 số
    expect(nguonXacThuc('CCHN123')).toBe('noi_bo')
  })
})

describe('chuanHoaMaNV', () => {
  it('đệm 0 cho số ≤5 chữ số', () => {
    expect(chuanHoaMaNV('101')).toBe('00101')
    expect(chuanHoaMaNV('7')).toBe('00007')
    expect(chuanHoaMaNV('12345')).toBe('12345')
  })
  it('để nguyên nếu không phải số ≤5 chữ số', () => {
    expect(chuanHoaMaNV('admin')).toBe('admin')
    expect(chuanHoaMaNV('123456')).toBe('123456')
  })
})

describe('docKetQuaHIS', () => {
  it('200 + success=true → ok', () => {
    expect(docKetQuaHIS(200, { success: true })).toEqual({ ok: true })
  })
  it('200 + success=false → sai_thong_tin', () => {
    expect(docKetQuaHIS(200, { success: false })).toEqual({ ok: false, ly_do: 'sai_thong_tin' })
  })
  it('mã lỗi đã biết → kèm thông báo rõ', () => {
    const r = docKetQuaHIS(200, { success: false, code: 'PASSWORD_EXPIRED' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.ly_do).toBe('sai_thong_tin')
      expect(r.thong_bao).toMatch(/hết hạn/)
    }
  })
  it('code không phân biệt hoa/thường', () => {
    const r = docKetQuaHIS(200, { success: false, code: 'user_locked' })
    if (!r.ok) expect(r.thong_bao).toMatch(/bị khóa/)
  })
  it('HTTP ≥500 → khong_ket_noi (KHÔNG báo sai mật khẩu)', () => {
    expect(docKetQuaHIS(500, null)).toEqual({ ok: false, ly_do: 'khong_ket_noi' })
    expect(docKetQuaHIS(503, {})).toEqual({ ok: false, ly_do: 'khong_ket_noi' })
  })
  it('thân rỗng / không phải JSON → không sập, trả sai_thong_tin', () => {
    expect(docKetQuaHIS(200, null)).toEqual({ ok: false, ly_do: 'sai_thong_tin' })
    expect(docKetQuaHIS(401, null)).toEqual({ ok: false, ly_do: 'sai_thong_tin' })
  })
})
