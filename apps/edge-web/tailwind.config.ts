import type { Config } from "tailwindcss";
import { typeScale } from "../../packages/ui/type-scale";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: { fontSize: typeScale, extend: {} },
  plugins: [],
} satisfies Config;
