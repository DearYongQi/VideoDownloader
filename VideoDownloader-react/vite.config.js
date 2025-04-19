import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path' // 如果需要解析路径别名

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      scss: {
        // 核心配置：全局自动注入 theme.scss
        additionalData: `
          @use "@/styles/theme.scss" as *; // 全局注入并启用命名空间
        `,
      }
    }
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080', // 后端接口地址
        changeOrigin: true,
        // 完全保留原始路径，不做任何重写
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true, // 启用WebSocket代理
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src') // 确保路径别名正确定义
    }
  }
})