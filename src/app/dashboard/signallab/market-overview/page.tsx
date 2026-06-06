"use client";

import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Activity, Gauge, Loader2 } from "lucide-react";

export default function MarketOverviewPage() {
  const { data, isLoading, error } = trpc.signallab.marketOverview.useQuery(undefined, {
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-destructive">{error.message}</p>
      </div>
    );
  }

  if (!data) return null;

  const fgColor = data.fearGreed.value >= 60 ? "text-emerald-400" : data.fearGreed.value <= 40 ? "text-red-400" : "text-yellow-400";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Piyasa Özeti</h1>
        <p className="text-sm text-muted-foreground">Major endeksler, emtialar, VIX ve Fear & Greed</p>
      </div>

      {/* Fear & Greed + VIX */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-4">
          <Gauge className={cn("h-10 w-10", fgColor)} />
          <div>
            <p className="text-xs text-muted-foreground">Fear & Greed Index</p>
            <p className={cn("text-2xl font-bold", fgColor)}>{data.fearGreed.value}</p>
            <p className="text-xs text-muted-foreground">{data.fearGreed.classification}</p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-4">
          <Activity className={cn("h-10 w-10", data.vix > 25 ? "text-red-400" : data.vix > 20 ? "text-yellow-400" : "text-emerald-400")} />
          <div>
            <p className="text-xs text-muted-foreground">VIX (Volatility Index)</p>
            <p className="text-2xl font-bold text-foreground">{data.vix.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{data.vix > 25 ? "Yüksek volatilite" : data.vix > 20 ? "Normal" : "Düşük volatilite"}</p>
          </div>
        </div>
      </div>

      {/* Indices */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Endeksler</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {data.indices.map((idx) => (
            <div key={idx.symbol} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{idx.name ?? idx.symbol}</span>
                {idx.changePct >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-400" />
                )}
              </div>
              <p className="text-lg font-bold text-foreground">{idx.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
              <p className={cn("text-sm font-medium", idx.changePct >= 0 ? "text-emerald-400" : "text-red-400")}>
                {idx.changePct >= 0 ? "+" : ""}{idx.changePct.toFixed(2)}%
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Commodities */}
      {data.commodities.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Emtialar</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {data.commodities.map((c) => (
              <div key={c.symbol} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">{c.name ?? c.symbol}</span>
                  {c.changePct >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-400" />
                  )}
                </div>
                <p className="text-lg font-bold text-foreground">${c.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                <p className={cn("text-sm font-medium", c.changePct >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {c.changePct >= 0 ? "+" : ""}{c.changePct.toFixed(2)}%
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
