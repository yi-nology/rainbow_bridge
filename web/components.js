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
    label: "流水线管理",
    description: "管理配置的流水线维度，支持多流程隔离",
    tagline: "按流水线隔离配置，支持多流程并行",
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
    key: "export",
    href: "export.html",
    icon: "📤",
    label: "配置导出",
    description: "批量导出配置与静态资源",
    tagline: "标准化导出，方便分发部署",
  },
  {
    key: "import",
    href: "import.html",
    icon: "⇅",
    label: "配置导入",
    description: "上传 ZIP 还原配置与资源",
    tagline: "一键导入，保障多环境一致性",
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

export function initPageLayout(options = {}) {
  const { activeKey, title, caption, tagline } = options;
  const activeItem = NAV_ITEMS.find((item) => item.key === activeKey) || NAV_ITEMS[0];

  initSidebar({
    activeKey,
    tagline: tagline || activeItem.tagline,
  });

  initPageHeader({
    title: title || activeItem.label,
    caption: caption || activeItem.description,
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
  const { title, caption, actions = "" } = options;
  header.classList.add("topbar");

  header.innerHTML = `
    <div class="page-heading">
      <h1>${title || BRAND.title}</h1>
      ${caption ? `<p>${caption}</p>` : ""}
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ""}
  `;
}

export function getNavItem(key) {
  return NAV_ITEMS.find((item) => item.key === key);
}
