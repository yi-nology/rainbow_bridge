<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Loader2, FileImage } from 'lucide-vue-next'

const props = defineProps<{
  isOpen: boolean
  imageUrl: string
  imageName: string
  onClose: () => void
}>()

const isImageLoading = ref(false)
const imageLoadError = ref(false)

const handleImageLoad = () => {
  isImageLoading.value = false
  imageLoadError.value = false
}

const handleImageError = () => {
  isImageLoading.value = false
  imageLoadError.value = true
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.isOpen) {
    props.onClose()
  }
}

onMounted(() => {
  if (props.isOpen) {
    isImageLoading.value = true
    document.addEventListener('keydown', handleKeyDown)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" @click="onClose">
    <div class="relative max-w-4xl max-h-[90vh] p-4" @click.stop>
      <button 
        @click="onClose" 
        class="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white shadow-lg flex items-center justify-center font-bold z-10"
      >
        ✕
      </button>
      
      <div v-if="isImageLoading" class="flex items-center justify-center h-[85vh]">
        <Loader2 class="w-12 h-12 animate-spin text-white" />
        <span class="text-white ml-3">加载中...</span>
      </div>
      
      <div v-else-if="imageLoadError" class="flex flex-col items-center justify-center h-[85vh] text-white">
        <FileImage class="w-16 h-16 mb-4 text-gray-400" />
        <p class="text-lg">图片加载失败</p>
        <p class="text-sm text-gray-400 mt-2">请检查网络连接或图片是否存在</p>
      </div>
      
      <img
        v-else
        :src="imageUrl"
        :alt="imageName"
        class="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
        @load="handleImageLoad"
        @error="handleImageError"
      />
      
      <div class="absolute bottom-6 left-0 right-0 text-center">
        <p class="text-white bg-black/50 py-2 px-4 rounded-full inline-block text-sm">
          {{ imageName }}
        </p>
      </div>
    </div>
  </div>
</template>