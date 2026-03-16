var _a;
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import http from 'node:http';
var agent = new http.Agent({
    family: 6,
});
var basePath = process.env.BASE_PATH || '/rainbow-bridge/';
var normalizedBasePath = basePath.replace(/\/$/, '');
export default defineConfig({
    plugins: [vue(), tailwindcss()],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
    base: basePath,
    build: {
        outDir: '../pkg/static/web',
        emptyOutDir: true,
    },
    server: {
        port: 3000,
        host: true,
        proxy: (_a = {},
            _a["".concat(normalizedBasePath, "/api")] = {
                target: 'http://[::1]:8080',
                changeOrigin: true,
                rewrite: function (path) { return path.replace(normalizedBasePath, ''); },
                secure: false,
                agent: agent,
            },
            _a),
    },
});
