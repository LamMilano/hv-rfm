// Router đăng nhập. App chỉ hỏi HIS "mã NV + mật khẩu đúng không?"; vai trò/phòng
// lấy từ CSDL app. Mã NV 5 chữ số → xác thực HIS; còn lại (admin/dùng chung) →
// mật khẩu nội bộ (bcrypt). Xem [[hisAuth]], [[jwt]], [[userRepo]].

import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { chuanHoaMaNV, nguonXacThuc, xacThucHIS, hisDangBat } from '../services/hisAuth'
import { timTheoMaNV, timTheoId, type UserRow } from '../repos/userRepo'
import { taoUserJIT, laySettingDon } from '../repos/configRepo'
import { kyToken } from '../auth/jwt'
import { yeuCauDangNhap } from '../auth/middleware'
import { ghiAudit, layIp } from '../repos/auditRepo'

// JIT: tự tạo tài khoản Bác sĩ khi đăng nhập HIS hợp lệ mà chưa có bản ghi. Tắt mặc
// định — admin bật ở trang Tổng quan (app_settings 'jit_tu_tao' = 'true').
async function jitTuTaoBat(): Promise<boolean> {
  try { return (await laySettingDon('jit_tu_tao'))?.gia_tri === 'true' }
  catch { return false }
}

export const authRouter = Router()

function thongTinNguoiDung(u: UserRow) {
  return { id: u.id, ho_ten: u.ho_ten, role: u.role, ma_bs: u.ma_bs, ma_nv: u.ma_nv }
}

authRouter.post('/login', async (req, res) => {
  const maNVRaw = typeof req.body?.ma_nv === 'string' ? req.body.ma_nv.trim() : ''
  const matKhau = typeof req.body?.mat_khau === 'string' ? req.body.mat_khau : ''
  if (!maNVRaw || !matKhau) {
    res.status(400).json({ error: 'Vui lòng nhập mã nhân viên và mật khẩu.' })
    return
  }

  const maNV = chuanHoaMaNV(maNVRaw)
  const nguon = nguonXacThuc(maNV)

  // Ghi vết đăng nhập thất bại (an ninh + đếm mã/mật khẩu sai). Không có actor (chưa
  // vào được) → chỉ lưu mã NV đã thử + IP. Nuốt lỗi trong ghiAudit, không chặn login.
  const ghiThatBai = (ly_do: string) =>
    ghiAudit({
      nhom: 'auth', loai: 'dang_nhap_that_bai', muc_do: 'warn',
      boi_canh: { ip: layIp(req) }, doi_tuong: `ma_nv:${maNVRaw}`, mo_ta: ly_do,
    })

  // CSDL app là nguồn chuẩn cho quyền — không có bản ghi thì không cấp vai trò.
  let user: UserRow | null
  try {
    user = await timTheoMaNV(maNV)
  } catch (err: any) {
    console.error('[auth] lỗi truy vấn user:', err.message)
    res.status(503).json({ error: 'Hệ thống tạm thời không truy cập được dữ liệu người dùng.' })
    return
  }
  // Chưa có bản ghi. Nếu là mã NV HIS và bật JIT → xác thực HIS, đúng thì tự tạo
  // tài khoản Bác sĩ rồi cho vào (admin nâng quyền sau). Ngược lại từ chối.
  let daXacThuc = false
  if (!user) {
    if (nguon === 'his' && hisDangBat() && (await jitTuTaoBat())) {
      const kq = await xacThucHIS(maNV, matKhau)
      if (!kq.ok) {
        if (kq.ly_do === 'khong_ket_noi') {
          await ghiThatBai('Không kết nối hệ tài khoản HIS (JIT)')
          res.status(503).json({ error: 'Không kết nối được hệ tài khoản bệnh viện. Vui lòng thử lại.' })
          return
        }
        await ghiThatBai('Sai mã nhân viên / mật khẩu (HIS, JIT)')
        res.status(401).json({ error: kq.thong_bao ?? 'Mã nhân viên hoặc mật khẩu không đúng.' })
        return
      }
      try {
        user = await taoUserJIT(maNV)
        daXacThuc = true
      } catch (err: any) {
        console.error('[auth] lỗi tạo user JIT:', err.message)
      }
    }
    if (!user) {
      await ghiThatBai('Tài khoản chưa được cấp quyền trong hệ thống MRI')
      res.status(401).json({ error: 'Tài khoản chưa được cấp quyền trong hệ thống MRI. Vui lòng liên hệ quản trị.' })
      return
    }
  }

  // Xác thực mật khẩu theo nguồn (bỏ qua nếu JIT đã xác thực HIS ở trên).
  if (daXacThuc) {
    // đã xác thực khi tạo JIT
  } else if (nguon === 'his') {
    if (!hisDangBat()) {
      res.status(503).json({ error: 'Chưa cấu hình kết nối hệ tài khoản bệnh viện trên server.' })
      return
    }
    const kq = await xacThucHIS(maNV, matKhau)
    if (!kq.ok) {
      if (kq.ly_do === 'khong_ket_noi') {
        await ghiThatBai('Không kết nối hệ tài khoản HIS')
        res.status(503).json({ error: 'Không kết nối được hệ tài khoản bệnh viện. Vui lòng thử lại.' })
        return
      }
      await ghiThatBai('Sai mã nhân viên / mật khẩu (HIS)')
      res.status(401).json({ error: kq.thong_bao ?? 'Mã nhân viên hoặc mật khẩu không đúng.' })
      return
    }
  } else {
    const hash = user.password_hash ?? ''
    const khop = hash ? await bcrypt.compare(matKhau, hash) : false
    if (!khop) {
      await ghiThatBai('Sai mật khẩu (nội bộ)')
      res.status(401).json({ error: 'Mã nhân viên hoặc mật khẩu không đúng.' })
      return
    }
  }

  const token = kyToken({ uid: user.id, role: user.role, ho_ten: user.ho_ten, ma_bs: user.ma_bs })
  await ghiAudit({
    nhom: 'auth', loai: 'dang_nhap',
    boi_canh: { actor_id: user.id, actor_ten: user.ho_ten, actor_role: user.role, ip: layIp(req) },
    mo_ta: `Đăng nhập thành công (${nguon})`,
  })
  res.json({ token, user: thongTinNguoiDung(user) })
})

// Lấy lại thông tin phiên (frontend gọi lúc khởi động để khôi phục đăng nhập).
authRouter.get('/me', yeuCauDangNhap, async (req, res) => {
  const u = await timTheoId(req.nguoiDung!.uid)
  if (!u) {
    res.status(401).json({ error: 'Tài khoản không còn hiệu lực.' })
    return
  }
  res.json({ user: thongTinNguoiDung(u) })
})
