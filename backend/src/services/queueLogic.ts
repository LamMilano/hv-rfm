// Máy trạng thái ca chụp + logic thứ tự hàng đợi — HÀM THUẦN (không đụng DB),
// để unit test trọn vẹn. Route/DB sẽ gọi các hàm này (Lát 4 phần tích hợp).
// Theo §6 bản thiết kế.

export type TrangThai = 'cho' | 'dang_goi' | 'qua_luot' | 'hoan_thanh' | 'huy'
export type HanhDong = 'goi' | 'hoan_thanh' | 'qua_luot' | 'goi_lai' | 'huy'

// Chuyển trạng thái hợp lệ. Trả trạng thái kế tiếp, hoặc null nếu hành động không
// cho phép ở trạng thái hiện tại (hệ thống chặn thao tác sai vòng đời).
//
// Trạng thái CA CHỤP do HIS quyết định: ca HIS tự đóng ('hoan_thanh' = "Đã chụp")
// khi HIS báo đã chụp (TrangThai 2/3/4, xem [[hisPull]]). KTV chỉ điều phối HÀNG CHỜ:
// Gọi số / Quá lượt / Gọi lại. Hành động 'hoan_thanh' (đóng ca thủ công) chỉ dùng cho
// ca NHẬP TAY lúc mất kết nối HIS — ca HIS không cần KTV bấm đóng.
const CHUYEN: Record<HanhDong, { tu: TrangThai[]; den: TrangThai }> = {
  goi:        { tu: ['cho'],                          den: 'dang_goi' },
  hoan_thanh: { tu: ['dang_goi', 'qua_luot'],         den: 'hoan_thanh' },
  qua_luot:   { tu: ['dang_goi'],                     den: 'qua_luot' },
  goi_lai:    { tu: ['qua_luot'],                     den: 'dang_goi' },
  huy:        { tu: ['cho', 'dang_goi', 'qua_luot'],  den: 'huy' },
}

export function trangThaiKeTiep(tt: TrangThai, hd: HanhDong): TrangThai | null {
  const luat = CHUYEN[hd]
  if (!luat) return null
  return luat.tu.includes(tt) ? luat.den : null
}

export function hanhDongHopLe(tt: TrangThai, hd: HanhDong): boolean {
  return trangThaiKeTiep(tt, hd) !== null
}

// ── Thứ tự hàng đợi (KTV sắp tay) ────────────────────────────────────────────
// Hệ thống chỉ gắn nhãn gợi ý, KHÔNG tự sắp xếp. Các hàm dưới chỉ phục vụ thao
// tác tường minh của KTV (kéo đổi, chen) rồi đánh lại số thứ tự liên tục 1..n.

// Đánh lại queue_pos liên tục 1..n theo thứ tự mảng id truyền vào.
export function danhSoThuTu(idsTheoThuTu: number[]): { id: number; queue_pos: number }[] {
  return idsTheoThuTu.map((id, i) => ({ id, queue_pos: i + 1 }))
}

// Di chuyển/chen 1 ca tới vị trí mới (0-based) trong hàng. Trả mảng id thứ tự mới.
// Dùng cho "chen ca ưu tiên vào bất kỳ vị trí nào" và "kéo đổi thứ tự".
export function dichChuyen(ids: number[], id: number, viTriMoi: number): number[] {
  const hienTai = ids.indexOf(id)
  if (hienTai === -1) return ids.slice()
  const con = ids.slice()
  con.splice(hienTai, 1)
  const kep = Math.max(0, Math.min(viTriMoi, con.length))
  con.splice(kep, 0, id)
  return con
}

// Xếp 1 ca mới xuống cuối hàng của phòng (HIS push → cuối hàng). Trả queue_pos mới.
export function viTriCuoiHang(queuePosHienCo: number[]): number {
  return (queuePosHienCo.length ? Math.max(...queuePosHienCo) : 0) + 1
}
