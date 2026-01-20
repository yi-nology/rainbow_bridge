import { CONFIG_TYPES, getConfigTypeName } from "./types.js";

/**
 * HTML escape utility to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * HTML attribute escape utility
 * @param {string} str - String to escape for attributes
 * @returns {string} Escaped string
 */
export function escapeAttr(str = "") {
  return escapeHtml(str).replace(/"/g, "&quot;");
}

/**
 * Normalize data type to internal format
 * @param {string} value - Input type value
 * @returns {string} Normalized type: 'image', 'text', 'color', 'json', or 'kv'
 */
export function normalizeDataType(value = "") {
  const str = value.toString().toLowerCase();
  if (str === CONFIG_TYPES.IMAGE || str === "image") return CONFIG_TYPES.IMAGE;
  if (["text", "string", "copy", "文案", "文本"].includes(str)) return CONFIG_TYPES.TEXT;
  if (["color", "colour", "color_tag", "color-tag", "色彩", "色彩标签"].includes(str)) return CONFIG_TYPES.COLOR;
  if (["kv", "keyvalue", "key-value", "键值对"].includes(str)) return CONFIG_TYPES.KV;
  if (["json", "config", "对象", "配置对象"].includes(str)) return CONFIG_TYPES.JSON;
  return CONFIG_TYPES.JSON; // default
}

/**
 * Display friendly data type name
 * @param {string} value - Internal type value
 * @returns {string} Display name
 */
export function displayDataType(value = "") {
  const normalized = normalizeDataType(value);
  return getConfigTypeName(normalized);
}

/**
 * Summarize content for table display
 * @param {string} content - Content to summarize
 * @param {number} maxLength - Maximum length before truncation
 * @returns {string} Summarized content
 */
export function summarizeContent(content = "", maxLength = 20) {
  if (!content) return "";
  return content.length > maxLength ? content.slice(0, maxLength) + "\u2026" : content;
}

/**
 * Normalize hex color value
 * @param {string} value - Color value to normalize
 * @returns {string} Normalized hex color or empty string
 */
export function normalizeColorValue(value = "") {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return "";
  let hex = match[1];
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  return `#${hex.toUpperCase()}`;
}

/**
 * Format file size for display
 * @param {number} size - Size in bytes
 * @returns {string} Formatted size string
 */
export function formatSize(size) {
  if (!size) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let value = size;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(1)} ${units[idx]}`;
}

/**
 * Format timestamp for display
 * @param {Date} date - Date to format
 * @returns {string} Formatted time string (HH:MM:SS)
 */
export function formatTimestamp(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Get value from object by multiple possible keys
 * @param {Object} obj - Source object
 * @param {string[]} keys - Possible keys in order of preference
 * @returns {*} Found value or empty string
 */
export function getValue(obj, keys = []) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj || {}, key) && obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }
  return "";
}

/**
 * Parse filename from Content-Disposition header
 * @param {string} header - Content-Disposition header value
 * @returns {string} Extracted filename
 */
export function parseFilename(header) {
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(header);
  if (!match) return "";
  const encoded = match[1] || match[2];
  try {
    return decodeURIComponent(encoded);
  } catch (err) {
    return encoded;
  }
}

/**
 * Download a blob as file
 * @param {Blob} blob - Blob to download
 * @param {string} filename - Target filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Resolve asset reference or path to a full URL
 * @param {string} reference - Asset reference (asset://id), relative path (/api/...) or full URL
 * @param {string} apiBase - API base URL
 * @returns {string} Resolved URL
 */
export function resolveAssetUrl(reference = "", apiBase = "") {
  const trimmed = reference.trim();
  if (!trimmed) return "";

  // Full URL
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // asset:// protocol
  if (trimmed.startsWith("asset://")) {
    const assetId = trimmed.replace("asset://", "");
    return assetId ? `${apiBase}/api/v1/asset/file/${encodeURIComponent(assetId)}` : "";
  }

  // Relative path
  if (trimmed.startsWith("/")) {
    return `${apiBase}${trimmed}`;
  }

  // fallback or already relative/absolute path without leading slash
  // If it doesn't match any, and isn't empty, we could try to prefix it if it looks like a path
  // but for now let's be conservative.
  return trimmed;
}

/**
 * Set button loading state
 * @param {HTMLButtonElement} button - Button element
 * @param {boolean} loading - Loading state
 * @param {string} loadingText - Text to show while loading
 */
export function setButtonLoading(button, loading, loadingText) {
  if (!button) return;
  if (loading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }
    if (loadingText) {
      button.textContent = loadingText;
    }
    button.disabled = true;
  } else {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }
}
