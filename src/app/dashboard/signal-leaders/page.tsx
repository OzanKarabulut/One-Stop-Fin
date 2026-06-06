"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

type Period = "24h" | "7d" | "30d";

export default function SignalLeadersPage() {
  const [period, setPeriod] = useState<Period>("7d");
  const { data, isLoading } = trpc.signal.leaders.useQuery({ period });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Sinyal Liderleri</h1>
        <p className="text-sm text-text-muted">En güçlü yükseliş ve düşüş sinyalleri</p>
      </div>

      <div className="flex gap-2">
        {(["24h", "7d", "30d"] as Period[]).map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className={cn("px-3 py-1.5 text-sm rounded", period === p ? "bg-accent text-white" : "bg-card-bg border border-card-border text-text-primary")}>{p}</button>
        ))}
      </div>

      {isLoading && <div className="text-center py-10 text-text-muted">Yükleniyor...</div>}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg border border-card-border bg-card-bg p-4">
            <h2 className="font-bold text-up mb-3">📈 Yükseliş Sinyalleri</h2>
            {data.bullish.length > 0 ? (
              <div className="space-y-2">
                {data.bullish.map((s) => (
                  <div key={s.ticker} className="flex items-center justify-between py-1.5 border-b border-card-border/50 last:border-0">
                    <span className="font-medium text-sm text-text-primary">{s.ticker}</span>
                    <div className="text-right">
                      <span className="text-sm font-bold text-up">{(s.score * 100).toFixed(0)}%</span>
                      <span className="text-xs text-text-muted ml-2">{s.sources} kaynak</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-text-muted">Veri bekleniyor...</p>}
          </div>

          <div className="rounded-lg border border-card-border bg-card-bg p-4">
            <h2 className="font-bold text-down mb-3">📉 Düşüş Sinyalleri</h2>
            {data.bearish.length > 0 ? (
              <div className="space-y-2">
                {data.bearish.map((s) => (
                  <div key={s.ticker} className="flex items-center justify-between py-1.5 border-b border-card-border/50 last:border-0">
                    <span className="font-medium text-sm text-text-primary">{s.ticker}</span>
                    <div className="text-right">
                      <span className="text-sm font-bold text-down">{(s.score * 100).toFixed(0)}%</span>
                      <span className="text-xs text-text-muted ml-2">{s.sources} kaynak</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-text-muted">Veri bekleniyor...</p>}
          </div>
        </div>
      )}
    </div>
  );
}
