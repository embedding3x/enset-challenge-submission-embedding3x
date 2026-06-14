import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./contexts/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["var(--font-geist-mono)", "monospace"],
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
        serif: ["var(--font-playfair)", "Playfair Display", "serif"],
      },
      colors: {
        appbg: "#141724",
        panelbg: "#1e2235",
        paneldark: "#181b2b",
        panelborder: "#2a2f4c",
        navactive: "#272b43",
        textmuted: "#8b92b2",
        textlight: "#e2e8f0",
        primary: "#a855f7",
        secondary: "#3b82f6",
      },
      backgroundImage: {
        "gradient-hero": "linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
