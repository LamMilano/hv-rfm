// Xác thực qua hệ tài khoản bệnh viện ("apihrm" / My HungVuong). App chỉ hỏi hệ
// kia đúng một câu: "mã NV + mật khẩu này có đúng không?". Vai trò / phòng / quyền
// đều của app (CSDL app là nguồn chuẩn) — mọi thứ khác HRM trả về (token, role) bỏ.
//
// POST {manv, passwordHash} (passwordHash là mật khẩu THƯỜNG — tên trường đặt vậy),
// trả {success, code, message}. Mã lỗi để nói rõ vì sao trượt.
// Phỏng theo HV-MRM/hisAuth.ts (đã kiểm chứng), rút gọn cho phạm vi MRI.

export type KetQuaHIS =
  | { ok: true }
  | { ok: false; ly_do: 'sai_thong_tin' | 'khong_ket_noi'; thong_bao?: string }

const TIMEOUT_MS = 8000

// Lý do trượt người dùng tự xử được — nói thẳng, đừng gộp vào "sai mật khẩu".
const THONG_BAO_THEO_MA: Record<string, string> = {
  PASSWORD_EXPIRED: 'Mật khẩu đã hết hạn. Vui lòng đổi mật khẩu trên ứng dụng My HungVuong rồi đăng nhập lại.',
  USER_LOCKED: 'Tài khoản đã bị khóa trên hệ thống tài khoản bệnh viện. Vui lòng liên hệ phòng CNTT.',
  USER_NOT_FOUND: 'Mã nhân viên này chưa có trên hệ thống tài khoản bệnh viện. Vui lòng liên hệ phòng CNTT.',
}

// Mã NV đúng 5 chữ số → xác thực qua HIS. Còn lại (admin, tài khoản dùng chung)
// → mật khẩu nội bộ (bcrypt).
export function nguonXacThuc(maNV: string | null | undefined): 'his' | 'noi_bo' {
  return maNV && /^\d{5}$/.test(maNV) ? 'his' : 'noi_bo'
}

// Người dùng gõ "101" thay vì "00101" vẫn tra ra đúng tài khoản.
export function chuanHoaMaNV(s: string): string {
  return /^\d{1,5}$/.test(s) ? s.padStart(5, '0') : s
}

export function hisDangBat(): boolean {
  return process.env.HIS_AUTH_ENABLED !== 'false' && !!process.env.HIS_AUTH_URL
}

// Đọc phản hồi HIS thành kết quả xác thực (hàm thuần — có unit test).
// Phân biệt rõ "trả lời là sai" với "không nhận được trả lời".
export function docKetQuaHIS(status: number, body: unknown): KetQuaHIS {
  if (status >= 500) return { ok: false, ly_do: 'khong_ket_noi' }
  const data = body as { success?: boolean; code?: string } | null
  if (status === 200 && data?.success === true) return { ok: true }
  const thong_bao = data?.code ? THONG_BAO_THEO_MA[data.code.toUpperCase()] : undefined
  return thong_bao
    ? { ok: false, ly_do: 'sai_thong_tin', thong_bao }
    : { ok: false, ly_do: 'sai_thong_tin' }
}

export async function xacThucHIS(maNV: string, matKhau: string): Promise<KetQuaHIS> {
  const url = process.env.HIS_AUTH_URL
  if (!url) return { ok: false, ly_do: 'khong_ket_noi' }

  const ctrl = setTimeoutController()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manv: maNV, passwordHash: matKhau }),
      signal: ctrl.signal,
    })
    const body = await res.json().catch(() => null)
    return docKetQuaHIS(res.status, body)
  } catch (err: any) {
    // Không log mật khẩu — chỉ log lý do kết nối.
    console.error('[his-auth] không gọi được hệ tài khoản nội bộ:', err.message)
    return { ok: false, ly_do: 'khong_ket_noi' }
  } finally {
    ctrl.clear()
  }
}

function setTimeoutController() {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) }
}
