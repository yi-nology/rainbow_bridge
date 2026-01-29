"use client"

import { useState, useMemo, useCallback } from "react"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Search, 
  Layers, 
  GitBranch, 
  X,
  Upload,
  ImageIcon,
  FileText,
  AlertCircle,
  Loader2
} from "lucide-react"
import { useRuntimeOverview } from "@/hooks/use-environments"
import { useConfigs, useCreateConfig, useUpdateConfig, useDeleteConfig } from "@/hooks/use-configs"
import { useUploadAsset } from "@/hooks/use-assets"
import { type ConfigItem, type ConfigType, CONFIG_TYPE_META } from "@/lib/types"
import { resolveAssetUrl } from "@/lib/utils"


interface KeyValuePair {
  key: string
  value: string
}

interface ValidationError {
  field: string
  message: string
}

interface ConfigFormProps {
  formData: {
    name: string
    alias: string
    type: ConfigType
    content: string
  }
  setFormData: React.Dispatch<React.SetStateAction<{
    name: string
    alias: string
    type: ConfigType
    content: string
  }>>
  editingConfig: ConfigItem | null
  errors: ValidationError[]
  getFieldError: (field: string) => string | undefined
  handleTypeChange: (type: ConfigType) => void
  keyValuePairs: KeyValuePair[]
  setKeyValuePairs: React.Dispatch<React.SetStateAction<KeyValuePair[]>>
  booleanValue: boolean
  setBooleanValue: React.Dispatch<React.SetStateAction<boolean>>
  colorValue: string
  setColorValue: React.Dispatch<React.SetStateAction<string>>
  imageSize: { width: number; height: number } | null
  setImageSize: React.Dispatch<React.SetStateAction<{ width: number; height: number } | null>>
  setErrors: React.Dispatch<React.SetStateAction<ValidationError[]>>
  selectedEnvKey: string
  selectedPipelineKey: string
  uploadAsset: ReturnType<typeof useUploadAsset>
  isMutating: boolean
  onSubmit: () => void
  onCancel: () => void
  selectedEnvironment?: { name: string; key: string; pipelines: any[] }
  pipelines: any[]
}

// 将 ConfigForm 组件提取到外部
const ConfigForm: React.FC<ConfigFormProps> = ({
  formData,
  setFormData,
  editingConfig,
  errors,
  getFieldError,
  handleTypeChange,
  keyValuePairs,
  setKeyValuePairs,
  booleanValue,
  setBooleanValue,
  colorValue,
  setColorValue,
  imageSize,
  setImageSize,
  setErrors,
  selectedEnvKey,
  selectedPipelineKey,
  uploadAsset,
  isMutating,
  onSubmit,
  onCancel,
  selectedEnvironment,
  pipelines,
}) => {
  // 键值对操作
  const addKeyValuePair = () => {
    setKeyValuePairs([...keyValuePairs, { key: "", value: "" }])
  }

  const removeKeyValuePair = (index: number) => {
    setKeyValuePairs(keyValuePairs.filter((_, i) => i !== index))
  }

  const updateKeyValuePair = (index: number, field: "key" | "value", value: string) => {
    const newPairs = [...keyValuePairs]
    newPairs[index][field] = value
    setKeyValuePairs(newPairs)
  }

  // 处理文件上传
  const handleFileUpload = async (type: "file" | "image") => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = type === "image" ? "image/*" : "*/*"
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file || !selectedEnvKey || !selectedPipelineKey) return
      
      try {
        const result = await uploadAsset.mutateAsync({
          file,
          environmentKey: selectedEnvKey,
          pipelineKey: selectedPipelineKey,
        })
        if (result.asset?.url) {
          const uploadedUrl = result.asset.url
          
          // 根据文件的 MIME 类型自动判断应该使用的配置类型
          const isImageFile = file.type.startsWith('image/')
          const autoDetectedType = isImageFile ? 'image' : 'file'
          
          // 如果当前表单类型与上传文件类型不匹配，自动更新类型
          if (formData.type !== autoDetectedType) {
            setFormData(prev => ({ 
              ...prev, 
              type: autoDetectedType,
              content: uploadedUrl 
            }))
          } else {
            setFormData(prev => ({ ...prev, content: uploadedUrl }))
          }
          
          // 清除相关字段的验证错误
          setErrors(prev => prev.filter(e => e.field !== 'content'))
                  
          // 如果是图片,获取尺寸
          if (isImageFile) {
            const img = new Image()
            img.onload = () => {
              setImageSize({ width: img.naturalWidth, height: img.naturalHeight })
            }
            img.onerror = () => {
              setImageSize(null)
            }
            img.src = uploadedUrl
          }
        }
      } catch (error) {
        // 错误已在 hook 中处理
      }
    }
    
    input.click()
  }

  // 渲染内容输入组件
  const renderContentInput = () => {
    const error = getFieldError("content")
    
    switch (formData.type) {
      case "text":
        return (
          <div className="space-y-2">
            <Label htmlFor="content">内容</Label>
            <Input
              id="content"
              placeholder="请输入文本内容..."
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className={error ? "border-destructive" : ""}
            />
            {error && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
          </div>
        )
      
      case "textarea":
        return (
          <div className="space-y-2">
            <Label htmlFor="content">多行文本</Label>
            <Textarea
              id="content"
              placeholder="请输入多行文本内容..."
              rows={4}
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className={error ? "border-destructive" : ""}
            />
            {error && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
          </div>
        )
      
      case "richtext":
        return (
          <div className="space-y-2">
            <Label htmlFor="content">富文本 (HTML)</Label>
            <Textarea
              id="content"
              placeholder="<p>请输入HTML内容...</p>"
              rows={6}
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className={`font-mono text-sm ${error ? "border-destructive" : ""}`}
            />
            {formData.content && (
              <div className="p-3 border rounded-md bg-muted/30">
                <Label className="text-xs text-muted-foreground mb-2 block">预览</Label>
                <div 
                  className="prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: formData.content }}
                />
              </div>
            )}
            {error && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
          </div>
        )
      
      case "number":
        return (
          <div className="space-y-2">
            <Label htmlFor="content">整数</Label>
            <Input
              id="content"
              type="text"
              inputMode="numeric"
              placeholder="请输入整数，例如: 100"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className={error ? "border-destructive" : ""}
            />
            {error && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
          </div>
        )
      
      case "decimal":
        return (
          <div className="space-y-2">
            <Label htmlFor="content">小数</Label>
            <Input
              id="content"
              type="text"
              inputMode="decimal"
              placeholder="请输入小数，例如: 3.14"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className={error ? "border-destructive" : ""}
            />
            {error && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
          </div>
        )
      
      case "boolean":
        return (
          <div className="space-y-2">
            <Label>布尔值</Label>
            <div className="flex items-center gap-4 p-4 border rounded-md">
              <Switch
                checked={booleanValue}
                onCheckedChange={setBooleanValue}
              />
              <span className="text-sm">
                当前值: <Badge variant={booleanValue ? "default" : "secondary"}>{booleanValue ? "true" : "false"}</Badge>
              </span>
            </div>
          </div>
        )
      
      case "keyvalue":
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>键值对</Label>
              <Button type="button" variant="outline" size="sm" onClick={addKeyValuePair}>
                <Plus className="w-3 h-3 mr-1" />
                添加
              </Button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {keyValuePairs.map((pair, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    placeholder="键名"
                    value={pair.key}
                    onChange={(e) => updateKeyValuePair(index, "key", e.target.value)}
                    className="flex-1"
                  />
                  <span className="text-muted-foreground">=</span>
                  <Input
                    placeholder="键值"
                    value={pair.value}
                    onChange={(e) => updateKeyValuePair(index, "value", e.target.value)}
                    className="flex-1"
                  />
                  {keyValuePairs.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeKeyValuePair(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {error && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
          </div>
        )
      
      case "object":
        const formatJSON = () => {
          try {
            const parsed = JSON.parse(formData.content)
            const formatted = JSON.stringify(parsed, null, 2)
            setFormData({ ...formData, content: formatted })
            // 清除该字段的错误
            setErrors(errors.filter(e => e.field !== 'content'))
          } catch (e) {
            // 格式化失败，不做处理
          }
        }
        
        let jsonValidation: { valid: boolean; message?: string } = { valid: true }
        if (formData.content.trim()) {
          try {
            const parsed = JSON.parse(formData.content)
            if (typeof parsed !== "object" || Array.isArray(parsed)) {
              jsonValidation = { valid: false, message: "必须是JSON对象（非数组）" }
            }
          } catch {
            jsonValidation = { valid: false, message: "JSON格式无效" }
          }
        }
        
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="content">JSON 对象</Label>
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={formatJSON}
                disabled={!formData.content.trim()}
              >
                <span className="text-xs">🎨 格式化</span>
              </Button>
            </div>
            <Textarea
              id="content"
              placeholder='{"key": "value", "count": 100}'
              rows={8}
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className={`font-mono text-sm ${error ? "border-destructive" : jsonValidation.valid ? "" : "border-yellow-500"}`}
            />
            {/* 实时校验提示 */}
            {formData.content.trim() && !jsonValidation.valid && !error && (
              <p className="text-sm text-yellow-600 dark:text-yellow-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />{jsonValidation.message}
              </p>
            )}
            {formData.content.trim() && jsonValidation.valid && !error && (
              <p className="text-sm text-green-600 dark:text-green-500 flex items-center gap-1">
                <span className="text-xs">✓</span> JSON格式正确
              </p>
            )}
            <p className="text-xs text-muted-foreground">请输入有效的 JSON 对象格式</p>
            {error && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
          </div>
        )
      
      case "color":
        // RGB值计算
        const hexToRgb = (hex: string) => {
          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
          return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
          } : null
        }
        
        const rgb = hexToRgb(colorValue)
        
        return (
          <div className="space-y-3">
            <Label>颜色选择器</Label>
            <div className="space-y-3">
              {/* 颜色选择器 */}
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="color"
                    value={colorValue}
                    onChange={(e) => setColorValue(e.target.value)}
                    className="w-16 h-16 rounded-lg cursor-pointer border-2 border-border"
                    style={{ padding: '4px' }}
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <Input
                    value={colorValue}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val.startsWith('#') || val === '') {
                        setColorValue(val)
                      }
                    }}
                    placeholder="#3B82F6"
                    className={`font-mono text-lg ${error ? "border-destructive" : ""}`}
                    maxLength={7}
                  />
                  {rgb && (
                    <p className="text-xs text-muted-foreground font-mono">
                      RGB: ({rgb.r}, {rgb.g}, {rgb.b})
                    </p>
                  )}
                </div>
              </div>
              
              {/* 预览区域 */}
              <div className="grid grid-cols-2 gap-3">
                <div 
                  className="h-20 rounded-lg border-2 flex items-center justify-center text-sm font-medium transition-colors"
                  style={{ 
                    backgroundColor: colorValue, 
                    color: parseInt(colorValue.slice(1), 16) > 0x7FFFFF ? "#000" : "#fff" 
                  }}
                >
                  浅色背景预览
                </div>
                <div 
                  className="h-20 rounded-lg border-2 flex items-center justify-center text-sm font-medium transition-colors bg-slate-900"
                >
                  <div 
                    className="px-4 py-2 rounded"
                    style={{ backgroundColor: colorValue, color: parseInt(colorValue.slice(1), 16) > 0x7FFFFF ? "#000" : "#fff" }}
                  >
                    深色背景预览
                  </div>
                </div>
              </div>
              
              {/* 常用颜色快捷选择 */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">常用颜色</Label>
                <div className="flex gap-2 flex-wrap">
                  {['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#64748B'].map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="w-8 h-8 rounded border-2 hover:scale-110 transition-transform"
                      style={{ backgroundColor: color, borderColor: colorValue === color ? '#000' : 'transparent' }}
                      onClick={() => setColorValue(color)}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>
            {error && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
          </div>
        )
      
      case "file":
        return (
          <div className="space-y-2">
            <Label>文件</Label>
            <div 
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors ${error ? "border-destructive" : ""}`}
              onClick={() => handleFileUpload("file")}
            >
              {uploadAsset.isPending ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">上传中...</span>
                </div>
              ) : formData.content ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                  <div className="text-left">
                    <p className="text-sm font-medium truncate max-w-xs">{formData.content}</p>
                    <p className="text-xs text-muted-foreground">点击更换文件</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">点击上传文件</p>
                </div>
              )}
            </div>
            {error && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
          </div>
        )
      
      case "image":
        const imagePreviewUrl = formData.content ? resolveAssetUrl(formData.content) : ''
        return (
          <div className="space-y-2">
            <Label>图片</Label>
            <div 
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors ${error ? "border-destructive" : ""}`}
              onClick={() => handleFileUpload("image")}
            >
              {uploadAsset.isPending ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">上传中...</span>
                </div>
              ) : formData.content ? (
                <div className="space-y-3">
                  {/* 图片预览 */}
                  <div className="w-full max-h-48 bg-muted rounded flex items-center justify-center overflow-hidden">
                    <img 
                      src={imagePreviewUrl} 
                      alt="预览" 
                      className="max-w-full max-h-48 object-contain"
                      onLoad={(e) => {
                        // 图片加载完成时获取尺寸
                        const img = e.target as HTMLImageElement
                        setImageSize({ width: img.naturalWidth, height: img.naturalHeight })
                      }}
                      onError={(e) => {
                        // 加载失败时显示占位符
                        (e.target as HTMLImageElement).style.display = 'none';
                        const parent = (e.target as HTMLElement).parentElement;
                        if (parent) {
                          parent.innerHTML = '<div class="flex items-center justify-center h-32"><svg class="w-12 h-12 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>';
                        }
                        setImageSize(null)
                      }}
                    />
                  </div>
                  {/* 图片信息 */}
                  <div className="space-y-1">
                    {imageSize && (
                      <div className="flex items-center justify-center gap-4 text-sm">
                        <Badge variant="secondary" className="font-mono">
                          {imageSize.width} × {imageSize.height} px
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {(imageSize.width * imageSize.height / 1000000).toFixed(2)} MP
                        </span>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground break-all px-2">{formData.content}</p>
                  </div>
                  <p className="text-xs text-primary hover:underline">点击更换图片</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">点击上传图片</p>
                  <p className="text-xs text-muted-foreground">支持 PNG, JPG, GIF, SVG 格式</p>
                </div>
              )}
            </div>
            {error && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
          </div>
        )
      
      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      {/* 错误提示汇总 */}
      {errors.length > 0 && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
          <div className="flex items-center gap-2 text-destructive font-medium text-sm mb-1">
            <AlertCircle className="w-4 h-4" />
            保存失败，请检查以下问题：
          </div>
          <ul className="list-disc list-inside text-sm text-destructive/80 space-y-0.5">
            {errors.map((error, index) => (
              <li key={index}>{error.message}</li>
            ))}
          </ul>
        </div>
      )}
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">名称 *</Label>
          <Input
            id="name"
            placeholder="例如: API基础地址"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className={getFieldError("name") ? "border-destructive" : ""}
          />
          {getFieldError("name") && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />{getFieldError("name")}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="alias">别名 *</Label>
          <Input
            id="alias"
            placeholder="例如: API_BASE_URL"
            value={formData.alias}
            onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
            className={getFieldError("alias") ? "border-destructive" : ""}
            disabled={!!editingConfig}
          />
          {getFieldError("alias") && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />{getFieldError("alias")}
            </p>
          )}
          {editingConfig && (
            <p className="text-xs text-muted-foreground">
              别名在创建后不可修改
            </p>
          )}
        </div>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="type">类型</Label>
        <Select
          value={formData.type}
          onValueChange={(value: ConfigType) => handleTypeChange(value)}
          disabled={!!editingConfig}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(CONFIG_TYPE_META) as [ConfigType, typeof CONFIG_TYPE_META[ConfigType]][]).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={`${config.color} text-xs`}>
                    {config.label}
                  </Badge>
                  <span className="text-muted-foreground text-xs">{config.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {renderContentInput()}
      
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} className="bg-transparent">
          取消
        </Button>
        <Button onClick={onSubmit} disabled={isMutating}>
          {isMutating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          保存
        </Button>
      </DialogFooter>
    </div>
  )
}

export default function ConfigPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedEnvKey, setSelectedEnvKey] = useState<string>("")
  const [selectedPipelineKey, setSelectedPipelineKey] = useState<string>("")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<ConfigItem | null>(null)
  const [errors, setErrors] = useState<ValidationError[]>([])
  
  const [formData, setFormData] = useState({
    name: "",
    alias: "",
    type: "text" as ConfigType,
    content: "",
  })

  // 键值对状态
  const [keyValuePairs, setKeyValuePairs] = useState<KeyValuePair[]>([{ key: "", value: "" }])
  // 布尔值状态
  const [booleanValue, setBooleanValue] = useState(false)
  // 颜色状态
  const [colorValue, setColorValue] = useState("#3B82F6")
  // 图片尺寸状态
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)

  // 获取环境和渠道数据
  const { data: environments = [], isLoading: isEnvLoading } = useRuntimeOverview()
  
  // 获取配置列表
  const { 
    data: configs = [], 
    isLoading: isConfigsLoading,
    error: configsError 
  } = useConfigs(selectedEnvKey, selectedPipelineKey)

  // Mutations
  const createConfig = useCreateConfig()
  const updateConfig = useUpdateConfig()
  const deleteConfig = useDeleteConfig()
  const uploadAsset = useUploadAsset()

  // 获取当前选中环境
  const selectedEnvironment = useMemo(
    () => environments.find((env) => env.key === selectedEnvKey),
    [environments, selectedEnvKey]
  )

  // 获取当前选中环境的渠道列表
  const pipelines = useMemo(
    () => selectedEnvironment?.pipelines || [],
    [selectedEnvironment]
  )

  // 根据搜索词过滤配置
  const filteredConfigs = useMemo(() => {
    if (!searchTerm) return configs
    return configs.filter(
      (config) =>
        config.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        config.alias.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [configs, searchTerm])

  const handleEnvChange = (envKey: string) => {
    setSelectedEnvKey(envKey)
    setSelectedPipelineKey("")
  }

  // 校验函数
  const validateForm = useCallback((): ValidationError[] => {
    const newErrors: ValidationError[] = []
    
    // 基础字段校验
    if (!formData.name.trim()) {
      newErrors.push({ field: "name", message: "名称不能为空" })
    }

    if (!formData.alias.trim()) {
      newErrors.push({ field: "alias", message: "别名不能为空" })
    } else if (!/^[A-Z_][A-Z0-9_]*$/i.test(formData.alias)) {
      newErrors.push({ field: "alias", message: "别名只能包含字母、数字和下划线，且不能以数字开头" })
    }

    // 根据类型校验内容
    switch (formData.type) {
      case "text":
      case "textarea":
      case "richtext":
        if (!formData.content.trim()) {
          newErrors.push({ field: "content", message: "内容不能为空" })
        }
        break
      
      case "number":
        if (!formData.content.trim()) {
          newErrors.push({ field: "content", message: "请输入整数" })
        } else if (!/^-?\d+$/.test(formData.content)) {
          newErrors.push({ field: "content", message: "请输入有效的整数" })
        }
        break
      
      case "decimal":
        if (!formData.content.trim()) {
          newErrors.push({ field: "content", message: "请输入小数" })
        } else if (!/^-?\d+(\.\d+)?$/.test(formData.content)) {
          newErrors.push({ field: "content", message: "请输入有效的小数，例如: 3.14" })
        }
        break
      
      case "object":
        if (!formData.content.trim()) {
          newErrors.push({ field: "content", message: "JSON对象不能为空" })
        } else {
          try {
            const parsed = JSON.parse(formData.content)
            if (typeof parsed !== "object" || Array.isArray(parsed)) {
              newErrors.push({ field: "content", message: "请输入有效的JSON对象（非数组）" })
            }
          } catch {
            newErrors.push({ field: "content", message: "JSON格式无效，请检查语法" })
          }
        }
        break
      
      case "keyvalue":
        const validPairs = keyValuePairs.filter(p => p.key.trim() || p.value.trim())
        if (validPairs.length === 0) {
          newErrors.push({ field: "content", message: "请至少添加一个键值对" })
        } else {
          const hasEmptyKey = validPairs.some(p => !p.key.trim())
          const hasEmptyValue = validPairs.some(p => !p.value.trim())
          if (hasEmptyKey) {
            newErrors.push({ field: "content", message: "键名不能为空" })
          }
          if (hasEmptyValue) {
            newErrors.push({ field: "content", message: "键值不能为空" })
          }
          // 检查重复键
          const keys = validPairs.map(p => p.key.trim())
          const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index)
          if (duplicates.length > 0) {
            newErrors.push({ field: "content", message: `存在重复的键名: ${duplicates.join(", ")}` })
          }
        }
        break
      
      case "color":
        if (!/^#[0-9A-Fa-f]{6}$/.test(colorValue)) {
          newErrors.push({ field: "content", message: "请输入有效的颜色值，例如: #3B82F6" })
        }
        break
      
      case "file":
      case "image":
        if (!formData.content.trim()) {
          newErrors.push({ field: "content", message: formData.type === "image" ? "请上传图片" : "请上传文件" })
        }
        break
    }

    return newErrors
  }, [formData, keyValuePairs, colorValue])

  // 获取字段错误
  const getFieldError = (field: string) => {
    return errors.find(e => e.field === field)?.message
  }

  const resetForm = () => {
    setFormData({ name: "", alias: "", type: "text", content: "" })
    setKeyValuePairs([{ key: "", value: "" }])
    setBooleanValue(false)
    setColorValue("#3B82F6")
    setImageSize(null)
    setEditingConfig(null)
    setErrors([])
  }

  // 处理类型变化时重置内容
  const handleTypeChange = (type: ConfigType) => {
    setFormData({ ...formData, type, content: "" })
    setKeyValuePairs([{ key: "", value: "" }])
    setBooleanValue(false)
    setColorValue("#3B82F6")
    setImageSize(null)
    setErrors([])
  }

  // 获取最终内容
  const getFinalContent = (): string => {
    switch (formData.type) {
      case "keyvalue":
        const pairs = keyValuePairs.filter(p => p.key.trim())
        return JSON.stringify(Object.fromEntries(pairs.map(p => [p.key, p.value])))
      case "boolean":
        return String(booleanValue)
      case "color":
        return colorValue
      default:
        return formData.content
    }
  }

  const handleAdd = async () => {
    const validationErrors = validateForm()
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      return
    }
    
    if (!selectedEnvKey || !selectedPipelineKey) return
    
    await createConfig.mutateAsync({
      name: formData.name,
      alias: formData.alias,
      type: formData.type,
      content: getFinalContent(),
      environmentId: selectedEnvKey,
      pipelineId: selectedPipelineKey,
    })
    
    setIsAddDialogOpen(false)
    resetForm()
  }

  const handleEdit = (config: ConfigItem) => {
    setEditingConfig(config)
    setFormData({
      name: config.name,
      alias: config.alias,
      type: config.type,
      content: config.content,
    })
    
    // 根据类型初始化特殊状态
    if (config.type === "keyvalue") {
      try {
        const obj = JSON.parse(config.content)
        setKeyValuePairs(Object.entries(obj).map(([key, value]) => ({ key, value: String(value) })))
      } catch {
        setKeyValuePairs([{ key: "", value: "" }])
      }
    } else if (config.type === "boolean") {
      setBooleanValue(config.content === "true")
    } else if (config.type === "color") {
      setColorValue(config.content || "#3B82F6")
    } else if (config.type === "image" && config.content) {
      // 加载图片尺寸
      const img = new Image()
      img.onload = () => {
        setImageSize({ width: img.naturalWidth, height: img.naturalHeight })
      }
      img.onerror = () => {
        setImageSize(null)
      }
      img.src = config.content
    }
    setErrors([])
  }

  const handleUpdate = async () => {
    const validationErrors = validateForm()
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      return
    }
    
    if (!editingConfig || !selectedEnvKey || !selectedPipelineKey) return
    
    await updateConfig.mutateAsync({
      id: editingConfig.id,
      name: formData.name,
      alias: formData.alias,
      type: formData.type,
      content: getFinalContent(),
      environmentId: selectedEnvKey,
      pipelineId: selectedPipelineKey,
    })
    
    resetForm()
  }

  const handleDelete = async (resourceKey: string) => {
    if (!selectedEnvKey || !selectedPipelineKey) return
    await deleteConfig.mutateAsync({
      environmentKey: selectedEnvKey,
      pipelineKey: selectedPipelineKey,
      resourceKey,
    })
  }

  const isMutating = createConfig.isPending || updateConfig.isPending

  // 渲染内容预览
  const renderContentPreview = (config: ConfigItem) => {
    switch (config.type) {
      case "text":
        return (
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <span className="text-sm truncate max-w-xs">{config.content}</span>
          </div>
        )
      
      case "textarea":
        return (
          <div className="flex items-start gap-2">
            <FileText className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
            <span className="text-sm line-clamp-2 text-muted-foreground">
              {config.content}
            </span>
          </div>
        )
      
      case "richtext":
        return (
          <div className="flex items-start gap-2">
            <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
            <div 
              className="text-sm line-clamp-2 prose prose-sm max-w-xs"
              dangerouslySetInnerHTML={{ __html: config.content }}
            />
          </div>
        )
      
      case "number":
        return (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950 dark:text-amber-400">
              {config.content}
            </Badge>
          </div>
        )
      
      case "decimal":
        return (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-orange-700 border-orange-300 bg-orange-50 dark:bg-orange-950 dark:text-orange-400">
              {config.content}
            </Badge>
          </div>
        )
      
      case "boolean":
        return (
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${config.content === "true" ? "bg-green-500" : "bg-gray-400"}`} />
            <Badge variant={config.content === "true" ? "default" : "secondary"}>
              {config.content === "true" ? "true" : "false"}
            </Badge>
          </div>
        )
      
      case "color":
        return (
          <div className="flex items-center gap-2">
            <div 
              className="w-8 h-8 rounded-md border-2 shadow-sm ring-1 ring-gray-200 dark:ring-gray-700"
              style={{ backgroundColor: config.content }}
              title={config.content}
            />
            <span className="font-mono text-xs text-muted-foreground">{config.content}</span>
          </div>
        )
      
      case "image":
        const resolvedImageUrl = resolveAssetUrl(config.content)
        return (
          <div className="flex items-center gap-3 group cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
              // 创建预览弹窗
              const dialog = document.createElement('div')
              dialog.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm'
              dialog.onclick = () => dialog.remove()
              
              const imgContainer = document.createElement('div')
              imgContainer.className = 'relative max-w-4xl max-h-[90vh] p-4'
              imgContainer.onclick = (e) => e.stopPropagation()
              
              const img = document.createElement('img')
              img.src = resolvedImageUrl
              img.className = 'max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl'
              img.alt = config.alias
              
              const closeBtn = document.createElement('button')
              closeBtn.innerHTML = '✕'
              closeBtn.className = 'absolute top-6 right-6 w-8 h-8 rounded-full bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center font-bold'
              closeBtn.onclick = () => dialog.remove()
              
              imgContainer.appendChild(img)
              imgContainer.appendChild(closeBtn)
              dialog.appendChild(imgContainer)
              document.body.appendChild(dialog)
            }}
          >
            <div className="relative">
              <img 
                src={resolvedImageUrl} 
                alt="缩略图" 
                className="w-12 h-12 object-cover rounded-md border-2 shadow-sm group-hover:scale-105 transition-transform"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none'
                  const parent = (e.target as HTMLElement).parentElement
                  if (parent) {
                    parent.innerHTML = '<div class="w-12 h-12 rounded-md border-2 bg-gray-100 dark:bg-gray-800 flex items-center justify-center"><svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>'
                  }
                }}
                onLoad={(e) => {
                  const img = e.target as HTMLImageElement
                  const title = `${img.naturalWidth} × ${img.naturalHeight} px\n点击查看大图`
                  img.setAttribute('title', title)
                }}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-md transition-colors flex items-center justify-center">
                <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity font-medium">查看</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <ImageIcon className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground">图片资源</span>
              </div>
              <span className="text-xs text-muted-foreground truncate block">
                {config.content.split('/').pop() || config.content}
              </span>
            </div>
          </div>
        )
      
      case "keyvalue":
        try {
          const obj = JSON.parse(config.content)
          const entries = Object.entries(obj)
          return (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-cyan-700 border-cyan-300 bg-cyan-50 dark:bg-cyan-950 dark:text-cyan-400">
                <span className="font-mono text-xs">{entries.length} 项</span>
              </Badge>
              {entries.length > 0 && (
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {entries.slice(0, 2).map(([k]) => k).join(', ')}
                  {entries.length > 2 ? '...' : ''}
                </span>
              )}
            </div>
          )
        } catch {
          return <span className="font-mono text-xs text-muted-foreground">无效格式</span>
        }
      
      case "object":
        try {
          const obj = JSON.parse(config.content)
          const keys = Object.keys(obj)
          return (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400">
                <span className="font-mono text-xs">{`{ ${keys.length} }`}</span>
              </Badge>
              {keys.length > 0 && (
                <span className="text-xs text-muted-foreground truncate max-w-[200px] font-mono">
                  {keys.slice(0, 3).join(', ')}
                  {keys.length > 3 ? '...' : ''}
                </span>
              )}
            </div>
          )
        } catch {
          return (
            <span className="font-mono text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              JSON格式错误
            </span>
          )
        }
      
      case "file":
        const fileName = config.content.split('/').pop() || config.content
        const fileExt = fileName.split('.').pop()?.toLowerCase() || ''
        return (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md border-2 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <FileText className="w-4 h-4 text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium truncate">{fileName}</span>
                {fileExt && (
                  <Badge variant="secondary" className="text-xs">{fileExt.toUpperCase()}</Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground truncate block">{config.content}</span>
            </div>
          </div>
        )
      
      default:
        return (
          <span className="text-sm text-muted-foreground truncate max-w-xs block">
            {config.content}
          </span>
        )
    }
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">配置管理</h1>
            <p className="text-muted-foreground mt-1">
              管理指定环境和渠道的运行时配置项
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

          {/* 配置列表 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">配置列表</CardTitle>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="搜索配置..."
                      className="pl-9 w-64"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      disabled={!selectedEnvKey || !selectedPipelineKey}
                    />
                  </div>
                  <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
                    setIsAddDialogOpen(open)
                    if (!open) resetForm()
                  }}>
                    <DialogTrigger asChild>
                      <Button disabled={!selectedEnvKey || !selectedPipelineKey}>
                        <Plus className="w-4 h-4 mr-2" />
                        新增配置
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>新增配置</DialogTitle>
                        <DialogDescription>
                          为 {selectedEnvironment?.name} - {pipelines.find(p => p.key === selectedPipelineKey)?.name} 添加配置项
                        </DialogDescription>
                      </DialogHeader>
                      <ConfigForm
                        formData={formData}
                        setFormData={setFormData}
                        editingConfig={editingConfig}
                        errors={errors}
                        getFieldError={getFieldError}
                        handleTypeChange={handleTypeChange}
                        keyValuePairs={keyValuePairs}
                        setKeyValuePairs={setKeyValuePairs}
                        booleanValue={booleanValue}
                        setBooleanValue={setBooleanValue}
                        colorValue={colorValue}
                        setColorValue={setColorValue}
                        imageSize={imageSize}
                        setImageSize={setImageSize}
                        setErrors={setErrors}
                        selectedEnvKey={selectedEnvKey}
                        selectedPipelineKey={selectedPipelineKey}
                        uploadAsset={uploadAsset}
                        isMutating={isMutating}
                        onSubmit={handleAdd}
                        onCancel={() => setIsAddDialogOpen(false)}
                        selectedEnvironment={selectedEnvironment}
                        pipelines={pipelines}
                      />
                    </DialogContent>
                  </Dialog>
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
                    配置项与环境和渠道关联，请在上方选择要管理的环境和渠道后查看对应的配置列表
                  </p>
                </div>
              ) : isConfigsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : configsError ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <AlertCircle className="w-12 h-12 text-destructive mb-4" />
                  <h3 className="text-lg font-medium mb-2">加载失败</h3>
                  <p className="text-muted-foreground text-sm">请刷新页面重试</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-48">名称</TableHead>
                        <TableHead className="w-40">别名</TableHead>
                        <TableHead className="w-24">类型</TableHead>
                        <TableHead>内容</TableHead>
                        <TableHead className="w-32 text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredConfigs.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="text-center py-8 text-muted-foreground"
                          >
                            {searchTerm ? "未找到匹配的配置" : "当前环境和渠道下暂无配置"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredConfigs.map((config) => (
                          <TableRow key={config.id}>
                            <TableCell className="font-mono text-sm break-all max-w-xs">
                              {config.name}
                            </TableCell>
                            <TableCell className="text-muted-foreground break-all max-w-xs">
                              {config.alias}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={CONFIG_TYPE_META[config.type]?.color || ""}
                              >
                                {CONFIG_TYPE_META[config.type]?.label || config.type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {renderContentPreview(config)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Dialog
                                  open={editingConfig?.id === config.id}
                                  onOpenChange={(open) => {
                                    if (open) {
                                      handleEdit(config)
                                    } else {
                                      resetForm()
                                    }
                                  }}
                                >
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
                                    <DialogHeader>
                                      <DialogTitle>编辑配置</DialogTitle>
                                      <DialogDescription>
                                        修改配置项信息
                                      </DialogDescription>
                                    </DialogHeader>
                                    <ConfigForm
                                      formData={formData}
                                      setFormData={setFormData}
                                      editingConfig={editingConfig}
                                      errors={errors}
                                      getFieldError={getFieldError}
                                      handleTypeChange={handleTypeChange}
                                      keyValuePairs={keyValuePairs}
                                      setKeyValuePairs={setKeyValuePairs}
                                      booleanValue={booleanValue}
                                      setBooleanValue={setBooleanValue}
                                      colorValue={colorValue}
                                      setColorValue={setColorValue}
                                      imageSize={imageSize}
                                      setImageSize={setImageSize}
                                      setErrors={setErrors}
                                      selectedEnvKey={selectedEnvKey}
                                      selectedPipelineKey={selectedPipelineKey}
                                      uploadAsset={uploadAsset}
                                      isMutating={isMutating}
                                      onSubmit={handleUpdate}
                                      onCancel={() => setEditingConfig(null)}
                                      selectedEnvironment={selectedEnvironment}
                                      pipelines={pipelines}
                                    />
                                  </DialogContent>
                                </Dialog>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={deleteConfig.isPending}
                                  onClick={() => handleDelete(config.id)}
                                >
                                  {deleteConfig.isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
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
