/** @type {import('next').NextConfig} */
const nextConfig = {
  // 仅在 BUILD_MODE=export 时启用静态导出，开发模式使用默认 SSR 服务器
  output: process.env.BUILD_MODE === 'export' ? 'export' : undefined,
  // 统一使用 /rainbow-bridge 作为 basePath，与后端配置保持一致
  basePath: '/rainbow-bridge',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // 允许的开发源，修复跨域警告
  experimental: {
    allowedDevOrigins: [
      '10.10.30.155:3000',
      'http://10.10.30.155:3000',
    ],
  },
}

export default nextConfig
