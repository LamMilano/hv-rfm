// ════════════════════════════════════════════════════════════════════════════
// Kiểm cấu hình môi trường lúc khởi động (fail-fast). Mọi secret đọc từ .env,
// KHÔNG hardcode. Theo quy ước HV-MRM (config.ts là nơi duy nhất đọc biến nhạy cảm).
// ════════════════════════════════════════════════════════════════════════════

interface EnvIssue { bien: string; muc: 'loi' | 'canh_bao'; thong_diep: string }

function kiemTra(): EnvIssue[] {
  const out: EnvIssue[] = []
  const batBuoc = (k: string, msg: string) => { if (!process.env[k]) out.push({ bien: k, muc: 'loi', thong_diep: msg }) }
  const nen = (k: string, msg: string) => { if (!process.env[k]) out.push({ bien: k, muc: 'canh_bao', thong_diep: msg }) }

  batBuoc('DATABASE_URL', 'Không có kết nối DB — hệ thống không chạy được')
  batBuoc('JWT_SECRET', 'Thiếu khóa ký JWT — đăng nhập không an toàn')
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    out.push({ bien: 'JWT_SECRET', muc: 'canh_bao', thong_diep: 'JWT_SECRET quá ngắn (<32 ký tự) — nên dùng chuỗi ngẫu nhiên dài' })
  }

  nen('HIS_PUSH_API_KEY', 'Chưa đặt khóa HIS push — endpoint /api/his/orders sẽ từ chối mọi request')
  nen('ZALO_HUB_KEY', 'Chưa cấu hình Zalo — thông báo Zalo sẽ TẮT')

  return out
}

// Gọi một lần lúc boot. Production thiếu biến bắt buộc → DỪNG (exit 1);
// dev chỉ cảnh báo để chạy được phần không cần DB.
export function validateEnv(): void {
  const issues = kiemTra()
  for (const c of issues.filter((i) => i.muc === 'canh_bao')) {
    console.warn(`[env] ⚠️  ${c.bien}: ${c.thong_diep}`)
  }
  const loi = issues.filter((i) => i.muc === 'loi')
  if (loi.length) {
    for (const l of loi) console.error(`[env] ❌ ${l.bien}: ${l.thong_diep}`)
    if (process.env.NODE_ENV === 'production') {
      console.error('[env] Dừng khởi động do thiếu cấu hình bắt buộc. Kiểm tra .env trên server.')
      process.exit(1)
    }
  }
}
