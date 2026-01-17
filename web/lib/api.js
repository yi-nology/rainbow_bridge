import { getDefaultApiBase } from "../runtime.js";

/**
 * Extract error message from fetch response
 * @param {Response} res - Fetch response
 * @returns {Promise<string>} Error message
 */
export async function extractError(res) {
  const text = await res.text();
  if (!text) return res.statusText || "\u8bf7\u6c42\u5931\u8d25";
  try {
    const json = JSON.parse(text);
    return json.error || json.msg || res.statusText || "\u8bf7\u6c42\u5931\u8d25";
  } catch (err) {
    return text;
  }
}

/**
 * Fetch business keys from API
 * @param {string} apiBase - API base URL
 * @param {Object} options - Options
 * @param {boolean} options.excludeSystem - Whether to exclude 'system' key
 * @param {boolean} options.includeSystem - Whether to ensure 'system' is included
 * @returns {Promise<string[]>} List of business keys
 */
export async function fetchBusinessKeys(apiBase, options = {}) {
  const base = apiBase || getDefaultApiBase();
  const res = await fetch(`${base}/api/v1/system/business-keys`);
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  const json = await res.json();
  let list = json?.list || json?.data?.list || [];

  if (options.excludeSystem) {
    list = list.filter((key) => key !== "system");
  }
  if (options.includeSystem && !list.includes("system")) {
    list.unshift("system");
  }

  return list;
}

/**
 * Fetch system configs from API
 * @param {string} apiBase - API base URL
 * @returns {Promise<Array>} List of system configs
 */
export async function fetchSystemConfigs(apiBase) {
  const base = apiBase || getDefaultApiBase();
  const res = await fetch(`${base}/api/v1/config/list?business_key=system`);
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  const json = await res.json();
  return json?.list || json?.data?.list || [];
}

/**
 * Parse system_keys config from system configs
 * @param {Array} systemConfigs - List of system configs
 * @returns {Array<{key: string, value: string}>} Parsed system keys
 */
export function parseSystemKeys(systemConfigs) {
  const systemConfig = systemConfigs.find((item) => item.alias === "system_keys");
  if (!systemConfig || !systemConfig.content) {
    return [];
  }
  let parsed = {};
  try {
    parsed = JSON.parse(systemConfig.content);
  } catch (err) {
    throw new Error("system_keys \u914d\u7f6e\u683c\u5f0f\u9519\u8bef");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("system_keys \u914d\u7f6e\u683c\u5f0f\u9519\u8bef");
  }
  const entries = Object.entries(parsed).map(([key, value]) => ({
    key,
    value: value == null ? "" : String(value),
  }));
  entries.sort((a, b) => {
    if (a.value === b.value) {
      return a.key.localeCompare(b.key, "zh-Hans-CN");
    }
    return a.value.localeCompare(b.value, "zh-Hans-CN");
  });
  return entries;
}

/**
 * Fetch configs by business key
 * @param {string} apiBase - API base URL
 * @param {string} businessKey - Business key
 * @returns {Promise<Array>} List of configs
 */
export async function fetchConfigs(apiBase, businessKey) {
  if (!businessKey) return [];
  const base = apiBase || getDefaultApiBase();
  const res = await fetch(
    `${base}/api/v1/config/list?business_key=${encodeURIComponent(businessKey)}`
  );
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  const json = await res.json();
  return json?.list || json?.data?.list || [];
}

/**
 * Fetch assets by business key
 * @param {string} apiBase - API base URL
 * @param {string} businessKey - Business key
 * @returns {Promise<Array>} List of assets
 */
export async function fetchAssets(apiBase, businessKey) {
  if (!businessKey) return [];
  const base = apiBase || getDefaultApiBase();
  const url = `${base}/api/v1/asset/list?business_key=${encodeURIComponent(businessKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  const json = await res.json();
  return json?.assets || json?.data?.assets || [];
}

/**
 * Save config (create or update)
 * @param {string} apiBase - API base URL
 * @param {Object} config - Config object
 * @param {boolean} isUpdate - Whether this is an update (has resource_key)
 * @returns {Promise<Object>} Response data
 */
export async function saveConfig(apiBase, config, isUpdate = false) {
  const base = apiBase || getDefaultApiBase();
  const endpoint = isUpdate ? "/api/v1/config/update" : "/api/v1/config/create";
  const res = await fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  const json = await res.json();
  if (json.code && json.code !== 200) {
    throw new Error(json.error || json.msg || "\u4fdd\u5b58\u5931\u8d25");
  }
  return json;
}

/**
 * Delete config
 * @param {string} apiBase - API base URL
 * @param {string} businessKey - Business key
 * @param {string} resourceKey - Resource key
 * @returns {Promise<Object>} Response data
 */
export async function deleteConfig(apiBase, businessKey, resourceKey) {
  const base = apiBase || getDefaultApiBase();
  const res = await fetch(`${base}/api/v1/config/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ business_key: businessKey, resource_key: resourceKey }),
  });
  const json = await res.json();
  if (json.code && json.code !== 200) {
    throw new Error(json.error || json.msg || "\u5220\u9664\u5931\u8d25");
  }
  return json;
}

/**
 * Upload file
 * @param {string} apiBase - API base URL
 * @param {FormData} formData - Form data with file
 * @returns {Promise<Object>} Upload response with reference and asset
 */
export async function uploadFile(apiBase, formData) {
  const base = apiBase || getDefaultApiBase();
  const res = await fetch(`${base}/api/v1/asset/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  const json = await res.json();
  if (json.code && json.code !== 200) {
    throw new Error(json.error || json.msg || "\u4e0a\u4f20\u5931\u8d25");
  }
  return {
    reference: json?.data?.reference || json?.reference,
    asset: json?.data?.asset || json?.asset,
    raw: json,
  };
}
