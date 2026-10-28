import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Tests must not depend on a developer's .env.local (live API / pinned baseline run).
    env: { VITE_API_BASE_URL: "", VITE_USE_MOCK: "true", VITE_BASELINE_SIMULATION_ID: "" },
    css: false,
  },
});
