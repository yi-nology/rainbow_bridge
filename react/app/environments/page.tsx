"use client"

import { useState, useEffect } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, GitBranch, ChevronRight, Loader2 } from "lucide-react"
import {
  useRuntimeOverview,
  usePipelines,
  useCreateEnvironment,
  useDeleteEnvironment,
  useCreatePipeline,
  useDeletePipeline,
} from "@/hooks/use-environments"
import type { Environment, Pipeline } from "@/lib/types"

export default function EnvironmentsPage() {
  const { data: environments = [], isLoading, error } = useRuntimeOverview()
  const [selectedEnv, setSelectedEnv] = useState<Environment | null>(null)
  const [isEnvDialogOpen, setIsEnvDialogOpen] = useState(false)
  const [isPipelineDialogOpen, setIsPipelineDialogOpen] = useState(false)
  const [envFormData, setEnvFormData] = useState({ key: "", name: "" })
  const [pipelineFormData, setPipelineFormData] = useState({ key: "", name: "" })

  const { data: pipelines = [], isLoading: isPipelinesLoading } = usePipelines(
    selectedEnv?.key
  )

  const createEnvironment = useCreateEnvironment()
  const deleteEnvironment = useDeleteEnvironment()
  const createPipeline = useCreatePipeline()
  const deletePipeline = useDeletePipeline()

  // 当环境列表更新时，同步更新 selectedEnv
  useEffect(() => {
    if (selectedEnv && environments.length > 0) {
      const updated = environments.find((e) => e.key === selectedEnv.key)
      if (updated) {
        setSelectedEnv(updated)
      } else {
        setSelectedEnv(null)
      }
    }
  }, [environments, selectedEnv?.key])

  const handleAddEnv = async () => {
    if (!envFormData.key || !envFormData.name) return
    await createEnvironment.mutateAsync(envFormData)
    setEnvFormData({ key: "", name: "" })
    setIsEnvDialogOpen(false)
  }

  const handleDeleteEnv = async (key: string) => {
    await deleteEnvironment.mutateAsync(key)
    if (selectedEnv?.key === key) setSelectedEnv(null)
  }

  const handleAddPipeline = async () => {
    if (!selectedEnv || !pipelineFormData.key || !pipelineFormData.name) return
    await createPipeline.mutateAsync({
      environmentKey: selectedEnv.key,
      pipeline: pipelineFormData,
    })
    setPipelineFormData({ key: "", name: "" })
    setIsPipelineDialogOpen(false)
  }

  const handleDeletePipeline = async (pipelineKey: string) => {
    if (!selectedEnv) return
    await deletePipeline.mutateAsync({
      environmentKey: selectedEnv.key,
      pipelineKey,
    })
  }

  // 使用 API 返回的 pipelines 或 selectedEnv 中的 pipelines
  const displayPipelines = selectedEnv?.pipelines || []

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">环境管理</h1>
            <p className="text-muted-foreground mt-1">
              管理多环境配置和渠道
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">环境列表</CardTitle>
                  <Dialog open={isEnvDialogOpen} onOpenChange={setIsEnvDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="w-4 h-4 mr-2" />
                        新增环境
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>新增环境</DialogTitle>
                        <DialogDescription>添加一个新的部署环境</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="env-key">环境标识</Label>
                          <Input
                            id="env-key"
                            placeholder="例如: dev, test, prod"
                            value={envFormData.key}
                            onChange={(e) =>
                              setEnvFormData({ ...envFormData, key: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="env-name">环境名称</Label>
                          <Input
                            id="env-name"
                            placeholder="例如: 开发环境"
                            value={envFormData.name}
                            onChange={(e) =>
                              setEnvFormData({ ...envFormData, name: e.target.value })
                            }
                          />
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsEnvDialogOpen(false)}>
                            取消
                          </Button>
                          <Button
                            onClick={handleAddEnv}
                            disabled={createEnvironment.isPending}
                          >
                            {createEnvironment.isPending && (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            )}
                            保存
                          </Button>
                        </DialogFooter>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : error ? (
                  <p className="text-center py-8 text-destructive">
                    加载失败，请刷新重试
                  </p>
                ) : (
                  <div className="space-y-2">
                    {environments.map((env) => (
                      <div
                        key={env.key}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedEnv?.key === env.key
                            ? "border-primary bg-accent"
                            : "hover:bg-accent/50"
                        }`}
                        onClick={() => setSelectedEnv(env)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-md bg-primary/10">
                            <GitBranch className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{env.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {env.key}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {env.pipelines.length} 渠道
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={deleteEnvironment.isPending}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteEnv(env.key)
                            }}
                          >
                            {deleteEnvironment.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4 text-destructive" />
                            )}
                          </Button>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                    {environments.length === 0 && (
                      <p className="text-center py-8 text-muted-foreground">
                        暂无环境，请添加
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    {selectedEnv ? `${selectedEnv.name} - 渠道管理` : "渠道管理"}
                  </CardTitle>
                  {selectedEnv && (
                    <Dialog
                      open={isPipelineDialogOpen}
                      onOpenChange={setIsPipelineDialogOpen}
                    >
                      <DialogTrigger asChild>
                        <Button size="sm">
                          <Plus className="w-4 h-4 mr-2" />
                          新增渠道
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>新增渠道</DialogTitle>
                          <DialogDescription>
                            为 {selectedEnv.name} 添加渠道
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="pipeline-key">渠道标识</Label>
                            <Input
                              id="pipeline-key"
                              placeholder="例如: default, gray"
                              value={pipelineFormData.key}
                              onChange={(e) =>
                                setPipelineFormData({
                                  ...pipelineFormData,
                                  key: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="pipeline-name">渠道名称</Label>
                            <Input
                              id="pipeline-name"
                              placeholder="例如: 默认渠道"
                              value={pipelineFormData.name}
                              onChange={(e) =>
                                setPipelineFormData({
                                  ...pipelineFormData,
                                  name: e.target.value,
                                })
                              }
                            />
                          </div>
                          <DialogFooter>
                            <Button
                              variant="outline"
                              onClick={() => setIsPipelineDialogOpen(false)}
                            >
                              取消
                            </Button>
                            <Button
                              onClick={handleAddPipeline}
                              disabled={createPipeline.isPending}
                            >
                              {createPipeline.isPending && (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              )}
                              保存
                            </Button>
                          </DialogFooter>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {selectedEnv ? (
                  <div className="space-y-2">
                    {displayPipelines.map((pipeline) => (
                      <div
                        key={pipeline.key}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div>
                          <p className="font-medium text-sm">{pipeline.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {pipeline.key}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={deletePipeline.isPending}
                          onClick={() => handleDeletePipeline(pipeline.key)}
                        >
                          {deletePipeline.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4 text-destructive" />
                          )}
                        </Button>
                      </div>
                    ))}
                    {displayPipelines.length === 0 && (
                      <p className="text-center py-8 text-muted-foreground">
                        暂无渠道，请添加
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-center py-8 text-muted-foreground">
                    请先选择一个环境
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
