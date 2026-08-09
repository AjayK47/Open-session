import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/@tiptap/") || id.includes("/prosemirror-")) return "rich-text-vendor";
          if (id.includes("/@radix-ui/")) return "radix-vendor";
          if (id.includes("/@tanstack/")) return "tanstack-vendor";
          if (id.includes("/lucide-react/")) return "icons-vendor";
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/react-router/")) return "react-vendor";
          if (id.includes("/zod/") || id.includes("/react-hook-form/") || id.includes("/@hookform/")) return "forms-vendor";
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
