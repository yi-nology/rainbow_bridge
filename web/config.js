import { initPageLayout, initEnvSelector, initPipelineSelector, getCurrentEnvironment, getCurrentPipeline } from "./components.js";
import { getDefaultApiBase } from "./runtime.js";
import { createModal } from "./ui.js";
import { escapeHtml, escapeAttr, normalizeDataType, displayDataType, summarizeContent, normalizeColorValue, resolveAssetUrl } from "./lib/utils.js";
import { extractError } from "./lib/api.js";
import { createToast } from "./lib/toast.js";
import { CONFIG_TYPES, normalizeConfigType } from "./lib/types.js";

initPageLayout({
  activeKey: "config",
  title: "业务配置",
  caption: "按业务维度管理资源配置与版本，保持配置变更透明可追踪",
  showEnvSelector: true,
  showPipelineSelector: true,
});

const defaultBase = getDefaultApiBase();
const DEFAULT_COLOR = "#1677ff";
const state = {
  apiBase: defaultBase,
  configs: [],
  search: "",
  editing: null,
  systemOptions: [],
  identityMode: "custom",
  dataType: "config",
  imageUpload: {
    reference: "",
    url: "",
    filename: "",
  },
  imageUploading: false,
  colorValue: "",
  selectedEnv: getCurrentEnvironment(),
  selectedPipeline: getCurrentPipeline(),
};

const elements = {
  configTbody: document.getElementById("configTbody"),
  emptyState: document.getElementById("emptyState"),
  resourceCount: document.getElementById("resourceCount"),
  searchInput: document.getElementById("searchInput"),
  modalOverlay: document.getElementById("modalOverlay"),
  modalForm: document.getElementById("modalForm"),
  modalTitle: document.getElementById("modalTitle"),
  modalClose: document.getElementById("modalClose"),
  modalCancel: document.getElementById("modalCancel"),
  newConfigBtn: document.getElementById("newConfigBtn"),
  toast: document.getElementById("toast"),
  modalNameInput: document.getElementById("modalNameInput"),
  modalAliasInput: document.getElementById("modalAliasInput"),
  modalTypeSelect: document.getElementById("modalTypeSelect"),
  modalContentInput: document.getElementById("modalContentInput"),
  identityModeRadios: document.querySelectorAll("input[name='identityMode']"),
  systemKeySelect: document.getElementById("systemKeySelect"),
  refreshSystemOptionsBtn: document.getElementById("refreshSystemOptions"),
  contentKvGroup: document.getElementById("contentKvGroup"),
  contentJsonGroup: document.getElementById("contentConfigGroup"),
  contentTextGroup: document.getElementById("contentTextGroup"),
  contentImageGroup: document.getElementById("contentImageGroup"),
  contentColorGroup: document.getElementById("contentColorGroup"),
  kvList: document.getElementById("kvList"),
  addKvRowBtn: document.getElementById("addKvRowBtn"),
  contentJsonInput: document.getElementById("contentJsonInput"),
  contentTextInput: document.getElementById("contentTextInput"),
  contentImageFile: document.getElementById("contentImageFile"),
  contentImageUploadBtn: document.getElementById("contentImageUploadBtn"),
  contentImageStatus: document.getElementById("contentImageStatus"),
  contentImagePreview: document.getElementById("contentImagePreview"),
  contentImagePreviewImg: document.querySelector("#contentImagePreview img"),
  contentColorPicker: document.getElementById("contentColorPicker"),
  contentColorValue: document.getElementById("contentColorValue"),
  contentColorSwatch: document.getElementById("contentColorSwatch"),
};

const showToast = createToast("toast");

let pipelineReloader = null;

const configModal = createModal("modalOverlay", {
  onClose: () => {
    state.editing = null;
    elements.modalForm.reset();
    resetIdentityMode();
    resetDataType();
    const radios = elements.modalForm.elements.isPerm;
    if (radios) {
      const radioList =
        typeof radios.length === "number" ? Array.from(radios) : [radios];
      radioList.forEach((radio) => {
        radio.checked = radio.value === "false";
      });
    }
  },
});

// ------------------------- Initialization -------------------------

(async function init() {
  await initEnvSelector(state.apiBase, async () => {
    // 环境切换时，重载全局渠道选择器的选项
    if (pipelineReloader) {
      await pipelineReloader.reload();
    }
    fetchConfigs();
  });
  
  pipelineReloader = await initPipelineSelector(state.apiBase, () => {
    fetchConfigs();
  });
  
  // 初始化完成后，加载业务配置列表
  fetchConfigs();
})();

// ------------------------- Event Listeners -------------------------

if (elements.searchInput) {
  elements.searchInput.addEventListener("input", (evt) => {
    state.search = evt.target.value.trim().toLowerCase();
    renderConfigTable();
  });
}

if (elements.newConfigBtn) {
  elements.newConfigBtn.addEventListener("click", () => {
    openConfigModal(null);
  });
}

if (elements.modalForm) {
  elements.modalForm.addEventListener("submit", onSubmit);
}

if (elements.identityModeRadios) {
  elements.identityModeRadios.forEach((radio) => {
    radio.addEventListener("change", (evt) => {
      setIdentityMode(evt.target.value);
    });
  });
}

if (elements.systemKeySelect) {
  elements.systemKeySelect.addEventListener("change", handleSystemKeySelectChange);
}

if (elements.refreshSystemOptionsBtn) {
  elements.refreshSystemOptionsBtn.addEventListener("click", () => {
    syncIdentityMode({ forceRefresh: true }).catch(() => {});
  });
}

if (elements.modalTypeSelect) {
  elements.modalTypeSelect.addEventListener("change", (evt) => {
    setDataType(evt.target.value);
  });
}

if (elements.contentImageFile) {
  elements.contentImageFile.addEventListener("change", onImageFileChange);
}

if (elements.contentImageUploadBtn) {
  elements.contentImageUploadBtn.addEventListener("click", onImageUpload);
}

if (elements.contentColorPicker) {
  elements.contentColorPicker.addEventListener("input", (evt) => {
    setColorValue(evt.target.value, { fillPicker: true, forceContent: true });
  });
}

if (elements.contentColorValue) {
  elements.contentColorValue.addEventListener("input", (evt) => {
    const val = evt.target.value || "";
    state.colorValue = val.trim();
    if (state.dataType === "color" && elements.modalContentInput) {
      elements.modalContentInput.value = state.colorValue;
    }
    updateColorPreview(val);
  });
  elements.contentColorValue.addEventListener("blur", (evt) => {
    setColorValue(evt.target.value, { fillPicker: true, forceContent: true });
  });
}

if (elements.addKvRowBtn) {
  elements.addKvRowBtn.addEventListener("click", () => {
    const row = addKvRow();
    row?.querySelector("input")?.focus();
    updateContentFromKvEditor();
  });
}

if (elements.kvList) {
  elements.kvList.addEventListener("input", (evt) => {
    if (evt.target.matches("input")) {
      updateContentFromKvEditor();
    }
  });
  elements.kvList.addEventListener("click", (evt) => {
    if (evt.target.dataset.action === "kv-remove") {
      evt.target.closest(".kv-row")?.remove();
      updateContentFromKvEditor();
    }
  });
}

document.addEventListener("click", async (evt) => {
  const target = evt.target;
  const action = target.dataset.action;
  const key = target.dataset.key;
  if (!action || !key) return;

  const cfg = state.configs.find((c) => c.resource_key === key);
  if (!cfg) return;

  if (action === "view") {
    openConfigModal(cfg, true);
  } else if (action === "edit") {
    openConfigModal(cfg);
  } else if (action === "delete") {
    if (confirm(`确定删除配置 "${cfg.name || cfg.alias}" 吗？`)) {
      await deleteConfig(cfg.environment_key, cfg.pipeline_key, cfg.resource_key);
    }
  }
});

async function fetchConfigs() {
  const env = getCurrentEnvironment();
  const pipeline = getCurrentPipeline();
  if (!env || !pipeline) return;
  try {
    const res = await fetch(
      `${state.apiBase}/api/v1/config/list?environment_key=${encodeURIComponent(env)}&pipeline_key=${encodeURIComponent(pipeline)}`,
    );
    const json = await res.json();
    state.configs = json?.list || json?.data?.list || [];
    renderConfigTable();
  } catch (err) {
    showToast(`获取配置失败: ${err.message}`);
  }
}

async function onSubmit(evt) {
  evt.preventDefault();
  const form = elements.modalForm;
  const formData = new FormData(form);
  
  const resourceKey = formData.get("resourceKey");
  const name = formData.get("name").trim();
  const alias = formData.get("alias").trim();
  const type = formData.get("type");
  const remark = formData.get("remark").trim();
  const isPerm = formData.get("isPerm") === "true";
  
  let content = "";
  if (type === CONFIG_TYPES.KV) {
    const { data, errors } = collectKvData({ strict: true });
    if (errors.length) {
      showToast(errors[0]);
      return;
    }
    content = JSON.stringify(data);
  } else if (type === "config" || type === "json") {
    const raw = elements.contentJsonInput.value.trim();
    if (!raw) {
      showToast("请填写配置内容");
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      content = JSON.stringify(parsed);
    } catch (err) {
      showToast("JSON 格式错误");
      return;
    }
  } else if (type === "text") {
    content = elements.contentTextInput.value.trim();
    if (!content) {
      showToast("请填写文案内容");
      return;
    }
  } else if (type === "image") {
    content = state.imageUpload.reference || elements.modalContentInput.value.trim();
    if (!content) {
      showToast("请上传图片");
      return;
    }
  } else if (type === "color") {
    content = getColorValue();
    if (!content) {
      showToast("请选择颜色");
      return;
    }
  }

  const payload = {
    config: {
      resource_key: resourceKey || "",
      name,
      alias,
      type,
      content,
      remark,
      is_perm: isPerm,
      environment_key: getCurrentEnvironment(),
      pipeline_key: getCurrentPipeline(),
    },
  };

  const isNew = !resourceKey;
  const endpoint = isNew ? `${state.apiBase}/api/v1/config/create` : `${state.apiBase}/api/v1/config/update`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.code && json.code !== 200) {
      throw new Error(json.error || json.msg || "保存失败");
    }
    showToast(isNew ? "创建成功" : "保存成功");
    configModal.close();
    fetchConfigs();
  } catch (err) {
    showToast(`保存失败: ${err.message}`);
  }
}

async function deleteConfig(environmentKey, pipelineKey, resourceKey) {
  try {
    const res = await fetch(`${state.apiBase}/api/v1/config/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ environment_key: environmentKey, pipeline_key: pipelineKey, resource_key: resourceKey }),
    });
    const json = await res.json();
    if (json.code && json.code !== 200) {
      throw new Error(json.error || json.msg || "删除失败");
    }
    showToast("删除成功");
    await fetchConfigs();
  } catch (err) {
    showToast(err.message || "删除失败");
  }
}

function resetIdentityMode() {
  state.identityMode = "custom";
  if (elements.identityModeRadios && elements.identityModeRadios.length) {
    elements.identityModeRadios.forEach((radio) => {
      radio.checked = radio.value === "custom";
    });
  }
  hideSystemKeySelect(true);
}

async function setIdentityMode(mode, options = {}) {
  const normalized = mode === "system" ? "system" : "custom";
  state.identityMode = normalized;
  if (elements.identityModeRadios && elements.identityModeRadios.length) {
    elements.identityModeRadios.forEach((radio) => {
      radio.checked = radio.value === normalized;
    });
  }
  await syncIdentityMode(options);
}

async function syncIdentityMode(options = {}) {
  const {
    preserveSelection = false,
    selectedKey,
    matchAlias,
    matchName,
    requireMatch = false,
    forceRefresh = false,
  } = options;

  if (state.identityMode !== "system") {
    enableCustomNameAlias();
    return;
  }

  try {
    await ensureSystemOptions(forceRefresh);
  } catch (err) {
    showToast(err.message || "获取系统配置失败");
    await setIdentityMode("custom");
    return;
  }

  if (!state.systemOptions.length) {
    showToast("暂无系统配置可用");
    await setIdentityMode("custom");
    return;
  }

  const effectiveSelectedKey = preserveSelection ? elements.systemKeySelect?.value : selectedKey;
  const effectiveMatchAlias =
    matchAlias !== undefined
      ? matchAlias
      : preserveSelection
        ? undefined
        : elements.modalAliasInput?.value.trim() || "";
  const effectiveMatchName =
    matchName !== undefined
      ? matchName
      : preserveSelection
        ? undefined
        : elements.modalNameInput?.value.trim() || "";

  const activeItem = populateSystemKeyOptions({
    selectedKey: effectiveSelectedKey,
    matchAlias: effectiveMatchAlias,
    matchName: effectiveMatchName,
  });

  if (
    requireMatch &&
    (!activeItem ||
      (effectiveMatchAlias && activeItem.key !== effectiveMatchAlias) ||
      (effectiveMatchName && activeItem.value !== effectiveMatchName))
  ) {
    await setIdentityMode("custom");
    return;
  }

  showSystemKeySelect();
  applySystemKeySelection();
}

async function ensureSystemOptions(force = false) {
  if (!force && state.systemOptions.length) {
    return state.systemOptions;
  }
  try {
    // 从系统配置 API 获取所有配置项
    const env = getCurrentEnvironment();
    if (!env) {
      throw new Error("请先选择环境");
    }
    const entries = await fetchSystemOptionsFromConfig(env);
    state.systemOptions = entries;
    return state.systemOptions;
  } catch (err) {
    state.systemOptions = [];
    throw err;
  }
}

async function fetchSystemOptionsFromConfig(environmentKey) {
  try {
    const res = await fetch(
      `${state.apiBase}/api/v1/system-config/list?environment_key=${encodeURIComponent(environmentKey)}`
    );
    const json = await res.json();
    const list = json?.list || [];
    
    // 返回所有系统配置项，保存完整数据
    return list.map(cfg => ({
      key: cfg.config_key || "",
      value: getSystemConfigDisplayName(cfg.config_key) || cfg.config_key || "",
      type: cfg.config_type || "text", // 数据类型
      content: cfg.config_value || "", // 配置内容
      remark: cfg.remark || "", // 备注
    })).filter(item => item.key); // 过滤掉空 key
  } catch (err) {
    console.error("Failed to fetch system configs:", err);
    return [];
  }
}

// 获取系统配置的显示名称
function getSystemConfigDisplayName(configKey) {
  const names = {
    "system_options": "系统选项",
  };
  return names[configKey] || configKey;
}

function populateSystemKeyOptions({ selectedKey, matchAlias, matchName } = {}) {
  if (!elements.systemKeySelect) return null;
  const select = elements.systemKeySelect;
  select.innerHTML = "";
  if (!state.systemOptions.length) {
    return null;
  }
  let resolvedKey = selectedKey || "";
  let resolvedItem = null;
  if (!resolvedKey && matchAlias) {
    const matchedByAlias = state.systemOptions.find((item) => item.key === matchAlias);
    if (matchedByAlias) {
      resolvedKey = matchedByAlias.key;
      resolvedItem = matchedByAlias;
    }
  }
  if (!resolvedKey && matchName) {
    const matchedByName = state.systemOptions.find((item) => item.value === matchName);
    if (matchedByName) {
      resolvedKey = matchedByName.key;
      resolvedItem = matchedByName;
    }
  }
  state.systemOptions.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.key;
    option.textContent = item.value ? `${item.value} (${item.key})` : item.key;
    option.dataset.value = item.value;
    select.appendChild(option);
  });
  if (resolvedKey && state.systemOptions.some((item) => item.key === resolvedKey)) {
    select.value = resolvedKey;
    resolvedItem = state.systemOptions.find((item) => item.key === resolvedKey) || null;
  } else if (state.systemOptions.length) {
    select.value = state.systemOptions[0].key;
    resolvedItem = state.systemOptions[0];
  }
  return resolvedItem;
}

function showSystemKeySelect() {
  if (elements.systemKeySelect) {
    elements.systemKeySelect.classList.remove("hidden");
    elements.systemKeySelect.disabled = false;
  }
  if (elements.refreshSystemOptionsBtn) {
    elements.refreshSystemOptionsBtn.classList.remove("hidden");
    elements.refreshSystemOptionsBtn.disabled = false;
  }
  // 不设置 readonly，允许用户修改默认值
  if (elements.modalAliasInput) {
    elements.modalAliasInput.readOnly = false;
    elements.modalAliasInput.classList.remove("read-only");
  }
  if (elements.modalNameInput) {
    elements.modalNameInput.readOnly = false;
    elements.modalNameInput.classList.remove("read-only");
  }
}

function hideSystemKeySelect(clear = false) {
  if (elements.systemKeySelect) {
    elements.systemKeySelect.classList.add("hidden");
    elements.systemKeySelect.disabled = true;
    if (clear) {
      elements.systemKeySelect.innerHTML = "";
      elements.systemKeySelect.value = "";
    }
  }
  if (elements.refreshSystemOptionsBtn) {
    elements.refreshSystemOptionsBtn.classList.add("hidden");
    elements.refreshSystemOptionsBtn.disabled = true;
  }
  if (elements.modalAliasInput) {
    elements.modalAliasInput.readOnly = false;
    elements.modalAliasInput.classList.remove("read-only");
  }
  if (elements.modalNameInput) {
    elements.modalNameInput.readOnly = false;
    elements.modalNameInput.classList.remove("read-only");
  }
}

function enableCustomNameAlias() {
  hideSystemKeySelect();
}

function handleSystemKeySelectChange() {
  if (state.identityMode !== "system") return;
  applySystemKeySelection();
}

function getSelectedSystemKey() {
  if (!elements.systemKeySelect) return null;
  const selectedKey = elements.systemKeySelect.value;
  if (!selectedKey) return null;
  return state.systemOptions.find((item) => item.key === selectedKey) || null;
}

async function applySystemKeySelection() {
  const selected = getSelectedSystemKey();
  if (!selected) return;
  
  // 填充名称和别名
  if (elements.modalAliasInput) {
    elements.modalAliasInput.value = selected.key;
  }
  if (elements.modalNameInput) {
    elements.modalNameInput.value = selected.value;
  }
  
  // 根据类型设置编辑器并填充内容
  const configType = normalizeDataType(selected.type || "text");
  const configContent = selected.content || "";
  
  // 设置类型选择器
  if (elements.modalTypeSelect) {
    elements.modalTypeSelect.value = configType;
  }
  
  // 根据类型初始化对应的编辑器
  await initializeDataTypeFields(configType, configContent);
}

// ------------------------- Data Type Handling -------------------------

function resetDataType() {
  state.dataType = "config";
  state.imageUpload = { reference: "", url: "", filename: "" };
  state.imageUploading = false;
  state.colorValue = "";
  if (elements.modalTypeSelect) {
    elements.modalTypeSelect.value = "config";
  }
  if (elements.contentJsonInput) {
    elements.contentJsonInput.value = "";
  }
  if (elements.contentTextInput) {
    elements.contentTextInput.value = "";
  }
  clearImageReference();
  clearColorValue({ resetPicker: true, forceContent: true });
  clearKvEditor();
  updateDataTypeViews("config");
}

function setDataType(type, options = {}, isViewOnly = false) {
  const normalized = normalizeDataType(type);
  state.dataType = normalized;
  if (elements.modalTypeSelect) {
    elements.modalTypeSelect.value = normalized;
  }
  updateDataTypeViews(normalized, options, isViewOnly);
  if (!options.initialize) {
    if (normalized === "config" && elements.modalContentInput) {
      elements.modalContentInput.value = "";
    }
    if (normalized === "text" && elements.modalContentInput) {
      elements.modalContentInput.value = elements.contentTextInput?.value || "";
    }
    if (normalized === "image") {
      clearImageReference();
    }
  }
  if (normalized === "color") {
    const preset = state.colorValue || elements.contentColorPicker?.value || DEFAULT_COLOR;
    if (elements.contentColorPicker) elements.contentColorPicker.disabled = isViewOnly;
    if (elements.contentColorValue) elements.contentColorValue.readOnly = isViewOnly;
    setColorValue(preset, { fillPicker: true, forceContent: true });
  } else if (!options.initialize) {
    clearColorValue({ resetPicker: true });
  }
}

function updateDataTypeViews(type, options = {}, isViewOnly = false) {
  const normalizedType = normalizeConfigType(type);
  
  if (elements.contentKvGroup) {
    elements.contentKvGroup.classList.toggle("hidden", normalizedType !== CONFIG_TYPES.KV);
    if (normalizedType === CONFIG_TYPES.KV && isViewOnly && elements.kvList) {
      elements.kvList.querySelectorAll("input").forEach(input => input.readOnly = true);
      elements.kvList.querySelectorAll("button[data-action='kv-remove']").forEach(btn => btn.style.display = "none");
    }
  }
  if (elements.contentJsonGroup) {
    elements.contentJsonGroup.classList.toggle("hidden", normalizedType !== "config" && normalizedType !== "json");
    if (elements.contentJsonInput) {
      elements.contentJsonInput.readOnly = isViewOnly;
    }
  }
  if (elements.contentTextGroup) {
    elements.contentTextGroup.classList.toggle("hidden", normalizedType !== "text");
    if (elements.contentTextInput) {
      elements.contentTextInput.readOnly = isViewOnly;
    }
  }
  if (elements.contentImageGroup) {
    elements.contentImageGroup.classList.toggle("hidden", normalizedType !== "image");
    if (normalizedType === "image" && isViewOnly && elements.contentImageUploadBtn) {
      elements.contentImageUploadBtn.style.display = "none";
    }
  }
  if (elements.contentColorGroup) {
    elements.contentColorGroup.classList.toggle("hidden", normalizedType !== "color");
    if (normalizedType === "color" && isViewOnly) {
      if (elements.contentColorPicker) elements.contentColorPicker.disabled = true;
      if (elements.contentColorValue) elements.contentColorValue.readOnly = true;
    }
  }
  
  if (normalizedType !== "image" && !options.initialize) {
    state.imageUpload = { reference: "", url: "", filename: "" };
    state.imageUploading = false;
    updateImagePreview();
    setImageUploadStatus("");
    if (elements.contentImageFile) {
      elements.contentImageFile.value = "";
    }
  }
  if (normalizedType === "image" && !state.imageUpload.reference) {
    setImageUploadStatus("请选择图片文件并上传，成功后将自动填充引用地址。", false);
    updateImagePreview();
  }
  if (normalizedType !== "text" && !options.initialize && elements.contentTextInput) {
    elements.contentTextInput.value = "";
  }
  if (normalizedType === "color") {
    const preset = state.colorValue || elements.contentColorPicker?.value || DEFAULT_COLOR;
    setColorValue(preset, { fillPicker: true, forceContent: true });
  } else if (!options.initialize) {
    clearColorValue({ resetPicker: true });
  }
  
  // 清理键值对编辑器
  if (normalizedType !== CONFIG_TYPES.KV && !options.initialize) {
    clearKvEditor();
  }
}

function initializeDataTypeFields(type, content, isViewOnly = false) {
  const normalized = normalizeDataType(type);
  const normalizedType = normalizeConfigType(normalized);
  
  if (elements.modalTypeSelect) {
    elements.modalTypeSelect.value = normalized;
  }
  setDataType(normalized, { initialize: true }, isViewOnly);
  const trimmed = (content || "").trim();
  if (elements.modalContentInput) {
    elements.modalContentInput.value = trimmed;
  }
  
  if (normalizedType === CONFIG_TYPES.KV) {
    // 键值对类型
    populateKvEditor(trimmed);
  } else if (normalized === "config" || normalized === "json") {
    if (elements.contentJsonInput) {
      if (trimmed) {
        try {
          const parsed = JSON.parse(trimmed);
          elements.contentJsonInput.value = JSON.stringify(parsed, null, 2);
          if (elements.modalContentInput) {
            elements.modalContentInput.value = JSON.stringify(parsed);
          }
        } catch (err) {
          elements.contentJsonInput.value = trimmed;
        }
      } else {
        elements.contentJsonInput.value = "";
      }
    }
  } else if (normalized === "text") {
    if (elements.contentTextInput) {
      elements.contentTextInput.value = trimmed;
    }
    if (elements.modalContentInput) {
      elements.modalContentInput.value = trimmed;
    }
  } else if (normalized === "image") {
    if (trimmed) {
      setImageReference(trimmed);
    } else {
      clearImageReference();
    }
  } else if (normalized === "color") {
    setColorValue(trimmed || DEFAULT_COLOR, { fillPicker: true, forceContent: true });
  } else {
    state.imageUpload = { reference: "", url: "", filename: "" };
    state.imageUploading = false;
    updateImagePreview();
  }
}

function clearImageReference() {
  state.imageUpload = { reference: "", url: "", filename: "" };
  if (elements.modalContentInput) {
    elements.modalContentInput.value = "";
  }
  if (state.dataType === "image") {
    setImageUploadStatus("请选择图片文件并上传，成功后将自动填充引用地址。", false);
  } else {
    setImageUploadStatus("");
  }
  updateImagePreview();
  if (elements.contentImageFile) {
    elements.contentImageFile.value = "";
  }
}

function setImageReference(reference, asset) {
  const trimmed = (reference || "").trim();
  state.imageUpload.reference = trimmed;
  if (elements.modalContentInput) {
    elements.modalContentInput.value = trimmed;
  }
  
  // Use resolveAssetUrl to determine the actual image URL
  const url = resolveAssetUrl(asset?.url || trimmed, state.apiBase);
  state.imageUpload.url = url;
  
  state.imageUpload.filename = asset?.file_name || asset?.fileName || "";
  const parts = [];
  if (state.imageUpload.filename) {
    parts.push(`文件：${state.imageUpload.filename}`);
  }
  if (trimmed) {
    parts.push(`引用：${trimmed}`);
  }
  setImageUploadStatus(parts.join("  |  ") || "已获取图片引用");
  updateImagePreview();
}

function updateImagePreview() {
  if (!elements.contentImagePreview || !elements.contentImagePreviewImg) return;
  const url = state.imageUpload.url;
  if (!url) {
    elements.contentImagePreview.classList.add("hidden");
    elements.contentImagePreviewImg.src = "";
    return;
  }
  elements.contentImagePreviewImg.src = url;
  elements.contentImagePreview.classList.remove("hidden");
}

function setColorValue(value, options = {}) {
  const trimmed = (value || "").trim();
  const normalized = normalizeColorValue(trimmed);
  const finalValue = normalized || trimmed;
  state.colorValue = finalValue;
  if (elements.contentColorValue && options.updateText !== false) {
    elements.contentColorValue.value = finalValue;
  }
  if (elements.modalContentInput && (state.dataType === "color" || options.forceContent)) {
    elements.modalContentInput.value = finalValue;
  }
  if (elements.contentColorPicker && (normalized || options.fillPicker)) {
    elements.contentColorPicker.value = normalized || DEFAULT_COLOR;
  }
  updateColorPreview(finalValue);
}

function clearColorValue(options = {}) {
  state.colorValue = "";
  if (elements.contentColorValue && options.updateText !== false) {
    elements.contentColorValue.value = "";
  }
  if (elements.modalContentInput && (state.dataType === "color" || options.forceContent)) {
    elements.modalContentInput.value = "";
  }
  if (elements.contentColorPicker && options.resetPicker) {
    elements.contentColorPicker.value = DEFAULT_COLOR;
  }
  updateColorPreview("");
}

function updateColorPreview(value = "") {
  if (!elements.contentColorSwatch) return;
  const trimmed = (value || "").trim();
  const normalized = normalizeColorValue(trimmed);
  const hasValue = Boolean(normalized || trimmed);
  const display = normalized || trimmed;
  elements.contentColorSwatch.style.background = hasValue ? display : DEFAULT_COLOR;
  elements.contentColorSwatch.title = hasValue ? display : "未选择色值";
}

function getColorValue() {
  const candidates = [
    state.colorValue,
    elements.contentColorValue?.value || "",
    elements.contentColorPicker?.value || "",
  ];
  for (const candidate of candidates) {
    const normalized = normalizeColorValue(candidate || "");
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function setImageUploadStatus(message, isError = false) {
  if (!elements.contentImageStatus) return;
  elements.contentImageStatus.textContent = message || "";
  elements.contentImageStatus.classList.toggle("error", Boolean(isError));
}

function setImageUploadLoading(loading) {
  state.imageUploading = loading;
  if (!elements.contentImageUploadBtn) return;
  elements.contentImageUploadBtn.disabled = loading;
  if (loading) {
    if (!elements.contentImageUploadBtn.dataset.originalText) {
      elements.contentImageUploadBtn.dataset.originalText = elements.contentImageUploadBtn.textContent;
    }
    elements.contentImageUploadBtn.textContent = "上传中…";
  } else if (elements.contentImageUploadBtn.dataset.originalText) {
    elements.contentImageUploadBtn.textContent = elements.contentImageUploadBtn.dataset.originalText;
    delete elements.contentImageUploadBtn.dataset.originalText;
  }
}

function onImageFileChange() {
  if (!elements.contentImageFile) return;
  const file = elements.contentImageFile.files?.[0];
  if (file) {
    setImageUploadStatus(`已选择文件：${file.name}，请点击上传`, false);
  } else {
    setImageUploadStatus("");
  }
}

async function onImageUpload() {
  if (state.imageUploading) return;
  const file = elements.contentImageFile?.files?.[0];
  if (!file) {
    setImageUploadStatus("请先选择图片文件", true);
    showToast("请先选择图片文件");
    return;
  }
  const environmentKey = getCurrentEnvironment();
  const pipelineKey = getCurrentPipeline();
  if (!environmentKey || !pipelineKey) {
    setImageUploadStatus("请先选择环境和渠道", true);
    showToast("请先选择环境和渠道");
    return;
  }
  const formData = new FormData();
  formData.append("file", file);
  formData.append("environment_key", environmentKey);
  formData.append("pipeline_key", pipelineKey);
  try {
    setImageUploadLoading(true);
    const res = await fetch(`${state.apiBase}/api/v1/asset/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      throw new Error(await extractError(res));
    }
    const json = await res.json();
    if (json.code && json.code !== 200) {
      throw new Error(json.error || json.msg || "上传失败");
    }
    const reference = json?.data?.reference || json?.reference;
    const asset = json?.data?.asset || json?.asset;
    if (!reference) {
      throw new Error("上传成功但未返回引用地址");
    }
    setImageReference(reference, asset);
    showToast("图片上传成功");
    if (elements.contentImageFile) {
      elements.contentImageFile.value = "";
    }
  } catch (err) {
    setImageUploadStatus(err.message || "上传失败", true);
    showToast(err.message || "上传失败");
  } finally {
    setImageUploadLoading(false);
  }
}

// ------------------------- Rendering -------------------------

function renderConfigTable() {
  const configs = state.configs.filter((item) => {
    if (!state.search) return true;
    const haystack = [item.name, item.alias, item.type, item.environment_key, item.pipeline_key]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(state.search);
  });

  elements.resourceCount.textContent = `配置列表 · 共 ${configs.length} 条`;
  elements.configTbody.innerHTML = "";
  elements.emptyState.classList.toggle("hidden", configs.length > 0);

  configs.forEach((cfg) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(cfg.name || "-")}</td>
      <td>${escapeHtml(cfg.alias || "-")}</td>
      <td>${escapeHtml(displayDataType(cfg.type))}</td>
      <td>${escapeHtml(summarizeContent(cfg.content))}</td>
      <td>
        <div class="table-actions">
          <button class="ghost" data-action="view" data-key="${escapeAttr(cfg.resource_key || "")}">查看</button>
          <button class="ghost" data-action="edit" data-key="${escapeAttr(cfg.resource_key || "")}">编辑</button>
          <button class="danger" data-action="delete" data-key="${escapeAttr(cfg.resource_key || "")}" data-env="${escapeAttr(cfg.environment_key || "")}" data-pipeline="${escapeAttr(cfg.pipeline_key || "")}">删除</button>
        </div>
      </td>`;
    elements.configTbody.appendChild(tr);
  });
}

async function openConfigModal(cfg, isViewOnly = false) {
  state.editing = cfg || null;
  const isEditing = Boolean(cfg);
  
  elements.modalTitle.textContent = isViewOnly ? "查看配置" : (isEditing ? "编辑配置" : "新建配置");
  elements.modalForm.reset();
  resetIdentityMode();
  
  const form = elements.modalForm;
  
  // 控制确定按钮显示
  const submitBtn = form.querySelector("button[type='submit']");
  if (submitBtn) {
    submitBtn.style.display = isViewOnly ? "none" : "";
  }

  if (cfg) {
    form.elements.resourceKey.value = cfg.resource_key || "";
    form.elements.name.value = cfg.name || "";
    form.elements.alias.value = cfg.alias || "";
    form.elements.type.value = cfg.type || "";
    form.elements.content.value = cfg.content || "";
    form.elements.remark.value = cfg.remark || "";
    const isPerm = cfg.is_perm ? "true" : "false";
    [...form.elements.isPerm].forEach((radio) => {
      radio.checked = radio.value === isPerm;
    });
  }
  
  // 基础字段只读控制
  if (elements.modalNameInput) {
    elements.modalNameInput.readOnly = isViewOnly;
    elements.modalNameInput.classList.toggle("readonly", isViewOnly);
  }
  const remarkInput = form.elements.remark;
  if (remarkInput) {
    remarkInput.readOnly = isViewOnly;
    remarkInput.classList.toggle("readonly", isViewOnly);
  }
  const isPermRadios = form.elements.isPerm;
  if (isPermRadios) {
    [...isPermRadios].forEach(radio => radio.disabled = isViewOnly);
  }

  // 编辑模式下隐藏配置来源选项，别名和类型只读
  if (isEditing || isViewOnly) {
    // 隐藏配置来源整个 label
    const identityModeContainer = elements.identityModeRadios[0]?.closest('.identity-mode');
    const identityModeLabel = identityModeContainer?.closest('label.full');
    if (identityModeLabel) {
      identityModeLabel.style.display = 'none';
    }
    
    // 别名只读
    if (elements.modalAliasInput) {
      elements.modalAliasInput.readOnly = true;
      elements.modalAliasInput.classList.add('readonly');
    }
    
    // 类型只读
    if (elements.modalTypeSelect) {
      elements.modalTypeSelect.disabled = true;
      elements.modalTypeSelect.classList.add('disabled');
    }
  } else {
    // 新建模式下显示所有选项
    const identityModeContainer = elements.identityModeRadios[0]?.closest('.identity-mode');
    const identityModeLabel = identityModeContainer?.closest('label.full');
    if (identityModeLabel) {
      identityModeLabel.style.display = '';
    }
    
    // 别名可编辑
    if (elements.modalAliasInput) {
      elements.modalAliasInput.readOnly = false;
      elements.modalAliasInput.classList.remove('readonly');
    }
    
    // 类型可选择
    if (elements.modalTypeSelect) {
      elements.modalTypeSelect.disabled = false;
      elements.modalTypeSelect.classList.remove('disabled');
    }
  }
  
  // KV 编辑器只读控制
  if (elements.addKvRowBtn) {
    elements.addKvRowBtn.style.display = isViewOnly ? "none" : "";
  }
  
  // 图片上传按钮只读控制
  if (elements.contentImageUploadBtn) {
    elements.contentImageUploadBtn.style.display = isViewOnly ? "none" : "";
  }
  if (elements.contentImageFile) {
    elements.contentImageFile.disabled = isViewOnly;
  }
  
  // 重置状态
  clearImageReference();
  clearColorValue({ resetPicker: true, forceContent: true });
  
  const initialType = normalizeDataType(form.elements.type.value || "config");
  initializeDataTypeFields(initialType, form.elements.content.value || "", isViewOnly);

  // 编辑模式下不需要检查系统配置
  if (!isEditing) {
    let initialMode = "custom";
    if (cfg && (form.elements.alias.value || form.elements.name.value)) {
      try {
        await ensureSystemOptions();
        const alias = form.elements.alias.value.trim();
        const name = form.elements.name.value.trim();
        if (state.systemOptions.some((item) => item.key === alias && item.value === name)) {
          initialMode = "system";
        }
      } catch {
        // ignore fetch error here; fallback to custom mode
        initialMode = "custom";
      }
    }
    await setIdentityMode(initialMode, {
      matchAlias: initialMode === "system" ? form.elements.alias.value.trim() : undefined,
      matchName: initialMode === "system" ? form.elements.name.value.trim() : undefined,
      requireMatch: initialMode === "system",
    });
  }
  
  configModal.open();
}

// ------------------------- Key-Value Editor -------------------------

function addKvRow(key = "", value = "") {
  if (!elements.kvList) return null;
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
  elements.kvList.appendChild(row);
  return row;
}

function clearKvEditor() {
  if (elements.kvList) {
    elements.kvList.innerHTML = "";
  }
}

function populateKvEditor(rawContent) {
  clearKvEditor();
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
      showToast("键值对内容格式不正确，已重置为空");
    }
  }
  const entries = Object.entries(parsed);
  if (!entries.length) {
    addKvRow();
  } else {
    entries.forEach(([key, val]) => addKvRow(key, val != null ? String(val) : ""));
  }
  updateContentFromKvEditor();
}

function collectKvData({ strict = false } = {}) {
  const rows = elements.kvList?.querySelectorAll(".kv-row") || [];
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

function updateContentFromKvEditor() {
  if (!elements.modalContentInput || elements.contentKvGroup?.classList.contains("hidden")) {
    return;
  }
  const { data } = collectKvData();
  elements.modalContentInput.value = JSON.stringify(data);
}
