import { initPageLayout } from "./components.js";
import { getDefaultApiBase } from "./runtime.js";
import { createModal } from "./ui.js";

initPageLayout({
  activeKey: "config",
  title: "业务配置中心",
  caption: "按业务维度管理资源配置与版本，保持配置变更透明可追踪",
});

const defaultBase = getDefaultApiBase();
const state = {
  apiBase: defaultBase,
  businessKeys: [],
  activeBusiness: "",
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
};

const elements = {
  businessTabs: document.getElementById("businessTabs"),
  configTbody: document.getElementById("configTbody"),
  emptyState: document.getElementById("emptyState"),
  resourceCount: document.getElementById("resourceCount"),
  searchInput: document.getElementById("searchInput"),
  modalOverlay: document.getElementById("modalOverlay"),
  modalForm: document.getElementById("modalForm"),
  modalTitle: document.getElementById("modalTitle"),
  modalClose: document.getElementById("modalClose"),
  modalCancel: document.getElementById("modalCancel"),
  modalBusinessInput: document.getElementById("modalBusinessInput"),
  businessOptions: document.getElementById("businessOptions"),
  refreshBusinessBtn: document.getElementById("refreshBusiness"),
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
  contentJsonInput: document.getElementById("contentJsonInput"),
  contentTextInput: document.getElementById("contentTextInput"),
  contentImageFile: document.getElementById("contentImageFile"),
  contentImageUploadBtn: document.getElementById("contentImageUploadBtn"),
  contentImageStatus: document.getElementById("contentImageStatus"),
  contentImagePreview: document.getElementById("contentImagePreview"),
  contentImagePreviewImg: document.querySelector("#contentImagePreview img"),
};

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
    if (elements.modalBusinessInput) {
      elements.modalBusinessInput.readOnly = false;
      elements.modalBusinessInput.classList.remove("read-only");
    }
    if (elements.refreshBusinessBtn) {
      elements.refreshBusinessBtn.disabled = false;
    }
  },
});

// ------------------------- Initialization -------------------------

(async function init() {
  await fetchBusinessKeys();
})();

elements.refreshBusinessBtn.addEventListener("click", () => {
  fetchBusinessKeys(true);
});

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

elements.modalForm.addEventListener("submit", async (evt) => {
  evt.preventDefault();
  const form = elements.modalForm;
  const formData = new FormData(form);
  const getTrim = (key) => ((formData.get(key) || "").toString().trim());
  const businessKey = getTrim("businessKey");
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
      business_key: businessKey,
      resource_key: resourceKey,
      alias,
      name,
      type: dataType,
      content: contentValue,
      remark,
      is_perm: formData.get("isPerm") === "true",
    },
  };
  if (!payload.config.business_key || !payload.config.alias) {
    showToast("请填写必填项");
    return;
  }

  const method = payload.config.resource_key ? "PUT" : "POST";
  try {
    const res = await fetch(`${state.apiBase}/api/v1/resources`, {
      method,
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
    const business = target.dataset.business;
    if (confirm("确定删除该配置吗？")) {
      deleteConfig(business, key);
    }
  }
});

// ------------------------- Data Fetching -------------------------

async function fetchBusinessKeys(force = false) {
  try {
    const res = await fetch(`${state.apiBase}/api/v1/resources/business-keys`);
    const json = await res.json();
    const list = (json?.list || json?.data?.list || []).filter((key) => key !== "system");
    const previousActive = state.activeBusiness;
    state.businessKeys = list;
    if (previousActive && list.includes(previousActive)) {
      state.activeBusiness = previousActive;
    } else {
      state.activeBusiness = list[0] || "";
    }
    populateBusinessOptions(state.editing?.business_key);
    if (force && elements.modalBusinessInput && !elements.modalBusinessInput.readOnly) {
      elements.modalBusinessInput.value = state.activeBusiness || "";
    }
    renderBusinessTabs();
    await fetchConfigs();
  } catch (err) {
    showToast(`获取业务列表失败: ${err.message}`);
  }
}

function populateBusinessOptions(extraKey) {
  if (!elements.businessOptions) return;
  const options = [...state.businessKeys];
  const appendKey = extraKey ? `${extraKey}`.trim() : "";
  if (appendKey && !options.includes(appendKey)) {
    options.push(appendKey);
  }
  elements.businessOptions.innerHTML = "";
  options.forEach((key) => {
    const option = document.createElement("option");
    option.value = key;
    elements.businessOptions.appendChild(option);
  });
}

async function fetchConfigs() {
  if (!state.activeBusiness) return;
  try {
    const res = await fetch(
      `${state.apiBase}/api/v1/resources?business_key=${encodeURIComponent(state.activeBusiness)}`,
    );
    const json = await res.json();
    state.configs = json?.list || json?.data?.list || [];
    renderConfigTable();
  } catch (err) {
    showToast(`获取配置失败: ${err.message}`);
  }
}

async function deleteConfig(businessKey, resourceKey) {
  try {
    const res = await fetch(`${state.apiBase}/api/v1/resources`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business_key: businessKey, resource_key: resourceKey }),
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
  const res = await fetch(`${state.apiBase}/api/v1/resources?business_key=system`);
  if (!res.ok) {
    throw new Error(`获取 system_keys 失败 (HTTP ${res.status})`);
  }
  const json = await res.json();
  const list = json?.list || json?.data?.list || [];
  const systemConfig = list.find((item) => item.alias === "system_keys");
  if (!systemConfig || !systemConfig.content) {
    state.systemKeys = [];
    return state.systemKeys;
  }
  let parsed = {};
  try {
    parsed = JSON.parse(systemConfig.content);
  } catch (err) {
    throw new Error("system_keys 配置格式错误");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("system_keys 配置格式错误");
  }
  const entries = Object.entries(parsed).map(([key, value]) => ({
    key,
    value: value == null ? "" : String(value),
  }));
  entries.sort((a, b) => {
    if (a.value === b.value) {
      return a.key.localeCompare(b.key, "zh-Hans-CN");
    }
    return a.value.localeCompare(b.value, "zh-Hans-CN");
  });
  state.systemKeys = entries;
  return state.systemKeys;
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

function normalizeDataType(value = "") {
  const str = value.toString().toLowerCase();
  if (str === "image") return "image";
  if (["text", "string", "copy", "文案"].includes(str)) return "text";
  return "config";
}

function resetDataType() {
  state.dataType = "config";
  state.imageUpload = { reference: "", url: "", filename: "" };
  state.imageUploading = false;
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
      url = `${state.apiBase}/api/v1/files/${encodeURIComponent(assetId)}`;
    }
  }
  if (!url && trimmed.startsWith("/api/v1/files/")) {
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

function getBusinessKeyValue() {
  const input = elements.modalForm?.elements?.businessKey;
  return input ? input.value.trim() : "";
}

async function onImageUpload() {
  if (state.imageUploading) return;
  const file = elements.contentImageFile?.files?.[0];
  if (!file) {
    setImageUploadStatus("请先选择图片文件", true);
    showToast("请先选择图片文件");
    return;
  }
  const businessKey = getBusinessKeyValue();
  if (!businessKey) {
    setImageUploadStatus("请先填写业务，再上传图片", true);
    showToast("请先填写业务");
    return;
  }
  const formData = new FormData();
  formData.append("file", file);
  formData.append("business_key", businessKey);
  try {
    setImageUploadLoading(true);
    const res = await fetch(`${state.apiBase}/api/v1/resources/upload`, {
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

function displayDataType(value = "") {
  const normalized = normalizeDataType(value);
  if (normalized === "image") return "图片";
  if (normalized === "text") return "文案";
  return "配置对象";
}

function renderBusinessTabs() {
  elements.businessTabs.innerHTML = "";
  state.businessKeys.forEach((key) => {
    const btn = document.createElement("span");
    btn.className = `business-tab${state.activeBusiness === key ? " active" : ""}`;
    btn.textContent = key;
    btn.addEventListener("click", async () => {
      if (state.activeBusiness === key) return;
      state.activeBusiness = key;
      renderBusinessTabs();
      await fetchConfigs();
    });
    elements.businessTabs.appendChild(btn);
  });
}

function renderConfigTable() {
  const configs = state.configs.filter((item) => {
    if (!state.search) return true;
    const haystack = [item.name, item.alias, item.type, item.business_key]
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
      <td>${escapeHtml(cfg.business_key || "-")}</td>
      <td>${escapeHtml(cfg.alias || "-")}</td>
      <td>${escapeHtml(displayDataType(cfg.type))}</td>
      <td>${escapeHtml(summarizeContent(cfg.content))}</td>
      <td>
        <div class="table-actions">
          <button class="ghost" data-action="edit" data-key="${escapeAttr(cfg.resource_key || "")}">编辑</button>
          <button class="danger" data-action="delete" data-key="${escapeAttr(cfg.resource_key || "")}" data-business="${escapeAttr(cfg.business_key || "")}">删除</button>
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
  const businessInput = elements.modalBusinessInput;
  const refreshBtn = elements.refreshBusinessBtn;
  if (elements.businessOptions) {
    populateBusinessOptions(cfg?.business_key);
  }
  if (refreshBtn) {
    refreshBtn.disabled = Boolean(cfg);
  }
  if (businessInput) {
    businessInput.readOnly = Boolean(cfg);
    businessInput.classList.toggle("read-only", Boolean(cfg));
  }
  if (cfg) {
    form.elements.resourceKey.value = cfg.resource_key || "";
    form.elements.businessKey.value = cfg.business_key || "";
    form.elements.name.value = cfg.name || "";
    form.elements.alias.value = cfg.alias || "";
    form.elements.type.value = cfg.type || "";
    form.elements.content.value = cfg.content || "";
    form.elements.remark.value = cfg.remark || "";
    const isPerm = cfg.is_perm ? "true" : "false";
    [...form.elements.isPerm].forEach((radio) => {
      radio.checked = radio.value === isPerm;
    });
  } else if (state.activeBusiness) {
    form.elements.businessKey.value = state.activeBusiness;
    if (businessInput) {
      businessInput.readOnly = false;
      businessInput.classList.remove("read-only");
    }
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

// ------------------------- Helpers -------------------------

function summarizeContent(content = "") {
  if (!content) return "";
  return content.length > 20 ? content.slice(0, 20) + "…" : content;
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

let toastTimer;
function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    elements.toast.classList.add("hidden");
  }, 2500);
}
