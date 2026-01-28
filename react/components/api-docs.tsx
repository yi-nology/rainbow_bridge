import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const apiDocs = [
  {
    title: "概览接口",
    endpoint: "/api/v1/runtime/overview",
    method: "GET",
    description: "返回环境与渠道的树形结构",
    usage: "用于动态构建环境/渠道选择器",
  },
  {
    title: "实时接口（推荐）",
    endpoint: "/api/v1/runtime/config",
    method: "GET",
    description: "Header 传 x-environment, x-pipeline",
    usage: "需要实时获取最新配置的应用",
    recommended: true,
  },
  {
    title: "静态导出",
    endpoint: "/api/v1/runtime/static",
    method: "GET",
    description: "参数: ?environment_key=xxx&pipeline_key=xxx",
    usage: "离线部署、静态托管、CDN 分发",
  },
]

export function ApiDocs() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">前端对接</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {apiDocs.map((api) => (
            <div
              key={api.endpoint}
              className="p-4 rounded-lg border bg-card space-y-2"
            >
              <div className="flex items-center gap-2">
                <h4 className="font-medium">{api.title}</h4>
                {api.recommended && (
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300">
                    推荐
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {api.method}
                </Badge>
                <code className="text-sm font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
                  {api.endpoint}
                </code>
              </div>
              <p className="text-sm text-muted-foreground">
                <strong>请求：</strong>
                {api.description}
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>场景：</strong>
                {api.usage}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
