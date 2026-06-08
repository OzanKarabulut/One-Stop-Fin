"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Loader2, Star } from "lucide-react";

const DEFAULT_TICKERS = ["TSLA", "NVDA", "AMD", "AAPL", "META", "GOOGL", "MSFT", "AMZN", "SPY", "QQQ"];

export default function WatchlistPage() {
  const [tickers, setTickers] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("signallab_watchlist_tickers");
        if (saved) return JSON.parse(saved);
      } catch { /* ignore */ }
    }
    return DEFAULT_TICKERS;
  });
  const [newTicker, setNewTicker] = useState("");

  useEffect(() => {
    localStorage.setItem("signallab_watchlist_tickers", JSON.stringify(tickers));
  }, [tickers]);

  const { data, isLoading } = trpc.signallab.watchlist.useQuery(
    { tickers },
    { refetchInterval: 120000 },
  );

  const addTicker = () => {
    const t = newTicker.trim().toUpperCase();
    if (t && !tickers.includes(t)) {
      setTickers([...tickers, t]);
      setNewTicker("");
    }
  };

  const removeTicker = (symbol: string) => {
    setTickers(tickers.filter((t) => t !== symbol));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">İzleme Listesi</h1>
        <p className="text-sm font-bold text-white/90">Fiyat, değişim, IV Rank, HV, trend ve RSI</p>
      </div>

      {/* Add ticker */}
      <div className="flex gap-2">
        <input type="text" value={newTicker} onChange={(e) => setNewTicker(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTicker()}
          placeholder="Ticker ekle (ör. COIN)"
          className="rounded border border-border bg-background px-3 py-1.5 text-sm font-bold text-foreground placeholder:text-white/90 focus:outline-none focus:ring-1 focus:ring-ring" />
        <button onClick={addTicker}
          className="rounded bg-[#ff7200] px-3 py-1.5 text-sm font-bold text-white hover:bg-[#ff8c3a]">
          Ekle
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-white/90" />
        </div>
      )}

      {data && data.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm font-bold">
            <thead>
              <tr className="border-b border-border text-white/90 text-xs font-bold">
                <th className="px-4 py-3 text-left font-bold">Ticker</th>
                <th className="px-4 py-3 text-right font-bold">Fiyat</th>
                <th className="px-4 py-3 text-right font-bold">Değişim%</th>
                <th className="px-4 py-3 text-right font-bold">IV Rank</th>
                <th className="px-4 py-3 text-right font-bold">HV%</th>
                <th className="px-4 py-3 text-center font-bold">Trend</th>
                <th className="px-4 py-3 text-right font-bold">RSI</th>
                <th className="px-4 py-3 text-center font-bold"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.symbol} className="border-b border-border/50 hover:bg-white/10/20 transition-colors">
                  <td className="px-4 py-2.5 font-bold text-foreground">{item.symbol}</td>
                  <td className="px-4 py-2.5 text-right text-foreground">${item.price.toFixed(2)}</td>
                  <td className={cn("px-4 py-2.5 text-right font-bold", item.changePct >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {item.changePct >= 0 ? "+" : ""}{item.changePct.toFixed(2)}%
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={cn("font-bold", item.ivRank > 60 ? "text-emerald-400" : item.ivRank > 30 ? "text-yellow-400" : "text-white/90")}>
                      {item.ivRank.toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-white/90">{item.hv.toFixed(0)}%</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={cn("rounded px-2 py-0.5 text-xs font-bold",
                      item.trend === "bullish" ? "bg-emerald-500/20 text-emerald-400" :
                      item.trend === "bearish" ? "bg-red-500/20 text-red-400" :
                      "bg-zinc-500/20 text-zinc-400")}>
                      {item.trend === "bullish" ? "📈" : item.trend === "bearish" ? "📉" : "↔️"} {item.trend}
                    </span>
                  </td>
                  <td className={cn("px-4 py-2.5 text-right font-bold",
                    item.rsi > 70 ? "text-red-400" : item.rsi < 30 ? "text-emerald-400" : "text-white/90")}>
                    {item.rsi.toFixed(0)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button onClick={() => removeTicker(item.symbol)}
                      className="text-white/90 hover:text-yellow-400 transition-colors">
                      <Star className="h-4 w-4 fill-current" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
