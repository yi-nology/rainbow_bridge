const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff', 'ico', 'heic', 'heif']
export const IMAGE_ACCEPT = [...imageExtensions.map(extension => '.' + extension), 'image/*'].join(',')
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024

/** Selection hints are not content verification; the server still checks bytes. */
export function imageSelectionError(files: readonly File[]): string {
  if (files.length !== 1) return '一次只能上传一张图片'
  const file = files[0]!
  if (!file.size) return '图片不能为空'
  if (file.size > IMAGE_MAX_BYTES) return '图片不能超过 10 MiB'
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  const knownExtension = imageExtensions.includes(extension)
  const supportedMime = /^image\/(jpeg|pjpeg|png|x-png|gif|webp|svg\+xml|bmp|x-ms-bmp|tiff|x-icon|vnd\.microsoft\.icon|heic|heif)$/i.test(file.type)
  const unspecifiedMime = !file.type || file.type === 'application/octet-stream'
  return supportedMime || (unspecifiedMime && knownExtension) ? '' : '请选择支持的图片文件'
}
