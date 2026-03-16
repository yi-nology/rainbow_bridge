import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import http from 'node:http';
var agent = new http.Agent({
    family: 6,
});
export default defineConfig({
    plugins: [vue(), tailwindcss()],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
    base: process.env.BASE_PATH || '/rainbow-bridge/',
    build: {
        outDir: '../pkg/static/web',
        emptyOutDir: true,
    },
    server: {
        port: 3000,
        host: true,
        proxy: {
            '/api': {
                target: 'http://[::1]:8080',
                changeOrigin: true,
                secure: false,
                agent: agent,
            },
        },
    },
});
