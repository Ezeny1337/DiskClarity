import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
    ],

    // Tauri 开发配置
    clearScreen: false,
    server: {
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                protocol: "ws",
                host,
                port: 1421,
            }
            : undefined,
        watch: {
            ignored: ["**/src-tauri/**"],
        },
    },

    build: {
        // 代码分割配置
        rollupOptions: {
            output: {
                manualChunks: {
                    "react-vendor": ["react", "react-dom"],
                    "ui-vendor": ["@mui/material", "@mui/icons-material"],
                    "i18n": ["i18next", "react-i18next"],
                    "tauri": ["@tauri-apps/api", "@tauri-apps/plugin-opener"],
                    "state": ["zustand"],
                    "utils": ["pako", "@msgpack/msgpack"],
                    "animation": ["framer-motion"],
                },
                // 优化 chunk 命名
                chunkFileNames: "assets/js/[name]-[hash].js",
                entryFileNames: "assets/js/[name]-[hash].js",
                assetFileNames: (assetInfo) => {
                    if (assetInfo.names.some(n => n.endsWith('.css'))) {
                        return 'assets/css/[name]-[hash][extname]';
                    }
                    return 'assets/[name]-[hash][extname]';
                },
            },
        },
        // 启用 CSS 代码分割
        cssCodeSplit: true,
         // 使用最新的 JavaScript 版本
        target: "esnext",
        // terser 最小化配置
        minify: "terser",
        terserOptions: {
            compress: {
                drop_console: true, // 移除 console 语句
                drop_debugger: true, // 移除 debugger
                pure_funcs: ["console.log", "console.info", "console.warn"],
                unused: true,
                dead_code: true,
            },
            format: {
                comments: false, // 移除注释
            },
            mangle: {
                toplevel: true, // 混淆顶级变量
            },
        },
        reportCompressedSize: true,
        chunkSizeWarningLimit: 600,
    },
});
