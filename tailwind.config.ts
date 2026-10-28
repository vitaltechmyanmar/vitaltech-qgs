import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7ff",
          100: "#d9edff",
          500: "#0b6bcb",
          600: "#0959a8",
          700: "#084785",
          900: "#062a4f",
        },
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans Myanmar", "Padauk", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
