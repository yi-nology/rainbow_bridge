import { initPageLayout, initEnvSelector, initPipelineSelector, getCurrentEnvironment, getCurrentPipeline } from "./components.js";
import { getDefaultApiBase } from "./runtime.js";
import { createModal } from "./ui.js";
import { escapeHtml, escapeAttr, normalizeDataType, displayDataType, summarizeContent, normalizeColorValue } from "./lib/utils.js";
import { extractError } from "./lib/api.js";
import { createToast } from "./lib/toast.js";

initPageLayout({
  activeKey: "config",
  title: "业务配置中心",
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
  systemKeys: [],
  identityMode: "custom",
  dataType: "config",
  imageUpload: {
    reference: "",
    url: "",
    filename: "",
  },
  imageUploading: false,
  colorValue: "",
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
  refreshSystemKeysBtn: document.getElementById("refreshSystemKeys"),
  contentJsonGroup: document.getElementById("contentConfigGroup"),
  contentTextGroup: document.getElementById("contentTextGroup"),
  contentImageGroup: document.getElementById("contentImageGroup"),
  contentColorGroup: document.getElementById("contentColorGroup"),
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
  await initEnvSelector(state.apiBase, () => fetchConfigs());
  await initPipelineSelector(state.apiBase, () => fetchConfigs());
})();

elements.searchInput.addEventListener("input", (evt) => {
  state.search = evt.target.value.trim().toLowerCase();
  renderConfigTable();
});

elements.newConfigBtn.addEventListener("click", () => openConfigModal());

if (elements.identityModeRadios && elements.identityModeRadios.length) {
  elements.identityModeRadios.forEach((radio) => {
    radio.addEventListener("change", async (evt) => {
      if (!evt.target.checked) return;
      const mode = evt.target.value === "system" ? "system" : "custom";
      await setIdentityMode(mode);
    });
  });
}

if (elements.systemKeySelect) {
  elements.systemKeySelect.addEventListener("change", handleSystemKeySelectChange);
}

if (elements.refreshSystemKeysBtn) {
  elements.refreshSystemKeysBtn.addEventListener("click", async () => {
    try {
      await ensureSystemKeys(true);
      if (state.identityMode === "system") {
        await syncIdentityMode({ preserveSelection: true });
      }
    } catch (err) {
      showToast(err.message || "刷新 system_keys 失败");
    }
  });
}

if (elements.modalTypeSelect) {
  elements.modalTypeSelect.addEventListener("change", (evt) => {
    setDataType(evt.target.value);
  });
}

if (elements.contentTextInput) {
  elements.contentTextInput.addEventListener("input", () => {
    if (state.dataType === "text" && elements.modalContentInput) {
      elements.modalContentInput.value = elements.contentTextInput.value;
    }
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
    const value = evt.target.value || "";
    state.colorValue = value.trim();
    if (state.dataType === "color" && elements.modalContentInput) {
      elements.modalContentInput.value = state.colorValue;
    }
    updateColorPreview(value);
  });
  elements.contentColorValue.addEventListener("blur", (evt) => {
    setColorValue(evt.target.value, { fillPicker: true, forceContent: true });
  });
}

elements.modalForm.addEventListener("submit", async (evt) => {
  evt.preventDefault();
  const form = elements.modalForm;
  const formData = new FormData(form);
  const getTrim = (key) => ((formData.get(key) || "").toString().trim());
  const environmentKey = getCurrentEnvironment();
  const pipelineKey = getCurrentPipeline();
  const resourceKey = getTrim("resourceKey");
  const alias = getTrim("alias");
  const name = getTrim("name");
  const type = getTrim("type");
  const dataType = normalizeDataType(type);
  let contentValue = "";

  if (dataType === "config") {
    const raw = elements.contentJsonInput?.value.trim() || "";
    if (!raw) {
      showToast("请填写配置内容");
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("内容需为 JSON 对象");
      }
      contentValue = JSON.stringify(parsed);
      if (elements.contentJsonInput) {
        elements.contentJsonInput.value = JSON.stringify(parsed, null, 2);
      }
    } catch (err) {
      showToast(err.message || "配置内容不是合法的 JSON 对象");
      return;
    }
  } else if (dataType === "image") {
    const reference = (elements.modalContentInput?.value || state.imageUpload.reference || "").trim();
    if (!reference) {
      showToast("请上传图片");
      return;
    }
    contentValue = reference;
  } else if (dataType === "color") {
    const colorValue = getColorValue();
    if (!colorValue) {
      showToast("请选择色彩值");
      return;
    }
    contentValue = colorValue;
  } else {
    const textContent = elements.contentTextInput?.value.trim() || "";
    if (!textContent) {
      showToast("请填写文案内容");
      return;
    }
    contentValue = textContent;
  }

  if (elements.modalContentInput) {
    elements.modalContentInput.value = contentValue;
  }
  const remark = getTrim("remark");
  const payload = {
    config: {
      environment_key: environmentKey,
      pipeline_key: pipelineKey,
      resource_key: resourceKey,
      alias,
      name,
      type: dataType,
      content: contentValue,
      remark,
      is_perm: formData.get("isPerm") === "true",
    },
  };
  if (!payload.config.environment_key || !payload.config.pipeline_key || !payload.config.alias) {
    showToast("请填写必填项");
    return;
  }

  const isUpdate = Boolean(payload.config.resource_key);
  const endpoint = isUpdate ? "/api/v1/config/update" : "/api/v1/config/create";
  try {
    const res = await fetch(`${state.apiBase}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.code && json.code !== 200) {
      throw new Error(json.error || json.msg || "保存失败");
    }
    showToast("保存成功");
    configModal.close();
    await fetchConfigs();
  } catch (err) {
    showToast(err.message || "保存失败");
  }
});

document.addEventListener("click", (evt) => {
  const { target } = evt;
  if (target.matches("button[data-action='edit']")) {
    const key = target.dataset.key;
    const cfg = state.configs.find((item) => item.resource_key === key);
    if (cfg) openConfigModal(cfg);
  }
  if (target.matches("button[data-action='delete']")) {
    const key = target.dataset.key;
    const env = target.dataset.env;
    const pipeline = target.dataset.pipeline;
    if (confirm("确定删除该配置吗？")) {
      deleteConfig(env, pipeline, key);
    }
  }
});

// ------------------------- Data Fetching -------------------------

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
    await ensureSystemKeys(forceRefresh);
  } catch (err) {
    showToast(err.message || "获取 system_keys 失败");
    await setIdentityMode("custom");
    return;
  }

  if (!state.systemKeys.length) {
    showToast("暂无 system_keys 可用");
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

async function ensureSystemKeys(force = false) {
  if (!force && state.systemKeys.length) {
    return state.systemKeys;
  }
  try {
    // Get system_keys from system-config API using current environment
    const env = getCurrentEnvironment();
    if (!env) {
      throw new Error("请先选择环境");
    }
    const entries = await fetchSystemKeysFromConfig(env);
    state.systemKeys = entries;
    return state.systemKeys;
  } catch (err) {
    state.systemKeys = [];
    throw err;
  }
}

async function fetchSystemKeysFromConfig(environmentKey) {
  try {
    const res = await fetch(
      `${state.apiBase}/api/v1/system-config/list?environment_key=${encodeURIComponent(environmentKey)}`
    );
    const json = await res.json();
    const list = json?.list || [];
    
    // Find system_keys config
    const systemKeysConfig = list.find(cfg => cfg.config_key === "system_keys");
    if (!systemKeysConfig || !systemKeysConfig.config_value) {
      return [];
    }
    
    // Parse JSON value
    const parsed = JSON.parse(systemKeysConfig.config_value);
    if (!parsed || typeof parsed !== "object") {
      return [];
    }
    
    // Convert to array format
    return Object.entries(parsed).map(([key, value]) => ({
      key,
      value: value == null ? "" : String(value),
    }));
  } catch (err) {
    console.error("Failed to fetch system_keys:", err);
    return [];
  }
}

function populateSystemKeyOptions({ selectedKey, matchAlias, matchName } = {}) {
  if (!elements.systemKeySelect) return null;
  const select = elements.systemKeySelect;
  select.innerHTML = "";
  if (!state.systemKeys.length) {
    return null;
  }
  let resolvedKey = selectedKey || "";
  let resolvedItem = null;
  if (!resolvedKey && matchAlias) {
    const matchedByAlias = state.systemKeys.find((item) => item.key === matchAlias);
    if (matchedByAlias) {
      resolvedKey = matchedByAlias.key;
      resolvedItem = matchedByAlias;
    }
  }
  if (!resolvedKey && matchName) {
    const matchedByName = state.systemKeys.find((item) => item.value === matchName);
    if (matchedByName) {
      resolvedKey = matchedByName.key;
      resolvedItem = matchedByName;
    }
  }
  state.systemKeys.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.key;
    option.textContent = item.value ? `${item.value} (${item.key})` : item.key;
    option.dataset.value = item.value;
    select.appendChild(option);
  });
  if (resolvedKey && state.systemKeys.some((item) => item.key === resolvedKey)) {
    select.value = resolvedKey;
    resolvedItem = state.systemKeys.find((item) => item.key === resolvedKey) || null;
  } else if (state.systemKeys.length) {
    select.value = state.systemKeys[0].key;
    resolvedItem = state.systemKeys[0];
  }
  return resolvedItem;
}

function showSystemKeySelect() {
  if (elements.systemKeySelect) {
    elements.systemKeySelect.classList.remove("hidden");
    elements.systemKeySelect.disabled = false;
  }
  if (elements.refreshSystemKeysBtn) {
    elements.refreshSystemKeysBtn.classList.remove("hidden");
    elements.refreshSystemKeysBtn.disabled = false;
  }
  if (elements.modalAliasInput) {
    elements.modalAliasInput.readOnly = true;
    elements.modalAliasInput.classList.add("read-only");
  }
  if (elements.modalNameInput) {
    elements.modalNameInput.readOnly = true;
    elements.modalNameInput.classList.add("read-only");
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
  if (elements.refreshSystemKeysBtn) {
    elements.refreshSystemKeysBtn.classList.add("hidden");
    elements.refreshSystemKeysBtn.disabled = true;
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
  return state.systemKeys.find((item) => item.key === selectedKey) || null;
}

function applySystemKeySelection() {
  const selected = getSelectedSystemKey();
  if (!selected) return;
  if (elements.modalAliasInput) {
    elements.modalAliasInput.value = selected.key;
  }
  if (elements.modalNameInput) {
    elements.modalNameInput.value = selected.value;
  }
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
  updateDataTypeViews("config");
}

function setDataType(type, options = {}) {
  const normalized = normalizeDataType(type);
  state.dataType = normalized;
  if (elements.modalTypeSelect) {
    elements.modalTypeSelect.value = normalized;
  }
  updateDataTypeViews(normalized, options);
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
    if (normalized === "color") {
      const initial = state.colorValue || elements.contentColorPicker?.value || DEFAULT_COLOR;
      setColorValue(initial, { fillPicker: true, forceContent: true });
    } else {
      clearColorValue({ resetPicker: true });
    }
  }
}

function updateDataTypeViews(type, options = {}) {
  if (elements.contentJsonGroup) {
    elements.contentJsonGroup.classList.toggle("hidden", type !== "config");
  }
  if (elements.contentTextGroup) {
    elements.contentTextGroup.classList.toggle("hidden", type !== "text");
  }
  if (elements.contentImageGroup) {
    elements.contentImageGroup.classList.toggle("hidden", type !== "image");
  }
  if (elements.contentColorGroup) {
    elements.contentColorGroup.classList.toggle("hidden", type !== "color");
  }
  if (type !== "image" && !options.initialize) {
    state.imageUpload = { reference: "", url: "", filename: "" };
    state.imageUploading = false;
    updateImagePreview();
    setImageUploadStatus("");
    if (elements.contentImageFile) {
      elements.contentImageFile.value = "";
    }
  }
  if (type === "image" && !state.imageUpload.reference) {
    setImageUploadStatus("请选择图片文件并上传，成功后将自动填充引用地址。", false);
    updateImagePreview();
  }
  if (type !== "text" && !options.initialize && elements.contentTextInput) {
    elements.contentTextInput.value = "";
  }
  if (type === "color") {
    const preset = state.colorValue || elements.contentColorPicker?.value || DEFAULT_COLOR;
    setColorValue(preset, { fillPicker: true, forceContent: true });
  } else if (!options.initialize) {
    clearColorValue({ resetPicker: true });
  }
}

function initializeDataTypeFields(type, content) {
  const normalized = normalizeDataType(type);
  if (elements.modalTypeSelect) {
    elements.modalTypeSelect.value = normalized;
  }
  setDataType(normalized, { initialize: true });
  const trimmed = (content || "").trim();
  if (elements.modalContentInput) {
    elements.modalContentInput.value = trimmed;
  }
  if (normalized === "config") {
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
  let url = asset?.url || "";
  if (!url && trimmed.startsWith("asset://")) {
    const assetId = trimmed.replace("asset://", "");
    if (assetId) {
      url = `${state.apiBase}/api/v1/asset/file/${encodeURIComponent(assetId)}`;
    }
  }
  if (!url && trimmed.startsWith("/api/v1/asset/file/")) {
    url = `${state.apiBase}${trimmed}`;
  }
  if (!url && /^https?:\/\//i.test(trimmed)) {
    url = trimmed;
  }
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
    setImageUploadStatus("请先选择环境和流水线", true);
    showToast("请先选择环境和流水线");
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
      <td>${escapeHtml(cfg.environment_key || "-")} / ${escapeHtml(cfg.pipeline_key || "-")}</td>
      <td>${escapeHtml(cfg.alias || "-")}</td>
      <td>${escapeHtml(displayDataType(cfg.type))}</td>
      <td>${escapeHtml(summarizeContent(cfg.content))}</td>
      <td>
        <div class="table-actions">
          <button class="ghost" data-action="edit" data-key="${escapeAttr(cfg.resource_key || "")}">编辑</button>
          <button class="danger" data-action="delete" data-key="${escapeAttr(cfg.resource_key || "")}" data-env="${escapeAttr(cfg.environment_key || "")}" data-pipeline="${escapeAttr(cfg.pipeline_key || "")}">删除</button>
        </div>
      </td>`;
    elements.configTbody.appendChild(tr);
  });
}

async function openConfigModal(cfg) {
  state.editing = cfg || null;
  elements.modalTitle.textContent = cfg ? "编辑配置" : "新建配置";
  elements.modalForm.reset();
  resetIdentityMode();
  const form = elements.modalForm;
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
  const initialType = normalizeDataType(form.elements.type.value || "config");
  initializeDataTypeFields(initialType, form.elements.content.value || "");

  let initialMode = "custom";
  if (cfg && (form.elements.alias.value || form.elements.name.value)) {
    try {
      await ensureSystemKeys();
      const alias = form.elements.alias.value.trim();
      const name = form.elements.name.value.trim();
      if (state.systemKeys.some((item) => item.key === alias && item.value === name)) {
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
  configModal.open();
}
