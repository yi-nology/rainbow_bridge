export interface Environment {
  id: string
  key: string
  name: string
  pipelines: Pipeline[]
}

export interface Pipeline {
  id: string
  key: string
  name: string
}

export type ConfigType = 
  | 'text'        // 单行文本
  | 'textarea'    // 多行文本
  | 'richtext'    // 富文本
  | 'number'      // 整数
  | 'decimal'     // 小数
  | 'boolean'     // 布尔值
  | 'keyvalue'    // 键值对
  | 'object'      // JSON对象
  | 'color'       // 色彩标签
  | 'file'        // 文件
  | 'image'       // 图片

export const CONFIG_TYPE_META: Record<ConfigType, { label: string; color: string; description: string }> = {
  text: { 
    label: "文本", 
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    description: "单行文本输入"
  },
  textarea: { 
    label: "多行文本", 
    color: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300",
    description: "多行文本输入"
  },
  richtext: { 
    label: "富文本", 
    color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300",
    description: "支持HTML格式的富文本"
  },
  number: { 
    label: "整数", 
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
    description: "整数数值"
  },
  decimal: { 
    label: "小数", 
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
    description: "浮点数数值"
  },
  boolean: { 
    label: "布尔值", 
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    description: "真/假开关"
  },
  keyvalue: { 
    label: "键值对", 
    color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300",
    description: "键值对列表"
  },
  object: { 
    label: "对象", 
    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
    description: "JSON对象"
  },
  color: { 
    label: "色彩", 
    color: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300",
    description: "颜色选择器"
  },
  file: { 
    label: "文件", 
    color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
    description: "文件上传"
  },
  image: { 
    label: "图片", 
    color: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300",
    description: "图片上传"
  },
}

export interface ConfigItem {
  id: string
  name: string
  alias: string
  type: ConfigType
  content: string
  environmentId: string
  pipelineId: string
  createdAt: string
  updatedAt: string
}

export interface RuntimeOverview {
  environments: Environment[]
}
