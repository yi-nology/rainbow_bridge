import { initPageLayout } from "./components.js";
import { getDefaultApiBase } from "./runtime.js";
import { getValue } from "./lib/utils.js";
import { createToast } from "./lib/toast.js";

initPageLayout({
  activeKey: "import",
  title: "配置导入中心",
  caption: "选择目标环境和流水线，上传由平台导出的 ZIP，系统会还原配置与静态资源",
});

const defaultBase = getDefaultApiBase();
const state = {
  apiBase: defaultBase,
  environments: [],
  pipelines: [],
  selectedEnv: null,
  selectedPipeline: null,
  lastImportSummary: null,
};

const el = {
  envList: document.getElementById("importEnvList"),
  pipelineList: document.getElementById("importPipelineList"),
  importForm: document.getElementById("importZipForm"),
  importSummary: document.getElementById("importSummary"),
  importResetBtn: document.getElementById("importResetBtn"),
  archiveInput: document.getElementById("importArchiveInput"),
  toast: document.getElementById("importToast"),
};

const showToast = createToast("importToast");

if (!el.importForm || !el.importSummary) {
  console.warn("import page markup missing required nodes");
} else {
  init();
}

async function init() {
  await fetchEnvironments();
  // 等待环境加载完成后再加载流水线
  if (state.selectedEnv) {
    await fetchPipelines();
  }
  if (el.envList) {
    el.envList.addEventListener("click", onEnvSelect);
  }
  if (el.pipelineList) {
    el.pipelineList.addEventListener("click", onPipelineSelect);
  }
  el.importForm.addEventListener("submit", onImportZip);
  el.importResetBtn.addEventListener("click", onImportReset);
  renderSummary(el.importSummary, null, "尚未执行导入");
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

async function onImportZip(evt) {
  evt.preventDefault();
  if (!state.selectedEnv) {
    showToast("请选择目标环境");
    return;
  }
  if (!state.selectedPipeline) {
    showToast("请选择目标流水线");
    return;
  }
  const formData = new FormData(el.importForm);
  if (!formData.get("archive")) {
    showToast("请选择 ZIP 文件");
    return;
  }
  // 添加环境和流水线参数
  formData.append("environment_key", state.selectedEnv);
  formData.append("pipeline_key", state.selectedPipeline);
  
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
    state.lastImportSummary = summary;
    renderSummary(el.importSummary, summary, "尚未执行导入");
    const total = summary?.total || 0;
    showToast(`导入完成，共写入 ${total} 条配置到环境 ${state.selectedEnv}，流水线 ${state.selectedPipeline}`);
    el.importForm.reset();
  } catch (err) {
    showToast(err.message || "导入失败");
  }
}

function onImportReset() {
  state.lastImportSummary = null;
  el.importForm.reset();
  renderSummary(el.importSummary, null, "尚未执行导入");
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
