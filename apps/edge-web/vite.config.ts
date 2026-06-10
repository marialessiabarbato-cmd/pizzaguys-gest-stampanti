import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  envPrefix: "VITE_",
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
