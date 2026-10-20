// Dự báo "nếu chỉ định ngay vào phòng X" → sau bao nhiêu ca, bắt đầu khoảng mấy giờ.
// HÀM THUẦN (test trọn vẹn). Cộng thời lượng các ca sẽ chụp TRƯỚC + các suất đệm VIP
// đã chừa (Cách 2: giờ báo gồm sẵn đệm). Trả KHOẢNG giờ (eta_som..eta_muon), không
// hứa giờ điểm. Phòng có tổng chờ ngắn nhất được đánh dấu som_nhat để gợi ý.

export type TrangThaiCa = 'cho' | 'dang_goi' | 'dang_chup' | 'qua_luot' | 'hoan_thanh' | 'huy'

const PHUT_MAC_DINH = 20

export interface CaRut {
  room_id: number | null
  status: TrangThaiCa
  thoi_luong_phut: number | null
  // Mốc bắt đầu chụp (updated_at khi chuyển 'dang_chup') để trừ phần đã chụp.
  bat_dau_chup?: Date | string | null
}

// Suất đệm cho ca VIP đặt trước (chưa đến) — chiếm chỗ thời lượng trong kế hoạch phòng.
export interface DemVip {
  room_id: number
  thoi_luong_phut: number | null
}

export interface DuBaoPhong {
  room_id: number
  so_ca_truoc: number   // số ca sẽ chụp trước ca mới (đang chụp + đang gọi + chờ + quá lượt)
  so_dem_vip: number    // số suất đệm VIP đã chừa phía trước
  phut_cho: number      // tổng phút phải chờ tính từ now
  bat_dau: string       // ISO — dự kiến bắt đầu ca mới (đầu khoảng)
  eta_som: string       // ISO — đầu khoảng
  eta_muon: string      // ISO — cuối khoảng (bat_dau + dao động)
  som_nhat: boolean     // phòng trống sớm nhất → gợi ý ưu tiên chọn
}

function phut(ca: { thoi_luong_phut: number | null }): number {
  return ca.thoi_luong_phut && ca.thoi_luong_phut > 0 ? ca.thoi_luong_phut : PHUT_MAC_DINH
}

// Thời lượng còn lại của ca đang chụp = thời lượng - thời gian đã trôi (tối thiểu 0).
function phutConLai(ca: CaRut, now: Date): number {
  const tong = phut(ca)
  if (!ca.bat_dau_chup) return tong
  const bd = ca.bat_dau_chup instanceof Date ? ca.bat_dau_chup : new Date(ca.bat_dau_chup)
  if (Number.isNaN(bd.getTime())) return tong
  const daTroi = (now.getTime() - bd.getTime()) / 60_000
  return Math.max(0, Math.ceil(tong - daTroi))
}

export function duBaoCacPhong(
  roomIds: number[],
  cases: CaRut[],
  dem: DemVip[],
  now: Date,
  daoDongPhut = 15,
): DuBaoPhong[] {
  const kq: DuBaoPhong[] = roomIds.map((room_id) => {
    let phutCho = 0
    let soTruoc = 0
    for (const c of cases) {
      if (c.room_id !== room_id) continue
      // Ca đang được gọi/phục vụ ('dang_goi', và 'dang_chup' của dữ liệu cũ) chỉ còn
      // tính phần thời lượng CHƯA trôi qua. Ca chờ/quá lượt tính trọn thời lượng.
      if (c.status === 'dang_chup' || c.status === 'dang_goi') { phutCho += phutConLai(c, now); soTruoc++ }
      else if (c.status === 'cho' || c.status === 'qua_luot') {
        phutCho += phut(c); soTruoc++
      }
    }
    const demPhong = dem.filter((d) => d.room_id === room_id)
    phutCho += demPhong.reduce((s, d) => s + phut(d), 0)

    const bat = new Date(now.getTime() + phutCho * 60_000)
    return {
      room_id,
      so_ca_truoc: soTruoc,
      so_dem_vip: demPhong.length,
      phut_cho: phutCho,
      bat_dau: bat.toISOString(),
      eta_som: bat.toISOString(),
      eta_muon: new Date(bat.getTime() + daoDongPhut * 60_000).toISOString(),
      som_nhat: false,
    }
  })

  if (kq.length) {
    const min = Math.min(...kq.map((r) => r.phut_cho))
    for (const r of kq) r.som_nhat = r.phut_cho === min
  }
  return kq
}
