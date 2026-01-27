import { initPageLayout } from "./components.js";
import { getDefaultApiBase, getBasePathname } from "./runtime.js";
import { escapeHtml, summarizeContent, displayDataType, formatTimestamp } from "./lib/utils.js";
import { extractError } from "./lib/api.js";

initPageLayout({
  activeKey: "home",
  title: "项目概览",
  caption: "快速了解虹桥计划的能力与访问路径",
});

const defaultBase = getDefaultApiBase();
const basePathname = getBasePathname();
const state = {
  apiBase: defaultBase,
  runtime: {
    loading: false,
    selectedEnv: null,
    selectedPipeline: null,
    environments: [],
    pipelines: [],
    configs: [],
    environmentInfo: null,
    updatedAt: null,
  },
};

const elements = {
  envSelector: document.getElementById("envSelector"),
  pipelineSelector: document.getElementById("pipelineSelector"),
  refreshBtn: document.getElementById("refreshRuntimeBtn"),
  exportBtn: document.getElementById("exportStaticBtn"),
  status: document.getElementById("runtimeStatus"),
  currentEnvInfo: document.getElementById("currentEnvInfo"),
  currentPipelineInfo: document.getElementById("currentPipelineInfo"),
  configTbody: document.getElementById("runtimeConfigTbody"),
  configEmpty: document.getElementById("runtimeConfigEmpty"),
};

const endpointMap = {
  overview: "/api/v1/runtime/overview",
  resources: "/api/v1/config/list",
  runtime: "/api/v1/runtime/config",
  static: "/api/v1/runtime/static",
  files: "/api/v1/asset/file/<file_id>",
};

function formatEndpoint(path = "") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${basePathname || ""}${normalized}`;
}

function applyEndpointHints() {
  Object.entries(endpointMap).forEach(([key, relative]) => {
    const nodes = document.querySelectorAll(`[data-endpoint="${key}"]`);
    if (!nodes.length) return;
    const formatted = formatEndpoint(relative);
    nodes.forEach((node) => {
      node.textContent = formatted;
    });
  });
}

applyEndpointHints();

if (elements.refreshBtn) {
  elements.refreshBtn.addEventListener("click", () => {
    fetchRuntimeConfig(true);
  });
}

if (elements.exportBtn) {
  elements.exportBtn.addEventListener("click", () => {
    exportStaticPackage();
  });
}

if (elements.envSelector) {
  elements.envSelector.addEventListener("change", async (e) => {
    state.runtime.selectedEnv = e.target.value;
    await fetchPipelines();
    if (state.runtime.selectedPipeline) {
      await fetchRuntimeConfig();
    }
  });
}

if (elements.pipelineSelector) {
  elements.pipelineSelector.addEventListener("change", async (e) => {
    state.runtime.selectedPipeline = e.target.value;
    await fetchRuntimeConfig();
  });
}

(async function init() {
  await fetchEnvironments();
  if (state.runtime.selectedEnv) {
    await fetchPipelines();
  }
  if (state.runtime.selectedEnv && state.runtime.selectedPipeline) {
    await fetchRuntimeConfig();
  }
})();

async function fetchEnvironments() {
  try {
    const res = await fetch(`${state.apiBase}/api/v1/environment/list`);
    if (!res.ok) {
      throw new Error(await extractError(res));
    }
    const json = await res.json();
    state.runtime.environments = json?.list || [];
    
    if (elements.envSelector && state.runtime.environments.length > 0) {
      elements.envSelector.innerHTML = state.runtime.environments
        .map((env) => `<option value="${escapeHtml(env.environment_key)}">${escapeHtml(env.environment_name || env.environment_key)}</option>`)
        .join("");
      state.runtime.selectedEnv = state.runtime.environments[0].environment_key;
    }
  } catch (err) {
    setRuntimeStatus(`获取环境列表失败：${err.message}`, true);
  }
}

async function fetchPipelines() {
  if (!state.runtime.selectedEnv) {
    state.runtime.pipelines = [];
    return;
  }
  try {
    const res = await fetch(`${state.apiBase}/api/v1/pipeline/list?environment_key=${encodeURIComponent(state.runtime.selectedEnv)}`);
    if (!res.ok) {
      throw new Error(await extractError(res));
    }
    const json = await res.json();
    state.runtime.pipelines = json?.list || [];
    
    if (elements.pipelineSelector && state.runtime.pipelines.length > 0) {
      elements.pipelineSelector.innerHTML = state.runtime.pipelines
        .map((pl) => `<option value="${escapeHtml(pl.pipeline_key)}">${escapeHtml(pl.pipeline_name || pl.pipeline_key)}</option>`)
        .join("");
      state.runtime.selectedPipeline = state.runtime.pipelines[0].pipeline_key;
    } else if (elements.pipelineSelector) {
      elements.pipelineSelector.innerHTML = '<option value="">暂无渠道</option>';
      state.runtime.selectedPipeline = null;
    }
  } catch (err) {
    setRuntimeStatus(`获取渠道列表失败：${err.message}`, true);
  }
}

async function fetchRuntimeConfig(manual = false) {
  if (!elements.status || state.runtime.loading) {
    return;
  }
  if (!state.runtime.selectedEnv || !state.runtime.selectedPipeline) {
    setRuntimeStatus("请选择环境和渠道", true);
    return;
  }
  
  state.runtime.loading = true;
  setRuntimeStatus(manual ? "刷新中…" : "配置加载中…");
  
  try {
    const res = await fetch(`${state.apiBase}/api/v1/runtime/config`, {
      headers: {
        "x-environment": state.runtime.selectedEnv,
        "x-pipeline": state.runtime.selectedPipeline,
      },
    });
    if (!res.ok) {
      throw new Error(await extractError(res));
    }
    const json = await res.json();
    state.runtime.configs = json?.configs || [];
    state.runtime.environmentInfo = json?.environment || {};
    state.runtime.updatedAt = new Date();
    
    renderRuntimeConfig();
    setRuntimeStatus(`最新更新时间：${formatTimestamp(state.runtime.updatedAt)}`);
  } catch (err) {
    setRuntimeStatus(err.message || "获取配置失败", true);
  } finally {
    state.runtime.loading = false;
  }
}

function renderRuntimeConfig() {
  if (!elements.configTbody) {
    return;
  }
  
  // Update environment info display
  if (elements.currentEnvInfo && state.runtime.environmentInfo) {
    const envName = state.runtime.environmentInfo.environment_name || state.runtime.environmentInfo.environment_key || "-";
    elements.currentEnvInfo.textContent = envName;
  }
  if (elements.currentPipelineInfo && state.runtime.environmentInfo) {
    const plName = state.runtime.environmentInfo.pipeline_name || state.runtime.environmentInfo.pipeline_key || "-";
    elements.currentPipelineInfo.textContent = plName;
  }
  
  // Render config table
  const configs = state.runtime.configs || [];
  elements.configTbody.innerHTML = "";
  
  if (!configs.length) {
    if (elements.configEmpty) {
      elements.configEmpty.classList.remove("hidden");
    }
    return;
  }
  
  if (elements.configEmpty) {
    elements.configEmpty.classList.add("hidden");
  }
  
  configs.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.name || "-")}</td>
      <td>${escapeHtml(item.alias || "-")}</td>
      <td>${escapeHtml(displayDataType(item.type))}</td>
      <td>${escapeHtml(summarizeContent(formatConfigContent(item.content)))}</td>
      <td>${escapeHtml(item.remark || "-")}</td>
    `;
    elements.configTbody.appendChild(tr);
  });
}

function formatConfigContent(value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

async function exportStaticPackage() {
  if (!state.runtime.selectedEnv || !state.runtime.selectedPipeline) {
    setRuntimeStatus("请先选择环境和渠道", true);
    return;
  }
  
  try {
    const url = `${state.apiBase}/api/v1/runtime/static?environment_key=${encodeURIComponent(state.runtime.selectedEnv)}&pipeline_key=${encodeURIComponent(state.runtime.selectedPipeline)}`;
    window.open(url, "_blank");
    setRuntimeStatus("正在下载静态资源包...");
  } catch (err) {
    setRuntimeStatus(`导出失败：${err.message}`, true);
  }
}

function setRuntimeStatus(message, isError = false) {
  if (!elements.status) return;
  elements.status.textContent = message || "";
  elements.status.classList.toggle("error", Boolean(isError));
}
