import { initPageLayout, initEnvSelector, initPipelineSelector, getCurrentEnvironment, getCurrentPipeline } from "./components.js";
import { getDefaultApiBase } from "./runtime.js";
import { createModal } from "./ui.js";
import { escapeHtml, escapeAttr, formatSize, resolveAssetUrl } from "./lib/utils.js";
import { fetchAssets } from "./lib/api.js";
import { createToast } from "./lib/toast.js";

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
  assets: [],
  search: "",
};

const showToast = createToast("assetToast");

const el = {
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
  await loadAssets();
  
  let pipelineReloader = null;
  
  // 初始化环境选择器，并在切换时重载渠道和资源
  await initEnvSelector(state.apiBase, async () => {
    // 环境切换时，重新加载渠道列表
    if (pipelineReloader) {
      await pipelineReloader.reload();
    }
    loadAssets();
  });
  
  // 初始化渠道选择器（但不自动加载数据）
  pipelineReloader = await initPipelineSelector(state.apiBase, () => loadAssets());
  
  // 先禁用渠道选择器
  const pipelineSelect = document.getElementById("globalPipelineSelector");
  if (pipelineSelect) {
    pipelineSelect.disabled = true;
  }
  
  // 等待环境选择器初始化完成后，再加载渠道列表
  if (pipelineReloader) {
    await pipelineReloader.reload();
  }
})();

el.search.addEventListener("input", (evt) => {
  state.search = evt.target.value.trim().toLowerCase();
  renderTable();
});

el.uploadBtn.addEventListener("click", () => {
  el.modalForm.reset();
  el.uploadResult.textContent = "";
  el.uploadResult.classList.add("hidden");
  assetModal.open();
});

el.modalForm.addEventListener("submit", async (evt) => {
  evt.preventDefault();
  const formData = new FormData(el.modalForm);
  const environmentKey = getCurrentEnvironment();
  const pipelineKey = getCurrentPipeline();
  if (!environmentKey || !pipelineKey) {
    showToast("请先选择环境和渠道");
    return;
  }
  formData.set("environment_key", environmentKey);
  formData.set("pipeline_key", pipelineKey);
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

async function loadAssets() {
  const env = getCurrentEnvironment();
  const pipeline = getCurrentPipeline();
  if (!env || !pipeline) {
    state.assets = [];
    renderTable();
    return;
  }
  try {
    state.assets = await fetchAssets(state.apiBase, env, pipeline);
    renderTable();
  } catch (err) {
    showToast(`获取静态资源失败: ${err.message}`);
  }
}

function renderTable() {
  const records = state.assets.filter((asset) => {
    if (!state.search) return true;
    const haystack = [asset.file_name, asset.environment_key, asset.pipeline_key, asset.content_type, asset.url]
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
    const isImage = asset.content_type?.startsWith("image/");
    const url = resolveAssetUrl(asset.url || `/api/v1/asset/file/${asset.file_id}/${asset.file_name}`, state.apiBase);
    
    let fileNameContent = escapeHtml(asset.file_name || "-");
    if (isImage) {
      fileNameContent = `
        <div class="asset-file-info">
          <div class="table-image-preview" onclick="window.open('${url}', '_blank')">
            <img src="${url}" alt="预览" title="点击查看大图" />
          </div>
          <span>${fileNameContent}</span>
        </div>
      `;
    }

    tr.innerHTML = `
      <td>${fileNameContent}</td>
      <td>${escapeHtml(asset.environment_key || "-")} / ${escapeHtml(asset.pipeline_key || "-")}</td>
      <td>${formatSize(asset.file_size)}</td>
      <td>${escapeHtml(asset.content_type || "-")}</td>
      <td>${escapeHtml(asset.remark || "-")}</td>
      <td>
        <div class="table-actions">
          <button class="ghost"
            data-copy="${escapeAttr(url)}"
            data-fallback-id="${escapeAttr(asset.file_id || "")}">复制引用</button>
          <a class="ghost" href="${escapeAttr(url)}" target="_blank">下载</a>
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
