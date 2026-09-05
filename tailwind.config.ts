import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: {
          50: "#FDFBF6",
          100: "#F8F3E9",
          200: "#F1E9DA",
          300: "#E5DAC5",
          400: "#D4C5A8",
        },
        ink: {
          900: "#141F33",
          800: "#1B2A41",
          700: "#26385A",
          600: "#35507C",
          500: "#4E6489",
          400: "#7386A6",
          300: "#9FADC4",
        },
        sage: {
          700: "#3E5646",
          600: "#4F6B58",
          500: "#6E8C74",
          400: "#93AE98",
          200: "#C8D8CB",
          100: "#E2ECE3",
        },
        mustard: {
          700: "#96691C",
          600: "#B8842A",
          500: "#D6A03C",
          400: "#E4BC6B",
          200: "#F2DFB2",
          100: "#F9EFD6",
        },
        clay: {
          600: "#A5563F",
          500: "#C06A50",
          100: "#F6E2DB",
        },
      },
      fontFamily: {
        serif: ["var(--font-plex-serif)", "Georgia", "serif"],
        sans: ["var(--font-plex-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(20, 31, 51, 0.04), 0 8px 24px -12px rgba(20, 31, 51, 0.16)",
        lift: "0 2px 4px rgba(20, 31, 51, 0.06), 0 16px 40px -16px rgba(20, 31, 51, 0.24)",
      },
      borderRadius: {
        card: "14px",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 240ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
