import { describe, it, expect } from 'vitest'
import { timCapGhepDatTruoc, chuanHoaSdt, chuanHoaTen, type CaDeGhep } from './ghepDatTruoc'

function ca(p: Partial<CaDeGhep> & { id: number }): CaDeGhep {
  return {
    nguon: 'his', status: 'cho', ma_bn: null, sdt: null, ho_ten: '', tuoi: null,
    ghep_bo_qua: false, ...p,
  }
}

describe('chuanHoaSdt', () => {
  it('bỏ ký tự không phải số, +84 → 0', () => {
    expect(chuanHoaSdt('+84 90 123 4567')).toBe('0901234567')
    expect(chuanHoaSdt('0901234567')).toBe('0901234567')
    expect(chuanHoaSdt('84901234567')).toBe('0901234567')
  })
  it('rỗng / quá ngắn → null', () => {
    expect(chuanHoaSdt(null)).toBeNull()
    expect(chuanHoaSdt('123')).toBeNull()
  })
})

describe('chuanHoaTen', () => {
  it('bỏ dấu, gộp khoảng trắng, thường hóa', () => {
    expect(chuanHoaTen('Nguyễn  Văn  A')).toBe('nguyen van a')
    expect(chuanHoaTen('ĐỖ THỊ B')).toBe('do thi b')
  })
})

describe('timCapGhepDatTruoc', () => {
  it('khớp mã BN (mạnh nhất) → gắn gợi ý cho cả hai dòng', () => {
    const rows = [
      ca({ id: 1, nguon: 'dat_truoc', ma_bn: 'BN9', sdt: '0901', ho_ten: 'A' }),
      ca({ id: 2, nguon: 'his', ma_bn: 'BN9', sdt: '0999', ho_ten: 'Khác' }),
    ]
    const m = timCapGhepDatTruoc(rows)
    expect(m.get(1)).toEqual({ doi_id: 2, vai: 'dat_truoc', do_tin: 'ma_bn' })
    expect(m.get(2)).toEqual({ doi_id: 1, vai: 'his', do_tin: 'ma_bn' })
  })

  it('không có mã BN → rớt xuống SĐT', () => {
    const rows = [
      ca({ id: 1, nguon: 'dat_truoc', sdt: '0901234567', ho_ten: 'A' }),
      ca({ id: 2, nguon: 'his', sdt: '+84901234567', ho_ten: 'B' }),
    ]
    expect(timCapGhepDatTruoc(rows).get(1)?.do_tin).toBe('sdt')
  })

  it('chỉ tên + tuổi khớp → độ tin "ten"', () => {
    const rows = [
      ca({ id: 1, nguon: 'dat_truoc', ho_ten: 'Nguyễn Văn A', tuoi: 60 }),
      ca({ id: 2, nguon: 'his', ho_ten: 'nguyen van a', tuoi: 60 }),
    ]
    expect(timCapGhepDatTruoc(rows).get(1)?.do_tin).toBe('ten')
  })

  it('tên khớp nhưng tuổi lệch → không ghép', () => {
    const rows = [
      ca({ id: 1, nguon: 'dat_truoc', ho_ten: 'A', tuoi: 60 }),
      ca({ id: 2, nguon: 'his', ho_ten: 'A', tuoi: 30 }),
    ]
    expect(timCapGhepDatTruoc(rows).size).toBe(0)
  })

  it('phiếu đã "Để riêng" (ghep_bo_qua) → bỏ qua', () => {
    const rows = [
      ca({ id: 1, nguon: 'dat_truoc', ma_bn: 'BN9', ghep_bo_qua: true }),
      ca({ id: 2, nguon: 'his', ma_bn: 'BN9' }),
    ]
    expect(timCapGhepDatTruoc(rows).size).toBe(0)
  })

  it('ca đã đóng/hủy không xét ghép', () => {
    const rows = [
      ca({ id: 1, nguon: 'dat_truoc', ma_bn: 'BN9' }),
      ca({ id: 2, nguon: 'his', ma_bn: 'BN9', status: 'hoan_thanh' }),
    ]
    expect(timCapGhepDatTruoc(rows).size).toBe(0)
  })

  it('mỗi ca HIS chỉ thuộc một cặp (hai phiếu cùng mã BN → chỉ một ghép)', () => {
    const rows = [
      ca({ id: 1, nguon: 'dat_truoc', ma_bn: 'BN9' }),
      ca({ id: 3, nguon: 'dat_truoc', ma_bn: 'BN9' }),
      ca({ id: 2, nguon: 'his', ma_bn: 'BN9' }),
    ]
    const m = timCapGhepDatTruoc(rows)
    // Ca HIS id=2 chỉ ghép với một phiếu; tổng số dòng được gắn gợi ý = 2 (một cặp).
    expect(m.size).toBe(2)
  })
})
