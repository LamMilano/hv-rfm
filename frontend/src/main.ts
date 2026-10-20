import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { dangKyKhiHetPhien } from './api/client'
import { useAuth } from './stores/auth'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// Phiên hết hạn (API trả 401) → đăng xuất và đưa về trang đăng nhập.
dangKyKhiHetPhien(() => {
  useAuth().dangXuat()
  if (router.currentRoute.value.name !== 'login') router.push({ name: 'login' })
})

app.mount('#app')
