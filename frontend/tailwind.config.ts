import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Light tactical surface ramp (lightest -> deepest neutral).
        base: {
          900: "#F8FAFC",
          800: "#F1F5F9",
          700: "#E2E8F0",
          600: "#CBD5E1",
        },
        neon: {
          conflict: "#FF3333",
          unrest: "#E67E22",
          biosecurity: "#2ECC71",
          humanitarian: "#0097A7",
        },
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        glass: "0 1px 2px 0 rgba(15,23,42,0.04), 0 8px 28px rgba(15,23,42,0.10)",
      },
    },
  },
  plugins: [],
};

export default config;
