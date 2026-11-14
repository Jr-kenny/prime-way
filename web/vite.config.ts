import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

declare const process: { env: Record<string, string | undefined> };

// Dev only: /api proxies to the local Relay proxy server on :3000.
// In production the same server serves the built frontend, so the app
// calls same-origin /api and no proxy is needed. The deployed Prime
// Way backend (https://prime-way-backend.onrender.com) is the fallback
// API base when no local server is running; set VITE_API_BASE_URL to
// point at a different backend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        changeOrigin: true,
        target: process.env.API_PROXY_TARGET || "http://localhost:3000",
      },
    },
  },
});
