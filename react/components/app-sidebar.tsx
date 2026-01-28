"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Settings, Github, Database, Layers, ArrowRightLeft, Info, ExternalLink,Import } from "lucide-react"
import { cn } from "@/lib/utils"
import { useVersion, useLatestRelease } from "@/hooks/use-version"
import { Badge } from "@/components/ui/badge"

const navItems = [
  {
    title: "项目概览",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    title: "配置管理",
    href: "/config",
    icon: Settings,
  },
  {
    title: "环境管理",
    href: "/environments",
    icon: Layers,
  },
  {
    title: "资源管理",
    href: "/resources",
    icon: Database,
  },
  {
    title: "配置迁移",
    href: "/migration",
    icon: ArrowRightLeft,
  },
  {
    title: "导入导出",
    href: "/import-export",
    icon: Import,
  },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { data: versionInfo } = useVersion()
  const { data: latestRelease } = useLatestRelease()

  // 比较版本号，判断是否有新版本
  const hasNewVersion = () => {
    if (!versionInfo?.version || !latestRelease?.tag_name) return false
    // 简单的字符串比较，如果不相等且最新版本不是预发布版本
    return versionInfo.version !== latestRelease.tag_name && !latestRelease.prerelease
  }

  return (
    <aside className="w-64 min-h-screen border-r border-border bg-sidebar flex flex-col">
      <div className="p-6 border-b border-sidebar-border">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-rose-500 via-amber-500 to-emerald-500 flex items-center justify-center">
            <span className="text-white font-bold text-lg">R</span>
          </div>
          <div>
            <h1 className="font-semibold text-sidebar-foreground">虹桥计划</h1>
            <p className="text-xs text-muted-foreground">Rainbow Bridge</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.title}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* 版本信息 */}
      <div className="p-4 border-t border-sidebar-border space-y-3">
        {/* 当前版本 */}
        {versionInfo && (
          <div className="px-3 py-2 rounded-lg bg-sidebar-accent/50">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">当前版本</span>
              </div>
              <Badge variant="secondary" className="text-xs font-mono">
                {versionInfo.version}
              </Badge>
            </div>
            <div className="text-[10px] text-muted-foreground space-y-0.5">
              <div className="truncate" title={versionInfo.git_commit}>
                Commit: {versionInfo.git_commit.substring(0, 7)}
              </div>
              <div className="truncate" title={versionInfo.build_time}>
                Build: {new Date(versionInfo.build_time).toLocaleDateString('zh-CN')}
              </div>
            </div>
          </div>
        )}

        {/* 最新版本 */}
        {latestRelease && (
          <a
            href={latestRelease.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">最新版本</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge 
                  variant={hasNewVersion() ? "default" : "secondary"} 
                  className="text-xs font-mono"
                >
                  {latestRelease.tag_name}
                </Badge>
                {hasNewVersion() && (
                  <span className="text-xs text-green-600 dark:text-green-400">• New</span>
                )}
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              {latestRelease.name || '点击查看更新说明'}
            </div>
          </a>
        )}
      </div>

      {/* GitHub 链接 */}
      <div className="p-4 border-t border-sidebar-border">
        <a
          href="https://github.com/yi-nology/rainbow_bridge"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <Github className="w-4 h-4" />
          GitHub
        </a>
      </div>
    </aside>
  )
}
