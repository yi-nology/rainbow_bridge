import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import http from 'node:http'

const agent = new http.Agent({
  family: 6,
})

const basePath = process.env.BASE_PATH || '/rainbow-bridge/'
const normalizedBasePath = basePath.replace(/\/$/, '')

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  base: basePath,
  build: {
    outDir: '../pkg/static/web',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      [`${normalizedBasePath}/api`]: {
        target: 'http://[::1]:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(normalizedBasePath, ''),
        secure: false,
        agent,
      },
    },
  },
})
