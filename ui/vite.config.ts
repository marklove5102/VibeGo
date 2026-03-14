import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

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
  },
  server: {
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "https://127.0.0.1:1984",
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      "/version": {
        target: "https://127.0.0.1:1984",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    allowedHosts: true,
    port: 4173,
    proxy: {
      "/api": {
        target: "https://127.0.0.1:1984",
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      "/version": {
        target: "https://127.0.0.1:1984",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
