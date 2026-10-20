// SSE realtime: đẩy sự kiện "hàng đợi thay đổi" cho mọi màn hình đang mở để chúng
// refetch. EventSource không gắn được header Authorization nên token truyền qua
// query ?token= (vẫn là JWT đã ký). Có heartbeat giữ kết nối qua Nginx. Xem [[bus]].

import { Router } from 'express'
import { giaiToken } from '../auth/jwt'
import { nghe } from '../realtime/bus'

export const streamRouter = Router()

const NHIP_MS = 25_000 // heartbeat < timeout mặc định của proxy

streamRouter.get('/', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : ''
  if (!giaiToken(token)) { res.status(401).json({ error: 'Phiên không hợp lệ.' }); return }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Nginx: không đệm SSE
  })
  res.write('retry: 3000\n\n')
  res.write(': ket-noi\n\n')

  const huyNghe = nghe((sk) => {
    res.write(`event: hang-doi\ndata: ${JSON.stringify(sk)}\n\n`)
  })
  const nhip = setInterval(() => res.write(': nhip\n\n'), NHIP_MS)

  req.on('close', () => { clearInterval(nhip); huyNghe(); res.end() })
})
