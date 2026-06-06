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
        "sidebar-muted": "var(--sidebar-muted)",
        "sidebar-active-bg": "var(--sidebar-active-bg)",
        "sidebar-sub-fg": "var(--sidebar-sub-fg)",
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
      },
    },
  },
  plugins: [],
};
export default config;
