<script setup lang="ts">
const props = defineProps<{
  imagePreviewUrl: string | null
  onClose: () => void
}>()

const handleClose = () => {
  props.onClose()
}

const handleBackdropClick = (event: MouseEvent) => {
  if (event.target === event.currentTarget) {
    handleClose()
  }
}
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="imagePreviewUrl" 
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-300"
      @click="handleBackdropClick"
    >
      <div class="relative max-w-5xl max-h-[90vh] p-4" @click.stop>
        <img 
          :src="imagePreviewUrl" 
          class="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
          alt="图片预览"
        />
        <button 
          class="absolute top-6 right-6 w-10 h-10 rounded-full bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center font-bold transition-colors duration-300"
          @click="handleClose"
        >
          ✕
        </button>
      </div>
    </div>
  </Teleport>
</template>