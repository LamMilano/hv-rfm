// Ước tính giờ hẹn dự kiến — ĐẶT SAU INTERFACE để tương lai thay bằng AI/động
// mà không đụng phần còn lại (§9). Giai đoạn 1: tĩnh theo thời lượng cấu hình.

export interface CaTrongHang {
  id: number
  thoi_luong_phut: number
  gio_hen_thu_cong: boolean  // KTV đã ghi đè → KHÔNG tự tính đè lên
  gio_hen?: string | null    // giờ đã ghi đè (ISO), dùng khi gio_hen_thu_cong
}

export interface UocTinhGioHen {
  // Tính giờ hẹn cho từng ca theo thứ tự hàng của MỘT phòng.
  // demPhutMoiGio: số phút/giờ chừa cho cấp cứu — giãn giờ hẹn để gói sẵn kỳ vọng
  // cấp cứu chen ngang (0 = không đệm). Xem app_settings 'dem_cap_cuu_phut_moi_gio'.
  tinhChoHang(batDau: Date, hang: CaTrongHang[], demPhutMoiGio?: number): { id: number; gio_hen: string }[]
}

// Hệ số giãn thời lượng theo phút đệm/giờ: chừa 15′/giờ → mỗi 45′ phục vụ chiếm 60′
// đồng hồ → nhân 60/45. Kẹp an toàn (đệm < 60, không âm). demPhutMoiGio=0 → hệ số 1.
export function heSoDem(demPhutMoiGio: number): number {
  if (!(demPhutMoiGio > 0)) return 1
  const d = Math.min(demPhutMoiGio, 55)   // đừng để mẫu số về 0/âm
  return 60 / (60 - d)
}

// Cộng phút vào một mốc thời gian.
export function congPhut(moc: Date, phut: number): Date {
  return new Date(moc.getTime() + phut * 60_000)
}

// Ca đang được phục vụ ở một phòng (để neo mốc đầu hàng chờ).
export interface CaDangChup {
  bat_dau: Date         // thời điểm bắt đầu gọi/chụp (updated_at khi vào 'dang_goi')
  thoi_luong_phut: number
}

// Mốc bắt đầu cho ca CHỜ đầu tiên của một phòng = khi phòng dự kiến rảnh:
//  - Có ca đang chụp: max(now, bắt_đầu + thời_lượng) — nếu đã quá giờ dự kiến thì lấy now.
//  - Phòng rảnh: now.
export function tinhBatDauPhong(active: CaDangChup | null, now: Date): Date {
  if (!active) return now
  const xong = congPhut(active.bat_dau, active.thoi_luong_phut)
  return xong.getTime() > now.getTime() ? xong : now
}

// Impl tĩnh: giờ hẹn của ca = batDau + tổng thời lượng các ca ĐỨNG TRƯỚC trong
// cùng phòng. Ca có giờ sửa tay giữ nguyên giờ đó và vẫn "chiếm chỗ" thời lượng.
export class UocTinhTinh implements UocTinhGioHen {
  tinhChoHang(batDau: Date, hang: CaTrongHang[], demPhutMoiGio = 0): { id: number; gio_hen: string }[] {
    const out: { id: number; gio_hen: string }[] = []
    const heSo = heSoDem(demPhutMoiGio)
    let moc = batDau
    for (const ca of hang) {
      const gio = ca.gio_hen_thu_cong && ca.gio_hen ? new Date(ca.gio_hen) : moc
      out.push({ id: ca.id, gio_hen: gio.toISOString() })
      // Mốc cho ca kế = (mốc muộn hơn giữa dòng tự động và giờ sửa tay) + thời lượng
      // (đã giãn theo đệm cấp cứu). Nhờ max(): ca sửa tay/đặt trước MUỘN hơn dòng tự
      // động sẽ ĐẨY LÙI các ca phía sau; còn sửa tay SỚM hơn thì không kéo ca sau lên.
      const mocSau = gio.getTime() > moc.getTime() ? gio : moc
      moc = congPhut(mocSau, Math.round(ca.thoi_luong_phut * heSo))
    }
    return out
  }
}

export const uocTinhMacDinh: UocTinhGioHen = new UocTinhTinh()
