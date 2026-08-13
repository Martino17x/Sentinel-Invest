import type { Config } from "tailwindcss";

// Tailwind v4 — esta config es puente de compatibilidad para shadcn/ui
// (los tokens reales viven en src/index.css con @theme)
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
