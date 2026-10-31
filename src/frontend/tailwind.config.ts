import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        veritas: {
          blue: "#126BEB",
          primary: "#126BEB",
          "primary-hover": "#0e56be",
          dark: "#172033",
          ink: "#172033",
          bg: "#F5F7FA",
          mist: "#DDE7F4",
          "neutral-dark": "#475569",
          "neutral-light": "#E2E8F0",
          supported: "#10B981",
          contradicted: "#EF4444",
          unresolved: "#F59E0B",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;

