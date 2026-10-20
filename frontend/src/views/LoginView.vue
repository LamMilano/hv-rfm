<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth, trangMacDinh } from '@/stores/auth'
import { thongDiepLoi } from '@/api/client'

// Đăng nhập (§8): mã NV + mật khẩu → backend rẽ HIS (mã 5 số) / nội bộ (bcrypt).
const router = useRouter()
const route = useRoute()
const auth = useAuth()

const maNV = ref('')
const matKhau = ref('')
const loi = ref('')
const dangGui = ref(false)

async function dangNhap() {
  loi.value = ''
  if (!maNV.value || !matKhau.value) {
    loi.value = 'Vui lòng nhập mã nhân viên và mật khẩu.'
    return
  }
  dangGui.value = true
  try {
    await auth.dangNhap(maNV.value.trim(), matKhau.value)
    const next = typeof route.query.next === 'string' ? route.query.next : trangMacDinh(auth.vaiTro)
    router.replace(next)
  } catch (e) {
    loi.value = thongDiepLoi(e, 'Đăng nhập không thành công.')
  } finally {
    dangGui.value = false
  }
}
</script>

<template>
  <div class="h-screen flex items-center justify-center bg-[#eef1f5] px-4">
    <div class="w-full max-w-[380px] bg-white rounded-2xl border border-[#d6dde6] shadow-sm p-8">
      <div class="flex flex-col items-center gap-3 mb-6">
        <div class="w-16 h-16 rounded-xl bg-white border border-slate-200 p-1.5 flex items-center justify-center">
          <img src="/logo-bvhv.jpg" alt="BVĐK Hùng Vương" class="w-full h-full object-contain" />
        </div>
        <div class="text-center">
          <div class="text-2xl font-extrabold tracking-tight text-[#1366b1]">HV-RFM</div>
          <div class="text-sm font-semibold text-slate-800">Hệ thống điều phối hàng chờ</div>
          <div class="text-xs text-slate-500 mt-0.5">Bệnh viện Đa khoa Hùng Vương</div>
        </div>
      </div>

      <form @submit.prevent="dangNhap" class="flex flex-col gap-3">
        <label class="text-[13px] font-semibold text-slate-700">
          Mã nhân viên
          <input v-model="maNV" type="text" autocomplete="username" :disabled="dangGui"
                 class="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-hv disabled:bg-slate-50" />
        </label>
        <label class="text-[13px] font-semibold text-slate-700">
          Mật khẩu
          <input v-model="matKhau" type="password" autocomplete="current-password" :disabled="dangGui"
                 class="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-hv disabled:bg-slate-50" />
        </label>
        <p v-if="loi" class="text-[13px] text-rose-600 font-medium">{{ loi }}</p>
        <button type="submit" :disabled="dangGui"
                class="mt-1 bg-hv text-white font-bold rounded-lg py-2.5 text-[14px] hover:bg-hv-dark disabled:opacity-60">
          {{ dangGui ? 'Đang đăng nhập…' : 'Đăng nhập' }}
        </button>
      </form>

      <p class="mt-5 text-center text-[11px] text-slate-400">Phát triển bởi Nguyễn Thành Lâm</p>
    </div>
  </div>
</template>
