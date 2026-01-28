import React from "react"
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from 'sonner'
import { QueryProvider } from '@/providers/query-provider'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: '虹桥计划 · 前端资源配置中台',
  description: '轻量级、自部署的前端资源配置中台，专为多环境、多渠道场景设计',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: './icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: './icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: './icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: './apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`}>
        <QueryProvider>
          {children}
        </QueryProvider>
        <Toaster position="top-center" richColors />
        <Analytics />
      </body>
    </html>
  )
}
