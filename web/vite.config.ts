import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: { '/healthz': process.env.OVLOAD_DEV_API ?? 'http://127.0.0.1:8080' },
  },
})
