import { initPageLayout, initEnvSelector, initPipelineSelector } from "./components.js";
import { getDefaultApiBase } from "./runtime.js";
import { createModal } from "./ui.js";
import { escapeHtml, escapeAttr, formatSize } from "./lib/utils.js";
import { fetchAssets } from "./lib/api.js";
import { createToast } from "./lib/toast.js";
import { getBusinessKeys } from "./lib/init.js";

initPageLayout({
  activeKey: "assets",
  title: "静态资源库",
  caption: "集中上传与管理可复用文件，统一引用规范",
  showEnvSelector: true,
  showPipelineSelector: true,
});

const defaultBase = getDefaultApiBase();
const state = {
  apiBase: defaultBase,
  businessKeys: [],
  activeBusiness: "",
  assets: [],
  search: "",
};

const showToast = createToast("assetToast");

const el = {
  tabs: document.getElementById("assetBusinessTabs"),
  tableBody: document.getElementById("assetTbody"),
  count: document.getElementById("assetCount"),
  search: document.getElementById("assetSearchInput"),
  empty: document.getElementById("assetEmpty"),
  uploadBtn: document.getElementById("assetUploadBtn"),
  modalForm: document.getElementById("assetForm"),
  uploadResult: document.getElementById("assetUploadResult"),
  toast: document.getElementById("assetToast"),
};

const assetModal = createModal("assetModal", {
  onClose: () => {
    el.modalForm.reset();
    el.uploadResult.textContent = "";
    el.uploadResult.classList.add("hidden");
  },
});

(async function init() {
  await loadBusinessKeys();
  await initEnvSelector(state.apiBase, () => loadAssets());
  await initPipelineSelector(state.apiBase, () => loadAssets());
})();

el.search.addEventListener("input", (evt) => {
  state.search = evt.target.value.trim().toLowerCase();
  renderTable();
});

el.uploadBtn.addEventListener("click", () => {
  el.modalForm.reset();
  el.uploadResult.textContent = "";
  el.uploadResult.classList.add("hidden");
  const businessInput = el.modalForm.elements.business_key;
  if (businessInput && state.activeBusiness) {
    businessInput.value = state.activeBusiness;
  }
  assetModal.open();
});

el.modalForm.addEventListener("submit", async (evt) => {
  evt.preventDefault();
  const formData = new FormData(el.modalForm);
  try {
    const res = await fetch(`${state.apiBase}/api/v1/asset/upload`, {
      method: "POST",
      body: formData,
    });
    const json = await res.json();
    const reference = json?.data?.reference || json?.reference;
    let message = JSON.stringify(json, null, 2);
    if (reference) {
      message += `\n\n引用地址: ${reference}`;
    }
    el.uploadResult.textContent = message;
    el.uploadResult.classList.remove("hidden");
    showToast("上传成功");
    await loadAssets();
  } catch (err) {
    el.uploadResult.textContent = err.message;
    el.uploadResult.classList.remove("hidden");
  }
});

async function loadBusinessKeys() {
  try {
    state.businessKeys = await getBusinessKeys({ apiBase: state.apiBase });
    state.activeBusiness = state.businessKeys[0] || "";
    renderTabs();
    await loadAssets();
  } catch (err) {
    showToast(`获取业务列表失败: ${err.message}`);
  }
}

async function loadAssets() {
  if (!state.activeBusiness) {
    state.assets = [];
    renderTable();
    return;
  }
  try {
    state.assets = await fetchAssets(state.apiBase, state.activeBusiness);
    renderTable();
  } catch (err) {
    showToast(`获取静态资源失败: ${err.message}`);
  }
}

function renderTabs() {
  el.tabs.innerHTML = "";
  state.businessKeys.forEach((key) => {
    const span = document.createElement("span");
    span.className = `business-tab${key === state.activeBusiness ? " active" : ""}`;
    span.textContent = key;
    span.addEventListener("click", async () => {
      if (state.activeBusiness === key) return;
      state.activeBusiness = key;
      renderTabs();
      await loadAssets();
    });
    el.tabs.appendChild(span);
  });
}

function renderTable() {
  const records = state.assets.filter((asset) => {
    if (!state.search) return true;
    const haystack = [asset.file_name, asset.business_key, asset.content_type, asset.url]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(state.search);
  });

  el.count.textContent = `静态资源 · 共 ${records.length} 个`;
  el.tableBody.innerHTML = "";
  el.empty.classList.toggle("hidden", records.length > 0);

  records.forEach((asset) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(asset.file_name || "-")}</td>
      <td>${escapeHtml(asset.business_key || "-")}</td>
      <td>${formatSize(asset.file_size)}</td>
      <td>${escapeHtml(asset.content_type || "-")}</td>
      <td>${escapeHtml(asset.remark || "-")}</td>
      <td>
        <div class="table-actions">
          <button class="ghost"
            data-copy="${escapeAttr(asset.url || "")}"
            data-fallback-id="${escapeAttr(asset.file_id || "")}">复制引用</button>
          <a class="ghost" href="${escapeAttr(asset.url || "#")}" target="_blank">下载</a>
        </div>
      </td>`;
    el.tableBody.appendChild(tr);
  });
}

document.addEventListener("click", (evt) => {
  const btn = evt.target.closest("button[data-copy]");
  if (!btn) return;
  let text = btn.dataset.copy;
  if (!text) {
    const fallbackId = btn.dataset.fallbackId;
    if (fallbackId) {
      text = `${state.apiBase}/api/v1/asset/file/${fallbackId}`;
    }
  }
  if (!text) {
    showToast("暂无可复制的引用地址");
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    showToast("已复制引用地址");
  });
});
