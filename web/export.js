import { initPageLayout } from "./components.js";

initPageLayout({
  activeKey: "export",
  title: "配置导出中心",
  caption: "批量导出配置 ZIP 或 Nginx 静态资源包，支持多业务并行",
});

const defaultBase = window.location.origin.replace(/\/$/, "");
const state = {
  apiBase: defaultBase,
  businessKeys: [],
  selectedKeys: new Set(),
  lastConfigSummary: null,
  lastStaticSummary: null,
  exportingZip: false,
  exportingStatic: false,
};

function getSelectedBusinessKeys() {
  return Array.from(state.selectedKeys.values())
    .map((key) => (typeof key === "string" ? key.trim() : key))
    .filter(Boolean);
}

const el = {
  businessList: document.getElementById("exportBusinessList"),
  exportZipBtn: document.getElementById("exportZipBtn"),
  exportStaticBtn: document.getElementById("exportStaticBtn"),
  exportSummary: document.getElementById("exportSummary"),
  exportClearBtn: document.getElementById("exportClearBtn"),
  staticSummary: document.getElementById("staticSummary"),
  staticClearBtn: document.getElementById("staticClearBtn"),
  toast: document.getElementById("exportToast"),
};

if (!el.businessList || !el.exportZipBtn || !el.exportStaticBtn) {
  console.warn("export page markup missing required nodes");
} else {
  init();
}

async function init() {
  await fetchBusinessKeys();
  el.businessList.addEventListener("change", onBusinessToggle);
  el.exportZipBtn.addEventListener("click", onExportZip);
  el.exportStaticBtn.addEventListener("click", onExportStatic);
  el.exportClearBtn.addEventListener("click", () => {
    state.lastConfigSummary = null;
    renderSummary(el.exportSummary, null, "尚未导出任何配置");
  });
  el.staticClearBtn.addEventListener("click", () => {
    state.lastStaticSummary = null;
    renderSummary(el.staticSummary, null, "尚未导出静态资源包");
  });
  renderSummary(el.exportSummary, null, "尚未导出任何配置");
  renderSummary(el.staticSummary, null, "尚未导出静态资源包");
}

async function fetchBusinessKeys() {
  try {
    const res = await fetch(`${state.apiBase}/api/v1/resources/business-keys`);
    const json = await res.json();
    const list = json?.list || json?.data?.list || [];
    if (!list.includes("system")) {
      list.unshift("system");
    }
    state.businessKeys = list;
    state.selectedKeys.clear();
    if (list.length) {
      state.selectedKeys.add(list[0]);
    }
    renderBusinessChecklist();
  } catch (err) {
    showToast(`获取业务列表失败：${err.message || err}`);
  }
}

function renderBusinessChecklist() {
  if (!el.businessList) return;
  if (!state.businessKeys.length) {
    el.businessList.innerHTML = `<p class="summary-list summary-muted">暂无业务数据</p>`;
    return;
  }
  el.businessList.innerHTML = "";
  state.businessKeys.forEach((key) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "business";
    input.value = key;
    input.checked = state.selectedKeys.has(key);
    label.appendChild(input);
    const span = document.createElement("span");
    span.textContent = key;
    label.appendChild(span);
    el.businessList.appendChild(label);
  });
}

function onBusinessToggle(evt) {
  const input = evt.target;
  if (input?.name !== "business") return;
  if (input.checked) {
    state.selectedKeys.add(input.value);
  } else {
    state.selectedKeys.delete(input.value);
  }
}

async function onExportZip() {
  if (state.exportingZip) return;
  const keys = getSelectedBusinessKeys();
  if (!keys.length) {
    showToast("请选择至少一个业务");
    return;
  }
  state.exportingZip = true;
  setButtonLoading(el.exportZipBtn, true, "导出中…");
  const includeSystem = true;
  try {
    const summary = await fetchExportSummary(keys, includeSystem);
    await downloadExportZip(keys, includeSystem);
    state.lastConfigSummary = summary;
    renderSummary(el.exportSummary, summary, "尚未导出任何配置");
    showToast(`配置 ZIP 已导出：${keys.length} 个业务`);
  } catch (err) {
    showToast(err.message || "导出失败");
  } finally {
    state.exportingZip = false;
    setButtonLoading(el.exportZipBtn, false);
  }
}

async function onExportStatic() {
  if (state.exportingStatic) return;
  const keys = getSelectedBusinessKeys();
  if (!keys.length) {
    showToast("请选择至少一个业务");
    return;
  }
  state.exportingStatic = true;
  setButtonLoading(el.exportStaticBtn, true, "导出中…");
  const includeSystem = true;
  try {
    const summary = await fetchExportSummary(keys, includeSystem);
    await downloadStaticBundle(keys, includeSystem);
    state.lastStaticSummary = summary;
    renderSummary(el.staticSummary, summary, "尚未导出静态资源包");
    showToast(`Nginx 静态包已导出：${keys.length} 个业务`);
  } catch (err) {
    showToast(err.message || "导出失败");
  } finally {
    state.exportingStatic = false;
    setButtonLoading(el.exportStaticBtn, false);
  }
}

async function fetchExportSummary(businessKeys, includeSystem) {
  const query = new URLSearchParams({
    format: "json",
  });
  if (Array.isArray(businessKeys) && businessKeys.length) {
    query.set("business_keys", businessKeys.join(","));
  }
  if (includeSystem) {
    query.set("include_system", "true");
  }
  const res = await fetch(`${state.apiBase}/api/v1/resources/export?${query.toString()}`);
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  const json = await res.json();
  const list = json?.list || json?.data?.list || [];
  return buildSummary(list);
}

async function downloadExportZip(businessKeys, includeSystem) {
  const query = new URLSearchParams({
    format: "zip",
  });
  if (Array.isArray(businessKeys) && businessKeys.length) {
    query.set("business_keys", businessKeys.join(","));
  }
  if (includeSystem) {
    query.set("include_system", "true");
  }
  const res = await fetch(`${state.apiBase}/api/v1/resources/export?${query.toString()}`);
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || res.headers.get("content-disposition") || "";
  const filename = parseFilename(disposition) || `${(businessKeys && businessKeys[0]) || "configs"}_archive.zip`;
  downloadBlob(blob, filename);
}

async function downloadStaticBundle(businessKeys, includeSystem) {
  const query = new URLSearchParams({
    format: "nginx",
  });
  if (Array.isArray(businessKeys) && businessKeys.length) {
    query.set("business_keys", businessKeys.join(","));
  }
  if (includeSystem) {
    query.set("include_system", "true");
  }
  const res = await fetch(`${state.apiBase}/api/v1/resources/export?${query.toString()}`);
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || res.headers.get("content-disposition") || "";
  const filename = parseFilename(disposition) || `${(businessKeys && businessKeys[0]) || "configs"}_static_bundle.zip`;
  downloadBlob(blob, filename);
}

function renderSummary(container, summary, emptyText) {
  if (!container) return;
  if (!summary || !summary.total) {
    container.classList.add("summary-muted", "summary-empty");
    container.textContent = emptyText;
    return;
  }
  container.classList.remove("summary-muted", "summary-empty");
  container.innerHTML = "";
  const groups = groupByBusiness(summary.items);
  groups.forEach((items, businessKey) => {
    container.appendChild(createSummaryItem(businessKey, items));
  });
}

function createSummaryItem(businessKey, items) {
  const wrapper = document.createElement("div");
  wrapper.className = "summary-item";

  const header = document.createElement("div");
  header.className = "summary-item-header";

  const title = document.createElement("span");
  title.className = "summary-item-title";
  title.textContent = `${businessKey || "未指定业务"} · ${items.length} 项`;

  const meta = document.createElement("span");
  meta.className = "summary-item-meta";
  const typeSet = new Set(items.map((item) => item.type).filter(Boolean));
  meta.textContent = typeSet.size ? `类型：${Array.from(typeSet).join(" / ")}` : "类型：-";

  header.appendChild(title);
  header.appendChild(meta);
  wrapper.appendChild(header);

  const list = document.createElement("ul");
  list.className = "summary-item-details";
  items.forEach((item) => {
    const li = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = item.name || item.alias || item.resourceKey || "未命名";
    li.appendChild(name);
    const detailParts = [];
    if (item.alias && item.alias !== item.name) {
      detailParts.push(`别名：${item.alias}`);
    }
    detailParts.push(`类型：${item.type || "-"}`);
    const detail = document.createElement("span");
    detail.textContent = ` ${detailParts.join(" · ")}`;
    li.appendChild(detail);
    list.appendChild(li);
  });
  wrapper.appendChild(list);
  return wrapper;
}

function groupByBusiness(items = []) {
  const map = new Map();
  items.forEach((item) => {
    const key = item.businessKey || "未指定业务";
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(item);
  });
  map.forEach((group) => sortSummaryItems(group));
  return map;
}

function buildSummary(configs = []) {
  const items = [];
  configs.forEach((cfg) => {
    if (!cfg) return;
    const item = {
      resourceKey: getValue(cfg, ["resourceKey", "resource_key"]),
      businessKey: getValue(cfg, ["businessKey", "business_key"]),
      name: getValue(cfg, ["name"]),
      alias: getValue(cfg, ["alias"]),
      type: getValue(cfg, ["type"]),
    };
    items.push(item);
  });
  return normalizeSummary({ items, total: items.length });
}

function normalizeSummary(summary) {
  if (!summary) return null;
  const items = Array.isArray(summary.items)
    ? summary.items.map((item) => ({
        resourceKey: getValue(item, ["resourceKey", "resource_key"]),
        businessKey: getValue(item, ["businessKey", "business_key"]),
        name: getValue(item, ["name"]),
        alias: getValue(item, ["alias"]),
        type: getValue(item, ["type"]),
      }))
    : [];
  const businessKeys = Array.isArray(summary.businessKeys)
    ? summary.businessKeys.filter(Boolean)
    : [];
  const normalized = {
    total: typeof summary.total === "number" ? summary.total : items.length,
    businessKeys,
    items,
  };
  if (!normalized.businessKeys.length && items.length) {
    const set = new Set(items.map((item) => item.businessKey).filter(Boolean));
    normalized.businessKeys = Array.from(set).sort();
  }
  normalized.total = items.length;
  sortSummaryItems(normalized.items);
  return normalized;
}

function sortSummaryItems(items = []) {
  items.sort((a, b) => {
    if (a.businessKey === b.businessKey) {
      const nameA = (a.name || a.alias || a.resourceKey || "").toString();
      const nameB = (b.name || b.alias || b.resourceKey || "").toString();
      const nameCompare = nameA.localeCompare(nameB, "zh-Hans-CN");
      if (nameCompare !== 0) {
        return nameCompare;
      }
      return 0;
    }
    return (a.businessKey || "").localeCompare(b.businessKey || "", "zh-Hans-CN");
  });
}

function getValue(obj, keys = []) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj || {}, key) && obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }
  return "";
}

function parseFilename(header) {
  const match = /filename\\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i.exec(header);
  if (!match) return "";
  const encoded = match[1] || match[2];
  try {
    return decodeURIComponent(encoded);
  } catch (err) {
    return encoded;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function extractError(res) {
  const text = await res.text();
  if (!text) return res.statusText || "请求失败";
  try {
    const json = JSON.parse(text);
    return json.error || json.msg || res.statusText || "请求失败";
  } catch (err) {
    return text;
  }
}

function showToast(message) {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.toast.classList.add("hidden"), 2600);
}

function setButtonLoading(button, loading, loadingText) {
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
