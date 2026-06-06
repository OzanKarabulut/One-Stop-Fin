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
        "sidebar-bg": "var(--sidebar-bg)",
        "sidebar-fg": "var(--sidebar-fg)",
        "page-bg": "var(--page-bg)",
        "card-bg": "var(--card-bg)",
        "card-border": "var(--card-border)",
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        link: "var(--link)",
        up: "var(--up)",
        down: "var(--down)",
        "text-primary": "var(--text-primary)",
        "text-muted": "var(--text-muted)",
        foreground: "var(--foreground)",
        "muted-foreground": "var(--muted-foreground)",
        border: "var(--border)",
        card: "var(--card)",
        background: "var(--background)",
        primary: "var(--primary)",
        "primary-foreground": "var(--primary-foreground)",
        destructive: "var(--destructive)",
        muted: "var(--muted)",
        ring: "var(--ring)",
      },
    },
  },
  plugins: [],
};
export default config;
