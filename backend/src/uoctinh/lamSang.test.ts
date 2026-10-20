import { describe, it, expect } from 'vitest'
import { canTiemThuoc } from './lamSang'

describe('canTiemThuoc', () => {
  it('có tiêm chất tương phản → true', () => {
    expect(canTiemThuoc('Chụp cộng hưởng từ sọ não có tiêm chất tương phản (0.2-1.5T)')).toBe(true)
  })
  it('[có chất tương phản] → true', () => {
    expect(canTiemThuoc('Chụp cộng hưởng từ đáy sọ và xương đá (0.2-1.5T) [có chất tương phản]')).toBe(true)
  })
  it('không tiêm chất tương phản → false', () => {
    expect(canTiemThuoc('Chụp cộng hưởng từ não- mạch não không tiêm chất tương phản (0.2-1.5T)')).toBe(false)
  })
  it('[không có chất tương phản] → false', () => {
    expect(canTiemThuoc('Chụp cộng hưởng từ sọ não (0.2-1.5T) [không có chất tương phản]')).toBe(false)
  })
  it('không có mô tả tiêm/tương phản → false', () => {
    expect(canTiemThuoc('Chụp cộng hưởng từ khuếch tán (DWI)')).toBe(false)
  })
  it('null/rỗng → false', () => {
    expect(canTiemThuoc(null)).toBe(false)
    expect(canTiemThuoc('')).toBe(false)
  })
})
