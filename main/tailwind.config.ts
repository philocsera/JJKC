import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1280px" },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      // 폰트 크기는 globals.css 의 --fs-* 변수(= 기본값 × --font-scale)에 연결.
      // --font-scale 하나로 사이트 전체 폰트를 한 번에 조절한다.
      fontSize: {
        xs: ["var(--fs-xs)", { lineHeight: "1.45" }],
        sm: ["var(--fs-sm)", { lineHeight: "1.5" }],
        base: ["var(--fs-base)", { lineHeight: "1.55" }],
        lg: ["var(--fs-lg)", { lineHeight: "1.5" }],
        xl: ["var(--fs-xl)", { lineHeight: "1.4" }],
        "2xl": ["var(--fs-2xl)", { lineHeight: "1.3" }],
        "3xl": ["var(--fs-3xl)", { lineHeight: "1.2" }],
        "4xl": ["var(--fs-4xl)", { lineHeight: "1.1" }],
        "5xl": ["var(--fs-5xl)", { lineHeight: "1.05" }],
        "6xl": ["var(--fs-6xl)", { lineHeight: "1.0" }],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up":   { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up":   "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [animate],
};
export default config;
