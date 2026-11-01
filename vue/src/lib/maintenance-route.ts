export const publicId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/
export const isMaintenanceTaskPath = (path: string) => /^\/backups\/tasks\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(path)
