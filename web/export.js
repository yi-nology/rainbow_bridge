import { initPageLayout } from "./components.js";
import { getDefaultApiBase } from "./runtime.js";
import { getValue, setButtonLoading, parseFilename, downloadBlob } from "./lib/utils.js";
import { extractError } from "./lib/api.js";
import { createToast } from "./lib/toast.js";

initPageLayout({
  activeKey: "export",
  title: "配置导出中心",
  caption: "批量导出配置 ZIP 或 Nginx 静态资源包，支持环境和流水线隔离",
});

const defaultBase = getDefaultApiBase();
const state = {
  apiBase: defaultBase,
  environments: [],
  pipelines: [],
  selectedEnv: null,
  selectedPipeline: null,
  lastConfigSummary: null,
  lastStaticSummary: null,
  exportingZip: false,
  exportingStatic: false,
};

const el = {
  envList: document.getElementById("exportEnvList"),
  pipelineList: document.getElementById("exportPipelineList"),
  exportZipBtn: document.getElementById("exportZipBtn"),
  exportStaticBtn: document.getElementById("exportStaticBtn"),
  exportSummary: document.getElementById("exportSummary"),
  exportClearBtn: document.getElementById("exportClearBtn"),
  staticSummary: document.getElementById("staticSummary"),
  staticClearBtn: document.getElementById("staticClearBtn"),
  toast: document.getElementById("exportToast"),
};

const showToast = createToast("exportToast");

if (!el.envList || !el.pipelineList || !el.exportZipBtn || !el.exportStaticBtn) {
  console.warn("export page markup missing required nodes");
} else {
  init();
}

async function init() {
  await fetchEnvironments();
  // 等待环境加载完成后再加载流水线
  if (state.selectedEnv) {
    await fetchPipelines();
  }
  el.envList.addEventListener("click", onEnvSelect);
  el.pipelineList.addEventListener("click", onPipelineSelect);
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

async function fetchEnvironments() {
  try {
    const res = await fetch(`${state.apiBase}/api/v1/environment/list`);
    const json = await res.json();
    state.environments = json?.list || json?.data?.list || [];
    if (state.environments.length > 0) {
      state.selectedEnv = state.environments[0].environment_key;
    }
    renderEnvTabs();
  } catch (err) {
    showToast(`获取环境列表失败：${err.message || err}`);
  }
}

async function fetchPipelines() {
  if (!state.selectedEnv) {
    state.pipelines = [];
    renderPipelineTabs();
    return;
  }
  try {
    const res = await fetch(`${state.apiBase}/api/v1/pipeline/list?environment_key=${encodeURIComponent(state.selectedEnv)}`);
    const json = await res.json();
    state.pipelines = json?.list || json?.data?.list || [];
    if (state.pipelines.length > 0) {
      state.selectedPipeline = state.pipelines[0].pipeline_key;
    } else {
      state.selectedPipeline = null;
    }
    renderPipelineTabs();
  } catch (err) {
    showToast(`获取流水线列表失败：${err.message || err}`);
  }
}

function renderEnvTabs() {
  if (!el.envList) return;
  if (!state.environments.length) {
    el.envList.innerHTML = `<span class="selector-empty">暂无环境数据</span>`;
    return;
  }
  el.envList.innerHTML = state.environments.map((env) => `
    <span class="selector-tab${state.selectedEnv === env.environment_key ? " active" : ""}" 
          data-key="${env.environment_key}">
      ${env.environment_name || env.environment_key}
    </span>
  `).join("");
}

function renderPipelineTabs() {
  if (!el.pipelineList) return;
  if (!state.pipelines.length) {
    el.pipelineList.innerHTML = `<span class="selector-empty">暂无流水线数据</span>`;
    return;
  }
  el.pipelineList.innerHTML = state.pipelines.map((pl) => `
    <span class="selector-tab${state.selectedPipeline === pl.pipeline_key ? " active" : ""}" 
          data-key="${pl.pipeline_key}">
      ${pl.pipeline_name || pl.pipeline_key}
    </span>
  `).join("");
}

function onEnvSelect(evt) {
  const tab = evt.target.closest(".selector-tab");
  if (!tab) return;
  state.selectedEnv = tab.dataset.key;
  renderEnvTabs();
  // 环境切换时重新加载流水线
  fetchPipelines();
}

function onPipelineSelect(evt) {
  const tab = evt.target.closest(".selector-tab");
  if (!tab) return;
  state.selectedPipeline = tab.dataset.key;
  renderPipelineTabs();
}

async function onExportZip() {
  if (state.exportingZip) return;
  
  // 询问是否包含系统配置
  const includeSystemConfig = confirm(
    "导出所有环境和流水线的配置\n\n" +
    "默认导出：所有业务配置 + 图片资源\n\n" +
    "是否一并导出系统配置？\n\n" +
    "点击“确定”：业务配置 + 系统配置 + 图片资源\n" +
    "点击“取消”：仅业务配置 + 图片资源"
  );
  
  state.exportingZip = true;
  setButtonLoading(el.exportZipBtn, true, "导出中…");
  try {
    await downloadExportZipAll(includeSystemConfig);
    const msg = includeSystemConfig 
      ? `配置 ZIP 已导出：所有环境和流水线（包含业务配置、系统配置、图片资源）`
      : `配置 ZIP 已导出：所有环境和流水线（包含业务配置、图片资源）`;
    showToast(msg);
  } catch (err) {
    showToast(err.message || "导出失败");
  } finally {
    state.exportingZip = false;
    setButtonLoading(el.exportZipBtn, false);
  }
}

async function onExportStatic() {
  if (state.exportingStatic) return;
  if (!state.selectedEnv) {
    showToast("请选择环境");
    return;
  }
  if (!state.selectedPipeline) {
    showToast("请选择流水线");
    return;
  }
  state.exportingStatic = true;
  setButtonLoading(el.exportStaticBtn, true, "导出中…");
  try {
    const summary = await fetchExportSummary();
    await downloadStaticBundle();
    state.lastStaticSummary = summary;
    renderSummary(el.staticSummary, summary, "尚未导出静态资源包");
    showToast(`Nginx 静态包已导出：环境 ${state.selectedEnv}，流水线 ${state.selectedPipeline}`);
  } catch (err) {
    showToast(err.message || "导出失败");
  } finally {
    state.exportingStatic = false;
    setButtonLoading(el.exportStaticBtn, false);
  }
}

async function fetchExportSummary(includeSystemConfig = false) {
  const query = new URLSearchParams({
    format: "json",
    environment_key: state.selectedEnv,
    pipeline_key: state.selectedPipeline,
    include_system_config: includeSystemConfig ? "true" : "false",
  });
  const res = await fetch(`${state.apiBase}/api/v1/transfer/export?${query.toString()}`);
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  const json = await res.json();
  const list = json?.list || json?.data?.list || [];
  return buildSummary(list);
}

async function downloadExportZip(includeSystemConfig = false) {
  const query = new URLSearchParams({
    format: "zip",
    environment_key: state.selectedEnv,
    pipeline_key: state.selectedPipeline,
    include_system_config: includeSystemConfig ? "true" : "false",
  });
  const res = await fetch(`${state.apiBase}/api/v1/transfer/export?${query.toString()}`);
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || res.headers.get("content-disposition") || "";
  const filename = parseFilename(disposition) || `${state.selectedEnv}_${state.selectedPipeline}_archive.zip`;
  downloadBlob(blob, filename);
}

async function downloadExportZipAll(includeSystemConfig = false) {
  const query = new URLSearchParams({
    format: "zip",
    environment_key: "all",
    pipeline_key: "all",
    include_system_config: includeSystemConfig ? "true" : "false",
  });
  const res = await fetch(`${state.apiBase}/api/v1/transfer/export?${query.toString()}`);
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || res.headers.get("content-disposition") || "";
  const filename = parseFilename(disposition) || "all_environments_archive.zip";
  downloadBlob(blob, filename);
}

async function downloadStaticBundle() {
  const query = new URLSearchParams({
    format: "nginx",
    environment_key: state.selectedEnv,
    pipeline_key: state.selectedPipeline,
    include_system_config: "true",
  });
  const res = await fetch(`${state.apiBase}/api/v1/transfer/export?${query.toString()}`);
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || res.headers.get("content-disposition") || "";
  const filename = parseFilename(disposition) || `${state.selectedEnv}_${state.selectedPipeline}_static_bundle.zip`;
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
