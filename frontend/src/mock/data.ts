// Dữ liệu giả để dựng & xem giao diện trước khi nối API thật (Lát 8).
// Bám theo nội dung trong UI canvas.
import type { Order, Room } from '@/types'

export const rooms: Room[] = [
  { id: 1, ma_phong: 'MRI1', ten: 'Phòng MRI 1' },
  { id: 2, ma_phong: 'MRI2', ten: 'Phòng MRI 2' },
]

export const orders: Order[] = [
  // Đang gọi (phục vụ) — trạng thái ca chụp do HIS quyết định, KTV chỉ điều phối hàng chờ
  { id: 18, stt: 18, ho_ten: 'Phạm Văn Dũng', tuoi: 63, chi_dinh: 'Sọ não', room_id: 1, status: 'dang_goi', queue_pos: 0, gio_hen: null, gio_hen_thu_cong: false },
  // Hàng chờ
  { id: 19, stt: 19, ho_ten: 'Lê Thị Hồng', tuoi: 78, chi_dinh: 'MRI khớp gối', room_id: 1, status: 'cho', queue_pos: 1, gio_hen: '09:55', gio_hen_thu_cong: false, nhan: { ma: 'cao_tuoi', ten: 'Ưu tiên ≥75t', kieu: 'uu_tien', viet_tat: '75+', mau: 'cam' } },
  { id: 20, stt: 20, ho_ten: 'Hoàng Minh Tuấn', tuoi: 35, chi_dinh: 'MRI gối phải', room_id: 1, status: 'cho', queue_pos: 2, gio_hen: '10:10', gio_hen_thu_cong: false },
  { id: 21, stt: 21, ho_ten: 'Vũ Thị Mai', tuoi: 52, chi_dinh: 'MRI gan mật', room_id: 1, status: 'cho', queue_pos: 3, gio_hen: '10:25', gio_hen_thu_cong: true, doi_gio: true, nhan: { ma: 'gio_sua_tay', ten: 'Giờ sửa tay', kieu: 'gio_sua_tay' } },
  { id: 22, stt: 22, ho_ten: 'Đặng Quốc Bảo', tuoi: 29, chi_dinh: 'MRI cổ tay', room_id: 1, status: 'cho', queue_pos: 4, gio_hen: '10:40', gio_hen_thu_cong: false },
  { id: 23, stt: 23, ho_ten: 'Bùi Thanh Hà', tuoi: 41, chi_dinh: 'MRI vai trái', room_id: 1, status: 'cho', queue_pos: 5, gio_hen: '10:55', gio_hen_thu_cong: false },
  // Quá lượt
  { id: 14, stt: 14, ho_ten: 'Trịnh Văn Nam', tuoi: 60, chi_dinh: 'MRI sọ não', room_id: 1, status: 'qua_luot', queue_pos: 0, gio_hen: null, gio_hen_thu_cong: false, ghi_chu: 'vắng 08:30' },
  { id: 16, stt: 16, ho_ten: 'Ngô Thị Thu', tuoi: 55, chi_dinh: 'MRI bụng', room_id: 1, status: 'qua_luot', queue_pos: 0, gio_hen: null, gio_hen_thu_cong: false, ghi_chu: 'vắng 09:05' },
]
