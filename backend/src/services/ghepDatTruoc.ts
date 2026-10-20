// Gợi ý GHÉP phiếu đặt lịch hẹn trước (nguon='dat_truoc') với chỉ định HIS (nguon='his')
// khi HIS đẩy ca thật sang. KHÔNG tự ghép — chỉ tìm cặp ứng viên để KTV xác nhận
// (xem [[orderRepo]] ghepDatTruoc). Hàm THUẦN để test trọn vẹn; route chỉ truyền
// các bản ghi đang hoạt động vào rồi gắn kết quả lên OrderView.

// Độ tin của cặp ghép, theo khóa mạnh nhất khớp được: mã BN > SĐT > tên+tuổi.
export type DoTinGhep = 'ma_bn' | 'sdt' | 'ten'

export interface CaDeGhep {
  id: number
  nguon: string | null
  status: string
  ma_bn: string | null
  sdt: string | null
  ho_ten: string
  tuoi: number | null
  ghep_bo_qua?: boolean | null
}

export interface GoiYGhep {
  doi_id: number                 // id của ca đối diện trong cặp
  vai: 'dat_truoc' | 'his'       // vai của CHÍNH dòng này trong cặp
  do_tin: DoTinGhep
}

// Trạng thái còn trên hàng (chưa đóng/hủy) mới xét ghép.
const TRANG_THAI_HOP_LE = new Set(['cho', 'dang_goi', 'qua_luot'])

// Chuẩn hóa SĐT: chỉ giữ chữ số; dạng +84/84xxxxxxxxx → 0xxxxxxxxx để so khớp.
export function chuanHoaSdt(s: string | null | undefined): string | null {
  if (!s) return null
  let d = s.replace(/\D/g, '')
  if (d.startsWith('84') && d.length >= 10) d = '0' + d.slice(2)
  return d.length >= 8 ? d : null
}

// Chuẩn hóa tên: bỏ dấu, gộp khoảng trắng, viết thường.
export function chuanHoaTen(s: string | null | undefined): string {
  if (!s) return ''
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}

// Một phiếu đặt trước khớp một ca HIS nếu: cùng mã BN (mạnh nhất) → cùng SĐT → cùng
// tên và tuổi (yếu nhất). Trả độ tin cao nhất khớp được, hoặc null nếu không khớp.
function khopCap(dt: CaDeGhep, his: CaDeGhep): DoTinGhep | null {
  if (dt.ma_bn && his.ma_bn && dt.ma_bn.trim() === his.ma_bn.trim()) return 'ma_bn'
  const s1 = chuanHoaSdt(dt.sdt), s2 = chuanHoaSdt(his.sdt)
  if (s1 && s2 && s1 === s2) return 'sdt'
  const t1 = chuanHoaTen(dt.ho_ten), t2 = chuanHoaTen(his.ho_ten)
  if (t1 && t1 === t2 && (dt.tuoi == null || his.tuoi == null || dt.tuoi === his.tuoi)) return 'ten'
  return null
}

const UU_TIEN: Record<DoTinGhep, number> = { ma_bn: 3, sdt: 2, ten: 1 }

// Tìm các cặp (phiếu đặt trước ↔ ca HIS) để gợi ý ghép. Mỗi phiếu ghép với tối đa một
// ca HIS (độ tin cao nhất); mỗi ca HIS chỉ thuộc một cặp. Trả map id → gợi ý cho CẢ
// hai dòng trong cặp để màn hình gắn chip ở đâu cũng được.
export function timCapGhepDatTruoc(rows: CaDeGhep[]): Map<number, GoiYGhep> {
  const hopLe = rows.filter((r) => TRANG_THAI_HOP_LE.has(r.status))
  const phieu = hopLe.filter((r) => r.nguon === 'dat_truoc' && !r.ghep_bo_qua)
  const hisRows = hopLe.filter((r) => r.nguon === 'his')
  const kq = new Map<number, GoiYGhep>()
  const hisDaDung = new Set<number>()

  for (const dt of phieu) {
    let tot: { his: CaDeGhep; do_tin: DoTinGhep } | null = null
    for (const his of hisRows) {
      if (hisDaDung.has(his.id)) continue
      const d = khopCap(dt, his)
      if (d && (!tot || UU_TIEN[d] > UU_TIEN[tot.do_tin])) tot = { his, do_tin: d }
    }
    if (tot) {
      hisDaDung.add(tot.his.id)
      kq.set(dt.id, { doi_id: tot.his.id, vai: 'dat_truoc', do_tin: tot.do_tin })
      kq.set(tot.his.id, { doi_id: dt.id, vai: 'his', do_tin: tot.do_tin })
    }
  }
  return kq
}
