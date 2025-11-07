import { initPageLayout } from "./components.js";
import { getDefaultApiBase } from "./runtime.js";
import { createModal } from "./ui.js";

initPageLayout({
  activeKey: "system",
  title: "系统业务配置",
  caption: "维护 system 业务下的配置，支持配置对象、图片及文案类型",
});

const defaultBase = getDefaultApiBase();
const state = {
  apiBase: defaultBase,
  configs: [],
  search: "",
  editing: null,
  businessKeys: [],
  dataType: "config",
  imageUpload: {
    reference: "",
    url: "",
    filename: "",
  },
  imageUploading: false,
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
  imageFileInput: document.getElementById("systemImageFile"),
  imageUploadBtn: document.getElementById("systemImageUploadBtn"),
  imageStatus: document.getElementById("systemImageStatus"),
  imagePreview: document.getElementById("systemImagePreview"),
  imagePreviewImg: document.querySelector("#systemImagePreview img"),
  businessSelect: document.getElementById("systemBusinessSelect"),
  keyValueEditor: document.getElementById("systemKeyValueEditor"),
  keyValueList: document.getElementById("systemKeyValueList"),
  keyValueAddBtn: document.getElementById("systemKeyValueAdd"),
};

const systemModal = createModal("systemModal", {
  onClose: () => {
    state.editing = null;
    elements.modalForm.reset();
    elements.modalForm.elements.businessKey.value = "system";
    resetDataType(true);
    resetAliasState();
    resetKeyValueEditor();
    if (elements.aliasInput) {
      elements.aliasInput.value = "";
    }
    const radios = elements.modalForm.elements.isPerm;
    if (radios) {
      const list = typeof radios.length === "number" ? Array.from(radios) : [radios];
      list.forEach((radio) => {
        radio.checked = radio.value === "false";
      });
    }
  },
});

(async function init() {
  await fetchConfigs();
})();

if (elements.search) {
  elements.search.addEventListener("input", (evt) => {
    state.search = evt.target.value.trim().toLowerCase();
    renderTable();
  });
}

if (elements.newBtn) {
  elements.newBtn.addEventListener("click", () => openModal());
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

if (elements.contentTextInput) {
  elements.contentTextInput.addEventListener("input", () => {
    if (state.dataType === "text" && elements.contentInput) {
      elements.contentInput.value = elements.contentTextInput.value;
    }
  });
}

if (elements.imageFileInput) {
  elements.imageFileInput.addEventListener("change", onImageFileChange);
}

if (elements.imageUploadBtn) {
  elements.imageUploadBtn.addEventListener("click", onImageUpload);
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
    const cfg = state.configs.find((item) => item.resource_key === key);
    if (cfg) openModal(cfg);
  }
  if (target.matches("button[data-system-action='delete']")) {
    const key = target.dataset.key;
    if (confirm("确定删除该配置吗？")) {
      deleteConfig(key);
    }
  }
});

async function fetchConfigs() {
  try {
    const res = await fetch(`${state.apiBase}/api/v1/resources?business_key=system`);
    const json = await res.json();
    state.configs = json?.list || json?.data?.list || [];
    renderTable();
  } catch (err) {
    showToast(`获取配置失败: ${err.message}`);
  }
}

async function deleteConfig(resourceKey) {
  try {
    const res = await fetch(`${state.apiBase}/api/v1/resources`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business_key: "system", resource_key: resourceKey }),
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

function renderTable() {
  const records = state.configs.filter((cfg) => {
    if (!state.search) return true;
    const haystack = [cfg.name, cfg.alias, cfg.type, cfg.content]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(state.search);
  });

  elements.count.textContent = `system 配置列表 · 共 ${records.length} 条`;
  elements.tableBody.innerHTML = "";
  elements.empty.classList.toggle("hidden", records.length > 0);

  records.forEach((cfg) => {
    const tr = document.createElement("tr");
    const isProtected = cfg.alias === "business_select" || cfg.alias === "system_keys";
    const deleteBtn = isProtected
      ? ""
      : `<button class="danger" data-system-action="delete" data-key="${escapeAttr(cfg.resource_key || "")}">删除</button>`;
    tr.innerHTML = `
      <td>${escapeHtml(cfg.name || "-")}</td>
      <td>${escapeHtml(cfg.alias || "-")}</td>
      <td>${escapeHtml(displayDataType(cfg.type))}</td>
      <td>${escapeHtml(summarizeContent(cfg.content))}</td>
      <td>
        <div class="table-actions">
          <button class="ghost" data-system-action="edit" data-key="${escapeAttr(cfg.resource_key || "")}">编辑</button>
          ${deleteBtn}
        </div>
      </td>`;
    elements.tableBody.appendChild(tr);
  });
}

async function openModal(cfg) {
  state.editing = cfg || null;
  elements.modalForm.reset();
  elements.modalForm.elements.businessKey.value = "system";
  elements.modalForm.elements.resourceKey.value = cfg?.resource_key || "";
  elements.modalForm.elements.name.value = cfg?.name || "";
  elements.modalForm.elements.alias.value = cfg?.alias || "";
  elements.modalForm.elements.remark.value = cfg?.remark || "";
  const isPermValue = cfg?.is_perm ? "true" : "false";
  [...elements.modalForm.elements.isPerm].forEach((radio) => {
    radio.checked = radio.value === isPermValue;
  });
  const initialType = cfg?.type || "config";
  const initialContent = cfg?.content || "";
  initializeDataTypeFields(initialType, initialContent);
  try {
    await syncAliasMode({ content: initialContent, initialize: true });
  } catch {
    // ignore
  }
  const title = cfg ? "编辑 system 配置" : "新建 system 配置";
  const titleNode = document.getElementById("systemModalTitle");
  if (titleNode) titleNode.textContent = title;
  systemModal.open();
}

async function onSubmit(evt) {
  evt.preventDefault();
  const form = elements.modalForm;
  const formData = new FormData(form);
  const getTrim = (key) => ((formData.get(key) || "").toString().trim());
  const aliasValue = getTrim("alias");
  const nameValue = getTrim("name");
  if (!aliasValue || !nameValue) {
    showToast("请填写名称与别名");
    return;
  }

  let contentValue = "";
  let typeValue = getTrim("type");
  if (aliasValue === "business_select") {
    contentValue = (elements.businessSelect?.value || "").trim();
    if (!contentValue) {
      showToast("请选择业务");
      return;
    }
    typeValue = "text";
  } else if (aliasValue === "system_keys") {
    const { data, errors } = collectKeyValueData({ strict: true });
    if (errors.length) {
      showToast(errors[0]);
      return;
    }
    if (!Object.keys(data).length) {
      showToast("请至少添加一行 key 与 名称");
      return;
    }
    contentValue = JSON.stringify(data);
    typeValue = "config";
  } else {
    const normalizedType = normalizeDataType(typeValue);
    typeValue = normalizedType;
    if (normalizedType === "config") {
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
    } else if (normalizedType === "image") {
      const reference = (elements.contentInput?.value || state.imageUpload.reference || "").trim();
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
  }

  const payload = {
    config: {
      business_key: "system",
      resource_key: getTrim("resourceKey"),
      alias: aliasValue,
      name: nameValue,
      type: typeValue,
      content: contentValue,
      remark: getTrim("remark"),
      is_perm: formData.get("isPerm") === "true",
    },
  };

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
    systemModal.close();
    await fetchConfigs();
  } catch (err) {
    showToast(err.message || "保存失败");
  }
}

function getAliasValue() {
  return elements.aliasInput?.value.trim() || "";
}

function getBusinessKeyValue() {
  return "system";
}

function normalizeDataType(value = "") {
  const str = value.toString().toLowerCase();
  if (str === "image") return "image";
  if (["text", "string", "copy", "文案"].includes(str)) return "text";
  return "config";
}

function displayDataType(value = "") {
  const normalized = normalizeDataType(value);
  if (normalized === "image") return "图片";
  if (normalized === "text") return "文案";
  return "配置对象";
}

function resetDataType(initial = false) {
  state.dataType = "config";
  state.imageUpload = { reference: "", url: "", filename: "" };
  state.imageUploading = false;
  if (elements.typeSelect) {
    elements.typeSelect.disabled = false;
    elements.typeSelect.value = "config";
  }
  if (!initial && elements.contentJsonInput) elements.contentJsonInput.value = "";
  if (!initial && elements.contentTextInput) elements.contentTextInput.value = "";
  clearImageReference(true);
  updateDataTypeViews("config", { initialize: true });
  if (elements.contentInput) {
    elements.contentInput.value = "";
    elements.contentInput.disabled = false;
    elements.contentInput.classList.remove("hidden");
  }
}

function setDataType(type, options = {}) {
  const normalized = normalizeDataType(type);
  state.dataType = normalized;
  if (elements.typeSelect) {
    elements.typeSelect.value = normalized;
  }
  updateDataTypeViews(normalized, options);
  if (!options.preserveContent && elements.contentInput) {
    elements.contentInput.value = "";
  }
  if (normalized === "config" && !options.preserveContent && elements.contentJsonInput) {
    elements.contentJsonInput.value = "";
  }
  if (normalized === "text" && !options.preserveContent && elements.contentTextInput) {
    elements.contentTextInput.value = "";
  }
  if (normalized === "image" && !options.preserveContent) {
    clearImageReference();
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
    clearImageReference();
  }
  if (type === "image" && !state.imageUpload.reference) {
    setImageUploadStatus("请选择图片文件并上传，成功后将自动填充引用地址。");
  }
}

function initializeDataTypeFields(type, content) {
  const normalized = normalizeDataType(type);
  if (elements.typeSelect) {
    elements.typeSelect.value = normalized;
  }
  setDataType(normalized, { initialize: true, preserveContent: true });
  const trimmed = (content || "").trim();
  if (elements.contentInput) {
    elements.contentInput.value = trimmed;
  }
  if (normalized === "config") {
    if (elements.contentJsonInput) {
      if (trimmed) {
        try {
          const parsed = JSON.parse(trimmed);
          elements.contentJsonInput.value = JSON.stringify(parsed, null, 2);
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
  } else if (normalized === "image") {
    if (trimmed) {
      setImageReference(trimmed);
    } else {
      clearImageReference(true);
    }
  }
}

function enableTypeSelect() {
  if (!elements.typeSelect) return;
  elements.typeSelect.disabled = false;
}

function disableTypeSelect(value) {
  if (!elements.typeSelect) return;
  elements.typeSelect.value = value;
  elements.typeSelect.disabled = true;
  state.dataType = normalizeDataType(value);
  updateDataTypeViews(state.dataType, { initialize: true, preserveContent: true });
}

function resetAliasState() {
  enableTypeSelect();
  hideBusinessSelect();
  hideKeyValueEditor();
  updateDataTypeViews(state.dataType, { initialize: true });
}

async function syncAliasMode(options = {}) {
  const alias = getAliasValue();
  if (alias === "business_select") {
    try {
      await ensureBusinessKeys();
    } catch (err) {
      showToast(`获取业务列表失败: ${err.message}`);
      resetAliasState();
      return;
    }
    disableTypeSelect("text");
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
    disableTypeSelect("config");
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
  setDataType(state.dataType, { initialize: options.initialize, preserveContent: true });
  if (elements.contentInput) {
    elements.contentInput.disabled = false;
    elements.contentInput.classList.remove("hidden");
  }
}

function hideDataTypeGroups() {
  if (elements.contentJsonGroup) elements.contentJsonGroup.classList.add("hidden");
  if (elements.contentTextGroup) elements.contentTextGroup.classList.add("hidden");
  if (elements.contentImageGroup) elements.contentImageGroup.classList.add("hidden");
}

function handleBusinessSelectChange() {
  if (!elements.businessSelect || !elements.contentInput) return;
  elements.contentInput.value = elements.businessSelect.value || "";
}

async function ensureBusinessKeys(force = false) {
  if (!force && state.businessKeys.length) {
    return state.businessKeys;
  }
  const res = await fetch(`${state.apiBase}/api/v1/resources/business-keys`);
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

function setImageReference(reference, asset) {
  const trimmed = (reference || "").trim();
  state.imageUpload.reference = trimmed;
  if (elements.contentInput) {
    elements.contentInput.value = trimmed;
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

function clearImageReference(initial = false) {
  state.imageUpload = { reference: "", url: "", filename: "" };
  state.imageUploading = false;
  if (elements.contentInput) {
    elements.contentInput.value = "";
  }
  if (elements.imageFileInput) {
    elements.imageFileInput.value = "";
  }
  if (initial) {
    setImageUploadStatus("请选择图片文件并上传，成功后将自动填充引用地址。");
  } else {
    setImageUploadStatus("");
  }
  updateImagePreview();
}

function setImageUploadStatus(message, isError = false) {
  if (!elements.imageStatus) return;
  elements.imageStatus.textContent = message || "";
  elements.imageStatus.classList.toggle("error", Boolean(isError));
}

function setImageUploadLoading(loading) {
  state.imageUploading = loading;
  if (!elements.imageUploadBtn) return;
  elements.imageUploadBtn.disabled = loading;
  if (loading) {
    if (!elements.imageUploadBtn.dataset.originalText) {
      elements.imageUploadBtn.dataset.originalText = elements.imageUploadBtn.textContent;
    }
    elements.imageUploadBtn.textContent = "上传中…";
  } else if (elements.imageUploadBtn.dataset.originalText) {
    elements.imageUploadBtn.textContent = elements.imageUploadBtn.dataset.originalText;
    delete elements.imageUploadBtn.dataset.originalText;
  }
}

function updateImagePreview() {
  if (!elements.imagePreview || !elements.imagePreviewImg) return;
  const url = state.imageUpload.url;
  if (!url) {
    elements.imagePreview.classList.add("hidden");
    elements.imagePreviewImg.src = "";
    return;
  }
  elements.imagePreviewImg.src = url;
  elements.imagePreview.classList.remove("hidden");
}

function onImageFileChange() {
  const file = elements.imageFileInput?.files?.[0];
  if (file) {
    setImageUploadStatus(`已选择文件：${file.name}，请点击上传`, false);
  } else if (!state.imageUpload.reference) {
    setImageUploadStatus("请选择图片文件并上传，成功后将自动填充引用地址。");
  }
}

async function onImageUpload() {
  if (state.imageUploading) return;
  const file = elements.imageFileInput?.files?.[0];
  if (!file) {
    setImageUploadStatus("请先选择图片文件", true);
    showToast("请先选择图片文件");
    return;
  }
  const formData = new FormData();
  formData.append("file", file);
  formData.append("business_key", getBusinessKeyValue());
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
    if (elements.imageFileInput) {
      elements.imageFileInput.value = "";
    }
  } catch (err) {
    setImageUploadStatus(err.message || "上传失败", true);
    showToast(err.message || "上传失败");
  } finally {
    setImageUploadLoading(false);
  }
}

function resetKeyValueEditor() {
  hideKeyValueEditor();
  clearKeyValueEditor();
}

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

let toastTimer;
function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    elements.toast.classList.add("hidden");
  }, 2500);
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
