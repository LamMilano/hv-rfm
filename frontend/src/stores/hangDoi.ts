import { defineStore } from 'pinia'
import { apiHangDoi, type OrderThuCong, type OrderDatTruoc, type KipTrucNhap } from '@/api/endpoints'
import { thongDiepLoi } from '@/api/client'
import type { Order, Room, HanhDong, KipTruc, DuBaoPhong } from '@/types'
import { COT_CHINH_MAC_DINH } from '@/types'

// Nguồn dữ liệu hàng đợi dùng chung. Mọi màn hình vận hành đọc từ đây; SSE gọi tai()
// để làm mới. Thao tác ghi gọi API rồi tai() lại ngay (phản hồi nhanh, không chờ SSE).
export const useHangDoi = defineStore('hangDoi', {
  state: () => ({
    rooms: [] as Room[],
    orders: [] as Order[],
    hoanThanh: [] as Order[],
    kipTruc: [] as KipTruc[],
    duBao: [] as DuBaoPhong[],
    cotChinh: COT_CHINH_MAC_DINH as string[],
    hisCuoi: null as string | null,
    dangTai: false,
    daTaiLanDau: false,
    loi: '' as string,
    capNhatLuc: '' as string,
  }),
  getters: {
    // Ca đang chờ mà mã HH chưa có trong cấu hình → không xếp được phòng/số.
    // Bỏ ca hàng GIỮ (nội trú): chúng cố ý chưa xếp, không phải lỗi cấu hình.
    chuaXep: (s) => s.orders.filter((o) => o.chua_xep && o.status === 'cho' && !o.giu_hang),
  },
  actions: {
    async tai() {
      this.dangTai = true
      try {
        const d = await apiHangDoi.tai()
        this.rooms = d.rooms
        this.orders = d.orders
        this.hoanThanh = d.hoan_thanh
        this.kipTruc = d.kip_truc ?? []
        this.duBao = d.du_bao ?? []
        this.cotChinh = d.cot_chinh?.length ? d.cot_chinh : COT_CHINH_MAC_DINH
        this.hisCuoi = d.his_cuoi ?? null
        this.loi = ''
        this.capNhatLuc = new Intl.DateTimeFormat('vi-VN', {
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }).format(new Date())
      } catch (e) {
        this.loi = thongDiepLoi(e, 'Không tải được hàng đợi.')
      } finally {
        this.dangTai = false
        this.daTaiLanDau = true
      }
    },
    async hanhDong(id: number, hd: HanhDong) {
      await apiHangDoi.hanhDong(id, hd); await this.tai()
    },
    async sapXep(room_id: number, ids: number[]) {
      await apiHangDoi.sapXep(room_id, ids); await this.tai()
    },
    async gioHen(id: number, gio_hen: string | null) {
      await apiHangDoi.gioHen(id, gio_hen); await this.tai()
    },
    async chuyenPhong(id: number, room_id: number) {
      await apiHangDoi.chuyenPhong(id, room_id); await this.tai()
    },
    async vaoHang(id: number, room_id: number) {
      await apiHangDoi.vaoHang(id, room_id); await this.tai()
    },
    async roiHang(id: number) {
      await apiHangDoi.roiHang(id); await this.tai()
    },
    async uuTien(id: number, priority_type_id: number | null) {
      await apiHangDoi.uuTien(id, priority_type_id); await this.tai()
    },
    async themThuCong(d: OrderThuCong) {
      await apiHangDoi.themThuCong(d); await this.tai()
    },
    async datTruoc(d: OrderDatTruoc) {
      await apiHangDoi.datTruoc(d); await this.tai()
    },
    async ghep(id: number, his_id: number) {
      await apiHangDoi.ghep(id, his_id); await this.tai()
    },
    async deRieng(id: number) {
      await apiHangDoi.deRieng(id); await this.tai()
    },
    async luuKip(kip: KipTrucNhap[]) {
      await apiHangDoi.luuKip(kip); await this.tai()
    },
  },
})
