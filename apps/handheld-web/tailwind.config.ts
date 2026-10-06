import type { Config } from "tailwindcss";
import { typeScale } from "../../packages/ui/type-scale";

export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
    "../../packages/comanda/src/**/*.{ts,tsx}",
  ],
  theme: {
    fontSize: typeScale,
    extend: {
      screens: {
        /** iPad / tablet landscape: Menu | Comanda affiancati */
        "tablet-l": { raw: "(orientation: landscape) and (min-width: 900px)" },
      },
    },
  },
  plugins: [],
} satisfies Config;
