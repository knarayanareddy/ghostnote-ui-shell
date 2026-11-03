import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // Dev servers get proxied under generated hostnames (Codespaces, E2B
    // previews, tunnels). Vite rejects unknown Host headers by default.
    allowedHosts: true,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  build: {
    // Vendor chunks change far less often than app code, so splitting them
    // keeps the browser cache warm across deploys (and keeps any single chunk
    // under Vite's 500 kB warning threshold).
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
          radix: [
            "@radix-ui/react-checkbox",
            "@radix-ui/react-dialog",
            "@radix-ui/react-slot",
            "@radix-ui/react-tooltip",
            "sonner",
          ],
        },
      },
    },
  },
}));
