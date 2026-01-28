/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
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
