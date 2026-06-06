import type { Metadata } from "next";
import { TRPCProvider } from "@/lib/trpc/Provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "One-Stop-Fin",
  description: "Kişisel finans karar-destek terminali",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
