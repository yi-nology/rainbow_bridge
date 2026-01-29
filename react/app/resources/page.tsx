"use client"

import { useState, useRef } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Upload,
  Trash2,
  Copy,
  Check,
  FileImage,
  FileJson,
  FileText,
  File,
  Search,
  Layers,
  GitBranch,
  Loader2,
  Eye,
} from "lucide-react"
import { useRuntimeOverview } from "@/hooks/use-environments"
import { useAssets, useUploadAsset } from "@/hooks/use-assets"
import type { Asset } from "@/lib/api/transformers"
import { resolveAssetUrl } from "@/lib/utils"

const getFileIcon = (type: string) => {
  if (type.startsWith("image/")) return FileImage
  if (type.includes("json")) return FileJson
  if (type.includes("text")) return FileText
  return File
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

export default function ResourcesPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedEnvKey, setSelectedEnvKey] = useState<string>("")
  const [selectedPipelineKey, setSelectedPipelineKey] = useState<string>("")
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 获取环境和渠道
  const { data: environments = [], isLoading: isEnvLoading } = useRuntimeOverview()

  // 获取资源列表
  const { data: assets = [], isLoading: isAssetsLoading } = useAssets(
    selectedEnvKey,
    selectedPipelineKey
  )

  // 上传资源
  const uploadAsset = useUploadAsset()

  // 当前选中的环境
  const selectedEnvironment = environments.find((e) => e.key === selectedEnvKey)
  const pipelines = selectedEnvironment?.pipelines || []

  // 过滤资源
  const filteredAssets = assets.filter((r) =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleEnvChange = (envKey: string) => {
    setSelectedEnvKey(envKey)
    setSelectedPipelineKey("")
  }

  const handleCopy = async (url: string, id: string) => {
    // 构建完整 URL
    const fullUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`
    await navigator.clipboard.writeText(fullUrl)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedEnvKey || !selectedPipelineKey) return

    await uploadAsset.mutateAsync({
      file,
      environmentKey: selectedEnvKey,
      pipelineKey: selectedPipelineKey,
    })

    // 清空 input 以便可以再次选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  // 预览图片
  const handlePreviewImage = (url: string, name: string) => {
    const resolvedUrl = resolveAssetUrl(url)
    
    // 创建预览弹窗
    const dialog = document.createElement('div')
    dialog.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm'
    dialog.onclick = () => dialog.remove()
    
    const imgContainer = document.createElement('div')
    imgContainer.className = 'relative max-w-4xl max-h-[90vh] p-4'
    imgContainer.onclick = (e) => e.stopPropagation()
    
    const img = document.createElement('img')
    img.src = resolvedUrl
    img.className = 'max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl'
    img.alt = name
    
    const closeBtn = document.createElement('button')
    closeBtn.innerHTML = '✕'
    closeBtn.className = 'absolute top-6 right-6 w-8 h-8 rounded-full bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center font-bold'
    closeBtn.onclick = () => dialog.remove()
    
    const fileName = document.createElement('div')
    fileName.className = 'absolute bottom-6 left-6 right-6 bg-white/90 dark:bg-gray-800/90 px-4 py-2 rounded-lg backdrop-blur-sm'
    fileName.innerHTML = `<p class="text-sm font-medium text-gray-900 dark:text-gray-100">${name}</p>`
    
    imgContainer.appendChild(img)
    imgContainer.appendChild(closeBtn)
    imgContainer.appendChild(fileName)
    dialog.appendChild(imgContainer)
    document.body.appendChild(dialog)
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">资源管理</h1>
            <p className="text-muted-foreground mt-1">
              集中管理静态资源，自动生成 URL
            </p>
          </div>

          {/* 环境和渠道选择器 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">选择环境与渠道</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Layers className="w-4 h-4" />
                    <span className="text-sm font-medium">环境</span>
                  </div>
                  <Select value={selectedEnvKey} onValueChange={handleEnvChange} disabled={isEnvLoading}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder={isEnvLoading ? "加载中..." : "请选择环境"} />
                    </SelectTrigger>
                    <SelectContent>
                      {environments.map((env) => (
                        <SelectItem key={env.key} value={env.key}>
                          {env.name} ({env.key})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <GitBranch className="w-4 h-4" />
                    <span className="text-sm font-medium">渠道</span>
                  </div>
                  <Select
                    value={selectedPipelineKey}
                    onValueChange={setSelectedPipelineKey}
                    disabled={!selectedEnvKey}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder={selectedEnvKey ? "请选择渠道" : "先选择环境"} />
                    </SelectTrigger>
                    <SelectContent>
                      {pipelines.map((pipeline) => (
                        <SelectItem key={pipeline.key} value={pipeline.key}>
                          {pipeline.name} ({pipeline.key})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedEnvKey && selectedPipelineKey && (
                  <Badge variant="secondary" className="ml-auto">
                    已选择: {selectedEnvironment?.name} / {pipelines.find(p => p.key === selectedPipelineKey)?.name}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">资源列表</CardTitle>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="搜索资源..."
                      className="pl-9 w-64"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      disabled={!selectedEnvKey || !selectedPipelineKey}
                    />
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileChange}
                    accept="image/*,application/json,text/*"
                  />
                  <Button
                    onClick={handleUploadClick}
                    disabled={!selectedEnvKey || !selectedPipelineKey || uploadAsset.isPending}
                  >
                    {uploadAsset.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 mr-2" />
                    )}
                    上传资源
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!selectedEnvKey || !selectedPipelineKey ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Layers className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">请先选择环境和渠道</h3>
                  <p className="text-muted-foreground text-sm max-w-sm">
                    资源与环境和渠道关联，请在上方选择要管理的环境和渠道后查看对应的资源列表
                  </p>
                </div>
              ) : isAssetsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">预览</TableHead>
                        <TableHead className="w-64">文件名</TableHead>
                        <TableHead className="w-32">类型</TableHead>
                        <TableHead className="w-24">大小</TableHead>
                        <TableHead>URL</TableHead>
                        <TableHead className="w-32 text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAssets.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="text-center py-8 text-muted-foreground"
                          >
                            {searchTerm ? "未找到匹配的资源" : "当前环境和渠道下暂无资源"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredAssets.map((resource) => {
                          const FileIcon = getFileIcon(resource.type)
                          const isImage = resource.type.startsWith("image/")
                          const resolvedUrl = resolveAssetUrl(resource.url)
                          
                          return (
                            <TableRow key={resource.id}>
                              <TableCell>
                                {isImage ? (
                                  <div className="relative group">
                                    <img
                                      src={resolvedUrl}
                                      alt={resource.name}
                                      className="w-12 h-12 object-cover rounded-md border-2 cursor-pointer hover:scale-105 transition-transform"
                                      onClick={() => handlePreviewImage(resource.url, resource.name)}
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none'
                                        const parent = (e.target as HTMLElement).parentElement
                                        if (parent) {
                                          parent.innerHTML = '<div class="w-12 h-12 rounded-md border-2 bg-gray-100 dark:bg-gray-800 flex items-center justify-center"><svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>'
                                        }
                                      }}
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-md transition-colors flex items-center justify-center">
                                      <Eye className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="w-12 h-12 rounded-md border-2 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                    <FileIcon className="w-6 h-6 text-gray-500" />
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <FileIcon className="w-4 h-4 text-muted-foreground" />
                                  <span className="font-medium text-sm">
                                    {resource.name}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">
                                  {resource.type.split("/")[1] || resource.type}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {formatFileSize(resource.size)}
                              </TableCell>
                              <TableCell className="font-mono text-sm text-muted-foreground truncate max-w-xs">
                                {resource.url}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {isImage && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handlePreviewImage(resource.url, resource.name)}
                                      title="预览图片"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      handleCopy(resource.url, resource.id)
                                    }
                                    title="复制链接"
                                  >
                                    {copiedId === resource.id ? (
                                      <Check className="w-4 h-4 text-green-600" />
                                    ) : (
                                      <Copy className="w-4 h-4" />
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
