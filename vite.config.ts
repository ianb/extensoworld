import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: ".",
  build: {
    outDir: "dist",
  },
  server: {
    port: 3000,
    watch: {
      ignored: ["**/data/**", "**/userdata/**"],
    },
    proxy: {
      "/trpc": "http://localhost:3001",
      "/api": {
        target: "http://localhost:3001",
        timeout: 120_000, // AI calls can take 30-60s
      },
      "/auth": "http://localhost:3001",
    },
  },
});
