// Thông tin lâm sàng suy ra từ mô tả dịch vụ (hh_routing.mo_ta) — HÀM THUẦN.
// Dùng để nhắc bác sĩ: ca này CÓ tiêm thuốc tương phản hay không.
// Quy ước mô tả danh mục: "...có tiêm chất tương phản...", "...[có chất tương phản]",
// "...không tiêm chất tương phản...", "...[không có chất tương phản]".

export function canTiemThuoc(moTa: string | null | undefined): boolean {
  if (!moTa) return false
  const s = moTa.toLowerCase()
  // "không" đứng trước → ưu tiên xét trước (chuỗi "không có chất tương phản" chứa
  // cả "có chất tương phản" nên phải loại trước).
  if (s.includes('không có chất tương phản') || s.includes('không tiêm')) return false
  if (s.includes('có tiêm') || s.includes('tương phản')) return true
  return false
}
