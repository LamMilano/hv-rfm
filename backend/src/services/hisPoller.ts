// Bộ hẹn giờ tự gọi API HIS lấy chỉ định MRI ([[hisPull]]) + chạy một vòng cho nút
// "Làm mới" thủ công. Chu kỳ đọc từ app_settings 'his_pull_chu_ky_giay' (admin chỉnh,
// áp dụng ngay vòng kế). Mỗi vòng: ca TrangThai=1 → themTuHIS (idempotent, định tuyến
// phòng); ca 2/3/4 → dongCaHIS. Có thay đổi → phát SSE để mọi màn hình refetch.

import { layChiDinhMRI, khoangNgayHomNay, phanLoai, maHisHieuLuc, LoiHIS, type ChiDinhMRI } from './hisPull'
import { themTuHIS, dongCaHIS, dongCacCaBiHuy, capNhatHisMeta, capNhatHisLastSeen } from '../repos/orderRepo'
import { laySettingDon } from '../repos/configRepo'
import { phat } from '../realtime/bus'
import { ghiAudit, chiTietLoi } from '../repos/auditRepo'

export interface KetQuaVong {
  nhan: number      // tổng bản ghi HIS trả
  moi: number       // ca mới thêm vào hàng đợi
  dong: number      // ca vừa đóng (HIS báo đã chụp)
  huy: number       // ca vừa hủy (HIS hủy chỉ định → biến mất khỏi danh sách)
  bo_qua: number    // bản ghi thiếu trường / trạng thái không xử lý
  loi: number       // số ca lỗi khi lưu
}

const CHU_KY_MIN_S = 5
const CHU_KY_MAX_S = 600            // chu kỳ trong giờ hành chính
const CHU_KY_MAC_DINH_S = 20
const NGOAI_GIO_MIN_S = 10
const NGOAI_GIO_MAX_S = 3600        // tối đa 1 giờ/lần khi ngoài giờ
const NGOAI_GIO_MAC_DINH_S = 600    // 10 phút/lần
const GIO_HC_TU_MAC_DINH = 7
const GIO_HC_DEN_MAC_DINH = 17

// Gom các trường HIS phụ của một ca → object lưu vào cột his_meta.
function metaCua(c: ChiDinhMRI): Record<string, unknown> {
  return {
    ngay_sinh: c.ngay_sinh, gioi_tinh: c.gioi_tinh, doi_tuong: c.doi_tuong,
    khoa_chi_dinh: c.khoa_chi_dinh, phong_chi_dinh: c.phong_chi_dinh,
    loai_dieu_tri: c.loai_dieu_tri, ghi_chu: c.ghi_chu,
  }
}

// Chạy đúng một vòng đồng bộ. userId dùng để ghi nhật ký (null khi chạy tự động).
export async function chayMotVong(userId: number | null = null): Promise<KetQuaVong> {
  const { tuNgay, denNgay } = khoangNgayHomNay()
  const ds = await layChiDinhMRI(tuNgay, denNgay)
  const { vao_hang, da_xong, bo_qua } = phanLoai(ds)

  let moi = 0, dong = 0, huy = 0, loi = 0
  for (const c of vao_hang) {
    try {
      const r = await themTuHIS(
        { ma_his: c.ma_his, ho_ten: c.ho_ten, ma_bn: c.ma_bn, tuoi: c.tuoi, sdt: c.sdt, ma_hh: c.ma_hh },
        null,            // ma_bs: HIS không trả mã NV bác sĩ
        c.ten_dich_vu,
        c.ten_bs,        // tên bác sĩ chỉ định (hiển thị)
        c.gio_chi_dinh,
        metaCua(c),      // trường HIS phụ → lưu JSONB his_meta cho màn điều phối
      )
      if (r.moi) moi++
      else await capNhatHisMeta(c.ma_his, metaCua(c))   // ca đã có → điền bù nếu còn thiếu
    } catch (err: any) {
      loi++; console.error('[his-pull] lỗi lưu ca', c.ma_his, ':', err.message)
    }
  }
  for (const c of da_xong) {
    try {
      if (await dongCaHIS(c.ma_his, userId)) dong++
      await capNhatHisMeta(c.ma_his, metaCua(c))   // điền bù his_meta cho ca cũ/đã đóng
    } catch (err: any) { loi++; console.error('[his-pull] lỗi đóng ca', c.ma_his, ':', err.message) }
  }

  // Đối soát hủy: ca HIS đang trong hàng mà KHÔNG còn trong danh sách kéo = đã hủy trên
  // HIS. CHỐT AN TOÀN: chỉ đối soát khi HIS trả về có dữ liệu — mảng rỗng (lỗi/glitch
  // hoặc đầu ngày chưa có ca) thì BỎ QUA vòng này, tránh hủy nhầm sạch hàng chờ.
  const conHieuLuc = maHisHieuLuc({ vao_hang, da_xong, bo_qua })
  if (conHieuLuc.length > 0) {
    try {
      // Đánh dấu "vừa thấy" TRƯỚC khi đối soát → ca kéo được lần này không bị hủy oan.
      await capNhatHisLastSeen(conHieuLuc)
      const grace = await laySettingDon('his_huy_grace_giay')
      const graceGiay = Number(grace?.gia_tri)
      huy = await dongCacCaBiHuy(conHieuLuc, userId, Number.isFinite(graceGiay) ? graceGiay : 90)
    }
    catch (err: any) { loi++; console.error('[his-pull] lỗi đối soát hủy:', err.message) }
  }

  if (moi > 0 || dong > 0 || huy > 0) phat(null)
  // Chỉ ghi nhật ký vòng CÓ thay đổi hoặc CÓ lỗi — tránh ngập log vì mỗi chu kỳ ~20s.
  // actor_id = userId (thủ công) hoặc null (poller tự động → nguồn hệ thống).
  if (moi || dong || huy || loi) {
    void ghiAudit({
      nhom: 'his', loai: 'keo_his', muc_do: loi > 0 ? 'warn' : 'info',
      boi_canh: { actor_id: userId },
      gia_tri_moi: { nhan: ds.length, moi, dong, huy, bo_qua, loi },
      mo_ta: `Kéo HIS: +${moi} mới, ${dong} đóng, ${huy} hủy${loi ? `, ${loi} lỗi` : ''}`,
    })
  }
  return { nhan: ds.length, moi, dong, huy, bo_qua, loi }
}

// Giờ hiện tại theo múi giờ Việt Nam (0–23) — để chọn chu kỳ theo khung giờ.
function gioVN(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', hour12: false, timeZone: 'Asia/Ho_Chi_Minh',
  }).formatToParts(now)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  return h === 24 ? 0 : h   // vài môi trường trả '24' lúc nửa đêm
}

function soNguyen(gt: string | null | undefined, min: number, max: number, macDinh: number): number {
  const n = Number(gt)
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : macDinh
}

// Chu kỳ gọi HIS (ms) cho vòng kế. Nếu admin bật 'his_pull_theo_khung_gio' thì trong
// giờ hành chính [tu, den) dùng chu kỳ nhanh, ngoài giờ giãn ra; tắt → đồng nhất.
// Đọc lại mỗi vòng nên đổi cấu hình/qua mốc giờ là áp ngay vòng sau.
async function chuKyMs(now: Date = new Date()): Promise<number> {
  try {
    const [bat, hcTu, hcDen, trongGio, ngoaiGio] = await Promise.all([
      laySettingDon('his_pull_theo_khung_gio'),
      laySettingDon('his_pull_gio_hc_tu'),
      laySettingDon('his_pull_gio_hc_den'),
      laySettingDon('his_pull_chu_ky_giay'),
      laySettingDon('his_pull_chu_ky_ngoai_gio_giay'),
    ])
    const sTrongGio = soNguyen(trongGio?.gia_tri, CHU_KY_MIN_S, CHU_KY_MAX_S, CHU_KY_MAC_DINH_S)
    if (bat?.gia_tri !== '1') return sTrongGio * 1000     // tắt khung giờ → chu kỳ đồng nhất

    const tu = soNguyen(hcTu?.gia_tri, 0, 23, GIO_HC_TU_MAC_DINH)
    const den = soNguyen(hcDen?.gia_tri, 1, 24, GIO_HC_DEN_MAC_DINH)
    const sNgoaiGio = soNguyen(ngoaiGio?.gia_tri, NGOAI_GIO_MIN_S, NGOAI_GIO_MAX_S, NGOAI_GIO_MAC_DINH_S)
    const h = gioVN(now)
    const trongHanhChinh = tu < den ? (h >= tu && h < den) : true  // cấu hình lạ (tu>=den) → coi như luôn trong giờ
    return (trongHanhChinh ? sTrongGio : sNgoaiGio) * 1000
  } catch { /* lỗi đọc cấu hình → dùng mặc định an toàn */ }
  return CHU_KY_MAC_DINH_S * 1000
}

let timer: NodeJS.Timeout | null = null

// Khởi động vòng lặp tự gọi. HIS_PULL_ENABLED=false → tắt (chỉ còn nút Làm mới thủ công).
export function khoiDongPoller(): void {
  if (process.env.HIS_PULL_ENABLED === 'false') {
    console.log('[his-pull] Poller TẮT (HIS_PULL_ENABLED=false). Vẫn dùng được nút "Làm mới".')
    return
  }
  const lap = async () => {
    try {
      const kq = await chayMotVong()
      if (kq.moi || kq.dong || kq.huy || kq.loi) console.log('[his-pull] vòng:', kq)
    } catch (err: any) {
      console.error('[his-pull] lỗi vòng lặp:', err.message)
      void ghiAudit({
        nhom: 'his', loai: 'loi_ket_noi', muc_do: 'error',
        mo_ta: `Lỗi vòng kéo HIS tự động: ${err.message}`,
        // Chi tiết chẩn đoán để hồi cứu: LoiHIS → status/errors/url/timeout; lỗi khác
        // (DB, lập trình…) → tên/mã/nguyên nhân/stack.
        gia_tri_moi: err instanceof LoiHIS
          ? { nguon: 'poller', ...err.chi_tiet }
          : { nguon: 'poller', loi_goc: chiTietLoi(err) },
      })
    } finally {
      timer = setTimeout(lap, await chuKyMs())
    }
  }
  console.log('[his-pull] Poller BẬT — tự gọi API HIS theo chu kỳ app_settings.his_pull_chu_ky_giay.')
  lap()
}

export function dungPoller(): void {
  if (timer) { clearTimeout(timer); timer = null }
}
