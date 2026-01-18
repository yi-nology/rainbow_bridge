import { initPageLayout, initEnvSelector, getCurrentEnvironment } from "./components.js";
import { getDefaultApiBase } from "./runtime.js";
import { createToast } from "./lib/toast.js";

const apiBase = getDefaultApiBase();
const showToast = createToast("plToast");

let pipelines = [];
let searchTerm = "";
let currentEnvironment = "default";

// DOM Elements
const plTbody = document.getElementById("plTbody");
const plEmpty = document.getElementById("plEmpty");
const plCount = document.getElementById("plCount");
const plSearchInput = document.getElementById("plSearchInput");
const plNewBtn = document.getElementById("plNewBtn");
const plModal = document.getElementById("plModal");
const plModalTitle = document.getElementById("plModalTitle");
const plModalForm = document.getElementById("plModalForm");
const plModalClose = document.getElementById("plModalClose");
const plModalCancel = document.getElementById("plModalCancel");

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
  initPageLayout({ activeKey: "pipeline", showEnvSelector: true });
  await loadPipelines();
  await initEnvSelector(apiBase, (envKey) => {
    currentEnvironment = envKey;
    loadPipelines();
  });
  bindEvents();
});

function bindEvents() {
  plNewBtn.addEventListener("click", () => openModal());
  plModalClose.addEventListener("click", () => closeModal());
  plModalCancel.addEventListener("click", () => closeModal());
  plModalForm.addEventListener("submit", handleSubmit);
  plSearchInput.addEventListener("input", (e) => {
    searchTerm = e.target.value.toLowerCase();
    renderTable();
  });
  plModal.addEventListener("click", (e) => {
    if (e.target === plModal) closeModal();
  });
}

async function loadPipelines() {
  try {
    const env = currentEnvironment || getCurrentEnvironment() || "default";
    const res = await fetch(`${apiBase}/api/v1/pipeline/list?environment_key=${encodeURIComponent(env)}`);
    const json = await res.json();
    if (json.code && json.code !== 200) {
      throw new Error(json.error || json.msg || "加载失败");
    }
    pipelines = json.list || [];
    renderTable();
  } catch (err) {
    showToast(`加载流水线列表失败: ${err.message}`);
  }
}

function renderTable() {
  const filtered = pipelines.filter((pl) => {
    if (!searchTerm) return true;
    return (
      pl.pipeline_key?.toLowerCase().includes(searchTerm) ||
      pl.pipeline_name?.toLowerCase().includes(searchTerm) ||
      pl.description?.toLowerCase().includes(searchTerm)
    );
  });

  plCount.textContent = `流水线列表 (${filtered.length})`;

  if (filtered.length === 0) {
    plTbody.innerHTML = "";
    plEmpty.classList.remove("hidden");
    return;
  }

  plEmpty.classList.add("hidden");
  plTbody.innerHTML = filtered
    .map(
      (pl) => `
      <tr>
        <td><code>${escapeHtml(pl.pipeline_key)}</code></td>
        <td>${escapeHtml(pl.pipeline_name)}</td>
        <td>${escapeHtml(pl.description || "-")}</td>
        <td>${pl.sort_order ?? 0}</td>
        <td>
          <span class="status-badge ${pl.is_active ? "active" : "inactive"}">
            ${pl.is_active ? "启用" : "禁用"}
          </span>
        </td>
        <td>
          <button class="ghost mini" onclick="window.editPl('${escapeHtml(pl.pipeline_key)}')">编辑</button>
          <button class="ghost mini danger" onclick="window.deletePl('${escapeHtml(pl.pipeline_key)}')">删除</button>
        </td>
      </tr>
    `
    )
    .join("");
}

function openModal(pl = null) {
  const isEdit = !!pl;
  plModalTitle.textContent = isEdit ? "编辑流水线" : "新建流水线";
  plModalForm.reset();

  const keyInput = plModalForm.querySelector('[name="pipelineKey"]');
  if (isEdit) {
    plModalForm.querySelector('[name="isEdit"]').value = "true";
    keyInput.value = pl.pipeline_key;
    keyInput.disabled = true;
    plModalForm.querySelector('[name="pipelineName"]').value = pl.pipeline_name || "";
    plModalForm.querySelector('[name="description"]').value = pl.description || "";
    plModalForm.querySelector('[name="sortOrder"]').value = pl.sort_order ?? 0;
    plModalForm.querySelector(`[name="isActive"][value="${pl.is_active}"]`).checked = true;
  } else {
    plModalForm.querySelector('[name="isEdit"]').value = "false";
    keyInput.disabled = false;
  }

  plModal.classList.remove("hidden");
  const autofocus = plModalForm.querySelector("[data-autofocus]");
  if (autofocus && !autofocus.disabled) autofocus.focus();
}

function closeModal() {
  plModal.classList.add("hidden");
  plModalForm.reset();
  const keyInput = plModalForm.querySelector('[name="pipelineKey"]');
  keyInput.disabled = false;
}

async function handleSubmit(e) {
  e.preventDefault();
  const formData = new FormData(plModalForm);
  const isEdit = formData.get("isEdit") === "true";

  const payload = {
    pipeline: {
      pipeline_key: formData.get("pipelineKey"),
      pipeline_name: formData.get("pipelineName"),
      description: formData.get("description"),
      sort_order: parseInt(formData.get("sortOrder") || "0", 10),
      is_active: formData.get("isActive") === "true",
    },
  };

  try {
    const endpoint = isEdit
      ? "/api/v1/pipeline/update"
      : "/api/v1/pipeline/create";
    const res = await fetch(`${apiBase}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.code && json.code !== 200) {
      throw new Error(json.error || json.msg || "保存失败");
    }
    showToast(isEdit ? "流水线更新成功" : "流水线创建成功");
    closeModal();
    await loadPipelines();
  } catch (err) {
    showToast(`保存失败: ${err.message}`);
  }
}

window.editPl = function (key) {
  const pl = pipelines.find((p) => p.pipeline_key === key);
  if (pl) openModal(pl);
};

window.deletePl = async function (key) {
  if (!confirm(`确定要删除流水线 "${key}" 吗？\n\n注意：删除后相关配置可能无法正常访问。`)) {
    return;
  }
  try {
    const res = await fetch(`${apiBase}/api/v1/pipeline/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_key: key }),
    });
    const json = await res.json();
    if (json.code && json.code !== 200) {
      throw new Error(json.error || json.msg || "删除失败");
    }
    showToast("流水线删除成功");
    await loadPipelines();
  } catch (err) {
    showToast(`删除失败: ${err.message}`);
  }
};

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
