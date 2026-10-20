// Gói các lời gọi API theo nhóm, trả dữ liệu đã bóc .data. UI/store chỉ dùng tầng này.
import { api } from './client'
import type { NguoiDung, Order, Room, HanhDong, KipTruc, DuBaoPhong } from '@/types'

export interface KetQuaDangNhap { token: string; user: NguoiDung }
export interface AnhChupHangDoi {
  rooms: Room[]; orders: Order[]; hoan_thanh: Order[]
  kip_truc: KipTruc[]; his_cuoi: string | null; du_bao?: DuBaoPhong[]
  cot_chinh?: string[]   // cột chính màn điều phối (cấu hình admin)
}
export interface OrderThuCong {
  ho_ten: string; tuoi: number | null; sdt: string | null
  room_id: number | null; ten_dich_vu: string | null; ma_bs: string | null; ma_hh: string | null
  thoi_luong_phut: number | null
}
export interface OrderDatTruoc {
  ho_ten: string; tuoi: number | null; sdt: string; ma_bn: string | null
  room_id: number; ten_dich_vu: string | null; ma_hh: string | null; ma_bs: string | null
  gio_hen: string   // ISO 8601
}
export interface KipTrucNhap { ho_ten: string; sdt: string | null }
export interface KtvChon { ho_ten: string; sdt: string | null }

export const apiAuth = {
  dangNhap: (ma_nv: string, mat_khau: string) =>
    api.post<KetQuaDangNhap>('/auth/login', { ma_nv, mat_khau }).then((r) => r.data),
  toiLaAi: () => api.get<{ user: NguoiDung }>('/auth/me').then((r) => r.data.user),
}

export const apiHangDoi = {
  tai: () => api.get<AnhChupHangDoi>('/hang-doi').then((r) => r.data),
  theoNgay: (ngay: string) =>
    api.get<{ rooms: Room[]; orders: Order[] }>('/hang-doi/theo-ngay', { params: { ngay } }).then((r) => r.data),
  hanhDong: (id: number, hanh_dong: HanhDong) =>
    api.post(`/hang-doi/${id}/hanh-dong`, { hanh_dong }).then((r) => r.data),
  sapXep: (room_id: number, ids: number[]) =>
    api.post('/hang-doi/sap-xep', { room_id, ids }).then((r) => r.data),
  gioHen: (id: number, gio_hen: string | null) =>
    api.post(`/hang-doi/${id}/gio-hen`, { gio_hen }).then((r) => r.data),
  chuyenPhong: (id: number, room_id: number) =>
    api.post(`/hang-doi/${id}/chuyen-phong`, { room_id }).then((r) => r.data),
  vaoHang: (id: number, room_id: number) =>
    api.post(`/hang-doi/${id}/vao-hang`, { room_id }).then((r) => r.data),
  roiHang: (id: number) =>
    api.post(`/hang-doi/${id}/roi-hang`, {}).then((r) => r.data),
  uuTien: (id: number, priority_type_id: number | null) =>
    api.post(`/hang-doi/${id}/uu-tien`, { priority_type_id }).then((r) => r.data),
  themThuCong: (d: OrderThuCong) =>
    api.post('/hang-doi/thu-cong', d).then((r) => r.data),
  datTruoc: (d: OrderDatTruoc) =>
    api.post('/hang-doi/dat-truoc', d).then((r) => r.data),
  ghep: (id: number, his_id: number) =>
    api.post(`/hang-doi/${id}/ghep`, { his_id }).then((r) => r.data),
  deRieng: (id: number) =>
    api.post(`/hang-doi/${id}/de-rieng`, {}).then((r) => r.data),
  dsKtv: () => api.get<{ ds_ktv: KtvChon[] }>('/hang-doi/ds-ktv').then((r) => r.data.ds_ktv),
  luuKip: (kip: KipTrucNhap[]) =>
    api.put('/hang-doi/kip-truc', { kip }).then((r) => r.data),
}

export interface KetQuaLamMoiHIS { nhan: number; moi: number; dong: number; huy: number; bo_qua: number; loi: number }

// Kéo chỉ định MRI từ HIS thủ công (nút "Làm mới"). Poller nền vẫn tự chạy theo chu kỳ.
export const apiHis = {
  lamMoi: () => api.post<KetQuaLamMoiHIS>('/his/lam-moi').then((r) => r.data),
}

export interface CauHinh {
  rooms: Room[]
  hh_routing: { ma_hh: string; room_id: number; ten_phong: string; thoi_luong_phut: number; mo_ta: string | null }[]
  priority_types: { id: number; ma: string; ten: string; viet_tat: string | null; mau: string | null; quy_tac_goi_y: string | null; thu_tu: number; active: boolean }[]
  users: { id: number; ma_nv: string | null; ho_ten: string; sdt: string | null; role: string; ma_bs: string | null; nguon_xac_thuc: string; active: boolean }[]
  settings: Record<string, string | null>
  hh_chua_cau_hinh: { ma_hh: string; ten_dich_vu: string | null; so_ca: number }[]
}

export interface KhoaHRM { makhoa: string; tenkhoa: string }
export interface NhanVienHRM { ma_nv: string; ho_ten: string; makhoa: string | null; tenkhoa: string | null; chuc_danh: string | null }

export const apiConfig = {
  tai: () => api.get<CauHinh>('/config').then((r) => r.data),
  luuHhRouting: (d: { ma_hh: string; room_id: number; thoi_luong_phut: number; mo_ta: string | null }) =>
    api.put('/config/hh-routing', d).then((r) => r.data as { ok: boolean; da_xep: number }),
  xoaHhRouting: (ma_hh: string) => api.delete(`/config/hh-routing/${encodeURIComponent(ma_hh)}`).then((r) => r.data),
  luuPriorityType: (d: { ma: string; ten: string; viet_tat: string | null; mau: string | null; quy_tac_goi_y: string | null; thu_tu: number }) =>
    api.put('/config/priority-types', d).then((r) => r.data),
  taoUser: (d: Record<string, unknown>) => api.post('/config/users', d).then((r) => r.data),
  taoNhieuUser: (users: { ma_nv: string; ho_ten: string; role: string; ma_bs: string | null }[]) =>
    api.post<{ ok: boolean; tao_moi: number; bo_qua: number }>('/config/users/bulk', { users }).then((r) => r.data),
  capNhatUser: (id: number, d: { role?: string; sdt?: string | null; ma_bs?: string | null; active?: boolean }) =>
    api.patch(`/config/users/${id}`, d).then((r) => r.data),
  datTrangThaiUser: (id: number, active: boolean) => api.patch(`/config/users/${id}`, { active }).then((r) => r.data),
  // Hệ nhân sự bệnh viện (apihrm) — nguồn tạo tài khoản hàng loạt.
  hrmTrangThai: () => api.get<{ co_tai_khoan_dich_vu: boolean }>('/config/hrm/trang-thai').then((r) => r.data),
  hrmKetNoi: (d: { ma_nv?: string; mat_khau?: string }) =>
    api.post<{ khoa: KhoaHRM[] }>('/config/hrm/ket-noi', d).then((r) => r.data),
  hrmNhanVien: (loc: { makhoa?: string; tu_khoa?: string }) =>
    api.get<{ nhan_vien: NhanVienHRM[] }>('/config/hrm/nhan-vien', { params: loc }).then((r) => r.data),
  luuSetting: (khoa: string, gia_tri: string) => api.put('/config/settings', { khoa, gia_tri }).then((r) => r.data),
  taiDashboard: () => api.get<ThongKeAdmin>('/config/dashboard').then((r) => r.data),
  taiThongKe: (tu_ngay: string, den_ngay: string) =>
    api.get<ThongKeVanHanh>('/config/thong-ke', { params: { tu_ngay, den_ngay } }).then((r) => r.data),
  taiChiTietThongKe: (loai: LoaiChiTiet, tu_ngay: string, den_ngay: string, khoa?: string | null) =>
    api.get<KetQuaChiTiet>('/config/thong-ke/chi-tiet', {
      params: { loai, tu_ngay, den_ngay, ...(khoa ? { khoa } : {}) },
    }).then((r) => r.data),
  taiNhatKy: (loc: LocNhatKy) =>
    api.get<KetQuaNhatKy>('/config/nhat-ky', { params: loc }).then((r) => r.data),
}

// ── Thống kê vận hành & hiệu quả (trang Thống kê) ────────────────────────────
export interface ThongKeVanHanh {
  khoang: { tu_ngay: string; den_ngay: string }
  ca: { tiep_nhan: number; hoan_thanh: number; huy: number; qua_luot: number; goi_lai: number }
  nguon: { his: number; thu_cong: number }
  thoi_gian: { cho_tb: number | null; chup_tb: number | null; tre_hen_tb: number | null }
  sua_gio_tay: { so_ca_sua: number; tong_ca: number; so_lan_doi_gio: number }
  theo_phong: { ten: string; hoan_thanh: number; cho_tb: number | null }[]
  theo_ktv: { ho_ten: string; hoan_thanh: number; goi: number; doi_gio: number }[]
  theo_nhom_uu_tien: { ten: string; so_ca: number; cho_tb: number | null }[]
  cap_cuu: { tong: number; chen: number; theo_gio: { gio: number; so_ca: number }[] }
  cham_hen: {
    tb: number | null; p90: number | null; max: number | null
    theo_ngay: { ngay: string; cham_tb: number | null; so_ca: number }[]
  }
}

// Chi tiết một chỉ số (nút "Chi tiết" trên trang Thống kê) — mỗi dòng một ca/sự kiện.
export type LoaiChiTiet =
  | 'tiep_nhan' | 'hoan_thanh' | 'huy' | 'qua_luot' | 'thoi_gian' | 'nguon' | 'sua_gio'
  | 'phong' | 'nhom' | 'cap_cuu' | 'cham' | 'ktv'
export interface DongChiTiet {
  id: number; stt_ngay: number | null; ma_bn: string | null; ho_ten: string; tuoi: number | null
  ten_dich_vu: string | null; status: string; nguon: string; phong: string | null; nhom: string | null
  tao_luc: string; gio_hen: string | null; gio_hen_goc: string | null
  lan_goi_dau: string | null; luc_xong: string | null
  cho_phut: number | null; chup_phut: number | null; lech_hen_phut: number | null
  cham_phut: number | null; so_doi_gio: number; gio_hen_thu_cong: boolean; chen: number
  su_kien_luc: string | null; su_kien_loai: string | null; nguoi: string | null
  ly_do: string | null; gia_tri_cu: string | null; gia_tri_moi: string | null
}
export interface KetQuaChiTiet { dong: DongChiTiet[]; tong: number; gioi_han: number }

// ── Nhật ký hệ thống (trang Nhật ký) ─────────────────────────────────────────
export interface LocNhatKy {
  nhom?: string; loai?: string; muc_do?: string
  tu_ngay?: string; den_ngay?: string; limit?: number; offset?: number
}
export interface DongNhatKy {
  id: number; thoi_diem: string; nhom: string; loai: string; muc_do: string
  actor_id: number | null; actor_ten: string | null; actor_role: string | null; ip: string | null
  doi_tuong: string | null; gia_tri_cu: unknown; gia_tri_moi: unknown; mo_ta: string | null
}
export interface KetQuaNhatKy { dong: DongNhatKy[]; tong: number }

export interface ThongKeAdmin {
  ca_hom_nay: number
  dang_cho: number
  dang_phuc_vu: number
  da_chup_hom_nay: number
  his_cuoi: string | null
  theo_phong: { id: number; ten: string; dang_cho: number; dang_phuc_vu: number }[]
  so_user: Record<string, number>
  tong_user: number
  his_bat: boolean
  jit_tu_tao: boolean
  gio_server: string
}
