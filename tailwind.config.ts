/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        glassBg: 'rgba(240, 129, 242, 0.37)',
        background: "var(--background)",
        foreground: "var(--foreground)",
        bgBackground: "#111022",
        primary: "#f770ff",
        secondary: "#6ef0ff"
      },
      backgroundImage: {
        'hero-dark': `radial-gradient(circle at 30% 30%, rgba(240, 129, 242, 0.2), transparent 25%),
                              radial-gradient(circle at 70% 70%, rgba(240, 129, 242, 0.15), transparent 30%),
                              linear-gradient(135deg, #050505, #0e0e0e)`,
        'hero-light': `radial-gradient(circle at 30% 30%, rgba(133, 216, 230, 0.2), transparent 25%),
                               radial-gradient(circle at 70% 70%, rgba(133, 216, 230, 0.15), transparent 30%),
                               linear-gradient(135deg, #f9f9f9, #ffffff)`,
      },
      animation: {
        shimmer: "shimmer 2s linear infinite",
        scroll:
          "scroll var(--animation-duration, 40s) var(--animation-direction, forwards) linear infinite",
      },
      keyframes: {
        shimmer: {
          from: {
            backgroundPosition: "0 0",
          },
          to: {
            backgroundPosition: "-200% 0",
          },
        },
        scroll: {
          to: {
            transform: "translate(calc(-50% - 0.5rem))",
          },
        },
      },
    },
  },
  plugins: [],
};
export default config;

