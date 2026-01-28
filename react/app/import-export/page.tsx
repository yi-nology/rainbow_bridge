"use client"

import React from "react"

import { useState, useRef } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  Download,
  Upload,
  FileJson,
  FileText,
  Check,
  AlertCircle,
  Info,
  Loader2,
  FolderDown,
  FolderUp,
  Settings,
  Layers,
  Database,
  ChevronRight,
  X,
  FileWarning,
} from "lucide-react"
import { mockEnvironments, mockConfigs, mockResources } from "@/lib/mock-data"

type ExportFormat = "json" | "yaml"
type DataCategory = "environments" | "configs" | "resources" | "all"

interface ImportPreview {
  environments: number
  pipelines: number
  configs: number
  resources: number
  conflicts: ConflictItem[]
}

interface ConflictItem {
  type: "environment" | "config" | "resource"
  name: string
  existing: string
  incoming: string
}

export default function ImportExportPage() {
  // Export state
  const [exportFormat, setExportFormat] = useState<ExportFormat>("json")
  const [exportCategories, setExportCategories] = useState<DataCategory[]>(["all"])
  const [isExporting, setIsExporting] = useState(false)
  const [exportSuccess, setExportSuccess] = useState(false)

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [overwriteConflicts, setOverwriteConflicts] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Export category toggle
  const toggleExportCategory = (category: DataCategory) => {
    if (category === "all") {
      setExportCategories(["all"])
    } else {
      const newCategories = exportCategories.filter((c) => c !== "all")
      if (newCategories.includes(category)) {
        const filtered = newCategories.filter((c) => c !== category)
        setExportCategories(filtered.length === 0 ? ["all"] : filtered)
      } else {
        setExportCategories([...newCategories, category])
      }
    }
  }

  // Generate export data
  const generateExportData = () => {
    const data: Record<string, unknown> = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      source: "rainbow-bridge",
    }

    const includeAll = exportCategories.includes("all")

    if (includeAll || exportCategories.includes("environments")) {
      data.environments = mockEnvironments
    }

    if (includeAll || exportCategories.includes("configs")) {
      data.configs = mockConfigs
    }

    if (includeAll || exportCategories.includes("resources")) {
      data.resources = mockResources
    }

    return data
  }

  // Handle export
  const handleExport = async () => {
    setIsExporting(true)
    setExportSuccess(false)

    try {
      await new Promise((resolve) => setTimeout(resolve, 800))

      const data = generateExportData()
      let content: string
      let filename: string
      let mimeType: string

      if (exportFormat === "json") {
        content = JSON.stringify(data, null, 2)
        filename = `rainbow-bridge-export-${Date.now()}.json`
        mimeType = "application/json"
      } else {
        // Simple YAML conversion
        content = convertToYaml(data)
        filename = `rainbow-bridge-export-${Date.now()}.yaml`
        mimeType = "text/yaml"
      }

      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setExportSuccess(true)
      setTimeout(() => setExportSuccess(false), 3000)
    } finally {
      setIsExporting(false)
    }
  }

  // Simple YAML converter
  const convertToYaml = (obj: unknown, indent = 0): string => {
    const spaces = "  ".repeat(indent)
    let yaml = ""

    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (typeof item === "object" && item !== null) {
          yaml += `${spaces}-\n${convertToYaml(item, indent + 1)}`
        } else {
          yaml += `${spaces}- ${item}\n`
        }
      }
    } else if (typeof obj === "object" && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === "object" && value !== null) {
          yaml += `${spaces}${key}:\n${convertToYaml(value, indent + 1)}`
        } else {
          yaml += `${spaces}${key}: ${value}\n`
        }
      }
    }

    return yaml
  }

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportFile(file)
    setImportError(null)
    setImportPreview(null)
    setIsParsing(true)

    try {
      const text = await file.text()
      let data: Record<string, unknown>

      if (file.name.endsWith(".json")) {
        data = JSON.parse(text)
      } else if (file.name.endsWith(".yaml") || file.name.endsWith(".yml")) {
        // Simple YAML parsing (for demo purposes)
        setImportError("YAML 导入功能开发中，请使用 JSON 格式")
        setIsParsing(false)
        return
      } else {
        throw new Error("不支持的文件格式")
      }

      // Validate and generate preview
      const preview = generateImportPreview(data)
      setImportPreview(preview)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "文件解析失败")
    } finally {
      setIsParsing(false)
    }
  }

  // Generate import preview
  const generateImportPreview = (data: Record<string, unknown>): ImportPreview => {
    const preview: ImportPreview = {
      environments: 0,
      pipelines: 0,
      configs: 0,
      resources: 0,
      conflicts: [],
    }

    if (Array.isArray(data.environments)) {
      preview.environments = data.environments.length
      for (const env of data.environments) {
        if (env && typeof env === "object" && "pipelines" in env && Array.isArray(env.pipelines)) {
          preview.pipelines += env.pipelines.length
        }
        // Check for conflicts
        const existing = mockEnvironments.find(
          (e) => e.key === (env as { key?: string }).key
        )
        if (existing) {
          preview.conflicts.push({
            type: "environment",
            name: (env as { name?: string }).name || (env as { key?: string }).key || "未知",
            existing: existing.name,
            incoming: (env as { name?: string }).name || "未知",
          })
        }
      }
    }

    if (Array.isArray(data.configs)) {
      preview.configs = data.configs.length
      // Check for config conflicts
      for (const config of data.configs) {
        const existing = mockConfigs.find(
          (c) =>
            c.name === (config as { name?: string }).name &&
            c.environmentId === (config as { environmentId?: string }).environmentId &&
            c.pipelineId === (config as { pipelineId?: string }).pipelineId
        )
        if (existing) {
          preview.conflicts.push({
            type: "config",
            name: (config as { name?: string }).name || "未知",
            existing: existing.content.substring(0, 50),
            incoming: ((config as { content?: string }).content || "").substring(0, 50),
          })
        }
      }
    }

    if (Array.isArray(data.resources)) {
      preview.resources = data.resources.length
    }

    return preview
  }

  // Handle import
  const handleImport = async () => {
    if (!importPreview) return

    if (importPreview.conflicts.length > 0 && !overwriteConflicts) {
      setShowConfirmDialog(true)
      return
    }

    setIsImporting(true)
    setImportSuccess(false)

    try {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      setImportSuccess(true)
      setTimeout(() => {
        setImportSuccess(false)
        setImportFile(null)
        setImportPreview(null)
      }, 3000)
    } finally {
      setIsImporting(false)
      setShowConfirmDialog(false)
    }
  }

  // Clear import
  const clearImport = () => {
    setImportFile(null)
    setImportPreview(null)
    setImportError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  // Get category stats
  const getCategoryStats = () => {
    const totalPipelines = mockEnvironments.reduce((sum, env) => sum + env.pipelines.length, 0)
    return {
      environments: mockEnvironments.length,
      pipelines: totalPipelines,
      configs: mockConfigs.length,
      resources: mockResources.length,
    }
  }

  const stats = getCategoryStats()

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground">导入导出</h1>
            <p className="text-muted-foreground mt-1">
              批量导入导出配置数据，支持 JSON 和 YAML 格式
            </p>
          </div>

          <Tabs defaultValue="export" className="space-y-6">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="export" className="gap-2">
                <FolderDown className="w-4 h-4" />
                数据导出
              </TabsTrigger>
              <TabsTrigger value="import" className="gap-2">
                <FolderUp className="w-4 h-4" />
                数据导入
              </TabsTrigger>
            </TabsList>

            {/* Export Tab */}
            <TabsContent value="export" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Export Options */}
                <div className="lg:col-span-2 space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">选择导出内容</CardTitle>
                      <CardDescription>
                        选择要导出的数据类型，可以选择全部或按类型导出
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div
                        className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                          exportCategories.includes("all")
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground/50"
                        }`}
                        onClick={() => toggleExportCategory("all")}
                      >
                        <Checkbox checked={exportCategories.includes("all")} />
                        <div className="flex-1">
                          <div className="font-medium">全部数据</div>
                          <div className="text-sm text-muted-foreground">
                            包含所有环境、配置和资源数据
                          </div>
                        </div>
                        <Badge variant="secondary">
                          {stats.environments + stats.configs + stats.resources} 项
                        </Badge>
                      </div>

                      <div className="grid gap-3">
                        <div
                          className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                            exportCategories.includes("environments") &&
                            !exportCategories.includes("all")
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-muted-foreground/50"
                          } ${exportCategories.includes("all") ? "opacity-50" : ""}`}
                          onClick={() =>
                            !exportCategories.includes("all") &&
                            toggleExportCategory("environments")
                          }
                        >
                          <Checkbox
                            checked={
                              exportCategories.includes("all") ||
                              exportCategories.includes("environments")
                            }
                            disabled={exportCategories.includes("all")}
                          />
                          <Layers className="w-5 h-5 text-blue-500" />
                          <div className="flex-1">
                            <div className="font-medium">环境与渠道</div>
                            <div className="text-sm text-muted-foreground">
                              {stats.environments} 个环境，{stats.pipelines} 个渠道
                            </div>
                          </div>
                        </div>

                        <div
                          className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                            exportCategories.includes("configs") &&
                            !exportCategories.includes("all")
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-muted-foreground/50"
                          } ${exportCategories.includes("all") ? "opacity-50" : ""}`}
                          onClick={() =>
                            !exportCategories.includes("all") && toggleExportCategory("configs")
                          }
                        >
                          <Checkbox
                            checked={
                              exportCategories.includes("all") ||
                              exportCategories.includes("configs")
                            }
                            disabled={exportCategories.includes("all")}
                          />
                          <Settings className="w-5 h-5 text-emerald-500" />
                          <div className="flex-1">
                            <div className="font-medium">配置项</div>
                            <div className="text-sm text-muted-foreground">
                              {stats.configs} 个配置项
                            </div>
                          </div>
                        </div>

                        <div
                          className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                            exportCategories.includes("resources") &&
                            !exportCategories.includes("all")
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-muted-foreground/50"
                          } ${exportCategories.includes("all") ? "opacity-50" : ""}`}
                          onClick={() =>
                            !exportCategories.includes("all") && toggleExportCategory("resources")
                          }
                        >
                          <Checkbox
                            checked={
                              exportCategories.includes("all") ||
                              exportCategories.includes("resources")
                            }
                            disabled={exportCategories.includes("all")}
                          />
                          <Database className="w-5 h-5 text-amber-500" />
                          <div className="flex-1">
                            <div className="font-medium">静态资源</div>
                            <div className="text-sm text-muted-foreground">
                              {stats.resources} 个资源文件
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">导出格式</CardTitle>
                      <CardDescription>选择导出文件的格式</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div
                          className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                            exportFormat === "json"
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-muted-foreground/50"
                          }`}
                          onClick={() => setExportFormat("json")}
                        >
                          <FileJson className="w-8 h-8 text-amber-500" />
                          <div>
                            <div className="font-medium">JSON</div>
                            <div className="text-sm text-muted-foreground">推荐格式</div>
                          </div>
                        </div>
                        <div
                          className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                            exportFormat === "yaml"
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-muted-foreground/50"
                          }`}
                          onClick={() => setExportFormat("yaml")}
                        >
                          <FileText className="w-8 h-8 text-blue-500" />
                          <div>
                            <div className="font-medium">YAML</div>
                            <div className="text-sm text-muted-foreground">可读性更好</div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Export Preview */}
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">导出预览</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">格式</span>
                          <Badge variant="outline">.{exportFormat}</Badge>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">环境</span>
                          <span>
                            {exportCategories.includes("all") ||
                            exportCategories.includes("environments")
                              ? stats.environments
                              : 0}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">配置项</span>
                          <span>
                            {exportCategories.includes("all") ||
                            exportCategories.includes("configs")
                              ? stats.configs
                              : 0}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">资源</span>
                          <span>
                            {exportCategories.includes("all") ||
                            exportCategories.includes("resources")
                              ? stats.resources
                              : 0}
                          </span>
                        </div>
                      </div>

                      <div className="pt-4 border-t">
                        <Button
                          className="w-full"
                          onClick={handleExport}
                          disabled={isExporting}
                        >
                          {isExporting ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              导出中...
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4 mr-2" />
                              导出数据
                            </>
                          )}
                        </Button>
                      </div>

                      {exportSuccess && (
                        <Alert className="border-emerald-500 bg-emerald-50 dark:bg-emerald-950">
                          <Check className="h-4 w-4 text-emerald-600" />
                          <AlertTitle className="text-emerald-600">导出成功</AlertTitle>
                          <AlertDescription className="text-emerald-600">
                            文件已开始下载
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>

                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>提示</AlertTitle>
                    <AlertDescription>
                      导出的数据包含完整的配置信息，请妥善保管，避免泄露敏感数据。
                    </AlertDescription>
                  </Alert>
                </div>
              </div>
            </TabsContent>

            {/* Import Tab */}
            <TabsContent value="import" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Import Upload */}
                <div className="lg:col-span-2 space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">上传文件</CardTitle>
                      <CardDescription>
                        支持 JSON 格式的配置文件，可以是从本系统导出的备份文件
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {!importFile ? (
                        <label
                          htmlFor="import-file"
                          className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors"
                        >
                          <Upload className="w-12 h-12 text-muted-foreground mb-4" />
                          <span className="text-sm font-medium">
                            点击或拖拽文件到此处
                          </span>
                          <span className="text-xs text-muted-foreground mt-1">
                            支持 .json 文件
                          </span>
                          <input
                            id="import-file"
                            type="file"
                            accept=".json,.yaml,.yml"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                          />
                        </label>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                            <FileJson className="w-10 h-10 text-amber-500" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{importFile.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {(importFile.size / 1024).toFixed(2)} KB
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={clearImport}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>

                          {isParsing && (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                              <span className="ml-2 text-muted-foreground">解析文件中...</span>
                            </div>
                          )}

                          {importError && (
                            <Alert variant="destructive">
                              <AlertCircle className="h-4 w-4" />
                              <AlertTitle>解析失败</AlertTitle>
                              <AlertDescription>{importError}</AlertDescription>
                            </Alert>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {importPreview && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">数据预览</CardTitle>
                        <CardDescription>
                          以下是将要导入的数据概览
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="p-4 bg-muted rounded-lg text-center">
                            <div className="text-2xl font-bold text-blue-600">
                              {importPreview.environments}
                            </div>
                            <div className="text-sm text-muted-foreground">环境</div>
                          </div>
                          <div className="p-4 bg-muted rounded-lg text-center">
                            <div className="text-2xl font-bold text-indigo-600">
                              {importPreview.pipelines}
                            </div>
                            <div className="text-sm text-muted-foreground">渠道</div>
                          </div>
                          <div className="p-4 bg-muted rounded-lg text-center">
                            <div className="text-2xl font-bold text-emerald-600">
                              {importPreview.configs}
                            </div>
                            <div className="text-sm text-muted-foreground">配置项</div>
                          </div>
                          <div className="p-4 bg-muted rounded-lg text-center">
                            <div className="text-2xl font-bold text-amber-600">
                              {importPreview.resources}
                            </div>
                            <div className="text-sm text-muted-foreground">资源</div>
                          </div>
                        </div>

                        {importPreview.conflicts.length > 0 && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-amber-600">
                              <FileWarning className="w-5 h-5" />
                              <span className="font-medium">
                                发现 {importPreview.conflicts.length} 个冲突项
                              </span>
                            </div>
                            <div className="border rounded-lg overflow-hidden">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>类型</TableHead>
                                    <TableHead>名称</TableHead>
                                    <TableHead>现有值</TableHead>
                                    <TableHead>
                                      <ChevronRight className="w-4 h-4 inline" />
                                    </TableHead>
                                    <TableHead>导入值</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {importPreview.conflicts.slice(0, 5).map((conflict, index) => (
                                    <TableRow key={index}>
                                      <TableCell>
                                        <Badge variant="outline">
                                          {conflict.type === "environment"
                                            ? "环境"
                                            : conflict.type === "config"
                                            ? "配置"
                                            : "资源"}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="font-medium">
                                        {conflict.name}
                                      </TableCell>
                                      <TableCell className="text-muted-foreground max-w-[120px] truncate">
                                        {conflict.existing}
                                      </TableCell>
                                      <TableCell>
                                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                      </TableCell>
                                      <TableCell className="max-w-[120px] truncate">
                                        {conflict.incoming}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              {importPreview.conflicts.length > 5 && (
                                <div className="px-4 py-2 bg-muted text-sm text-muted-foreground text-center">
                                  还有 {importPreview.conflicts.length - 5} 个冲突项...
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                              <Checkbox
                                id="overwrite"
                                checked={overwriteConflicts}
                                onCheckedChange={(checked) =>
                                  setOverwriteConflicts(checked === true)
                                }
                              />
                              <label
                                htmlFor="overwrite"
                                className="text-sm cursor-pointer"
                              >
                                覆盖现有冲突数据
                              </label>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Import Actions */}
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">导入操作</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {importPreview ? (
                        <>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">待导入总数</span>
                              <span className="font-medium">
                                {importPreview.environments +
                                  importPreview.configs +
                                  importPreview.resources}{" "}
                                项
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">冲突项</span>
                              <span
                                className={
                                  importPreview.conflicts.length > 0
                                    ? "text-amber-600 font-medium"
                                    : ""
                                }
                              >
                                {importPreview.conflicts.length} 项
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">处理方式</span>
                              <Badge variant={overwriteConflicts ? "destructive" : "secondary"}>
                                {overwriteConflicts ? "覆盖" : "跳过"}冲突
                              </Badge>
                            </div>
                          </div>

                          <div className="pt-4 border-t">
                            <Button
                              className="w-full"
                              onClick={handleImport}
                              disabled={isImporting}
                            >
                              {isImporting ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  导入中...
                                </>
                              ) : (
                                <>
                                  <Upload className="w-4 h-4 mr-2" />
                                  开始导入
                                </>
                              )}
                            </Button>
                          </div>

                          {importSuccess && (
                            <Alert className="border-emerald-500 bg-emerald-50 dark:bg-emerald-950">
                              <Check className="h-4 w-4 text-emerald-600" />
                              <AlertTitle className="text-emerald-600">导入成功</AlertTitle>
                              <AlertDescription className="text-emerald-600">
                                数据已成功导入系统
                              </AlertDescription>
                            </Alert>
                          )}
                        </>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Upload className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>请先上传配置文件</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>注意事项</AlertTitle>
                    <AlertDescription className="space-y-1">
                      <p>1. 导入前请确保已备份现有数据</p>
                      <p>2. 冲突数据默认跳过，可选择覆盖</p>
                      <p>3. 导入操作不可撤销</p>
                    </AlertDescription>
                  </Alert>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Confirm Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认导入</DialogTitle>
            <DialogDescription>
              检测到 {importPreview?.conflicts.length} 个冲突项，是否继续导入？
              未选择"覆盖冲突数据"时，冲突项将被跳过。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              取消
            </Button>
            <Button onClick={handleImport} disabled={isImporting}>
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  导入中...
                </>
              ) : (
                "确认导入"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
