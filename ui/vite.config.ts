import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

const proxyTarget = process.env.VG_DEV_PROXY_TARGET || "http://127.0.0.1:11984";
const proxy = {
  "/api": {
    target: proxyTarget,
    changeOrigin: true,
    secure: false,
    ws: true,
  },
  "/version": {
    target: proxyTarget,
    changeOrigin: true,
    secure: false,
  },
};

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        httpUpgrade: path.resolve(__dirname, "http-upgrade.html"),
      },
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: 15173,
    strictPort: true,
    proxy,
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: 15173,
    proxy,
  },
});
