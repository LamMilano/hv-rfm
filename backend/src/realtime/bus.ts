// Kênh phát sự kiện thay đổi hàng đợi trong tiến trình. Mọi mutation (gọi số, đổi
// thứ tự, HIS push…) phát 1 sự kiện; SSE đẩy cho client để refetch phòng liên quan.
// Đủ cho quy mô 2 phòng / vài chục màn hình. Nhiều tiến trình (scale ngang) sẽ thay
// bằng Postgres LISTEN/NOTIFY hoặc Redis — đổi ở đây, không đụng route.

import { EventEmitter } from 'events'

export interface SuKienHangDoi {
  loai: 'hang-doi-thay-doi'
  room_id: number | null   // null = ảnh hưởng nhiều phòng / cấu hình → client refetch tất cả
  luc: string              // ISO timestamp
}

const bus = new EventEmitter()
bus.setMaxListeners(200) // nhiều TV/màn hình cùng nghe

const TEN_SU_KIEN = 'hang-doi'

export function phat(room_id: number | null): void {
  const sk: SuKienHangDoi = { loai: 'hang-doi-thay-doi', room_id, luc: new Date().toISOString() }
  bus.emit(TEN_SU_KIEN, sk)
}

export function nghe(handler: (sk: SuKienHangDoi) => void): () => void {
  bus.on(TEN_SU_KIEN, handler)
  return () => bus.off(TEN_SU_KIEN, handler)
}
