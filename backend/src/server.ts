import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'

import { validateEnv } from './config'
import { authRouter } from './routes/auth'
import { hangDoiRouter } from './routes/hangDoi'
import { hisRouter } from './routes/his'
import { configRouter } from './routes/config'
import { streamRouter } from './routes/stream'
import { khoiDongPoller } from './services/hisPoller'
import { capNhatTatCaPhong } from './repos/orderRepo'

validateEnv() // fail-fast: thiếu biến bắt buộc → dừng ở production, cảnh báo ở dev

const app = express()
const PORT = Number(process.env.PORT ?? 3003)

// Sau Nginx cùng máy: tin X-Forwarded-For CHỈ khi request đến từ loopback.
app.set('trust proxy', 'loopback')
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : '*',
  credentials: true,
}))
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))

// ── API Routes ───────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0', service: 'mri-waitlist-backend' })
})

app.use('/api/auth', authRouter)
app.use('/api/hang-doi', hangDoiRouter)
app.use('/api/his', hisRouter)
app.use('/api/config', configRouter)
app.use('/api/stream', streamRouter)

// /api/* không khớp → 404 JSON (tránh rơi vào SPA fallback trả HTML che lỗi).
app.use('/api', (_req, res) => { res.status(404).json({ error: 'Không tìm thấy endpoint' }) })

// ── Serve frontend (production) ──────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../../frontend/dist')
  // /assets/* có hash trong tên → cache lâu dài; index.html luôn phải lấy bản mới để sau
  // mỗi lần deploy trình duyệt không còn trỏ tới chunk cũ đã bị xoá.
  app.use(
    express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        } else {
          res.setHeader('Cache-Control', 'no-cache')
        }
      },
    }),
  )
  // Asset không tồn tại (chunk của bản build cũ) → 404 thật, KHÔNG trả index.html.
  app.use('/assets', (_req, res) => res.status(404).end())
  app.use((_req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`[MRI] Backend chạy ở cổng ${PORT} (${process.env.NODE_ENV ?? 'development'})`)
  // Điền giờ hẹn cho hàng chờ hiện có (trước mutation đầu tiên). Lỗi không chặn khởi động.
  capNhatTatCaPhong()
    .then(() => console.log('[MRI] Đã tính lại giờ hẹn các phòng lúc khởi động'))
    .catch((err) => console.error('[MRI] Lỗi tính giờ hẹn lúc khởi động:', err.message))
  khoiDongPoller() // tự gọi API HIS lấy chỉ định MRI theo chu kỳ
})

export default app
