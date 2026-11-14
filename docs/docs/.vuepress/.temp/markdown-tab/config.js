import { VPCodeTabs } from "/private/tmp/rb-dw/docs/node_modules/@vuepress/plugin-markdown-tab/dist/client/components/VPCodeTabs.js";
import { VPTabs } from "/private/tmp/rb-dw/docs/node_modules/@vuepress/plugin-markdown-tab/dist/client/components/VPTabs.js";

export default {
  enhance: ({ app }) => {
    app.component("VPCodeTabs", VPCodeTabs);
    app.component("VPTabs", VPTabs);
  },
};
