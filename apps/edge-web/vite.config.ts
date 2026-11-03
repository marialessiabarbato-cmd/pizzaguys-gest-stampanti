import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
// @ts-ignore modulo .mjs senza tipi, usato solo in build
import { buildId } from "../../scripts/build-id.mjs";

export default defineConfig({
  plugins: [react()],
  define: { __PG_BUILD__: JSON.stringify(buildId()) },
  server: { host: true, port: 5173 },
  envPrefix: "VITE_",
  envDir: path.resolve(__dirname, "../.."),
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
