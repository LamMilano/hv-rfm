import { onMounted, onBeforeUnmount } from 'vue'
import { KHOA_TOKEN } from '@/api/client'

// Nghe SSE realtime. EventSource không gắn được header nên token truyền qua query.
// Trình duyệt tự kết nối lại khi rớt. Gọi onThayDoi mỗi khi hàng đợi đổi để refetch.
export function useStream(onThayDoi: (roomId: number | null) => void) {
  let es: EventSource | null = null

  function moKetNoi() {
    const token = localStorage.getItem(KHOA_TOKEN)
    if (!token) return
    es = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`)
    es.addEventListener('hang-doi', (ev) => {
      try {
        const sk = JSON.parse((ev as MessageEvent).data)
        onThayDoi(sk.room_id ?? null)
      } catch {
        onThayDoi(null)
      }
    })
  }

  onMounted(moKetNoi)
  onBeforeUnmount(() => { es?.close(); es = null })

  return { dong: () => { es?.close(); es = null } }
}
