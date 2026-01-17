import { getDefaultApiBase } from "../runtime.js";
import { extractError } from "./api.js";

let cachedInitData = null;
let initPromise = null;

/**
 * @typedef {Object} InitData
 * @property {string[]} business_keys - List of business keys
 * @property {Object} system_config - Parsed system config
 * @property {string} system_config.business_select - Selected business key
 * @property {Array<{key: string, value: string}>} system_config.system_keys - System keys
 * @property {Object} realtime_config - Realtime config data
 */

/**
 * Get initialization data from unified API endpoint
 * Uses caching to avoid multiple requests
 * @param {Object} options - Options
 * @param {string} options.apiBase - API base URL
 * @param {boolean} options.force - Force refresh, bypass cache
 * @returns {Promise<InitData>} Initialization data
 */
export async function getInitData(options = {}) {
  const { apiBase, force = false } = options;

  if (!force && cachedInitData) {
    return cachedInitData;
  }

  if (!force && initPromise) {
    return initPromise;
  }

  const base = apiBase || getDefaultApiBase();
  initPromise = fetchInitData(base);

  try {
    cachedInitData = await initPromise;
    return cachedInitData;
  } finally {
    initPromise = null;
  }
}

/**
 * Fetch init data from server
 * @param {string} apiBase - API base URL
 * @returns {Promise<InitData>} Init data
 */
async function fetchInitData(apiBase) {
  const res = await fetch(`${apiBase}/api/v1/system/init`);
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  const json = await res.json();
  return normalizeInitData(json);
}

/**
 * Normalize init data response
 * @param {Object} json - Raw response
 * @returns {InitData} Normalized data
 */
function normalizeInitData(json) {
  const data = json?.data || json || {};

  return {
    business_keys: data.business_keys || [],
    system_config: {
      business_select: data.system_config?.business_select || "",
      system_keys: normalizeSystemKeys(data.system_config?.system_keys),
    },
    realtime_config: data.realtime_config || {},
  };
}

/**
 * Normalize system keys to array format
 * @param {Object|Array} keys - System keys (object or array)
 * @returns {Array<{key: string, value: string}>} Normalized array
 */
function normalizeSystemKeys(keys) {
  if (!keys) return [];

  if (Array.isArray(keys)) {
    return keys.map((item) => ({
      key: item.key || "",
      value: item.value || "",
    }));
  }

  if (typeof keys === "object") {
    return Object.entries(keys).map(([key, value]) => ({
      key,
      value: value == null ? "" : String(value),
    }));
  }

  return [];
}

/**
 * Clear cached init data
 */
export function clearInitCache() {
  cachedInitData = null;
  initPromise = null;
}

/**
 * Get business keys from init data
 * @param {Object} options - Options
 * @param {string} options.apiBase - API base URL
 * @param {boolean} options.excludeSystem - Exclude 'system' from list
 * @param {boolean} options.force - Force refresh
 * @returns {Promise<string[]>} Business keys
 */
export async function getBusinessKeys(options = {}) {
  const initData = await getInitData(options);
  let keys = initData.business_keys || [];

  if (options.excludeSystem) {
    keys = keys.filter((key) => key !== "system");
  }

  return keys;
}

/**
 * Get system keys from init data
 * @param {Object} options - Options
 * @param {string} options.apiBase - API base URL
 * @param {boolean} options.force - Force refresh
 * @returns {Promise<Array<{key: string, value: string}>>} System keys
 */
export async function getSystemKeys(options = {}) {
  const initData = await getInitData(options);
  return initData.system_config?.system_keys || [];
}

/**
 * Get selected business from init data
 * @param {Object} options - Options
 * @param {string} options.apiBase - API base URL
 * @param {boolean} options.force - Force refresh
 * @returns {Promise<string>} Selected business key
 */
export async function getSelectedBusiness(options = {}) {
  const initData = await getInitData(options);
  return initData.system_config?.business_select || "";
}

/**
 * Get realtime config from init data
 * @param {Object} options - Options
 * @param {string} options.apiBase - API base URL
 * @param {boolean} options.force - Force refresh
 * @returns {Promise<Object>} Realtime config
 */
export async function getRealtimeConfig(options = {}) {
  const initData = await getInitData(options);
  return initData.realtime_config || {};
}
