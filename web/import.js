import { initPageLayout } from "./components.js";

initPageLayout({
  activeKey: "import",
  title: "配置导入中心",
  caption: "上传由平台导出的 ZIP，系统会还原配置与静态资源",
});

const defaultBase = window.location.origin.replace(/\/$/, "");
const state = {
  apiBase: defaultBase,
  lastImportSummary: null,
};

const el = {
  importForm: document.getElementById("importZipForm"),
  importSummary: document.getElementById("importSummary"),
  importResetBtn: document.getElementById("importResetBtn"),
  archiveInput: document.getElementById("importArchiveInput"),
  toast: document.getElementById("importToast"),
};

if (!el.importForm || !el.importSummary) {
  console.warn("import page markup missing required nodes");
} else {
  init();
}

function init() {
  el.importForm.addEventListener("submit", onImportZip);
  el.importResetBtn.addEventListener("click", onImportReset);
  renderSummary(el.importSummary, null, "尚未执行导入");
}

async function onImportZip(evt) {
  evt.preventDefault();
  const formData = new FormData(el.importForm);
  if (!formData.get("archive")) {
    showToast("请选择 ZIP 文件");
    return;
  }
  try {
    const res = await fetch(`${state.apiBase}/api/v1/resources/import`, {
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
    showToast(`导入完成，共写入 ${total} 条配置`);
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

function getValue(obj, keys = []) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj || {}, key) && obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }
  return "";
}

function showToast(message) {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.toast.classList.add("hidden"), 2600);
}
