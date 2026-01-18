// 系统配置数据类型枚举
export const CONFIG_TYPES = {
  KV: "kv",
  JSON: "json",
  TEXT: "text",
  IMAGE: "image",
  COLOR: "color",
};

// 类型显示名称映射
export const CONFIG_TYPE_NAMES = {
  [CONFIG_TYPES.KV]: "键值对",
  [CONFIG_TYPES.JSON]: "对象",
  [CONFIG_TYPES.TEXT]: "文本",
  [CONFIG_TYPES.IMAGE]: "图片",
  [CONFIG_TYPES.COLOR]: "色彩标签",
};

// 获取类型显示名称
export function getConfigTypeName(type) {
  return CONFIG_TYPE_NAMES[type] || type || "未知";
}

// 标准化类型值（向后兼容）
export function normalizeConfigType(type) {
  const mapping = {
    config: CONFIG_TYPES.JSON,
    keyvalue: CONFIG_TYPES.KV,
  };
  return mapping[type] || type || CONFIG_TYPES.TEXT;
}

// 验证类型是否有效
export function isValidConfigType(type) {
  return Object.values(CONFIG_TYPES).includes(type);
}
