"use client";

import { trpc } from "@/lib/trpc/client";
import { Card } from "@/components/ui/Card";

export default function MarketOverviewPage() {
  const { data, isLoading, error } = trpc.signallab.marketOverview.useQuery();

  return (
    <div>
      <h1 className="text-lg font-semibold text-text-primary mb-4">Piyasa Genel Bakış</h1>
      {isLoading && <p className="text-sm text-text-muted">Yükleniyor...</p>}
      {error && <p className="text-sm text-down">Hata: {error.message}</p>}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.map((idx) => (
            <Card key={idx.symbol}>
              <div className="text-xs text-text-muted">{idx.name}</div>
              <div className="text-lg font-semibold text-text-primary mt-1">
                {idx.price.toLocaleString("tr-TR")}
              </div>
              <div className={`text-sm mt-1 ${idx.changePct >= 0 ? "text-up" : "text-down"}`}>
                {idx.changePct >= 0 ? "+" : ""}{idx.changePct}% ({idx.change >= 0 ? "+" : ""}{idx.change})
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
