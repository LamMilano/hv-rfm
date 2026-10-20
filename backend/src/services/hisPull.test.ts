import { describe, it, expect } from 'vitest'
import { tinhTuoi, chuanHoaChiDinh, phanLoai, maHisHieuLuc, khoangNgayHomNay } from './hisPull'

// Bản ghi mẫu theo đúng payload IT gửi (GET /api/CanLamSang/mri).
const MAU = {
  makcb: '2600000001',
  mabn: '0000000001',
  hoten: 'NGUYỄN VĂN AN',
  ngaysinh: '1955-01-25T00:00:00',
  dienthoai: '0900000001',
  gioitinh: 'Nam',
  doituong: 'Tự nguyện',
  KhoaChiDinh: 'Khoa Khám Bệnh',
  PhongChiDinh: 'Phòng Khám A101(YHCT)',
  NguoiChiDinh: 'Trần Thị B',
  NgayChiDinh: '2026-10-13T07:20:00',
  LoaiDieuTri: 'Ngoại trú',
  mahh: 626,
  Tendichvu: 'Chụp cộng hưởng từ cột sống thắt lưng - cùng (0.2-1.5T)',
  Ghichu: '',
  TrangThai: 1,
}

describe('tinhTuoi', () => {
  it('tính tuổi tròn từ ngày sinh', () => {
    expect(tinhTuoi('1955-01-25T00:00:00', new Date('2026-10-13'))).toBe(71)
  })
  it('chưa tới sinh nhật trong năm → trừ 1', () => {
    expect(tinhTuoi('1955-12-25', new Date('2026-10-13'))).toBe(70)
  })
  it('ngày sinh trống/sai → null', () => {
    expect(tinhTuoi(null)).toBeNull()
    expect(tinhTuoi('không-phải-ngày')).toBeNull()
  })
})

describe('chuanHoaChiDinh', () => {
  it('ánh xạ đúng payload HIS thật', () => {
    const c = chuanHoaChiDinh(MAU, new Date('2026-10-13'))
    expect(c).toEqual({
      ma_his: '2600000001-626',          // ghép makcb + mahh (makcb không duy nhất)
      ma_bn: '0000000001',
      ho_ten: 'NGUYỄN VĂN AN',
      tuoi: 71,
      ngay_sinh: '1955-01-25T00:00:00',
      gioi_tinh: 'Nam',
      sdt: '0900000001',
      doi_tuong: 'Tự nguyện',
      ma_hh: '626',                       // ép số → chuỗi, khớp hh_routing
      ten_dich_vu: 'Chụp cộng hưởng từ cột sống thắt lưng - cùng (0.2-1.5T)',
      ten_bs: 'Trần Thị B',     // chỉ có tên, không có mã
      khoa_chi_dinh: 'Khoa Khám Bệnh',
      phong_chi_dinh: 'Phòng Khám A101(YHCT)',
      loai_dieu_tri: 'Ngoại trú',
      ghi_chu: null,                      // Ghichu rỗng → null
      gio_chi_dinh: '2026-10-13T07:20:00',
      trang_thai: 1,
    })
  })
  it('thiếu makcb / hoten / mahh → null', () => {
    expect(chuanHoaChiDinh({ ...MAU, makcb: '' })).toBeNull()
    expect(chuanHoaChiDinh({ ...MAU, hoten: null })).toBeNull()
    expect(chuanHoaChiDinh({ ...MAU, mahh: null })).toBeNull()
  })
})

describe('phanLoai', () => {
  const moc = new Date('2026-10-13')
  it('TrangThai=1 → vào hàng; 2/3/4 → đã xong; lạ/thiếu → bỏ qua', () => {
    const ds = [
      { ...MAU, makcb: 'A', TrangThai: 1 },
      { ...MAU, makcb: 'B', TrangThai: 2 },
      { ...MAU, makcb: 'C', TrangThai: 3 },
      { ...MAU, makcb: 'D', TrangThai: 4 },
      { ...MAU, makcb: 'E', TrangThai: 9 },   // trạng thái lạ
      { ...MAU, makcb: '', TrangThai: 1 },    // thiếu khóa
    ]
    const r = phanLoai(ds, moc)
    expect(r.vao_hang.map((c) => c.ma_his)).toEqual(['A-626'])
    expect(r.da_xong.map((c) => c.ma_his)).toEqual(['B-626', 'C-626', 'D-626'])
    expect(r.bo_qua).toBe(2)
  })
})

describe('maHisHieuLuc', () => {
  const moc = new Date('2026-10-13')
  it('gồm cả ca đang chờ lẫn đã xong; loại bản ghi bỏ qua', () => {
    const phan = phanLoai([
      { ...MAU, makcb: 'A', TrangThai: 1 },   // vào hàng
      { ...MAU, makcb: 'B', TrangThai: 4 },   // đã xong
      { ...MAU, makcb: '', TrangThai: 1 },    // thiếu khóa → bỏ qua, không có ma_his
    ], moc)
    expect(maHisHieuLuc(phan).sort()).toEqual(['A-626', 'B-626'])
  })
  it('danh sách rỗng → tập rỗng (chốt an toàn: poller sẽ không hủy ai)', () => {
    expect(maHisHieuLuc(phanLoai([], moc))).toEqual([])
  })
})

describe('khoangNgayHomNay', () => {
  it('trả khoảng đầu–cuối ngày theo giờ VN', () => {
    const { tuNgay, denNgay } = khoangNgayHomNay(new Date('2026-10-13T02:00:00Z'))
    expect(tuNgay).toBe('2026-10-13 00:00:00')
    expect(denNgay).toBe('2026-10-13 23:59:59')
  })
})
