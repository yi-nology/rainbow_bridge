<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import AppSidebar from '@/components/AppSidebar.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
} from 'lucide-vue-next'
import ExportTreeSelect from '@/components/ExportTreeSelect.vue'
import ImportPreviewTree from '@/components/ImportPreviewTree.vue'
import { transferApi, type ExportSelection, type ExportTreeEnvironment, type ImportPreviewData } from '@/lib/api/transfer'

type ExportFormat = 'zip' | 'tar.gz'

const exportTree = ref<ExportTreeEnvironment[]>([])
const exportSelections = ref<ExportSelection[]>([])
const exportFormat = ref<ExportFormat>('zip')
const isLoadingTree = ref(true)
const isExporting = ref(false)
const exportSuccess = ref(false)
const exportError = ref<string | null>(null)

const importFile = ref<File | null>(null)
const importPreview = ref<ImportPreviewData | null>(null)
const importSelections = ref<ExportSelection[]>([])
const isParsing = ref(false)
const isImporting = ref(false)
const importSuccess = ref(false)
const importError = ref<string | null>(null)
const overwriteConflicts = ref(false)
const showConfirmDialog = ref(false)

const fileInputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  loadExportTree()
})

const loadExportTree = async () => {
  isLoadingTree.value = true
  exportError.value = null
  try {
    const tree = await transferApi.getExportTree()
    exportTree.value = tree
  } catch (err) {
    exportError.value = err instanceof Error ? err.message : '加载数据失败'
  } finally {
    isLoadingTree.value = false
  }
}

const handleExport = async () => {
  if (exportSelections.value.length === 0) {
    exportError.value = '请选择要导出的内容'
    return
  }

  isExporting.value = true
  exportSuccess.value = false
  exportError.value = null

  try {
    const blob = await transferApi.exportSelective({
      format: exportFormat.value,
      selections: exportSelections.value,
    })

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rainbow-bridge-export-${Date.now()}.${exportFormat.value === 'tar.gz' ? 'tar.gz' : 'zip'}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    exportSuccess.value = true
    setTimeout(() => (exportSuccess.value = false), 3000)
  } catch (err) {
    exportError.value = err instanceof Error ? err.message : '导出失败'
  } finally {
    isExporting.value = false
  }
}

const handleFileSelect = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return

  const fileName = file.name.toLowerCase()
  if (!fileName.endsWith('.zip') && !fileName.endsWith('.tar.gz') && !fileName.endsWith('.tgz')) {
    importError.value = '不支持的文件格式，请上传 .zip 或 .tar.gz 文件'
    return
  }

  importFile.value = file
  importError.value = null
  importPreview.value = null
  isParsing.value = true

  try {
    const preview = await transferApi.importPreview(file)
    if (preview) {
      importPreview.value = preview
      const allSelections: ExportSelection[] = []
      preview.environments.forEach((env) => {
        allSelections.push({
          environment_key: env.environment_key,
          pipeline_key: '',
          resource_keys: [],
        })
      })
      importSelections.value = allSelections
    }
  } catch (err) {
    importError.value = err instanceof Error ? err.message : '文件解析失败'
  } finally {
    isParsing.value = false
  }
}

const handleImport = async () => {
  if (!importFile.value || !importPreview.value) return

  if (importPreview.value.summary.conflict_count > 0 && !overwriteConflicts.value && !showConfirmDialog.value) {
    showConfirmDialog.value = true
    return
  }

  isImporting.value = true
  importSuccess.value = false
  importError.value = null

  try {
    await transferApi.importSelective(importFile.value, importSelections.value, overwriteConflicts.value)
    importSuccess.value = true
    setTimeout(() => {
      importSuccess.value = false
      clearImport()
      loadExportTree()
    }, 3000)
  } catch (err) {
    importError.value = err instanceof Error ? err.message : '导入失败'
  } finally {
    isImporting.value = false
    showConfirmDialog.value = false
  }
}

const clearImport = () => {
  importFile.value = null
  importPreview.value = null
  importSelections.value = []
  importError.value = null
  overwriteConflicts.value = false
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

const exportStats = computed(() => {
  let envCount = 0
  let pipeCount = 0
  let configCount = 0

  exportSelections.value.forEach((sel) => {
    const env = exportTree.value.find((e) => e.environment_key === sel.environment_key)
    if (!env) return

    if (!sel.pipeline_key) {
      envCount++
      pipeCount += env.pipelines.length
      configCount += env.pipelines.reduce((sum, p) => sum + p.config_count, 0)
    } else if (!sel.resource_keys || sel.resource_keys.length === 0) {
      const pipe = env.pipelines.find((p) => p.pipeline_key === sel.pipeline_key)
      if (pipe) {
        pipeCount++
        configCount += pipe.config_count
      }
    } else {
      configCount += sel.resource_keys.length
    }
  })

  return { envCount, pipeCount, configCount }
})

const handleExportSelectionsChange = (selections: ExportSelection[]) => {
  exportSelections.value = selections
}

const handleImportSelectionsChange = (selections: ExportSelection[]) => {
  importSelections.value = selections
}
</script>

<template>
  <div class="flex min-h-screen">
    <AppSidebar />
    <main class="flex-1 p-8 overflow-auto">
      <div class="max-w-5xl mx-auto">
        <div class="mb-8">
          <h1 class="text-2xl font-bold text-foreground">导入导出</h1>
          <p class="text-muted-foreground mt-1">
            批量导入导出配置数据，支持 ZIP 和 TAR.GZ 格式
          </p>
        </div>

        <Tabs default-value="export" class="space-y-6">
          <TabsList class="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="export" class="gap-2">
              <FolderDown class="w-4 h-4" />
              数据导出
            </TabsTrigger>
            <TabsTrigger value="import" class="gap-2">
              <FolderUp class="w-4 h-4" />
              数据导入
            </TabsTrigger>
          </TabsList>

          <TabsContent value="export" class="space-y-6">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div class="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle class="text-lg">选择导出内容</CardTitle>
                    <CardDescription>
                      选择要导出的环境、渠道或配置项
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Alert v-if="exportError" variant="destructive" class="mb-4">
                      <AlertCircle class="h-4 w-4" />
                      <AlertTitle>错误</AlertTitle>
                      <AlertDescription>{{ exportError }}</AlertDescription>
                    </Alert>
                    <ExportTreeSelect
                      :data="exportTree"
                      :loading="isLoadingTree"
                      @change="handleExportSelectionsChange"
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle class="text-lg">导出格式</CardTitle>
                    <CardDescription>选择导出文件的格式</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div class="grid grid-cols-2 gap-4">
                      <div
                        :class="[
                          'flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors',
                          exportFormat === 'zip'
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-muted-foreground/50'
                        ]"
                        @click="exportFormat = 'zip'"
                      >
                        <FileArchive class="w-8 h-8 text-amber-500" />
                        <div>
                          <div class="font-medium">ZIP</div>
                          <div class="text-sm text-muted-foreground">推荐格式</div>
                        </div>
                      </div>
                      <div
                        :class="[
                          'flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors',
                          exportFormat === 'tar.gz'
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-muted-foreground/50'
                        ]"
                        @click="exportFormat = 'tar.gz'"
                      >
                        <FileArchive class="w-8 h-8 text-blue-500" />
                        <div>
                          <div class="font-medium">TAR.GZ</div>
                          <div class="text-sm text-muted-foreground">通用压缩格式</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div class="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle class="text-lg">导出预览</CardTitle>
                  </CardHeader>
                  <CardContent class="space-y-4">
                    <div class="space-y-3">
                      <div class="flex items-center justify-between text-sm">
                        <span class="text-muted-foreground">格式</span>
                        <Badge variant="outline">.{{ exportFormat }}</Badge>
                      </div>
                      <div class="flex items-center justify-between text-sm">
                        <span class="text-muted-foreground">环境</span>
                        <span>{{ exportStats.envCount || '-' }}</span>
                      </div>
                      <div class="flex items-center justify-between text-sm">
                        <span class="text-muted-foreground">渠道</span>
                        <span>{{ exportStats.pipeCount || '-' }}</span>
                      </div>
                      <div class="flex items-center justify-between text-sm">
                        <span class="text-muted-foreground">配置项</span>
                        <span>{{ exportStats.configCount || '-' }}</span>
                      </div>
                    </div>

                    <div class="pt-4 border-t">
                      <Button
                        class="w-full"
                        @click="handleExport"
                        :disabled="isExporting || exportSelections.length === 0"
                      >
                        <Loader2 v-if="isExporting" class="w-4 h-4 mr-2 animate-spin" />
                        <Download v-else class="w-4 h-4 mr-2" />
                        {{ isExporting ? '导出中...' : '导出数据' }}
                      </Button>
                    </div>

                    <Alert v-if="exportSuccess" class="border-emerald-500 bg-emerald-50 dark:bg-emerald-950">
                      <Check class="h-4 w-4 text-emerald-600" />
                      <AlertTitle class="text-emerald-600">导出成功</AlertTitle>
                      <AlertDescription class="text-emerald-600">
                        文件已开始下载
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>

                <Alert>
                  <Info class="h-4 w-4" />
                  <AlertTitle>提示</AlertTitle>
                  <AlertDescription>
                    导出的数据包含完整的配置信息，请妥善保管，避免泄露敏感数据。
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="import" class="space-y-6">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div class="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle class="text-lg">上传文件</CardTitle>
                    <CardDescription>
                      支持 ZIP 和 TAR.GZ 格式的配置备份文件
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <template v-if="!importFile">
                      <label
                        for="import-file"
                        class="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors"
                      >
                        <Upload class="w-12 h-12 text-muted-foreground mb-4" />
                        <span class="text-sm font-medium">
                          点击或拖拽文件到此处
                        </span>
                        <span class="text-xs text-muted-foreground mt-1">
                          支持 .zip 和 .tar.gz 文件
                        </span>
                        <input
                          id="import-file"
                          type="file"
                          accept=".zip,.tar.gz,.tgz"
                          class="hidden"
                          ref="fileInputRef"
                          @change="handleFileSelect"
                        />
                      </label>
                    </template>
                    <template v-else>
                      <div class="space-y-4">
                        <div class="flex items-center gap-4 p-4 bg-muted rounded-lg">
                          <FileArchive class="w-10 h-10 text-amber-500" />
                          <div class="flex-1 min-w-0">
                            <div class="font-medium truncate">{{ importFile.name }}</div>
                            <div class="text-sm text-muted-foreground">
                              {{ (importFile.size / 1024).toFixed(2) }} KB
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" @click="clearImport">
                            <X class="w-4 h-4" />
                          </Button>
                        </div>

                        <div v-if="isParsing" class="flex items-center justify-center py-8">
                          <Loader2 class="w-6 h-6 animate-spin text-muted-foreground" />
                          <span class="ml-2 text-muted-foreground">解析文件中...</span>
                        </div>

                        <Alert v-if="importError" variant="destructive">
                          <AlertCircle class="h-4 w-4" />
                          <AlertTitle>解析失败</AlertTitle>
                          <AlertDescription>{{ importError }}</AlertDescription>
                        </Alert>
                      </div>
                    </template>
                  </CardContent>
                </Card>

                <Card v-if="importPreview">
                  <CardHeader>
                    <CardTitle class="text-lg">选择导入内容</CardTitle>
                    <CardDescription>
                      选择要导入的环境、渠道或配置项
                    </CardDescription>
                  </CardHeader>
                  <CardContent class="space-y-4">
                    <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                      <div class="p-4 bg-muted rounded-lg text-center">
                        <div class="text-2xl font-bold text-blue-600">
                          {{ importPreview.summary.total_environments }}
                        </div>
                        <div class="text-sm text-muted-foreground">环境</div>
                      </div>
                      <div class="p-4 bg-muted rounded-lg text-center">
                        <div class="text-2xl font-bold text-indigo-600">
                          {{ importPreview.summary.total_pipelines }}
                        </div>
                        <div class="text-sm text-muted-foreground">渠道</div>
                      </div>
                      <div class="p-4 bg-muted rounded-lg text-center">
                        <div class="text-2xl font-bold text-purple-600">
                          {{ importPreview.summary.total_configs }}
                        </div>
                        <div class="text-sm text-muted-foreground">配置</div>
                      </div>
                      <div class="p-4 bg-muted rounded-lg text-center">
                        <div class="text-2xl font-bold text-cyan-600">
                          {{ importPreview.summary.total_assets || 0 }}
                        </div>
                        <div class="text-sm text-muted-foreground">资源</div>
                      </div>
                      <div class="p-4 bg-muted rounded-lg text-center">
                        <div class="text-2xl font-bold text-amber-600">
                          {{ importPreview.summary.conflict_count }}
                        </div>
                        <div class="text-sm text-muted-foreground">冲突</div>
                      </div>
                    </div>

                    <ImportPreviewTree
                      :data="importPreview.environments"
                      @change="handleImportSelectionsChange"
                    />

                    <div v-if="importPreview.summary.conflict_count > 0" class="flex items-center gap-2 p-3 bg-muted rounded-lg mt-4">
                      <Checkbox
                        id="overwrite"
                        :model-value="overwriteConflicts"
                        @update:model-value="(v: boolean) => overwriteConflicts = v"
                      />
                      <label for="overwrite" class="text-sm cursor-pointer">
                        覆盖现有冲突数据
                      </label>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div class="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle class="text-lg">导入操作</CardTitle>
                  </CardHeader>
                  <CardContent class="space-y-4">
                    <template v-if="importPreview">
                      <div class="space-y-3">
                        <div class="flex items-center justify-between text-sm">
                          <span class="text-muted-foreground">文件格式</span>
                          <Badge variant="outline">{{ importPreview.format }}</Badge>
                        </div>
                        <div class="flex items-center justify-between text-sm">
                          <span class="text-muted-foreground">待导入总数</span>
                          <span class="font-medium">
                            {{ importPreview.summary.total_configs }} 项
                          </span>
                        </div>
                        <div class="flex items-center justify-between text-sm">
                          <span class="text-muted-foreground">冲突项</span>
                          <span
                            :class="importPreview.summary.conflict_count > 0 ? 'text-amber-600 font-medium' : ''"
                          >
                            {{ importPreview.summary.conflict_count }} 项
                          </span>
                        </div>
                        <div class="flex items-center justify-between text-sm">
                          <span class="text-muted-foreground">处理方式</span>
                          <Badge :variant="overwriteConflicts ? 'destructive' : 'secondary'">
                            {{ overwriteConflicts ? '覆盖' : '跳过' }}冲突
                          </Badge>
                        </div>
                      </div>

                      <div class="pt-4 border-t">
                        <Button
                          class="w-full"
                          @click="handleImport"
                          :disabled="isImporting || importSelections.length === 0"
                        >
                          <Loader2 v-if="isImporting" class="w-4 h-4 mr-2 animate-spin" />
                          <Upload v-else class="w-4 h-4 mr-2" />
                          {{ isImporting ? '导入中...' : '开始导入' }}
                        </Button>
                      </div>

                      <Alert v-if="importSuccess" class="border-emerald-500 bg-emerald-50 dark:bg-emerald-950">
                        <Check class="h-4 w-4 text-emerald-600" />
                        <AlertTitle class="text-emerald-600">导入成功</AlertTitle>
                        <AlertDescription class="text-emerald-600">
                          数据已成功导入系统
                        </AlertDescription>
                      </Alert>
                    </template>
                    <template v-else>
                      <div class="text-center py-8 text-muted-foreground">
                        <Upload class="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>请先上传配置文件</p>
                      </div>
                    </template>
                  </CardContent>
                </Card>

                <Alert>
                  <AlertCircle class="h-4 w-4" />
                  <AlertTitle>注意事项</AlertTitle>
                  <AlertDescription class="space-y-1">
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

    <Dialog :open="showConfirmDialog" @update:open="(v: boolean) => showConfirmDialog = v">
      <DialogContent>
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <FileWarning class="w-5 h-5 text-amber-500" />
            确认导入
          </DialogTitle>
          <DialogDescription>
            检测到 {{ importPreview?.summary.conflict_count }} 个冲突项，是否继续导入？
            未选择"覆盖冲突数据"时，冲突项将被跳过。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="showConfirmDialog = false">
            取消
          </Button>
          <Button @click="handleImport" :disabled="isImporting">
            <Loader2 v-if="isImporting" class="w-4 h-4 mr-2 animate-spin" />
            {{ isImporting ? '导入中...' : '确认导入' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
