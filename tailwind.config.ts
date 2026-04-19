import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./types/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        card: "hsl(var(--card))",
        border: "hsl(var(--border))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        accent: "hsl(var(--accent))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))"
      },
      boxShadow: {
        soft: "0 18px 70px -40px rgba(15, 23, 42, 0.45)"
      },
      fontFamily: {
        sans: ["var(--font-sora)"],
        mono: ["var(--font-plex-mono)"]
      },
      backgroundImage: {
        "dashboard-glow":
          "radial-gradient(circle at top left, rgba(84, 173, 255, 0.18), transparent 34%), radial-gradient(circle at top right, rgba(124, 255, 180, 0.18), transparent 28%), linear-gradient(180deg, rgba(8, 15, 24, 0.94) 0%, rgba(8, 15, 24, 1) 100%)"
      },
      animation: {
        float: "float 8s ease-in-out infinite",
        "fade-up": "fadeUp 0.5s ease-out forwards"
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" }
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        }
      }
    }
  },
  plugins: []
};

export default config;
