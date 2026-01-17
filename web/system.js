import { initPageLayout, initEnvSelector, initPipelineSelector, getCurrentEnvironment } from "./components.js";
import { getDefaultApiBase } from "./runtime.js";
import { createModal } from "./ui.js";
import { escapeHtml, escapeAttr } from "./lib/utils.js";
import { createToast } from "./lib/toast.js";

initPageLayout({
  activeKey: "system",
  title: "系统配置",
  caption: "管理环境维度的系统配置，包括业务选择和系统选项",
  showEnvSelector: true,
  showPipelineSelector: true,
});

const defaultBase = getDefaultApiBase();
const state = {
  apiBase: defaultBase,
  configs: [],
  search: "",
  editing: null,
  businessKeys: [],
  currentEnvironment: "default",
};

const elements = {
  tableBody: document.getElementById("systemConfigTbody"),
  count: document.getElementById("systemConfigCount"),
  search: document.getElementById("systemSearchInput"),
  empty: document.getElementById("systemEmpty"),
  newBtn: document.getElementById("systemNewBtn"),
  modalForm: document.getElementById("systemModalForm"),
  toast: document.getElementById("systemToast"),
  aliasInput: document.querySelector("#systemModalForm input[name='alias']"),
  typeSelect: document.getElementById("systemTypeSelect"),
  contentInput: document.getElementById("systemContentInput"),
  contentJsonGroup: document.getElementById("systemContentConfig"),
  contentJsonInput: document.getElementById("systemContentJson"),
  contentTextGroup: document.getElementById("systemContentText"),
  contentTextInput: document.getElementById("systemContentTextInput"),
  contentImageGroup: document.getElementById("systemContentImage"),
  contentColorGroup: document.getElementById("systemContentColor"),
  businessSelect: document.getElementById("systemBusinessSelect"),
  keyValueEditor: document.getElementById("systemKeyValueEditor"),
  keyValueList: document.getElementById("systemKeyValueList"),
  keyValueAddBtn: document.getElementById("systemKeyValueAdd"),
};

const showToast = createToast("systemToast");

const systemModal = createModal("systemModal", {
  onClose: () => {
    state.editing = null;
    elements.modalForm.reset();
    resetAliasState();
    resetKeyValueEditor();
    if (elements.aliasInput) {
      elements.aliasInput.value = "";
    }
  },
});

(async function init() {
  await fetchConfigs();
  await initEnvSelector(state.apiBase, (envKey) => {
    state.currentEnvironment = envKey;
    fetchConfigs();
  });
  await initPipelineSelector(state.apiBase, () => {});
})();

if (elements.search) {
  elements.search.addEventListener("input", (evt) => {
    state.search = evt.target.value.trim().toLowerCase();
    renderTable();
  });
}

if (elements.newBtn) {
  // Hide new button - system configs cannot be created manually
  elements.newBtn.style.display = "none";
}

if (elements.modalForm) {
  elements.modalForm.addEventListener("submit", onSubmit);
}

if (elements.aliasInput) {
  elements.aliasInput.addEventListener("input", () => {
    syncAliasMode().catch(() => {});
  });
}

if (elements.businessSelect) {
  elements.businessSelect.addEventListener("change", handleBusinessSelectChange);
}

if (elements.keyValueAddBtn) {
  elements.keyValueAddBtn.addEventListener("click", () => {
    const row = addKeyValueRow();
    if (row) {
      const input = row.querySelector("[data-role='kv-key']");
      input?.focus();
    }
    updateContentFromEditor();
  });
}

if (elements.keyValueList) {
  elements.keyValueList.addEventListener("input", (evt) => {
    if (evt.target.matches("[data-role='kv-key'], [data-role='kv-value']")) {
      updateContentFromEditor();
    }
  });
  elements.keyValueList.addEventListener("click", (evt) => {
    if (!evt.target.matches("button[data-action='kv-remove']")) return;
    evt.preventDefault();
    const row = evt.target.closest(".kv-row");
    if (row) {
      row.remove();
      if (!elements.keyValueList.querySelector(".kv-row")) {
        addKeyValueRow();
      }
      updateContentFromEditor();
    }
  });
}

document.addEventListener("click", (evt) => {
  const target = evt.target;
  if (target.matches("button[data-system-action='edit']")) {
    const key = target.dataset.key;
    const cfg = state.configs.find((item) => item.config_key === key);
    if (cfg) openModal(cfg);
  }
});

async function fetchConfigs() {
  try {
    const res = await fetch(`${state.apiBase}/api/v1/system-config/list?environment_key=${state.currentEnvironment}`);
    const json = await res.json();
    state.configs = json?.list || [];
    renderTable();
  } catch (err) {
    showToast(`获取配置失败: ${err.message}`);
  }
}

function renderTable() {
  const records = state.configs.filter((cfg) => {
    if (!state.search) return true;
    const haystack = [cfg.config_key, cfg.config_value, cfg.remark]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(state.search);
  });

  elements.count.textContent = `系统配置列表 · 共 ${records.length} 条`;
  elements.tableBody.innerHTML = "";
  elements.empty.classList.toggle("hidden", records.length > 0);

  records.forEach((cfg) => {
    const tr = document.createElement("tr");
    const displayName = getConfigDisplayName(cfg.config_key);
    const displayValue = summarizeConfigValue(cfg.config_key, cfg.config_value);
    tr.innerHTML = `
      <td>${escapeHtml(displayName)}</td>
      <td><code>${escapeHtml(cfg.config_key || "-")}</code></td>
      <td>${escapeHtml(displayValue)}</td>
      <td>
        <div class="table-actions">
          <button class="ghost" data-system-action="edit" data-key="${escapeAttr(cfg.config_key || "")}">编辑</button>
        </div>
      </td>`;
    elements.tableBody.appendChild(tr);
  });
}

function getConfigDisplayName(configKey) {
  const names = {
    "business_select": "业务选择",
    "system_keys": "系统选项",
  };
  return names[configKey] || configKey;
}

function summarizeConfigValue(configKey, value) {
  if (!value) return "-";
  if (configKey === "business_select") {
    return value;
  }
  if (configKey === "system_keys") {
    try {
      const parsed = JSON.parse(value);
      const keys = Object.keys(parsed);
      return `${keys.length} 个配置项`;
    } catch {
      return value.substring(0, 50) + (value.length > 50 ? "..." : "");
    }
  }
  return value.substring(0, 50) + (value.length > 50 ? "..." : "");
}

async function openModal(cfg) {
  state.editing = cfg || null;
  elements.modalForm.reset();

  // Set alias (config_key) - readonly for system configs
  if (elements.aliasInput) {
    elements.aliasInput.value = cfg?.config_key || "";
    elements.aliasInput.readOnly = true;
  }

  // Set name field
  const nameInput = elements.modalForm.elements.name;
  if (nameInput) {
    nameInput.value = getConfigDisplayName(cfg?.config_key || "");
    nameInput.readOnly = true;
  }

  // Set remark field
  const remarkInput = elements.modalForm.elements.remark;
  if (remarkInput) {
    remarkInput.value = cfg?.remark || "";
  }

  const initialContent = cfg?.config_value || "";
  if (elements.contentInput) {
    elements.contentInput.value = initialContent;
  }

  try {
    await syncAliasMode({ content: initialContent, initialize: true });
  } catch {
    // ignore
  }

  const title = `编辑系统配置 - ${getConfigDisplayName(cfg?.config_key || "")}`;
  const titleNode = document.getElementById("systemModalTitle");
  if (titleNode) titleNode.textContent = title;
  systemModal.open();
}

async function onSubmit(evt) {
  evt.preventDefault();
  const form = elements.modalForm;
  const formData = new FormData(form);
  const getTrim = (key) => ((formData.get(key) || "").toString().trim());
  const configKey = getTrim("alias");

  if (!configKey) {
    showToast("配置键不能为空");
    return;
  }

  let configValue = "";
  if (configKey === "business_select") {
    configValue = (elements.businessSelect?.value || "").trim();
    if (!configValue) {
      showToast("请选择业务");
      return;
    }
  } else if (configKey === "system_keys") {
    const { data, errors } = collectKeyValueData({ strict: true });
    if (errors.length) {
      showToast(errors[0]);
      return;
    }
    if (!Object.keys(data).length) {
      showToast("请至少添加一行 key 与 名称");
      return;
    }
    configValue = JSON.stringify(data);
  } else {
    configValue = elements.contentInput?.value.trim() || "";
    if (!configValue) {
      showToast("请填写配置值");
      return;
    }
  }

  const payload = {
    system_config: {
      environment_key: state.currentEnvironment,
      config_key: configKey,
      config_value: configValue,
    },
  };

  try {
    const res = await fetch(`${state.apiBase}/api/v1/system-config/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.code && json.code !== 200) {
      throw new Error(json.error || json.msg || "保存失败");
    }
    showToast("保存成功");
    systemModal.close();
    await fetchConfigs();
  } catch (err) {
    showToast(err.message || "保存失败");
  }
}

function resetAliasState() {
  hideBusinessSelect();
  hideKeyValueEditor();
  hideDataTypeGroups();
}

async function syncAliasMode(options = {}) {
  const alias = elements.aliasInput?.value.trim() || "";
  if (alias === "business_select") {
    try {
      await ensureBusinessKeys();
    } catch (err) {
      showToast(`获取业务列表失败: ${err.message}`);
      resetAliasState();
      return;
    }
    hideKeyValueEditor();
    hideDataTypeGroups();
    showBusinessSelect(options.content || elements.contentInput?.value.trim() || "");
    if (elements.contentInput) {
      elements.contentInput.disabled = true;
      elements.contentInput.classList.add("hidden");
    }
    return;
  }
  if (alias === "system_keys") {
    hideBusinessSelect();
    hideDataTypeGroups();
    showKeyValueEditor(options.content || elements.contentInput?.value.trim() || "");
    if (elements.contentInput) {
      elements.contentInput.disabled = true;
      elements.contentInput.classList.add("hidden");
    }
    return;
  }
  resetAliasState();
  if (elements.contentInput) {
    elements.contentInput.disabled = false;
    elements.contentInput.classList.remove("hidden");
  }
}

function hideDataTypeGroups() {
  if (elements.contentJsonGroup) elements.contentJsonGroup.classList.add("hidden");
  if (elements.contentTextGroup) elements.contentTextGroup.classList.add("hidden");
  if (elements.contentImageGroup) elements.contentImageGroup.classList.add("hidden");
  if (elements.contentColorGroup) elements.contentColorGroup.classList.add("hidden");
  if (elements.typeSelect) elements.typeSelect.closest("label")?.classList.add("hidden");
}

function handleBusinessSelectChange() {
  if (!elements.businessSelect || !elements.contentInput) return;
  elements.contentInput.value = elements.businessSelect.value || "";
}

async function ensureBusinessKeys(force = false) {
  if (!force && state.businessKeys.length) {
    return state.businessKeys;
  }
  const res = await fetch(`${state.apiBase}/api/v1/system/business-keys`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const json = await res.json();
  const list = (json?.list || json?.data?.list || []).filter((key) => key !== "system");
  state.businessKeys = list;
  return list;
}

function populateBusinessSelect(selectedValue) {
  if (!elements.businessSelect) return;
  const select = elements.businessSelect;
  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "请选择业务";
  placeholder.disabled = true;
  placeholder.selected = !selectedValue;
  select.appendChild(placeholder);

  const options = [...state.businessKeys];
  if (selectedValue && !options.includes(selectedValue)) {
    options.unshift(selectedValue);
  }

  options.forEach((key) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = key;
    select.appendChild(option);
  });

  if (selectedValue && options.includes(selectedValue)) {
    select.value = selectedValue;
  }
}

function showBusinessSelect(selectedValue = "") {
  if (!elements.businessSelect) return;
  populateBusinessSelect(selectedValue);
  elements.businessSelect.classList.remove("hidden");
  elements.businessSelect.disabled = false;
  elements.businessSelect.required = true;
  if (elements.contentInput) {
    elements.contentInput.value = elements.businessSelect.value || "";
  }
}

function hideBusinessSelect() {
  if (!elements.businessSelect) return;
  elements.businessSelect.classList.add("hidden");
  elements.businessSelect.disabled = true;
  elements.businessSelect.required = false;
}

function addKeyValueRow(key = "", value = "") {
  if (!elements.keyValueList) return null;
  const row = document.createElement("div");
  row.className = "kv-row";

  const keyInput = document.createElement("input");
  keyInput.setAttribute("data-role", "kv-key");
  keyInput.placeholder = "key";
  keyInput.value = key || "";

  const valueInput = document.createElement("input");
  valueInput.setAttribute("data-role", "kv-value");
  valueInput.placeholder = "名称";
  valueInput.value = value || "";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "ghost mini danger";
  removeBtn.dataset.action = "kv-remove";
  removeBtn.textContent = "删除";

  row.appendChild(keyInput);
  row.appendChild(valueInput);
  row.appendChild(removeBtn);
  elements.keyValueList.appendChild(row);
  return row;
}

function clearKeyValueEditor() {
  if (elements.keyValueList) {
    elements.keyValueList.innerHTML = "";
  }
}

function showKeyValueEditor(rawContent) {
  if (!elements.keyValueEditor) return;
  elements.keyValueEditor.classList.remove("hidden");
  if (elements.keyValueAddBtn) {
    elements.keyValueAddBtn.disabled = false;
  }
  populateKeyValueEditor(rawContent);
}

function hideKeyValueEditor() {
  if (!elements.keyValueEditor) return;
  elements.keyValueEditor.classList.add("hidden");
  if (elements.keyValueAddBtn) {
    elements.keyValueAddBtn.disabled = true;
  }
  clearKeyValueEditor();
}

function populateKeyValueEditor(rawContent) {
  clearKeyValueEditor();
  let parsed = {};
  if (rawContent) {
    try {
      const json = JSON.parse(rawContent);
      if (json && typeof json === "object" && !Array.isArray(json)) {
        parsed = json;
      } else {
        throw new Error("invalid format");
      }
    } catch (err) {
      showToast("system_keys 内容格式不正确，已重置为空");
    }
  }
  const entries = Object.entries(parsed);
  if (!entries.length) {
    addKeyValueRow();
  } else {
    entries.forEach(([key, val]) => addKeyValueRow(key, val != null ? String(val) : ""));
  }
  updateContentFromEditor();
}

function collectKeyValueData({ strict = false } = {}) {
  const rows = elements.keyValueList?.querySelectorAll(".kv-row") || [];
  const data = {};
  const errors = [];
  const seenKeys = new Set();
  rows.forEach((row) => {
    const key = row.querySelector("[data-role='kv-key']")?.value.trim() || "";
    const value = row.querySelector("[data-role='kv-value']")?.value.trim() || "";
    if (!key && !value) {
      return;
    }
    if (!key || !value) {
      if (strict) {
        errors.push("每行需要填写完整的 key 与 名称");
      }
      return;
    }
    if (seenKeys.has(key)) {
      if (strict) {
        errors.push(`存在重复的 key：${key}`);
      }
    }
    seenKeys.add(key);
    data[key] = value;
  });
  return { data, errors };
}

function updateContentFromEditor() {
  if (!elements.contentInput || elements.keyValueEditor?.classList.contains("hidden")) {
    return;
  }
  const { data } = collectKeyValueData();
  elements.contentInput.value = JSON.stringify(data);
}

function resetKeyValueEditor() {
  hideKeyValueEditor();
  clearKeyValueEditor();
}
