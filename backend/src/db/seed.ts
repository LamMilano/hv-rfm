import { pool, query } from './pool'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'

dotenv.config()

// Seed dữ liệu nền tối thiểu để chạy & demo: 2 phòng, vài tuyến mã HH, nhóm ưu
// tiên ≥75t, 1 tài khoản admin nội bộ (lối vào dự phòng). Idempotent qua ON CONFLICT.
async function seed() {
  try {
    // 2 phòng MRI
    await query(`
      INSERT INTO rooms (ma_phong, ten) VALUES
        ('MRI1', 'Phòng 1.5T'),
        ('MRI2', 'Phòng 0.4T')
      ON CONFLICT (ma_phong) DO NOTHING
    `)

    // Nhóm ưu tiên gợi ý
    await query(`
      INSERT INTO priority_types (ma, ten, quy_tac_goi_y, thu_tu) VALUES
        ('cap_cuu',  'Cấp cứu',      'phong ~ "cap cuu"', 10),
        ('cao_tuoi', 'Ưu tiên ≥75t', 'tuoi >= 75',        20)
      ON CONFLICT (ma) DO NOTHING
    `)

    // Tuyến mã HH: danh mục thật nạp ở migration 004_dm_mri_that.sql (không seed demo).

    // Tài khoản admin nội bộ (lối vào dự phòng — §8). Mật khẩu demo: 'admin123'.
    const hash = await bcrypt.hash('admin123', 10)
    await query(
      `INSERT INTO users (ma_nv, ho_ten, role, nguon_xac_thuc, password_hash)
       VALUES ('admin', 'Quản trị hệ thống', 'admin', 'noi_bo', $1)
       ON CONFLICT (ma_nv) WHERE ma_nv IS NOT NULL DO NOTHING`,
      [hash],
    )

    console.log('✅ Seed xong: 2 phòng, 2 nhóm ưu tiên, 1 admin nội bộ (admin/admin123)')
  } finally {
    await pool.end()
  }
}

seed().catch((err) => {
  console.error('❌ Seed thất bại:', err.message)
  process.exit(1)
})
