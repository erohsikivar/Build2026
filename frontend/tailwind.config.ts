import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          900: "#050B14",
          800: "#0A1120",
          700: "#101A30",
          600: "#16223D",
        },
        neon: {
          conflict: "#FF3333",
          unrest: "#FF8C00",
          biosecurity: "#33FF33",
          humanitarian: "#00D7FF",
        },
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        glass: "inset 0 1px 0 0 rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
