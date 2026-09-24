import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5175 },
  envPrefix: "VITE_",
  envDir: path.resolve(__dirname, "../.."),
});
