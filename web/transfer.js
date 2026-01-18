import { initPageLayout } from "./components.js";
import { getDefaultApiBase } from "./runtime.js";
import { getValue, setButtonLoading, parseFilename, downloadBlob } from "./lib/utils.js";
import { extractError } from "./lib/api.js";
import { createToast } from "./lib/toast.js";

initPageLayout({
  activeKey: "transfer",
  title: "配置迁移中心",
  caption: "导出配置进行备份分发，或导入 ZIP 还原到目标环境",
});

const defaultBase = getDefaultApiBase();
const state = {
  apiBase: defaultBase,
  currentTab: "export",
  export: {
    environments: [],
    pipelines: [],
    selectedEnv: null,
    selectedPipeline: null,
    lastConfigSummary: null,
    lastStaticSummary: null,
    exportingZip: false,
    exportingStatic: false,
  },
  import: {
    environments: [],
    pipelines: [],
    selectedEnv: null,
    selectedPipeline: null,
    lastImportSummary: null,
  },
};

const el = {
  exportTabBtn: document.getElementById("exportTabBtn"),
  importTabBtn: document.getElementById("importTabBtn"),
  exportTab: document.getElementById("exportTab"),
  importTab: document.getElementById("importTab"),
  // Export elements
  exportEnvList: document.getElementById("exportEnvList"),
  exportPipelineList: document.getElementById("exportPipelineList"),
  exportZipBtn: document.getElementById("exportZipBtn"),
  exportStaticBtn: document.getElementById("exportStaticBtn"),
  exportSummary: document.getElementById("exportSummary"),
  exportClearBtn: document.getElementById("exportClearBtn"),
  staticSummary: document.getElementById("staticSummary"),
  staticClearBtn: document.getElementById("staticClearBtn"),
  // Import elements
  importEnvList: document.getElementById("importEnvList"),
  importPipelineList: document.getElementById("importPipelineList"),
  importForm: document.getElementById("importZipForm"),
  importSummary: document.getElementById("importSummary"),
  importResetBtn: document.getElementById("importResetBtn"),
  archiveInput: document.getElementById("importArchiveInput"),
};

const showToast = createToast("transferToast");

if (!el.exportTabBtn || !el.importTabBtn) {
  console.warn("transfer page markup missing required nodes");
} else {
  init();
}

async function init() {
  // 初始化标签页切换
  el.exportTabBtn.addEventListener("click", () => switchTab("export"));
  el.importTabBtn.addEventListener("click", () => switchTab("import"));

  // 初始化导出功能
  await fetchExportEnvironments();
  if (state.export.selectedEnv) {
    await fetchExportPipelines();
  }
  el.exportEnvList.addEventListener("click", onExportEnvSelect);
  el.exportPipelineList.addEventListener("click", onExportPipelineSelect);
  el.exportZipBtn.addEventListener("click", onExportZip);
  el.exportStaticBtn.addEventListener("click", onExportStatic);
  el.exportClearBtn.addEventListener("click", () => {
    state.export.lastConfigSummary = null;
    renderSummary(el.exportSummary, null, "尚未导出任何配置");
  });
  el.staticClearBtn.addEventListener("click", () => {
    state.export.lastStaticSummary = null;
    renderSummary(el.staticSummary, null, "尚未导出静态资源包");
  });
  renderSummary(el.exportSummary, null, "尚未导出任何配置");
  renderSummary(el.staticSummary, null, "尚未导出静态资源包");

  // 初始化导入功能
  await fetchImportEnvironments();
  if (state.import.selectedEnv) {
    await fetchImportPipelines();
  }
  if (el.importEnvList) {
    el.importEnvList.addEventListener("click", onImportEnvSelect);
  }
  if (el.importPipelineList) {
    el.importPipelineList.addEventListener("click", onImportPipelineSelect);
  }
  el.importForm.addEventListener("submit", onImportZip);
  el.importResetBtn.addEventListener("click", onImportReset);
  renderSummary(el.importSummary, null, "尚未执行导入");
}

// ==================== 标签页切换 ====================
function switchTab(tab) {
  state.currentTab = tab;
  
  // 更新按钮状态
  el.exportTabBtn.classList.toggle("active", tab === "export");
  el.importTabBtn.classList.toggle("active", tab === "import");
  
  // 更新内容显示
  el.exportTab.classList.toggle("active", tab === "export");
  el.importTab.classList.toggle("active", tab === "import");
}

// ==================== 导出功能 ====================
async function fetchExportEnvironments() {
  try {
    const res = await fetch(`${state.apiBase}/api/v1/environment/list`);
    const json = await res.json();
    state.export.environments = json?.list || json?.data?.list || [];
    if (state.export.environments.length > 0) {
      state.export.selectedEnv = state.export.environments[0].environment_key;
    }
    renderExportEnvTabs();
  } catch (err) {
    showToast(`获取环境列表失败：${err.message || err}`);
  }
}

async function fetchExportPipelines() {
  if (!state.export.selectedEnv) {
    state.export.pipelines = [];
    renderExportPipelineTabs();
    return;
  }
  try {
    const res = await fetch(`${state.apiBase}/api/v1/pipeline/list?environment_key=${encodeURIComponent(state.export.selectedEnv)}`);
    const json = await res.json();
    state.export.pipelines = json?.list || json?.data?.list || [];
    if (state.export.pipelines.length > 0) {
      state.export.selectedPipeline = state.export.pipelines[0].pipeline_key;
    } else {
      state.export.selectedPipeline = null;
    }
    renderExportPipelineTabs();
  } catch (err) {
    showToast(`获取渠道列表失败：${err.message || err}`);
  }
}

function renderExportEnvTabs() {
  if (!el.exportEnvList) return;
  if (!state.export.environments.length) {
    el.exportEnvList.innerHTML = `<span class="selector-empty">暂无环境数据</span>`;
    return;
  }
  el.exportEnvList.innerHTML = state.export.environments.map((env) => `
    <span class="selector-tab${state.export.selectedEnv === env.environment_key ? " active" : ""}" 
          data-key="${env.environment_key}">
      ${env.environment_name || env.environment_key}
    </span>
  `).join("");
}

function renderExportPipelineTabs() {
  if (!el.exportPipelineList) return;
  if (!state.export.pipelines.length) {
    el.exportPipelineList.innerHTML = `<span class="selector-empty">暂无渠道数据</span>`;
    return;
  }
  el.exportPipelineList.innerHTML = state.export.pipelines.map((pl) => `
    <span class="selector-tab${state.export.selectedPipeline === pl.pipeline_key ? " active" : ""}" 
          data-key="${pl.pipeline_key}">
      ${pl.pipeline_name || pl.pipeline_key}
    </span>
  `).join("");
}

function onExportEnvSelect(evt) {
  const tab = evt.target.closest(".selector-tab");
  if (!tab) return;
  state.export.selectedEnv = tab.dataset.key;
  renderExportEnvTabs();
  fetchExportPipelines();
}

function onExportPipelineSelect(evt) {
  const tab = evt.target.closest(".selector-tab");
  if (!tab) return;
  state.export.selectedPipeline = tab.dataset.key;
  renderExportPipelineTabs();
}

async function onExportZip() {
  if (state.export.exportingZip) return;
  
  const includeSystemConfig = confirm(
    "导出所有环境和渠道的配置\n\n" +
    "默认导出：所有业务配置 + 图片资源\n\n" +
    "是否一并导出系统配置？\n\n" +
    "点击'确定'：业务配置 + 系统配置 + 图片资源\n" +
    "点击'取消'：仅业务配置 + 图片资源"
  );
  
  state.export.exportingZip = true;
  setButtonLoading(el.exportZipBtn, true, "导出中…");
  try {
    await downloadExportZipAll(includeSystemConfig);
    const msg = includeSystemConfig 
      ? `配置 ZIP 已导出：所有环境和渠道（包含业务配置、系统配置、图片资源）`
      : `配置 ZIP 已导出：所有环境和渠道（包含业务配置、图片资源）`;
    showToast(msg);
  } catch (err) {
    showToast(err.message || "导出失败");
  } finally {
    state.export.exportingZip = false;
    setButtonLoading(el.exportZipBtn, false);
  }
}

async function onExportStatic() {
  if (state.export.exportingStatic) return;
  if (!state.export.selectedEnv) {
    showToast("请选择环境");
    return;
  }
  if (!state.export.selectedPipeline) {
    showToast("请选择渠道");
    return;
  }
  state.export.exportingStatic = true;
  setButtonLoading(el.exportStaticBtn, true, "导出中…");
  try {
    const summary = await fetchExportSummary();
    await downloadStaticBundle();
    state.export.lastStaticSummary = summary;
    renderSummary(el.staticSummary, summary, "尚未导出静态资源包");
    showToast(`Nginx 静态包已导出：环境 ${state.export.selectedEnv}，渠道 ${state.export.selectedPipeline}`);
  } catch (err) {
    showToast(err.message || "导出失败");
  } finally {
    state.export.exportingStatic = false;
    setButtonLoading(el.exportStaticBtn, false);
  }
}

async function fetchExportSummary(includeSystemConfig = false) {
  const query = new URLSearchParams({
    format: "json",
    environment_key: state.export.selectedEnv,
    pipeline_key: state.export.selectedPipeline,
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
    environment_key: state.export.selectedEnv,
    pipeline_key: state.export.selectedPipeline,
    include_system_config: "true",
  });
  const res = await fetch(`${state.apiBase}/api/v1/transfer/export?${query.toString()}`);
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || res.headers.get("content-disposition") || "";
  const filename = parseFilename(disposition) || `${state.export.selectedEnv}_${state.export.selectedPipeline}_static_bundle.zip`;
  downloadBlob(blob, filename);
}

// ==================== 导入功能 ====================
async function fetchImportEnvironments() {
  try {
    const res = await fetch(`${state.apiBase}/api/v1/environment/list`);
    const json = await res.json();
    state.import.environments = json?.list || json?.data?.list || [];
    if (state.import.environments.length > 0) {
      state.import.selectedEnv = state.import.environments[0].environment_key;
    }
    renderImportEnvTabs();
  } catch (err) {
    showToast(`获取环境列表失败：${err.message || err}`);
  }
}

async function fetchImportPipelines() {
  if (!state.import.selectedEnv) {
    state.import.pipelines = [];
    renderImportPipelineTabs();
    return;
  }
  try {
    const res = await fetch(`${state.apiBase}/api/v1/pipeline/list?environment_key=${encodeURIComponent(state.import.selectedEnv)}`);
    const json = await res.json();
    state.import.pipelines = json?.list || json?.data?.list || [];
    if (state.import.pipelines.length > 0) {
      state.import.selectedPipeline = state.import.pipelines[0].pipeline_key;
    } else {
      state.import.selectedPipeline = null;
    }
    renderImportPipelineTabs();
  } catch (err) {
    showToast(`获取渠道列表失败：${err.message || err}`);
  }
}

function renderImportEnvTabs() {
  if (!el.importEnvList) return;
  if (!state.import.environments.length) {
    el.importEnvList.innerHTML = `<span class="selector-empty">暂无环境数据</span>`;
    return;
  }
  el.importEnvList.innerHTML = state.import.environments.map((env) => `
    <span class="selector-tab${state.import.selectedEnv === env.environment_key ? " active" : ""}" 
          data-key="${env.environment_key}">
      ${env.environment_name || env.environment_key}
    </span>
  `).join("");
}

function renderImportPipelineTabs() {
  if (!el.importPipelineList) return;
  if (!state.import.pipelines.length) {
    el.importPipelineList.innerHTML = `<span class="selector-empty">暂无渠道数据</span>`;
    return;
  }
  el.importPipelineList.innerHTML = state.import.pipelines.map((pl) => `
    <span class="selector-tab${state.import.selectedPipeline === pl.pipeline_key ? " active" : ""}" 
          data-key="${pl.pipeline_key}">
      ${pl.pipeline_name || pl.pipeline_key}
    </span>
  `).join("");
}

function onImportEnvSelect(evt) {
  const tab = evt.target.closest(".selector-tab");
  if (!tab) return;
  state.import.selectedEnv = tab.dataset.key;
  renderImportEnvTabs();
  fetchImportPipelines();
}

function onImportPipelineSelect(evt) {
  const tab = evt.target.closest(".selector-tab");
  if (!tab) return;
  state.import.selectedPipeline = tab.dataset.key;
  renderImportPipelineTabs();
}

async function onImportZip(evt) {
  evt.preventDefault();
  if (!state.import.selectedEnv) {
    showToast("请选择目标环境");
    return;
  }
  if (!state.import.selectedPipeline) {
    showToast("请选择目标渠道");
    return;
  }
  const formData = new FormData(el.importForm);
  if (!formData.get("archive")) {
    showToast("请选择 ZIP 文件");
    return;
  }
  formData.append("environment_key", state.import.selectedEnv);
  formData.append("pipeline_key", state.import.selectedPipeline);
  
  try {
    const res = await fetch(`${state.apiBase}/api/v1/transfer/import`, {
      method: "POST",
      body: formData,
    });
    const json = await res.json();
    if (json.code && json.code !== 200) {
      throw new Error(json.error || json.msg || "导入失败");
    }
    const summary = normalizeSummary(json.summary);
    state.import.lastImportSummary = summary;
    renderSummary(el.importSummary, summary, "尚未执行导入");
    const total = summary?.total || 0;
    showToast(`导入完成，共写入 ${total} 条配置到环境 ${state.import.selectedEnv}，渠道 ${state.import.selectedPipeline}`);
    el.importForm.reset();
  } catch (err) {
    showToast(err.message || "导入失败");
  }
}

function onImportReset() {
  state.import.lastImportSummary = null;
  el.importForm.reset();
  renderSummary(el.importSummary, null, "尚未执行导入");
}

// ==================== 通用函数 ====================
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
