"use client"

import { useState } from "react"
import { RefreshCw, Download, Copy, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useRuntimeOverview } from "@/hooks/use-environments"
import { useConfigs } from "@/hooks/use-configs"
import { runtimeApi } from "@/lib/api/runtime"
import { CONFIG_TYPE_META } from "@/lib/types"
import { toast } from "sonner"

export function RuntimeConfig() {
  const [selectedEnv, setSelectedEnv] = useState<string>("")
  const [selectedPipeline, setSelectedPipeline] = useState<string>("")
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  // 获取环境和渠道数据
  const { data: environments = [], isLoading: isEnvLoading } = useRuntimeOverview()

  // 获取当前选中环境的渠道
  const selectedEnvData = environments.find((e) => e.key === selectedEnv)
  const pipelines = selectedEnvData?.pipelines || []

  // 获取配置列表
  const {
    data: configs = [],
    isLoading: isConfigsLoading,
    refetch,
  } = useConfigs(selectedEnv, selectedPipeline)

  const handleEnvChange = (value: string) => {
    setSelectedEnv(value)
    setSelectedPipeline("")
  }

  const handleRefresh = () => {
    if (!selectedEnv || !selectedPipeline) return
    refetch()
  }

  const handleExport = async () => {
    if (!selectedEnv || !selectedPipeline) return
    setExporting(true)
    try {
      const blob = await runtimeApi.exportStatic(selectedEnv, selectedPipeline)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `config-${selectedEnv}-${selectedPipeline}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("导出成功")
    } catch (error) {
      // 如果静态导出失败，降级为导出 JSON
      const data = JSON.stringify(configs, null, 2)
      const blob = new Blob([data], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `config-${selectedEnv}-${selectedPipeline}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("已导出为 JSON 格式")
    } finally {
      setExporting(false)
    }
  }

  const handleCopy = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const loading = isConfigsLoading

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">运行时配置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">环境:</label>
            <Select value={selectedEnv} onValueChange={handleEnvChange} disabled={isEnvLoading}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder={isEnvLoading ? "加载中..." : "选择环境"} />
              </SelectTrigger>
              <SelectContent>
                {environments.map((env) => (
                  <SelectItem key={env.key} value={env.key}>
                    {env.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">渠道:</label>
            <Select
              value={selectedPipeline}
              onValueChange={setSelectedPipeline}
              disabled={!selectedEnv}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="选择渠道" />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map((pipeline) => (
                  <SelectItem key={pipeline.key} value={pipeline.key}>
                    {pipeline.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleRefresh}
            disabled={!selectedEnv || !selectedPipeline || loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            刷新配置
          </Button>

          <Button
            variant="outline"
            onClick={handleExport}
            disabled={configs.length === 0 || exporting}
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            导出静态资源
          </Button>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48">名称</TableHead>
                <TableHead className="w-40">别名</TableHead>
                <TableHead className="w-24">类型</TableHead>
                <TableHead>内容</TableHead>
                <TableHead className="w-20">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                    <span className="text-sm text-muted-foreground mt-2 block">
                      加载中...
                    </span>
                  </TableCell>
                </TableRow>
              ) : !selectedEnv || !selectedPipeline ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center py-8 text-muted-foreground"
                  >
                    请选择环境和渠道查看配置
                  </TableCell>
                </TableRow>
              ) : configs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center py-8 text-muted-foreground"
                  >
                    当前环境和渠道下暂无配置
                  </TableCell>
                </TableRow>
              ) : (
                configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell className="font-mono text-sm">
                      {config.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {config.alias}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={CONFIG_TYPE_META[config.type as keyof typeof CONFIG_TYPE_META]?.color || ""}
                      >
                        {CONFIG_TYPE_META[config.type as keyof typeof CONFIG_TYPE_META]?.label || config.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm max-w-xs truncate">
                      {config.content}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopy(config.content, config.id)}
                      >
                        {copiedId === config.id ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
