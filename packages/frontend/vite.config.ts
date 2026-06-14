import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";

const API_PREFIX_REGEX = /^\/api/;
const REMOTE_DEV_SERVER_URL = "desk.ssh";
const CERT_PATH = path.resolve(__dirname, `../../certs/${REMOTE_DEV_SERVER_URL}+2.pem`);
const CERT_KEY_PATH = path.resolve(__dirname, `../../certs/${REMOTE_DEV_SERVER_URL}+2-key.pem`);

// The repo root holds the single shared `.env` (see `.env.example`). Point Vite
// there so the proxy target is derived from the same MASKOR_API_* values the API
// binds to — the port can never drift between the two.
const REPO_ROOT = path.resolve(__dirname, "../..");

const shouldUseHTTPs = () => {
  return fs.existsSync(CERT_PATH) && fs.existsSync(CERT_KEY_PATH);
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix = read all keys (not just VITE_*); these stay server-side in
  // the config and are never exposed to client code.
  const env = loadEnv(mode, REPO_ROOT, "");
  const apiHost = env.MASKOR_API_HOST ?? "127.0.0.1";
  const apiPort = env.MASKOR_API_PORT ?? "3001";
  const apiTarget = `http://${apiHost}:${apiPort}`;

  return {
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
      host: "127.0.0.1",
      allowedHosts: [REMOTE_DEV_SERVER_URL],
      https: shouldUseHTTPs()
        ? {
            cert: fs.readFileSync(CERT_PATH),
            key: fs.readFileSync(CERT_KEY_PATH),
          }
        : undefined,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(API_PREFIX_REGEX, ""),
        },
      },
    },
  };
});
