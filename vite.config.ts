import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
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
      // 3. tell Vite to ignore watching `src-tauri`
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
        },
        // 优化 chunk 命名，便于缓存
        chunkFileNames: "js/[name]-[hash].js",
        entryFileNames: "js/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split(".");
          const ext = info[info.length - 1];
          if (/png|jpe?g|gif|svg|webp|ico|ttf|woff2?/i.test(ext)) {
            return `assets/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        },
      },
    },
    // 启用 CSS 代码分割
    cssCodeSplit: true,
    // 最小化配置
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true, // 移除 console 语句
        drop_debugger: true, // 移除 debugger
        pure_funcs: ["console.log", "console.info"],
      },
      format: {
        comments: false, // 移除注释
      },
      mangle: {
        toplevel: true, // 混淆顶级变量
      },
    },
    reportCompressedSize: true,
    chunkSizeWarningLimit: 500,
  },
}));
