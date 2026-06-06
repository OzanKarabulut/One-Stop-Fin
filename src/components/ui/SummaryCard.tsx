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
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <Link href={href} className="text-xs text-link hover:underline">
          Detay →
        </Link>
      </div>
      {loading && <p className="text-xs text-text-muted">Yükleniyor...</p>}
      {error && <p className="text-xs text-down">{error}</p>}
      {empty && !loading && !error && <p className="text-xs text-text-muted">Veri yok</p>}
      {!loading && !error && !empty && children}
    </Card>
  );
}
