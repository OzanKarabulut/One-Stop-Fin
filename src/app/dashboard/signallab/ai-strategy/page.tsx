"use client";

import { trpc } from "@/lib/trpc/client";
import { Card } from "@/components/ui/Card";

export default function AIStrategyPage() {
  const { data, isLoading, error } = trpc.signallab.aiPick.useQuery();

  return (
    <div>
      <h1 className="text-lg font-semibold text-text-primary mb-4">AI Strateji</h1>
      {isLoading && <p className="text-sm text-text-muted">Yükleniyor...</p>}
      {error && <p className="text-sm text-down">Hata: {error.message}</p>}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.map((pick) => (
            <Card key={pick.symbol}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{pick.symbol}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  pick.signal.includes("BUY") ? "bg-up/10 text-up" : "bg-down/10 text-down"
                }`}>
                  {pick.signal}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-text-muted">
                <span>${pick.price}</span>
                <span className={pick.change >= 0 ? "text-up" : "text-down"}>
                  {pick.change >= 0 ? "+" : ""}{pick.change}%
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
