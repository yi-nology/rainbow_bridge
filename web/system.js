import { initPageLayout, initEnvSelector, initPipelineSelector, getCurrentEnvironment, getCurrentPipeline } from "./components.js";
import { getDefaultApiBase } from "./runtime.js";
import { createModal } from "./ui.js";
import { escapeHtml, escapeAttr } from "./lib/utils.js";
import { createToast } from "./lib/toast.js";
import { CONFIG_TYPES, getConfigTypeName, normalizeConfigType } from "./lib/types.js";

initPageLayout({
  activeKey: "system",
  title: "系统配置",
  caption: "管理环境维度的系统配置",
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
  currentEnvironment: "default",
  currentPipeline: "default",
  dataType: "text",
  imageUpload: {
    reference: "",
    url: "",
    fileName: "",
    fileSize: 0,
  },
  imageUploading: false,
  colorValue: "",
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
  typeLabel: document.getElementById("systemTypeLabel"),
  contentInput: document.getElementById("systemContentInput"),
  contentJsonGroup: document.getElementById("systemContentConfig"),
  contentJsonInput: document.getElementById("systemContentJson"),
  contentTextGroup: document.getElementById("systemContentText"),
  contentTextInput: document.getElementById("systemContentTextInput"),
  contentImageGroup: document.getElementById("systemContentImage"),
  contentImageFile: document.getElementById("systemContentImageFile"),
  contentImageUploadBtn: document.getElementById("systemContentImageUploadBtn"),
  contentImageStatus: document.getElementById("systemContentImageStatus"),
  contentImagePreview: document.getElementById("systemContentImagePreview"),
  contentImagePreviewImg: document.querySelector("#systemContentImagePreview img"),
  contentColorGroup: document.getElementById("systemContentColor"),
  contentColorPicker: document.getElementById("systemContentColorPicker"),
  contentColorValue: document.getElementById("systemContentColorValue"),
  contentColorSwatch: document.getElementById("systemContentColorSwatch"),
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
    clearImageUpload();
    clearColorValue({ resetPicker: true });
    if (elements.aliasInput) {
      elements.aliasInput.value = "";
    }
  },
});

(async function init() {
  await fetchConfigs();
  
  let pipelineReloader = null;
  
  await initEnvSelector(state.apiBase, async (envKey) => {
    state.currentEnvironment = envKey;
    // 环境切换时，重新加载流水线列表
    if (pipelineReloader) {
      await pipelineReloader.reload();
    }
    fetchConfigs();
  });
  
  pipelineReloader = await initPipelineSelector(state.apiBase, (pipelineKey) => {
    state.currentPipeline = pipelineKey;
    fetchConfigs();
  });
})();

if (elements.search) {
  elements.search.addEventListener("input", (evt) => {
    state.search = evt.target.value.trim().toLowerCase();
    renderTable();
  });
}

if (elements.newBtn) {
  elements.newBtn.style.display = "";
  elements.newBtn.addEventListener("click", () => {
    openModal(null);
  });
}

if (elements.modalForm) {
  elements.modalForm.addEventListener("submit", onSubmit);
}

if (elements.aliasInput) {
  elements.aliasInput.addEventListener("input", () => {
    syncAliasMode().catch(() => {});
  });
}

if (elements.typeSelect) {
  elements.typeSelect.addEventListener("change", (evt) => {
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
    const value = evt.target.value || "";
    state.colorValue = value.trim();
    if (state.dataType === CONFIG_TYPES.COLOR && elements.contentInput) {
      elements.contentInput.value = state.colorValue;
    }
    updateColorPreview(value);
  });
  elements.contentColorValue.addEventListener("blur", (evt) => {
    setColorValue(evt.target.value, { fillPicker: true, forceContent: true });
  });
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
  if (target.matches("button[data-system-action='delete']")) {
    const key = target.dataset.key;
    const cfg = state.configs.find((item) => item.config_key === key);
    if (cfg) deleteConfig(cfg);
  }
});

async function fetchConfigs() {
  try {
    const env = state.currentEnvironment || getCurrentEnvironment() || "default";
    const pipeline = state.currentPipeline || getCurrentPipeline() || "default";
    const res = await fetch(`${state.apiBase}/api/v1/system-config/list?environment_key=${encodeURIComponent(env)}&pipeline_key=${encodeURIComponent(pipeline)}`);
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
    const configType = normalizeConfigType(cfg.config_type);
    const displayType = getConfigTypeName(configType);
    const isProtected = cfg.config_key === "system_options";
    const deleteBtn = isProtected ? "" : `<button class="ghost danger" data-system-action="delete" data-key="${escapeAttr(cfg.config_key || "")}">删除</button>`;
    tr.innerHTML = `
      <td>${escapeHtml(displayName)}</td>
      <td><code>${escapeHtml(cfg.config_key || "-")}</code></td>
      <td><span class="type-badge">${escapeHtml(displayType)}</span></td>
      <td>${escapeHtml(displayValue)}</td>
      <td>
        <div class="table-actions">
          <button class="ghost" data-system-action="edit" data-key="${escapeAttr(cfg.config_key || "")}">编辑</button>
          ${deleteBtn}
        </div>
      </td>`;
    elements.tableBody.appendChild(tr);
  });
}

function getConfigDisplayName(configKey) {
  const names = {
    "system_options": "系统选项",
  };
  return names[configKey] || configKey;
}

function summarizeConfigValue(configKey, value) {
  if (!value) return "-";
  if (configKey === "system_options") {
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

  const isNew = !cfg;
  const isProtected = cfg?.config_key === "system_options";

  // Set alias (config_key) - readonly for existing configs or protected configs
  if (elements.aliasInput) {
    elements.aliasInput.value = cfg?.config_key || "";
    elements.aliasInput.readOnly = !isNew;
  }

  // Set name field
  const nameInput = elements.modalForm.elements.name;
  if (nameInput) {
    nameInput.value = isNew ? "" : getConfigDisplayName(cfg?.config_key || "");
    nameInput.readOnly = !isNew;
  }

  // Set remark field
  const remarkInput = elements.modalForm.elements.remark;
  if (remarkInput) {
    remarkInput.value = cfg?.remark || "";
    remarkInput.readOnly = isProtected;
  }

  const initialContent = cfg?.config_value || "";
  if (elements.contentInput) {
    elements.contentInput.value = initialContent;
  }
  
  // 重置状态
  clearImageUpload();
  clearColorValue({ resetPicker: true });
  
  // 对于新建，显示类型选择器并默认选择文本类型
  if (isNew) {
    if (elements.typeLabel) {
      elements.typeLabel.classList.remove("hidden");
    }
    if (elements.typeSelect) {
      elements.typeSelect.value = CONFIG_TYPES.TEXT;
    }
    setDataType(CONFIG_TYPES.TEXT);
  } else {
    // 编辑时，优先使用数据库的 config_type，其次根据内容推断类型
    if (cfg.config_key === "system_options") {
      // system_options 会在 syncAliasMode 中处理
    } else {
      // 优先使用数据库的 config_type
      let detectedType = normalizeConfigType(cfg.config_type);
      // 如果数据库没有类型，根据内容推断
      if (!detectedType || detectedType === CONFIG_TYPES.TEXT) {
        detectedType = detectDataType(initialContent);
      }
      if (elements.typeSelect) {
        elements.typeSelect.value = detectedType;
      }
    }
  }

  try {
    await syncAliasMode({ content: initialContent, initialize: true });
  } catch {
    // ignore
  }

  const title = isNew ? "新建系统配置" : `编辑系统配置 - ${getConfigDisplayName(cfg?.config_key || "")}`;
  const titleNode = document.getElementById("systemModalTitle");
  if (titleNode) titleNode.textContent = title;
  systemModal.open();
}

// 检测数据类型
function detectDataType(content) {
  if (!content) return CONFIG_TYPES.TEXT;
  
  // 检测是否为图片引用
  if (content.startsWith("http://") || content.startsWith("https://") || content.startsWith("/")) {
    if (content.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i)) {
      return CONFIG_TYPES.IMAGE;
    }
  }
  
  // 检测是否为颜色值
  if (content.match(/^#[0-9A-Fa-f]{3,6}$/)) {
    return CONFIG_TYPES.COLOR;
  }
  
  // 检测是否为 JSON 对象
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      // 简单的键值对（所有值都是字符串）识别为 KV类型
      const values = Object.values(parsed);
      const allStrings = values.length > 0 && values.every(v => typeof v === "string");
      if (allStrings && values.length <= 20) {
        return CONFIG_TYPES.KV;
      }
      return CONFIG_TYPES.JSON;
    }
  } catch {
    // not JSON
  }
  
  return CONFIG_TYPES.TEXT;
}

async function onSubmit(evt) {
  evt.preventDefault();
  const form = elements.modalForm;
  const formData = new FormData(form);
  const getTrim = (key) => ((formData.get(key) || "").toString().trim());
  const configKey = getTrim("alias");
  const configRemark = getTrim("remark");
  const dataType = getTrim("type") || "text";

  const isNew = !state.editing;

  if (!configKey) {
    showToast("配置键不能为空");
    return;
  }

  let configValue = "";
  
  // 特殊处理 system_options 或键值对类型
  if (configKey === "system_options" || dataType === CONFIG_TYPES.KV) {
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
    // 根据数据类型获取配置值
    if (dataType === CONFIG_TYPES.JSON) {
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
        configValue = JSON.stringify(parsed);
        if (elements.contentJsonInput) {
          elements.contentJsonInput.value = JSON.stringify(parsed, null, 2);
        }
      } catch (err) {
        showToast(err.message || "配置内容不是合法的 JSON 对象");
        return;
      }
    } else if (dataType === CONFIG_TYPES.IMAGE) {
      const reference = (elements.contentInput?.value || state.imageUpload.reference || "").trim();
      if (!reference) {
        showToast("请上传图片");
        return;
      }
      configValue = reference;
    } else if (dataType === CONFIG_TYPES.COLOR) {
      const colorValue = getColorValue();
      if (!colorValue) {
        showToast("请选择色彩值");
        return;
      }
      configValue = colorValue;
    } else {
      // text
      const textContent = elements.contentTextInput?.value.trim() || "";
      if (!textContent) {
        showToast("请填写文案内容");
        return;
      }
      configValue = textContent;
    }
    
    // Save to hidden input
    if (elements.contentInput) {
      elements.contentInput.value = configValue;
    }
  }

  const payload = {
    system_config: {
      environment_key: state.currentEnvironment,
      pipeline_key: state.currentPipeline,
      config_key: configKey,
      config_value: configValue,
      config_type: configKey === "system_options" ? CONFIG_TYPES.KV : dataType,
      remark: configRemark,
    },
  };

  const endpoint = isNew ? `${state.apiBase}/api/v1/system-config/create` : `${state.apiBase}/api/v1/system-config/update`;

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
    systemModal.close();
    await fetchConfigs();
  } catch (err) {
    showToast(err.message || "保存失败");
  }
}

function resetAliasState() {
  hideKeyValueEditor();
  hideDataTypeGroups();
}

async function syncAliasMode(options = {}) {
  const alias = elements.aliasInput?.value.trim() || "";
  
  // system_options 使用 key-value editor
  if (alias === "system_options") {
    hideDataTypeGroups();
    showKeyValueEditor(options.content || elements.contentInput?.value.trim() || "");
    if (elements.contentInput) {
      elements.contentInput.disabled = true;
      elements.contentInput.classList.add("hidden");
    }
    // 隐藏类型选择器
    if (elements.typeLabel) {
      elements.typeLabel.classList.add("hidden");
    }
    return;
  }
  
  // 非 system_options，显示类型选择器
  if (elements.typeLabel) {
    elements.typeLabel.classList.remove("hidden");
  }
  resetAliasState();
  
  // 根据类型显示对应的输入区域
  if (options.initialize && options.content) {
    const dataType = elements.typeSelect?.value || CONFIG_TYPES.TEXT;
    setDataType(dataType, { content: options.content });
  } else {
    const dataType = elements.typeSelect?.value || CONFIG_TYPES.TEXT;
    setDataType(dataType);
  }
  
  // 如果是键值对类型，隐藏 contentInput
  if (elements.typeSelect?.value === CONFIG_TYPES.KV) {
    if (elements.contentInput) {
      elements.contentInput.disabled = true;
      elements.contentInput.classList.add("hidden");
    }
  } else {
    if (elements.contentInput) {
      elements.contentInput.disabled = false;
      elements.contentInput.classList.remove("hidden");
    }
  }
}

function hideDataTypeGroups() {
  if (elements.contentJsonGroup) elements.contentJsonGroup.classList.add("hidden");
  if (elements.contentTextGroup) elements.contentTextGroup.classList.add("hidden");
  if (elements.contentImageGroup) elements.contentImageGroup.classList.add("hidden");
  if (elements.contentColorGroup) elements.contentColorGroup.classList.add("hidden");
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
      showToast("system_options 内容格式不正确，已重置为空");
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

async function deleteConfig(cfg) {
  if (!cfg) return;
  
  if (cfg.config_key === "system_options") {
    showToast("系统保留配置禁止删除");
    return;
  }

  if (!confirm(`确认删除配置"${cfg.config_key}"吗？`)) {
    return;
  }

  try {
    const res = await fetch(`${state.apiBase}/api/v1/system-config/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        environment_key: state.currentEnvironment,
        pipeline_key: state.currentPipeline,
        config_key: cfg.config_key,
      }),
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

// ------------------------- Data Type Switching -------------------------

function setDataType(type, options = {}) {
  state.dataType = type || CONFIG_TYPES.TEXT;
  hideDataTypeGroups();
  hideKeyValueEditor();
  
  if (type === CONFIG_TYPES.KV) {
    // 键值对类型，显示键值对编辑器
    showKeyValueEditor(options.content || "");
    if (elements.contentInput) {
      elements.contentInput.disabled = true;
      elements.contentInput.classList.add("hidden");
    }
  } else if (type === CONFIG_TYPES.JSON) {
    if (elements.contentJsonGroup) {
      elements.contentJsonGroup.classList.remove("hidden");
      if (options.content && elements.contentJsonInput) {
        try {
          const parsed = JSON.parse(options.content);
          elements.contentJsonInput.value = JSON.stringify(parsed, null, 2);
        } catch {
          elements.contentJsonInput.value = options.content;
        }
      }
    }
    if (elements.contentInput) {
      elements.contentInput.disabled = false;
      elements.contentInput.classList.remove("hidden");
    }
  } else if (type === CONFIG_TYPES.IMAGE) {
    if (elements.contentImageGroup) {
      elements.contentImageGroup.classList.remove("hidden");
      if (options.content) {
        setImageReference(options.content);
      }
    }
    if (elements.contentInput) {
      elements.contentInput.disabled = false;
      elements.contentInput.classList.remove("hidden");
    }
  } else if (type === CONFIG_TYPES.COLOR) {
    if (elements.contentColorGroup) {
      elements.contentColorGroup.classList.remove("hidden");
      if (options.content) {
        setColorValue(options.content, { fillPicker: true, forceContent: true });
      }
    }
    if (elements.contentInput) {
      elements.contentInput.disabled = false;
      elements.contentInput.classList.remove("hidden");
    }
  } else {
    // text
    if (elements.contentTextGroup) {
      elements.contentTextGroup.classList.remove("hidden");
      if (options.content && elements.contentTextInput) {
        elements.contentTextInput.value = options.content;
      }
    }
    if (elements.contentInput) {
      elements.contentInput.disabled = false;
      elements.contentInput.classList.remove("hidden");
    }
  }
}

// ------------------------- Image Upload Functions -------------------------

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
      const text = await res.text();
      throw new Error(text || "上传失败");
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

function setImageReference(reference, asset) {
  state.imageUpload.reference = reference || "";
  state.imageUpload.url = reference || "";
  state.imageUpload.fileName = asset?.file_name || "";
  state.imageUpload.fileSize = asset?.file_size || 0;
  if (elements.contentInput && state.dataType === CONFIG_TYPES.IMAGE) {
    elements.contentInput.value = reference;
  }
  const parts = [];
  if (state.imageUpload.fileName) {
    parts.push(`文件名：${state.imageUpload.fileName}`);
  }
  if (state.imageUpload.fileSize) {
    const kb = (state.imageUpload.fileSize / 1024).toFixed(2);
    parts.push(`大小：${kb} KB`);
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

function clearImageUpload() {
  state.imageUpload = {
    reference: "",
    url: "",
    fileName: "",
    fileSize: 0,
  };
  if (elements.contentImageFile) {
    elements.contentImageFile.value = "";
  }
  setImageUploadStatus("");
  updateImagePreview();
}

// ------------------------- Color Functions -------------------------

function setColorValue(value, options = {}) {
  const trimmed = (value || "").trim();
  const normalized = normalizeColorValue(trimmed);
  const finalValue = normalized || trimmed;
  state.colorValue = finalValue;
  if (elements.contentColorValue && options.updateText !== false) {
    elements.contentColorValue.value = finalValue;
  }
  if (elements.contentInput && (state.dataType === CONFIG_TYPES.COLOR || options.forceContent)) {
    elements.contentInput.value = finalValue;
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
  if (elements.contentInput && (state.dataType === CONFIG_TYPES.COLOR || options.forceContent)) {
    elements.contentInput.value = "";
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

function normalizeColorValue(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  // Simple hex color validation
  const hexPattern = /^#[0-9A-Fa-f]{6}$/;
  const hexShortPattern = /^#[0-9A-Fa-f]{3}$/;
  if (hexPattern.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  if (hexShortPattern.test(trimmed)) {
    const short = trimmed.substring(1);
    const expanded = short.split("").map(c => c + c).join("");
    return `#${expanded.toUpperCase()}`;
  }
  return trimmed;
}
