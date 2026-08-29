import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// public/ is served at the web root, so the on-chain JSON is fetched as /onchain.json etc.
export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1200 },
});
