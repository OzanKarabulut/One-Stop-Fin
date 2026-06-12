import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { TRPCProvider } from "@/lib/trpc/Provider";
import "./globals.css";

const inter = localFont({
  src: [
    { path: "../fonts/inter-latin-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/inter-latin-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/inter-latin-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/inter-latin-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "One-Stop-Fin",
  description: "Kişisel finans karar-destek terminali",
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
