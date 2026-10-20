import { describe, it, expect } from 'vitest'
import { layIp, boiCanhTuReq, chiTietLoi } from './auditRepo'

describe('layIp', () => {
  it('ưu tiên req.ip khi có', () => {
    expect(layIp({ ip: '10.0.0.5', headers: { 'x-forwarded-for': '1.2.3.4' } })).toBe('10.0.0.5')
  })

  it('lùi về hop đầu của X-Forwarded-For khi không có req.ip', () => {
    expect(layIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } })).toBe('1.2.3.4')
  })

  it('null khi không có thông tin', () => {
    expect(layIp({})).toBeNull()
    expect(layIp({ ip: '   ' })).toBeNull()
  })
})

describe('boiCanhTuReq', () => {
  it('rút actor + IP khi đã đăng nhập', () => {
    const bc = boiCanhTuReq({
      nguoiDung: { uid: 7, role: 'admin', ho_ten: 'Nguyễn A' },
      ip: '192.168.1.9',
    })
    expect(bc).toEqual({ actor_id: 7, actor_ten: 'Nguyễn A', actor_role: 'admin', ip: '192.168.1.9' })
  })

  it('chưa đăng nhập → actor rỗng, chỉ còn IP', () => {
    const bc = boiCanhTuReq({ ip: '192.168.1.9' })
    expect(bc).toEqual({ actor_id: null, actor_ten: null, actor_role: null, ip: '192.168.1.9' })
  })
})

describe('chiTietLoi', () => {
  it('rút tên, thông điệp, mã và chuỗi nguyên nhân (lỗi fetch của undici)', () => {
    const goc = Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:443'), { code: 'ECONNREFUSED' })
    const err = new TypeError('fetch failed', { cause: goc })
    const ct = chiTietLoi(err)
    expect(ct.ten_loi).toBe('TypeError')
    expect(ct.thong_diep).toBe('fetch failed')
    expect(ct.nguyen_nhan?.ma).toBe('ECONNREFUSED')
    expect(ct.nguyen_nhan?.stack).toBeNull()   // stack chỉ giữ ở cấp ngoài cùng
    expect(ct.stack?.split('\n').length).toBeLessThanOrEqual(8)
  })

  it('lỗi abort (timeout) vẫn có tên + thông điệp', () => {
    const ctrl = new AbortController(); ctrl.abort()
    const ct = chiTietLoi(ctrl.signal.reason)
    expect(ct.ten_loi).toBe('AbortError')
    expect(ct.thong_diep).toBe('This operation was aborted')
  })

  it('giá trị không phải object → chỉ có thông điệp', () => {
    expect(chiTietLoi('hỏng')).toEqual({ ten_loi: null, thong_diep: 'hỏng' })
    expect(chiTietLoi(undefined)).toEqual({ ten_loi: null, thong_diep: null })
  })
})
