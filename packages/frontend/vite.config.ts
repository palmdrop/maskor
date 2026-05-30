import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";

const API_PREFIX_REGEX = /^\/api/;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@api": path.resolve(__dirname, "./src/api"),
      "@assets": path.resolve(__dirname, "./src/assets"),
      "@components": path.resolve(__dirname, "./src/components"),
      "@contexts": path.resolve(__dirname, "./src/contexts"),
      "@hooks": path.resolve(__dirname, "./src/hooks"),
      "@lib": path.resolve(__dirname, "./src/lib"),
      "@pages": path.resolve(__dirname, "./src/pages"),
      "@styles": path.resolve(__dirname, "./src/styles"),
    },
  },
  server: {
    host: '127.0.0.1',
    allowedHosts: ["desk.ssh"],
		https: {
      cert: fs.readFileSync(path.resolve(__dirname, '../../certs/desk.ssh+2.pem')),
      key: fs.readFileSync(path.resolve(__dirname, '../../certs/desk.ssh+2-key.pem')),
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(API_PREFIX_REGEX, ""),
      },
    },
  },
});
