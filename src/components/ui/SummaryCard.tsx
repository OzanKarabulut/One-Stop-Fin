import Link from "next/link";
import { Card } from "./Card";
import { ReactNode } from "react";

interface SummaryCardProps {
  title: string;
  href: string;
  children: ReactNode;
  loading?: boolean;
  error?: string;
  empty?: boolean;
}

export function SummaryCard({ title, href, children, loading, error, empty }: SummaryCardProps) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <Link href={href} className="text-xs font-bold text-link hover:underline">
          Detay →
        </Link>
      </div>
      {loading && <p className="text-xs font-bold text-white/90">Yükleniyor...</p>}
      {error && <p className="text-xs font-bold text-down">{error}</p>}
      {empty && !loading && !error && <p className="text-xs font-bold text-white/90">Veri yok</p>}
      {!loading && !error && !empty && children}
    </Card>
  );
}
