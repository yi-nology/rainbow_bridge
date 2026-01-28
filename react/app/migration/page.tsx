"use client"

import { useState } from "react"
import { ArrowRight, Check, AlertCircle, RefreshCw, ChevronDown, Loader2 } from "lucide-react"
import { AppSidebar } from "@/components/app-sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useRuntimeOverview } from "@/hooks/use-environments"
import { configApi } from "@/lib/api/config"
import { transferApi } from "@/lib/api/transfer"
import { fromApiConfig } from "@/lib/api/transformers"
import type { ConfigItem } from "@/lib/types"
import { toast } from "sonner"

type MigrationStatus = "idle" | "previewing" | "migrating" | "success" | "error"

interface MigrationConfig {
  id: string
  name: string
  alias: string
  type: string
  sourceValue: string
  targetValue: string | null
  hasConflict: boolean
  isNew: boolean
}

export default function MigrationPage() {
  const [sourceEnv, setSourceEnv] = useState("")
  const [sourcePipeline, setSourcePipeline] = useState("")
  const [targetEnv, setTargetEnv] = useState("")
  const [targetPipeline, setTargetPipeline] = useState("")
  const [selectedConfigs, setSelectedConfigs] = useState<string[]>([])
  const [status, setStatus] = useState<MigrationStatus>("idle")
  const [previewData, setPreviewData] = useState<MigrationConfig[]>([])
  const [overwriteConflicts, setOverwriteConflicts] = useState(false)
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [sourceConfigs, setSourceConfigs] = useState<ConfigItem[]>([])

  // 获取环境和渠道
  const { data: environments = [], isLoading: isEnvLoading } = useRuntimeOverview()

  const sourceEnvData = environments.find((e) => e.key === sourceEnv)
  const targetEnvData = environments.find((e) => e.key === targetEnv)

  const sourcePipelines = sourceEnvData?.pipelines || []
  const targetPipelines = targetEnvData?.pipelines || []

  const handlePreview = async () => {
    if (!sourceEnv || !sourcePipeline || !targetEnv || !targetPipeline) return

    setStatus("previewing")

    try {
      // 获取源配置
      const sourceResponse = await configApi.list({
        environment_key: sourceEnv,
        pipeline_key: sourcePipeline,
      })
      const sourceList = (sourceResponse.list || []).map(fromApiConfig)
      setSourceConfigs(sourceList)

      // 获取目标配置
      const targetResponse = await configApi.list({
        environment_key: targetEnv,
        pipeline_key: targetPipeline,
      })
      const targetList = (targetResponse.list || []).map(fromApiConfig)
      const targetMap = new Map(targetList.map((c) => [c.name, c]))

      // 生成预览数据
      const preview: MigrationConfig[] = sourceList.map((config) => {
        const targetConfig = targetMap.get(config.name)
        const hasConflict = targetConfig !== undefined && targetConfig.content !== config.content
        const isNew = targetConfig === undefined

        return {
          id: config.id,
          name: config.name,
          alias: config.alias,
          type: config.type,
          sourceValue: config.content,
          targetValue: targetConfig?.content || null,
          hasConflict,
          isNew,
        }
      })

      setPreviewData(preview)
      setSelectedConfigs(preview.map((p) => p.id))
      setStatus("idle")
    } catch (error) {
      setStatus("error")
      toast.error("获取配置失败，请重试")
    }
  }

  const handleMigrate = async () => {
    if (selectedConfigs.length === 0) return

    const hasConflicts = previewData.some((p) => p.hasConflict && selectedConfigs.includes(p.id))
    if (hasConflicts && !overwriteConflicts) {
      return
    }

    setStatus("migrating")

    try {
      // 获取选中的配置的 resource_keys
      const selectedResourceKeys = sourceConfigs
        .filter((c) => selectedConfigs.includes(c.id))
        .map((c) => c.id)

      // 调用迁移 API
      const result = await transferApi.migrate({
        source_environment_key: sourceEnv,
        source_pipeline_key: sourcePipeline,
        target_environment_key: targetEnv,
        target_pipeline_key: targetPipeline,
        resource_keys: selectedResourceKeys,
        overwrite: overwriteConflicts,
      })

      if (result) {
        const { total, succeeded, skipped, items } = result
        // 计算失败数量：从 items 中统计 status 为 'failed' 的数量
        const failed = items?.filter(item => item.status === 'failed').length || 0
        
        if (failed === 0) {
          setStatus("success")
          toast.success(`成功迁移 ${succeeded} 个配置${skipped > 0 ? `，跳过 ${skipped} 个` : ''}`)
        } else {
          setStatus("error")
          toast.error(`部分配置迁移失败：成功 ${succeeded}，跳过 ${skipped}，失败 ${failed}`)
        }
      } else {
        setStatus("error")
        toast.error("迁移失败，请重试")
      }
    } catch (error) {
      setStatus("error")
      toast.error("迁移失败，请重试")
    }
  }

  const handleReset = () => {
    setSourceEnv("")
    setSourcePipeline("")
    setTargetEnv("")
    setTargetPipeline("")
    setSelectedConfigs([])
    setPreviewData([])
    setSourceConfigs([])
    setStatus("idle")
    setOverwriteConflicts(false)
  }

  const toggleConfig = (id: string) => {
    setSelectedConfigs((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  const toggleAll = () => {
    if (selectedConfigs.length === previewData.length) {
      setSelectedConfigs([])
    } else {
      setSelectedConfigs(previewData.map((p) => p.id))
    }
  }

  const conflictCount = previewData.filter(
    (p) => p.hasConflict && selectedConfigs.includes(p.id)
  ).length

  const newCount = previewData.filter(
    (p) => p.isNew && selectedConfigs.includes(p.id)
  ).length

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />

      <main className="flex-1 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-foreground">配置迁移</h1>
            <p className="text-muted-foreground mt-1">
              在不同环境和渠道之间迁移配置项
            </p>
          </div>

          {status === "success" ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    迁移完成
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    已成功迁移 {selectedConfigs.length} 个配置项
                  </p>
                  <Button onClick={handleReset}>开始新的迁移</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Source and Target Selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">选择源和目标</CardTitle>
                  <CardDescription>
                    选择要迁移配置的源环境/渠道和目标环境/渠道
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    {/* Source */}
                    <div className="flex-1 space-y-3">
                      <p className="text-sm font-medium text-foreground">源</p>
                      <div className="grid grid-cols-2 gap-3">
                        <Select value={sourceEnv} onValueChange={(v) => {
                          setSourceEnv(v)
                          setSourcePipeline("")
                          setPreviewData([])
                        }} disabled={isEnvLoading}>
                          <SelectTrigger>
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
                        <Select
                          value={sourcePipeline}
                          onValueChange={(v) => {
                            setSourcePipeline(v)
                            setPreviewData([])
                          }}
                          disabled={!sourceEnv}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择渠道" />
                          </SelectTrigger>
                          <SelectContent>
                            {sourcePipelines.map((p) => (
                              <SelectItem key={p.key} value={p.key}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted mt-6">
                      <ArrowRight className="w-5 h-5 text-muted-foreground" />
                    </div>

                    {/* Target */}
                    <div className="flex-1 space-y-3">
                      <p className="text-sm font-medium text-foreground">目标</p>
                      <div className="grid grid-cols-2 gap-3">
                        <Select value={targetEnv} onValueChange={(v) => {
                          setTargetEnv(v)
                          setTargetPipeline("")
                          setPreviewData([])
                        }} disabled={isEnvLoading}>
                          <SelectTrigger>
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
                        <Select
                          value={targetPipeline}
                          onValueChange={(v) => {
                            setTargetPipeline(v)
                            setPreviewData([])
                          }}
                          disabled={!targetEnv}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择渠道" />
                          </SelectTrigger>
                          <SelectContent>
                            {targetPipelines.map((p) => (
                              <SelectItem key={p.key} value={p.key}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <Button
                      onClick={handlePreview}
                      disabled={
                        !sourceEnv ||
                        !sourcePipeline ||
                        !targetEnv ||
                        !targetPipeline ||
                        status === "previewing"
                      }
                    >
                      {status === "previewing" ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          预览中...
                        </>
                      ) : (
                        "预览变更"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Preview Results */}
              {previewData.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">变更预览</CardTitle>
                        <CardDescription>
                          共 {previewData.length} 个配置项，已选择{" "}
                          {selectedConfigs.length} 个
                          {newCount > 0 && (
                            <span className="text-emerald-600 dark:text-emerald-500">
                              ，{newCount} 个新增
                            </span>
                          )}
                          {conflictCount > 0 && (
                            <span className="text-amber-600 dark:text-amber-500">
                              ，{conflictCount} 个存在冲突
                            </span>
                          )}
                        </CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={toggleAll}
                        className="bg-transparent"
                      >
                        {selectedConfigs.length === previewData.length
                          ? "取消全选"
                          : "全选"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="border border-border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12" />
                            <TableHead>配置名</TableHead>
                            <TableHead>别名</TableHead>
                            <TableHead>类型</TableHead>
                            <TableHead>状态</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewData.map((config) => (
                            <TableRow
                              key={config.id}
                              className={
                                config.hasConflict
                                  ? "bg-amber-50 dark:bg-amber-900/10"
                                  : config.isNew
                                  ? "bg-emerald-50 dark:bg-emerald-900/10"
                                  : ""
                              }
                            >
                              <TableCell>
                                <Checkbox
                                  checked={selectedConfigs.includes(config.id)}
                                  onCheckedChange={() => toggleConfig(config.id)}
                                />
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {config.name}
                              </TableCell>
                              <TableCell>{config.alias}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">{config.type}</Badge>
                              </TableCell>
                              <TableCell>
                                {config.isNew ? (
                                  <Badge
                                    variant="outline"
                                    className="border-emerald-500 text-emerald-600 dark:text-emerald-500"
                                  >
                                    新增
                                  </Badge>
                                ) : config.hasConflict ? (
                                  <Badge
                                    variant="outline"
                                    className="border-amber-500 text-amber-600 dark:text-amber-500"
                                  >
                                    值不同
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="border-gray-400 text-gray-500"
                                  >
                                    无变更
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Advanced Options */}
                    <Collapsible
                      open={isAdvancedOpen}
                      onOpenChange={setIsAdvancedOpen}
                      className="mt-4"
                    >
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-2 text-muted-foreground"
                        >
                          <ChevronDown
                            className={`w-4 h-4 transition-transform ${
                              isAdvancedOpen ? "rotate-180" : ""
                            }`}
                          />
                          高级选项
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3">
                        <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="overwrite"
                              checked={overwriteConflicts}
                              onCheckedChange={(checked) =>
                                setOverwriteConflicts(checked === true)
                              }
                            />
                            <label
                              htmlFor="overwrite"
                              className="text-sm text-foreground cursor-pointer"
                            >
                              覆盖目标环境中已存在的不同值
                            </label>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* Warning */}
                    {conflictCount > 0 && !overwriteConflicts && (
                      <Alert variant="destructive" className="mt-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>存在冲突</AlertTitle>
                        <AlertDescription>
                          {conflictCount} 个配置项在目标环境中已存在不同的值。
                          请在高级选项中勾选"覆盖"以继续，或取消选择这些配置项。
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Actions */}
                    <div className="mt-6 flex items-center justify-between">
                      <Button
                        variant="outline"
                        onClick={handleReset}
                        className="bg-transparent"
                      >
                        重置
                      </Button>
                      <Button
                        onClick={handleMigrate}
                        disabled={
                          selectedConfigs.length === 0 ||
                          status === "migrating" ||
                          (conflictCount > 0 && !overwriteConflicts)
                        }
                      >
                        {status === "migrating" ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            迁移中...
                          </>
                        ) : (
                          `迁移 ${selectedConfigs.length} 个配置`
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
