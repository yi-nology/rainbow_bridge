import { initPageLayout } from "./components.js";
import { getDefaultApiBase } from "./runtime.js";

initPageLayout({
  activeKey: "home",
  title: "项目概览",
  caption: "快速了解虹桥计划的能力与访问路径",
});

const defaultBase = getDefaultApiBase();
const state = {
  apiBase: defaultBase,
  realtime: {
    loading: false,
    payload: null,
    updatedAt: null,
  },
};

const elements = {
  refreshBtn: document.getElementById("realtimeRefreshBtn"),
  status: document.getElementById("realtimeStatus"),
  businessKey: document.getElementById("realtimeBusinessKey"),
  businessList: document.getElementById("realtimeBusinessList"),
  systemTbody: document.getElementById("realtimeSystemTbody"),
  systemEmpty: document.getElementById("realtimeSystemEmpty"),
  businessTitle: document.getElementById("realtimeBusinessTitle"),
  businessTbody: document.getElementById("realtimeBusinessTbody"),
  businessEmpty: document.getElementById("realtimeBusinessEmpty"),
};

if (elements.refreshBtn) {
  elements.refreshBtn.addEventListener("click", () => {
    fetchRealtimePreview(true);
  });
}

renderRealtimePreview();
(async function init() {
  await fetchRealtimePreview();
})();

async function fetchRealtimePreview(manual = false) {
  if (!elements.status || state.realtime.loading) {
    return;
  }
  state.realtime.loading = true;
  setRealtimeStatus(manual ? "刷新中…" : "实时数据加载中…");
  try {
    const res = await fetch(`${state.apiBase}/api/v1/resources/nginx-config`);
    if (!res.ok) {
      throw new Error(await extractError(res));
    }
    const json = await res.json();
    state.realtime.payload = json || {};
    state.realtime.updatedAt = new Date();
    renderRealtimePreview();
    setRealtimeStatus(`最新更新时间：${formatTimestamp(state.realtime.updatedAt)}`);
  } catch (err) {
    setRealtimeStatus(err.message || "获取实时数据失败", true);
  } finally {
    state.realtime.loading = false;
  }
}

function renderRealtimePreview() {
  if (!elements.systemTbody || !elements.businessTbody) {
    return;
  }
  const payload = state.realtime.payload || {};
  const selectedRaw = typeof payload.business_select === "string" ? payload.business_select : "";
  const selectedKey = selectedRaw.trim();

  if (elements.businessKey) {
    elements.businessKey.textContent = selectedKey || "未设置";
  }
  if (elements.businessList) {
    const keys = Array.isArray(payload.business_keys) ? payload.business_keys : [];
    elements.businessList.textContent = keys.length ? keys.join("、") : "—";
  }

  const systemRows = mapRealtimeEntries(payload.system);
  renderRealtimeTable(elements.systemTbody, elements.systemEmpty, systemRows);

  if (elements.businessTitle) {
    elements.businessTitle.textContent = selectedKey || "默认业务";
  }
  const businessSource = selectedKey && payload[selectedKey] ? payload[selectedKey] : {};
  const businessRows = mapRealtimeEntries(businessSource);
  if (elements.businessEmpty) {
    elements.businessEmpty.textContent = selectedKey
      ? "默认业务暂无配置"
      : "尚未设置 business_select";
  }
  renderRealtimeTable(elements.businessTbody, elements.businessEmpty, businessRows);
}

function renderRealtimeTable(tbody, emptyElement, rows) {
  if (!tbody) return;
  const data = Array.isArray(rows) ? rows : [];
  tbody.innerHTML = "";
  if (!data.length) {
    if (emptyElement) {
      emptyElement.classList.remove("hidden");
    }
    return;
  }
  if (emptyElement) {
    emptyElement.classList.add("hidden");
  }
  data.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.name || "-")}</td>
      <td>${escapeHtml(item.alias || "-")}</td>
      <td>${escapeHtml(displayDataType(item.type))}</td>
      <td>${escapeHtml(summarizeContent(formatRealtimeContent(item.content)))}</td>
      <td>${escapeHtml(item.remark || "-")}</td>
    `;
    tbody.appendChild(tr);
  });
}

function mapRealtimeEntries(source) {
  if (!source || typeof source !== "object") {
    return [];
  }
  return Object.entries(source)
    .map(([alias, entry]) => {
      const aliasKey = typeof alias === "string" ? alias : String(alias);
      const details = entry && typeof entry === "object" ? entry : {};
      return {
        alias: aliasKey,
        name: details.name || "",
        type: details.type || "",
        content: details.content,
        remark: details.remark || "",
      };
    })
    .sort((a, b) => a.alias.localeCompare(b.alias));
}

function formatRealtimeContent(value) {
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

function summarizeContent(content = "") {
  if (!content) return "";
  return content.length > 20 ? `${content.slice(0, 20)}…` : content;
}

function displayDataType(value = "") {
  const str = value.toString().toLowerCase();
  if (str === "image") return "图片";
  if (["text", "string", "copy", "文案"].includes(str)) return "文案";
  return "配置对象";
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setRealtimeStatus(message, isError = false) {
  if (!elements.status) return;
  elements.status.textContent = message || "";
  elements.status.classList.toggle("error", Boolean(isError));
}

function formatTimestamp(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
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
