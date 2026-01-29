"use client"

import React, { useState, useRef, useEffect } from "react"
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
  Download,
  Upload,
  Check,
  AlertCircle,
  Info,
  Loader2,
  FolderDown,
  FolderUp,
  FileArchive,
  X,
  FileWarning,
} from "lucide-react"
import { ExportTreeSelect, ImportPreviewTree } from "@/components/transfer-tree-select"
import {
  transferApi,
  type ExportTreeEnvironment,
  type ExportSelection,
  type ImportPreviewData,
} from "@/lib/api/transfer"

type ExportFormat = "zip" | "tar.gz"

export default function ImportExportPage() {
  // Export state
  const [exportTree, setExportTree] = useState<ExportTreeEnvironment[]>([])
  const [exportSelections, setExportSelections] = useState<ExportSelection[]>([])
  const [exportFormat, setExportFormat] = useState<ExportFormat>("zip")
  const [isLoadingTree, setIsLoadingTree] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [exportSuccess, setExportSuccess] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreviewData | null>(null)
  const [importSelections, setImportSelections] = useState<ExportSelection[]>([])
  const [isParsing, setIsParsing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [overwriteConflicts, setOverwriteConflicts] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load export tree on mount
  useEffect(() => {
    loadExportTree()
  }, [])

  const loadExportTree = async () => {
    setIsLoadingTree(true)
    setExportError(null)
    try {
      const tree = await transferApi.getExportTree()
      setExportTree(tree)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "加载数据失败")
    } finally {
      setIsLoadingTree(false)
    }
  }

  // Handle export
  const handleExport = async () => {
    if (exportSelections.length === 0) {
      setExportError("请选择要导出的内容")
      return
    }

    setIsExporting(true)
    setExportSuccess(false)
    setExportError(null)

    try {
      const blob = await transferApi.exportSelective({
        format: exportFormat,
        selections: exportSelections,
      })

      // Download file
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `rainbow-bridge-export-${Date.now()}.${exportFormat === "tar.gz" ? "tar.gz" : "zip"}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setExportSuccess(true)
      setTimeout(() => setExportSuccess(false), 3000)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "导出失败")
    } finally {
      setIsExporting(false)
    }
  }

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith(".zip") && !fileName.endsWith(".tar.gz") && !fileName.endsWith(".tgz")) {
      setImportError("不支持的文件格式，请上传 .zip 或 .tar.gz 文件")
      return
    }

    setImportFile(file)
    setImportError(null)
    setImportPreview(null)
    setIsParsing(true)

    try {
      const preview = await transferApi.importPreview(file)
      if (preview) {
        setImportPreview(preview)
        // Initialize selections with all items selected
        const allSelections: ExportSelection[] = []
        preview.environments.forEach((env) => {
          allSelections.push({
            environment_key: env.environment_key,
            pipeline_key: "",
            resource_keys: [],
          })
        })
        setImportSelections(allSelections)
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "文件解析失败")
    } finally {
      setIsParsing(false)
    }
  }

  // Handle import
  const handleImport = async () => {
    if (!importFile || !importPreview) return

    if (importPreview.summary.conflict_count > 0 && !overwriteConflicts && !showConfirmDialog) {
      setShowConfirmDialog(true)
      return
    }

    setIsImporting(true)
    setImportSuccess(false)
    setImportError(null)

    try {
      await transferApi.importSelective(importFile, importSelections, overwriteConflicts)
      setImportSuccess(true)
      setTimeout(() => {
        setImportSuccess(false)
        clearImport()
        // Reload export tree to reflect changes
        loadExportTree()
      }, 3000)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "导入失败")
    } finally {
      setIsImporting(false)
      setShowConfirmDialog(false)
    }
  }

  // Clear import
  const clearImport = () => {
    setImportFile(null)
    setImportPreview(null)
    setImportSelections([])
    setImportError(null)
    setOverwriteConflicts(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  // Get export stats
  const getExportStats = () => {
    let envCount = 0
    let pipeCount = 0
    let configCount = 0

    exportSelections.forEach((sel) => {
      const env = exportTree.find((e) => e.environment_key === sel.environment_key)
      if (!env) return

      if (!sel.pipeline_key) {
        // Entire environment
        envCount++
        pipeCount += env.pipelines.length
        configCount += env.pipelines.reduce((sum, p) => sum + p.config_count, 0)
      } else if (!sel.resource_keys || sel.resource_keys.length === 0) {
        // Entire pipeline
        const pipe = env.pipelines.find((p) => p.pipeline_key === sel.pipeline_key)
        if (pipe) {
          pipeCount++
          configCount += pipe.config_count
        }
      } else {
        // Specific configs
        configCount += sel.resource_keys.length
      }
    })

    return { envCount, pipeCount, configCount }
  }

  const exportStats = getExportStats()

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground">导入导出</h1>
            <p className="text-muted-foreground mt-1">
              批量导入导出配置数据，支持 ZIP 和 TAR.GZ 格式
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
                {/* Export Tree */}
                <div className="lg:col-span-2 space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">选择导出内容</CardTitle>
                      <CardDescription>
                        选择要导出的环境、渠道或配置项
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {exportError && (
                        <Alert variant="destructive" className="mb-4">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>错误</AlertTitle>
                          <AlertDescription>{exportError}</AlertDescription>
                        </Alert>
                      )}
                      <ExportTreeSelect
                        data={exportTree}
                        onChange={setExportSelections}
                        loading={isLoadingTree}
                      />
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
                            exportFormat === "zip"
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-muted-foreground/50"
                          }`}
                          onClick={() => setExportFormat("zip")}
                        >
                          <FileArchive className="w-8 h-8 text-amber-500" />
                          <div>
                            <div className="font-medium">ZIP</div>
                            <div className="text-sm text-muted-foreground">推荐格式</div>
                          </div>
                        </div>
                        <div
                          className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                            exportFormat === "tar.gz"
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-muted-foreground/50"
                          }`}
                          onClick={() => setExportFormat("tar.gz")}
                        >
                          <FileArchive className="w-8 h-8 text-blue-500" />
                          <div>
                            <div className="font-medium">TAR.GZ</div>
                            <div className="text-sm text-muted-foreground">通用压缩格式</div>
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
                          <span>{exportStats.envCount || "-"}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">渠道</span>
                          <span>{exportStats.pipeCount || "-"}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">配置项</span>
                          <span>{exportStats.configCount || "-"}</span>
                        </div>
                      </div>

                      <div className="pt-4 border-t">
                        <Button
                          className="w-full"
                          onClick={handleExport}
                          disabled={isExporting || exportSelections.length === 0}
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
                        支持 ZIP 和 TAR.GZ 格式的配置备份文件
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
                            支持 .zip 和 .tar.gz 文件
                          </span>
                          <input
                            id="import-file"
                            type="file"
                            accept=".zip,.tar.gz,.tgz"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                          />
                        </label>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                            <FileArchive className="w-10 h-10 text-amber-500" />
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
                        <CardTitle className="text-lg">选择导入内容</CardTitle>
                        <CardDescription>
                          选择要导入的环境、渠道或配置项
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Summary */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                          <div className="p-4 bg-muted rounded-lg text-center">
                            <div className="text-2xl font-bold text-blue-600">
                              {importPreview.summary.total_environments}
                            </div>
                            <div className="text-sm text-muted-foreground">环境</div>
                          </div>
                          <div className="p-4 bg-muted rounded-lg text-center">
                            <div className="text-2xl font-bold text-indigo-600">
                              {importPreview.summary.total_pipelines}
                            </div>
                            <div className="text-sm text-muted-foreground">渠道</div>
                          </div>
                          <div className="p-4 bg-muted rounded-lg text-center">
                            <div className="text-2xl font-bold text-purple-600">
                              {importPreview.summary.total_configs}
                            </div>
                            <div className="text-sm text-muted-foreground">配置</div>
                          </div>
                          <div className="p-4 bg-muted rounded-lg text-center">
                            <div className="text-2xl font-bold text-cyan-600">
                              {importPreview.summary.total_assets || 0}
                            </div>
                            <div className="text-sm text-muted-foreground">资源</div>
                          </div>
                          <div className="p-4 bg-muted rounded-lg text-center">
                            <div className="text-2xl font-bold text-amber-600">
                              {importPreview.summary.conflict_count}
                            </div>
                            <div className="text-sm text-muted-foreground">冲突</div>
                          </div>
                        </div>

                        {/* Tree */}
                        <ImportPreviewTree
                          data={importPreview.environments}
                          onChange={setImportSelections}
                        />

                        {importPreview.summary.conflict_count > 0 && (
                          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg mt-4">
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
                              <span className="text-muted-foreground">文件格式</span>
                              <Badge variant="outline">{importPreview.format}</Badge>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">待导入总数</span>
                              <span className="font-medium">
                                {importPreview.summary.total_configs} 项
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">冲突项</span>
                              <span
                                className={
                                  importPreview.summary.conflict_count > 0
                                    ? "text-amber-600 font-medium"
                                    : ""
                                }
                              >
                                {importPreview.summary.conflict_count} 项
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
                              disabled={isImporting || importSelections.length === 0}
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
            <DialogTitle className="flex items-center gap-2">
              <FileWarning className="w-5 h-5 text-amber-500" />
              确认导入
            </DialogTitle>
            <DialogDescription>
              检测到 {importPreview?.summary.conflict_count} 个冲突项，是否继续导入？
              未选择&quot;覆盖冲突数据&quot;时，冲突项将被跳过。
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
