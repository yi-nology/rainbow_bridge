<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppSidebar from '@/components/AppSidebar.vue'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FolderDown, FolderUp } from 'lucide-vue-next'
import ExportFunctionality from '@/components/ImportExport/ExportFunctionality.vue'
import ImportFunctionality from '@/components/ImportExport/ImportFunctionality.vue'
import { transferApi, type ExportTreeEnvironment } from '@/lib/api/transfer'

const exportTree = ref<ExportTreeEnvironment[]>([])
const isLoadingTree = ref(true)

onMounted(() => {
  loadExportTree()
})

const loadExportTree = async () => {
  isLoadingTree.value = true
  try {
    const tree = await transferApi.getExportTree()
    exportTree.value = tree
  } catch (err) {
    console.error('加载数据失败:', err)
  } finally {
    isLoadingTree.value = false
  }
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
            <ExportFunctionality 
              :export-tree="exportTree" 
              :is-loading-tree="isLoadingTree"
              @load-tree="loadExportTree"
            />
          </TabsContent>

          <TabsContent value="import" class="space-y-6">
            <ImportFunctionality @load-tree="loadExportTree" />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  </div>
</template>
