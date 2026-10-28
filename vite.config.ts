import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    watch: {
      ignored: [
        "**/src-tauri/**",
        "**/.devdata*/**",
        "**/.edge-tmp/**",
        "**/.npm-cache/**",
        "**/.cargo-home/**",
        "**/dist/**",
        "**/node_modules/**",
        "**/*.png",
        "**/*.txt",
      ],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "chrome110",
    minify: "esbuild",
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
});
