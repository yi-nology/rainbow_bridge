import { initPageLayout } from "./components.js";
import { createModal } from "./ui.js";

initPageLayout({
  activeKey: "assets",
  title: "静态资源库",
  caption: "集中上传与管理可复用文件，统一引用规范",
});

const defaultBase = window.location.origin.replace(/\/$/, "");
const state = {
  apiBase: defaultBase,
  businessKeys: [],
  activeBusiness: "",
  assets: [],
  search: "",
};

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
  await fetchBusinessKeys();
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
    const res = await fetch(`${state.apiBase}/api/v1/resources/upload`, {
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
    await fetchAssets();
  } catch (err) {
    el.uploadResult.textContent = err.message;
    el.uploadResult.classList.remove("hidden");
  }
});

async function fetchBusinessKeys() {
  try {
    const res = await fetch(`${state.apiBase}/api/v1/resources/business-keys`);
    const json = await res.json();
    state.businessKeys = json?.list || json?.data?.list || [];
    state.activeBusiness = state.businessKeys[0] || "";
    renderTabs();
    await fetchAssets();
  } catch (err) {
    showToast(`获取业务列表失败: ${err.message}`);
  }
}

async function fetchAssets() {
  if (!state.activeBusiness) {
    state.assets = [];
    renderTable();
    return;
  }
  try {
    const url = `${state.apiBase}/api/v1/assets?business_key=${encodeURIComponent(state.activeBusiness)}`;
    const res = await fetch(url);
    const json = await res.json();
    state.assets = json?.assets || json?.data?.assets || [];
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
      await fetchAssets();
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
      text = `/api/v1/files/${fallbackId}`;
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

function formatSize(size) {
  if (!size) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let value = size;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(1)} ${units[idx]}`;
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(str = "") {
  return escapeHtml(str).replace(/"/g, "&quot;");
}

function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.toast.classList.add("hidden"), 2200);
}
