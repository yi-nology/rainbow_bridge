import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Layers,
  GitBranch,
  Zap,
  ArrowRightLeft,
  FolderOpen,
} from "lucide-react"

const capabilities = [
  {
    icon: Layers,
    title: "环境隔离",
    description: "支持 dev/test/prod 等多环境配置隔离",
  },
  {
    icon: GitBranch,
    title: "渠道管理",
    description: "支持多条渠道并行，满足 A/B 测试",
  },
  {
    icon: Zap,
    title: "实时与静态",
    description: "提供实时接口和静态资源包导出",
  },
  {
    icon: ArrowRightLeft,
    title: "配置迁移",
    description: "一键导出/导入，快速环境同步",
  },
  {
    icon: FolderOpen,
    title: "资源管理",
    description: "集中管理静态资源，自动生成 URL",
  },
]

export function ProjectIntro() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">项目简介</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            <strong className="text-foreground">虹桥计划（Rainbow Bridge）</strong>
            是一个轻量级、自部署的前端资源配置中台，专为多环境、多渠道场景设计。
          </p>
          <p className="text-muted-foreground leading-relaxed">
            基于 <Badge variant="secondary">CloudWeGo Hertz</Badge> 框架构建，支持
            SQLite/MySQL/PostgreSQL 数据库，开箱即用。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">核心能力</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((cap) => (
              <div
                key={cap.title}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="p-2 rounded-md bg-primary/10">
                  <cap.icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium text-sm">{cap.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {cap.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
