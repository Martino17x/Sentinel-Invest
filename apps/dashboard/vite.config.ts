import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Todo lo que vaya a /api se redirige al backend Express
      // → sin problemas de CORS en desarrollo
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
