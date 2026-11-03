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
      "@": path.resolve(import.meta.dirname, "./src"),
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
    //
    // Vite 8 is Rolldown-based: chunk groups are declared with
    // `advancedChunks`, and the old `manualChunks` record no longer types — the
    // function form is accepted but react-dom still ended up in the radix chunk.
    rollupOptions: {
      output: {
        advancedChunks: {
          groups: [
            {
              name: "react",
              test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
            },
            { name: "supabase", test: /[\\/]node_modules[\\/]@supabase[\\/]/ },
            {
              name: "radix",
              test: /[\\/]node_modules[\\/](@radix-ui|sonner|@floating-ui)[\\/]/,
            },
          ],
        },
      },
    },
  },
}));
