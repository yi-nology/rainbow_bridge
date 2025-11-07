const moduleBase = new URL(".", import.meta.url);
const origin = moduleBase.origin.replace(/\/$/, "");
let pathPrefix = moduleBase.pathname;
if (pathPrefix.endsWith("/")) {
  pathPrefix = pathPrefix.slice(0, -1);
}
if (pathPrefix === "/") {
  pathPrefix = "";
}

const apiBase = `${origin}${pathPrefix}`;

export function getDefaultApiBase() {
  return apiBase || origin;
}

export function getBasePathname() {
  return pathPrefix;
}
