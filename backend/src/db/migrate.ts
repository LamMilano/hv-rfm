import fs from 'fs'
import path from 'path'
import { pool } from './pool'
import dotenv from 'dotenv'

dotenv.config()

// Danh sách migration theo thứ tự. Mỗi file chạy đúng 1 lần (bảng schema_migrations).
const MIGRATIONS = [
  '001_init.sql', '002_order_bs_dichvu.sql', '003_app_settings.sql', '004_dm_mri_that.sql',
  '005_kip_truc.sql', '006_order_nguon.sql', '007_order_thoiluong.sql',
  '008_user_sdt_bo_vaitro_kip.sql', '009_his_pull_chi_dinh.sql',
  '010_bo_trang_thai_dang_chup.sql', '011_his_them_truong.sql',
  '012_uu_tien_theo_field.sql', '013_stt_ngay.sql',
  '014_giu_hang_noi_tru.sql', '015_audit_log.sql',
  '016_gio_hen_goc.sql', '017_dem_cap_cuu.sql',
  '018_sdt_lien_he_phong.sql', '019_his_pull_khung_gio.sql',
  '020_nhan_viet_tat_mau.sql', '021_his_huy_chong_nham.sql',
  '022_va_tre_da_bao_phut.sql', '023_dat_lich_hen_truoc.sql',
]

async function migrate() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        file       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    const { rows } = await client.query<{ file: string }>('SELECT file FROM schema_migrations')
    const applied = new Set(rows.map((r) => r.file))

    for (const file of MIGRATIONS) {
      if (applied.has(file)) {
        console.log(`⏭️  Migration ${file} đã chạy — bỏ qua`)
        continue
      }
      const sql = fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (file) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log(`✅ Migration ${file} xong`)
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      }
    }
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((err) => {
  console.error('❌ Migration thất bại:', err.message)
  process.exit(1)
})
