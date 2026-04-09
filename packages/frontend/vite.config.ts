import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_PREFIX_REGEX = /^\/api/;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(API_PREFIX_REGEX, ""),
      },
    },
  },
});
