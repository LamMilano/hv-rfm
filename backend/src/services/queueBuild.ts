// Dựng danh sách OrderView từ các bản ghi DB. Giờ hẹn là NGUỒN SỰ THẬT đã LƯU ở
// orders.gio_hen (tính lại + ghi mỗi khi hàng đổi — xem [[orderRepo]] capNhatGioHenPhong),
// neo theo tiến độ ca đang chụp. Ở đây chỉ đọc giá trị đã lưu và định dạng "HH:mm".
// Nhờ vậy ca đã rời hàng chờ (đang gọi / quá lượt / đã chụp) vẫn giữ giờ hẹn đã gán.

import type { OrderDbRow } from '../repos/orderRepo'
import { taoOrderView, gioHM, type OrderView } from './orderView'

export function dungDanhSach(rows: OrderDbRow[], _now: Date = new Date()): OrderView[] {
  return rows.map((r) => taoOrderView(r, gioHM(r.gio_hen)))
}
