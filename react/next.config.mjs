/** @type {import('next').NextConfig} */
const nextConfig = {
  // 仅在 BUILD_MODE=export 时启用静态导出，开发模式使用默认 SSR 服务器
  output: process.env.BUILD_MODE === 'export' ? 'export' : undefined,
  // BASE_PATH 从环境变量读取，构建时注入
  // 默认值为 'rainbow-bridge'，可通过 NEXT_PUBLIC_BASE_PATH 环境变量覆盖
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ,
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
