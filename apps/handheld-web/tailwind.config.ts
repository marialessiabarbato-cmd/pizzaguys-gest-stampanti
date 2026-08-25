import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      screens: {
        /** iPad / tablet landscape: Menu | Comanda affiancati */
        "tablet-l": { raw: "(orientation: landscape) and (min-width: 900px)" },
      },
    },
  },
  plugins: [],
} satisfies Config;
