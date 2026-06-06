"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Brain, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";

function generateFridays(): { date: string; label: string }[] {
  const fridays: { date: string; label: string }[] = [];
  const now = new Date();
  for (let i = 1; i < 120 && fridays.length < 10; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    if (d.getUTCDay() === 5) {
      const dateStr = d.toISOString().split("T")[0];
      const label = `${d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} (${i}g)`;
      fridays.push({ date: dateStr, label });
    }
  }
  return fridays;
}

export default function AIStrategyPage() {
  const fridays = useMemo(() => generateFridays(), []);
  const [ticker, setTicker] = useState("TSLA");
  const [expiry, setExpiry] = useState(fridays[1]?.date ?? "");
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading, error } = trpc.signallab.aiPick.useQuery(
    { ticker: ticker.toUpperCase(), expiry },
    { enabled: submitted, refetchOnWindowFocus: false },
  );

  const handleSubmit = () => { setSubmitted(true); };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">AI Strateji</h1>
        <p className="text-sm text-white/50">Ticker + vade seç → 7 strateji önerisi composite score ile sıralı</p>
      </div>

      {/* Input */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-white/50">Ticker</label>
            <input type="text" value={ticker} onChange={(e) => { setTicker(e.target.value); setSubmitted(false); }}
              className="w-28 rounded border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground uppercase focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-white/50">Vade</label>
            <select value={expiry} onChange={(e) => { setExpiry(e.target.value); setSubmitted(false); }}
              className="rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              {fridays.map((f) => <option key={f.date} value={f.date}>{f.label}</option>)}
            </select>
          </div>
          <button onClick={handleSubmit} disabled={isLoading || !ticker}
            className="rounded bg-[#ff7200] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#ff8c3a] disabled:opacity-50 flex items-center gap-2">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            Analiz Et
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error.message}</p>}

      {data && (
        <div className="space-y-6">
          {/* Signals Summary */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-bold text-foreground mb-3">Piyasa Sinyalleri — {data.ticker} (${data.price.toFixed(2)})</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="text-center">
                <p className="text-[10px] text-white/50">IV Rank</p>
                <p className={cn("text-sm font-bold", data.signals.ivRank > 50 ? "text-emerald-400" : "text-white/50")}>{data.signals.ivRank.toFixed(0)}%</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-white/50">Current IV</p>
                <p className="text-sm font-bold text-yellow-400">{data.signals.currentIv.toFixed(0)}%</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-white/50">HV</p>
                <p className="text-sm font-bold text-white/50">{data.signals.hv.toFixed(0)}%</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-white/50">IV vs HV</p>
                <p className="text-sm font-bold text-foreground">{data.signals.ivVsHv}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-white/50">Trend</p>
                <p className="text-sm font-bold text-foreground flex items-center justify-center gap-1">
                  {data.signals.trend === "bullish" ? <TrendingUp className="h-3 w-3 text-emerald-400" /> :
                   data.signals.trend === "bearish" ? <TrendingDown className="h-3 w-3 text-red-400" /> :
                   <Minus className="h-3 w-3" />}
                  {data.signals.trend}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-white/50">P/C Ratio</p>
                <p className="text-sm font-bold text-foreground">{data.signals.pcRatio.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* Strategies */}
          {data.strategies.length > 0 ? (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-foreground">Strateji Önerileri ({data.strategies.length})</h2>
              {data.strategies.map((s, idx) => (
                <div key={s.name} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white/50">#{idx + 1}</span>
                        <h3 className="text-sm font-bold text-foreground">{s.name}</h3>
                        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium",
                          s.type === "bullish" ? "bg-emerald-500/20 text-emerald-400" :
                          s.type === "bearish" ? "bg-red-500/20 text-red-400" :
                          "bg-blue-500/20 text-blue-400")}>{s.type}</span>
                      </div>
                      <p className="text-xs text-white/50 mt-1">{s.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-foreground">{s.compositeScore.toFixed(0)}</p>
                      <p className="text-[10px] text-white/50">Score</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
                    <div className="rounded border border-border/50 p-2 text-center">
                      <p className="text-[10px] text-white/50">Olasılık</p>
                      <p className="text-xs font-bold text-emerald-400">{s.probability.toFixed(0)}%</p>
                    </div>
                    <div className="rounded border border-border/50 p-2 text-center">
                      <p className="text-[10px] text-white/50">Max Kâr</p>
                      <p className="text-xs font-bold text-emerald-400">${s.maxProfit.toFixed(0)}</p>
                    </div>
                    <div className="rounded border border-border/50 p-2 text-center">
                      <p className="text-[10px] text-white/50">Max Zarar</p>
                      <p className="text-xs font-bold text-red-400">${s.maxLoss.toFixed(0)}</p>
                    </div>
                    <div className="rounded border border-border/50 p-2 text-center">
                      <p className="text-[10px] text-white/50">EV</p>
                      <p className={cn("text-xs font-bold", s.ev >= 0 ? "text-emerald-400" : "text-red-400")}>${s.ev.toFixed(0)}</p>
                    </div>
                    <div className="rounded border border-border/50 p-2 text-center">
                      <p className="text-[10px] text-white/50">Vol Edge</p>
                      <p className="text-xs font-bold text-yellow-400">{s.volEdge.toFixed(0)}%</p>
                    </div>
                  </div>

                  <p className="text-xs text-white/50 italic">{s.why}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-6 text-center">
              <p className="text-sm text-white/50">{data.debugInfo.reason || "Strateji bulunamadı"}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
