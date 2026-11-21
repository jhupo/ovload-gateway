/// <reference types="vitest/config" />
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { playwright } from '@vitest/browser-playwright'
import { readFileSync } from 'node:fs'

const tlsDirectory = process.env.OVLOAD_DEV_TLS_DIRECTORY
const backend = 'http://127.0.0.1:8080'

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: '127.0.0.1',
    https: tlsDirectory
      ? {
          key: readFileSync(path.join(tlsDirectory, 'localhost.key')),
          cert: readFileSync(path.join(tlsDirectory, 'localhost.crt')),
        }
      : undefined,
    proxy: {
      '/api': { target: backend, changeOrigin: false, ws: true },
      '/v1': { target: backend, changeOrigin: false, ws: true },
    },
  },
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['@radix-ui/react-switch', 'motion/react'],
  },
  test: {
    silent: 'passed-only',
    unstubEnvs: true,
    setupFiles: ['./src/test-utils/setup.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
    coverage: {
      // include: ['src/**/*.{js,jsx,ts,tsx}'], // Uncomment to expand the report to all src/**/* so untested modules appear as 0% coverage.
      exclude: [
        'src/components/ui/**',
        'src/assets/**',
        'src/tanstack-table.d.ts',
        'src/routeTree.gen.ts',
        'src/test-utils/**',
        'src/routes/**',
      ],
    },
  },
})
