/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        // FreshFlow semantic palette
        forest: { DEFAULT: "#1d4433", light: "#2f6b50", 50: "#eef5f1" },
        fresh: { DEFAULT: "#0f8a7e", light: "#14b8a6", 50: "#e7f6f4", 100: "#c8ece7" },
        risk: { DEFAULT: "#d9822b", 50: "#fdf3e7", 100: "#f9e0c2", dark: "#9a5a17" },
        unsafe: { DEFAULT: "#b4483f", 50: "#fbeceb", 100: "#f3cfcb", dark: "#8a332c" },
      },
      borderRadius: { lg: "0.625rem", md: "0.5rem", sm: "0.375rem" },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
