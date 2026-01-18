const NAV_ITEMS = [
  {
    key: "home",
    href: "home.html",
    icon: "🌈",
    label: "项目概览",
    description: "虹桥计划简介与快速上手指南",
    tagline: "全局视角了解虹桥计划",
  },
  {
    key: "config",
    href: "index.html",
    icon: "🧩",
    label: "业务配置",
    description: "按业务维度管理资源配置与版本",
    tagline: "集中管理业务配置，保持可追溯性",
  },
  {
    key: "system",
    href: "system.html",
    icon: "🛠️",
    label: "系统业务配置",
    description: "维护 system 业务下的专属配置与资源",
    tagline: "集中管理系统业务基础配置",
  },
  {
    key: "environment",
    href: "environment.html",
    icon: "🌍",
    label: "环境管理",
    description: "管理配置的环境维度，支持多环境隔离",
    tagline: "按环境隔离配置，支持多套部署",
  },
  {
    key: "pipeline",
    href: "pipeline.html",
    icon: "🔄",
    label: "渠道管理",
    description: "管理配置的渠道维度，支持多渠道隔离",
    tagline: "按渠道隔离配置，支持多渠道并行",
  },
  {
    key: "assets",
    href: "assets.html",
    icon: "📦",
    label: "静态资源库",
    description: "上传、存储与引用文件资源",
    tagline: "规范资源入口，统一引用规范",
  },
  {
    key: "transfer",
    href: "transfer.html",
    icon: "⇄",
    label: "配置迁移",
    description: "导出备份或导入配置与资源",
    tagline: "备份、迁移、多环境同步",
  },
];

const BRAND = {
  title: "虹桥计划",
  subtitle: "静态资源与配置一体化平台",
  icon: "🌈",
  footerLinks: [
    {
      label: "使用文档",
      href: "./home.html",
    },
    {
      label: "GitHub 仓库",
      href: "https://github.com/yi-nology/rainbow_bridge",
    },
  ],
};

// 上下文切换器状态存储
const CONTEXT_STORAGE_KEY = {
  environment: "rainbow_bridge_current_env",
  pipeline: "rainbow_bridge_current_pipeline",
};

export function initPageLayout(options = {}) {
  const { activeKey, title, caption, tagline, showEnvSelector = false, showPipelineSelector = false } = options;
  const activeItem = NAV_ITEMS.find((item) => item.key === activeKey) || NAV_ITEMS[0];

  initSidebar({
    activeKey,
    tagline: tagline || activeItem.tagline,
  });

  initPageHeader({
    title: title || activeItem.label,
    caption: caption || activeItem.description,
    showEnvSelector,
    showPipelineSelector,
  });
}

export function initSidebar(options = {}) {
  const { activeKey, tagline } = options;
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  const activeItem = NAV_ITEMS.find((item) => item.key === activeKey) || NAV_ITEMS[0];

  if (!sidebar.classList.contains("sider")) {
    sidebar.classList.add("sider");
  }

  sidebar.innerHTML = `
    <div class="brand brand-text-only" aria-label="${BRAND.title}">
      <div class="brand-text">
        <div>${BRAND.title}</div>
      </div>
    </div>
    <nav class="side-nav" aria-label="主导航">
      ${NAV_ITEMS.map(
        (item) => `
          <a class="${item.key === activeKey ? "active" : ""}" href="${item.href}">
            <span class="nav-icon" aria-hidden="true">${item.icon}</span>
            <span class="nav-meta">
              <span class="nav-label">${item.label}</span>
              <span class="nav-desc">${item.description}</span>
            </span>
          </a>
        `,
      ).join("")}
    </nav>
    <div class="side-footer">
      ${BRAND.footerLinks
        .map(
          (link) =>
            `<a class="side-footer-link" href="${link.href}" target="_blank" rel="noopener">${link.label}</a>`,
        )
        .join("")}
    </div>
  `;
}

export function initPageHeader(options = {}) {
  const header = document.getElementById("pageHeader");
  if (!header) return;
  const { title, caption, actions = "", showEnvSelector = false, showPipelineSelector = false } = options;
  header.classList.add("topbar");

  const selectorsHtml = renderContextSelectors({ showEnvSelector, showPipelineSelector });
  const actionsHtml = actions || selectorsHtml;

  header.innerHTML = `
    <div class="page-heading">
      <h1>${title || BRAND.title}</h1>
      ${caption ? `<p>${caption}</p>` : ""}
    </div>
    ${actionsHtml ? `<div class="page-actions">${actionsHtml}</div>` : ""}
  `;
}

function renderContextSelectors({ showEnvSelector, showPipelineSelector }) {
  if (!showEnvSelector && !showPipelineSelector) return "";

  const parts = [];

  if (showEnvSelector) {
    parts.push(`
      <div class="context-selector" data-type="environment">
        <span class="context-selector-icon">🌍</span>
        <select id="globalEnvSelector" class="context-select">
          <option value="default">默认环境</option>
        </select>
        <a href="environment.html" class="context-selector-link" title="管理环境">⚙️</a>
      </div>
    `);
  }

  if (showPipelineSelector) {
    parts.push(`
      <div class="context-selector" data-type="pipeline">
        <span class="context-selector-icon">🔄</span>
        <select id="globalPipelineSelector" class="context-select">
          <option value="default">默认渠道</option>
        </select>
        <a href="pipeline.html" class="context-selector-link" title="管理渠道">⚙️</a>
      </div>
    `);
  }

  return `<div class="context-selectors">${parts.join("")}</div>`;
}

// 获取当前选中的环境
export function getCurrentEnvironment() {
  const stored = localStorage.getItem(CONTEXT_STORAGE_KEY.environment);
  return stored || "default";
}

// 设置当前选中的环境
export function setCurrentEnvironment(envKey) {
  localStorage.setItem(CONTEXT_STORAGE_KEY.environment, envKey);
}

// 获取当前选中的渠道
export function getCurrentPipeline() {
  const stored = localStorage.getItem(CONTEXT_STORAGE_KEY.pipeline);
  return stored || "default";
}

// 设置当前选中的渠道
export function setCurrentPipeline(pipelineKey) {
  localStorage.setItem(CONTEXT_STORAGE_KEY.pipeline, pipelineKey);
}

// 初始化环境选择器
export async function initEnvSelector(apiBase, onChange) {
  const select = document.getElementById("globalEnvSelector");
  if (!select) return;

  try {
    const res = await fetch(`${apiBase}/api/v1/environment/list`);
    const json = await res.json();
    const list = json?.list || json?.data?.list || [];

    select.innerHTML = list.map((env) => `
      <option value="${env.environment_key}">${env.environment_name || env.environment_key}</option>
    `).join("");

    const current = getCurrentEnvironment();
    if (list.some((env) => env.environment_key === current)) {
      select.value = current;
    } else if (list.length > 0) {
      select.value = list[0].environment_key;
      setCurrentEnvironment(select.value);
    }

    select.addEventListener("change", (e) => {
      setCurrentEnvironment(e.target.value);
      if (onChange) onChange(e.target.value);
    });
  } catch (err) {
    console.error("Failed to load environments:", err);
  }
}

// 初始化渠道选择器
export async function initPipelineSelector(apiBase, onChange) {
  const select = document.getElementById("globalPipelineSelector");
  if (!select) return;

  const loadPipelines = async () => {
    try {
      const currentEnv = getCurrentEnvironment();
      const res = await fetch(`${apiBase}/api/v1/pipeline/list?environment_key=${encodeURIComponent(currentEnv)}`);
      const json = await res.json();
      const list = json?.list || json?.data?.list || [];

      select.innerHTML = list.map((pl) => `
        <option value="${pl.pipeline_key}">${pl.pipeline_name || pl.pipeline_key}</option>
      `).join("");

      const current = getCurrentPipeline();
      if (list.some((pl) => pl.pipeline_key === current)) {
        select.value = current;
      } else if (list.length > 0) {
        select.value = list[0].pipeline_key;
        setCurrentPipeline(select.value);
      }
    } catch (err) {
      console.error("Failed to load pipelines:", err);
    }
  };

  await loadPipelines();

  select.addEventListener("change", (e) => {
    setCurrentPipeline(e.target.value);
    if (onChange) onChange(e.target.value);
  });

  // 返回 reload函数，供外部调用
  return { reload: loadPipelines };
}

export function getNavItem(key) {
  return NAV_ITEMS.find((item) => item.key === key);
}
