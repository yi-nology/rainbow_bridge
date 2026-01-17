import { initPageLayout } from "./components.js";
import { getDefaultApiBase } from "./runtime.js";
import { createToast } from "./lib/toast.js";

const apiBase = getDefaultApiBase();
const showToast = createToast("envToast");

let environments = [];
let searchTerm = "";

// DOM Elements
const envTbody = document.getElementById("envTbody");
const envEmpty = document.getElementById("envEmpty");
const envCount = document.getElementById("envCount");
const envSearchInput = document.getElementById("envSearchInput");
const envNewBtn = document.getElementById("envNewBtn");
const envModal = document.getElementById("envModal");
const envModalTitle = document.getElementById("envModalTitle");
const envModalForm = document.getElementById("envModalForm");
const envModalClose = document.getElementById("envModalClose");
const envModalCancel = document.getElementById("envModalCancel");

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  initPageLayout({ activeKey: "environment" });
  loadEnvironments();
  bindEvents();
});

function bindEvents() {
  envNewBtn.addEventListener("click", () => openModal());
  envModalClose.addEventListener("click", () => closeModal());
  envModalCancel.addEventListener("click", () => closeModal());
  envModalForm.addEventListener("submit", handleSubmit);
  envSearchInput.addEventListener("input", (e) => {
    searchTerm = e.target.value.toLowerCase();
    renderTable();
  });
  envModal.addEventListener("click", (e) => {
    if (e.target === envModal) closeModal();
  });
}

async function loadEnvironments() {
  try {
    const res = await fetch(`${apiBase}/api/v1/environment/list`);
    const json = await res.json();
    if (json.code && json.code !== 200) {
      throw new Error(json.error || json.msg || "加载失败");
    }
    environments = json.list || [];
    renderTable();
  } catch (err) {
    showToast(`加载环境列表失败: ${err.message}`);
  }
}

function renderTable() {
  const filtered = environments.filter((env) => {
    if (!searchTerm) return true;
    return (
      env.environment_key?.toLowerCase().includes(searchTerm) ||
      env.environment_name?.toLowerCase().includes(searchTerm) ||
      env.description?.toLowerCase().includes(searchTerm)
    );
  });

  envCount.textContent = `环境列表 (${filtered.length})`;

  if (filtered.length === 0) {
    envTbody.innerHTML = "";
    envEmpty.classList.remove("hidden");
    return;
  }

  envEmpty.classList.add("hidden");
  envTbody.innerHTML = filtered
    .map(
      (env) => `
      <tr>
        <td><code>${escapeHtml(env.environment_key)}</code></td>
        <td>${escapeHtml(env.environment_name)}</td>
        <td>${escapeHtml(env.description || "-")}</td>
        <td>${env.sort_order ?? 0}</td>
        <td>
          <span class="status-badge ${env.is_active ? "active" : "inactive"}">
            ${env.is_active ? "启用" : "禁用"}
          </span>
        </td>
        <td>
          <button class="ghost mini" onclick="window.editEnv('${escapeHtml(env.environment_key)}')">编辑</button>
          <button class="ghost mini danger" onclick="window.deleteEnv('${escapeHtml(env.environment_key)}')">删除</button>
        </td>
      </tr>
    `
    )
    .join("");
}

function openModal(env = null) {
  const isEdit = !!env;
  envModalTitle.textContent = isEdit ? "编辑环境" : "新建环境";
  envModalForm.reset();

  const keyInput = envModalForm.querySelector('[name="environmentKey"]');
  if (isEdit) {
    envModalForm.querySelector('[name="isEdit"]').value = "true";
    keyInput.value = env.environment_key;
    keyInput.disabled = true;
    envModalForm.querySelector('[name="environmentName"]').value = env.environment_name || "";
    envModalForm.querySelector('[name="description"]').value = env.description || "";
    envModalForm.querySelector('[name="sortOrder"]').value = env.sort_order ?? 0;
    envModalForm.querySelector(`[name="isActive"][value="${env.is_active}"]`).checked = true;
  } else {
    envModalForm.querySelector('[name="isEdit"]').value = "false";
    keyInput.disabled = false;
  }

  envModal.classList.remove("hidden");
  const autofocus = envModalForm.querySelector("[data-autofocus]");
  if (autofocus && !autofocus.disabled) autofocus.focus();
}

function closeModal() {
  envModal.classList.add("hidden");
  envModalForm.reset();
  const keyInput = envModalForm.querySelector('[name="environmentKey"]');
  keyInput.disabled = false;
}

async function handleSubmit(e) {
  e.preventDefault();
  const formData = new FormData(envModalForm);
  const isEdit = formData.get("isEdit") === "true";

  const payload = {
    environment: {
      environment_key: formData.get("environmentKey"),
      environment_name: formData.get("environmentName"),
      description: formData.get("description"),
      sort_order: parseInt(formData.get("sortOrder") || "0", 10),
      is_active: formData.get("isActive") === "true",
    },
  };

  try {
    const endpoint = isEdit
      ? "/api/v1/environment/update"
      : "/api/v1/environment/create";
    const res = await fetch(`${apiBase}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.code && json.code !== 200) {
      throw new Error(json.error || json.msg || "保存失败");
    }
    showToast(isEdit ? "环境更新成功" : "环境创建成功");
    closeModal();
    await loadEnvironments();
  } catch (err) {
    showToast(`保存失败: ${err.message}`);
  }
}

window.editEnv = function (key) {
  const env = environments.find((e) => e.environment_key === key);
  if (env) openModal(env);
};

window.deleteEnv = async function (key) {
  if (!confirm(`确定要删除环境 "${key}" 吗？\n\n注意：删除后相关配置可能无法正常访问。`)) {
    return;
  }
  try {
    const res = await fetch(`${apiBase}/api/v1/environment/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ environment_key: key }),
    });
    const json = await res.json();
    if (json.code && json.code !== 200) {
      throw new Error(json.error || json.msg || "删除失败");
    }
    showToast("环境删除成功");
    await loadEnvironments();
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
