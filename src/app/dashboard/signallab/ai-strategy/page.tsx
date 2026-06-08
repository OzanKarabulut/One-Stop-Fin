"use client";

import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import {
  Brain,
  Loader2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Pencil,
  ChevronDown,
  ChevronRight,
  X,
  BarChart3,
} from "lucide-react";

type Mode = "mylist" | "all" | "custom";

const DEFAULT_LIST = "NASA,RKLB,DRAM,MRVL,NNE,AMBA,CBRS,OSCR,EOSE,BMNR,IREN,CLS,MU,CRDO,SNDK,AAOI,PENG,GLW";

const usd = (n: number) => `${Math.round(n).toLocaleString("tr-TR")}$`;

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

function scoreColor(score: number): string {
  if (score >= 65) return "text-emerald-400";
  if (score >= 45) return "text-yellow-400";
  return "text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 65) return "bg-emerald-500/15 border-emerald-500/30";
  if (score >= 45) return "bg-yellow-500/15 border-yellow-500/30";
  return "bg-red-500/15 border-red-500/30";
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    bullish: "bg-emerald-500/15 text-emerald-400",
    bearish: "bg-red-500/15 text-red-400",
    neutral: "bg-blue-500/15 text-blue-400",
  };
  const icons: Record<string, React.ReactNode> = {
    bullish: <TrendingUp className="h-3 w-3" />,
    bearish: <TrendingDown className="h-3 w-3" />,
    neutral: <Minus className="h-3 w-3" />,
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-bold", colors[type] ?? "bg-zinc-500/15 text-zinc-400")}>
      {icons[type]} {type === "bullish" ? "Yükseliş" : type === "bearish" ? "Düşüş" : "Nötr"}
    </span>
  );
}

function SignalPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={cn("rounded px-2 py-1 text-xs font-bold", ok ? "bg-emerald-500/10 text-emerald-400" : "bg-white/10 text-white/80")}>
      {label}
    </span>
  );
}

interface StrategyItem {
  ticker: string;
  tickerPrice: number;
  name: string;
  type: string;
  description: string;
  compositeScore: number;
  probability: number;
  maxProfit: number;
  maxLoss: number;
  ev: number;
  evPct: number;
  volEdge: number;
  netCredit: number;
  signals: { ivRankOk: boolean; trendOk: boolean; dteOk: boolean; earningsRisk: boolean } | null;
  legs: { action: string; type: string; strike: number; price: number; contracts: number }[];
  why: string;
}

interface ScenarioRow {
  price: number;
  changePct: number;
  pnl: number;
  outcome: string;
}

function calcScenarios(strategy: StrategyItem): ScenarioRow[] {
  const spot = strategy.tickerPrice;
  const pcts = [-20, -15, -10, -5, -3, 0, 3, 5, 10, 15, 20];
  return pcts.map((pct) => {
    const price = spot * (1 + pct / 100);
    let pnl = 0;
    for (const leg of strategy.legs) {
      const mult = leg.action === "sell" ? 1 : -1;
      if (leg.type === "stock") {
        const stockPnl = (price - leg.price) * leg.contracts;
        pnl += leg.action === "buy" ? stockPnl : -stockPnl;
      } else if (leg.type === "call") {
        const intrinsic = Math.max(price - leg.strike, 0);
        const value = intrinsic * leg.contracts * 100;
        const cost = leg.price * leg.contracts * 100;
        pnl += mult * (cost - value);
      } else if (leg.type === "put") {
        const intrinsic = Math.max(leg.strike - price, 0);
        const value = intrinsic * leg.contracts * 100;
        const cost = leg.price * leg.contracts * 100;
        pnl += mult * (cost - value);
      }
    }
    let outcome = "Nötr";
    if (pnl > 50) outcome = "Kâr ✓";
    else if (pnl < -50) outcome = "Zarar ✗";
    return { price, changePct: pct, pnl, outcome };
  });
}

function ScenarioPanel({ strategy, onClose }: { strategy: StrategyItem; onClose: () => void }) {
  const scenarios = useMemo(() => calcScenarios(strategy), [strategy]);
  const maxAbsPnl = Math.max(...scenarios.map((s) => Math.abs(s.pnl)), 1);

  // Investment summary
  const totalInvest = strategy.legs.reduce((sum, leg) => {
    if (leg.type === "stock" && leg.action === "buy") return sum + leg.price * leg.contracts;
    if (leg.type !== "stock" && leg.action === "buy") return sum + leg.price * leg.contracts * 100;
    return sum;
  }, 0);
  const totalCollateral = strategy.legs.reduce((sum, leg) => {
    if (leg.type === "put" && leg.action === "sell") return sum + leg.strike * leg.contracts * 100;
    if (leg.type === "call" && leg.action === "sell" && strategy.legs.some((l) => l.type === "stock")) return sum; // covered
    return sum;
  }, 0);
  const netCreditTotal = strategy.netCredit * 100;
  const riskAmount = Math.abs(strategy.maxLoss);
  const profitableCount = scenarios.filter((s) => s.pnl > 50).length;

  return (
    <div className="mt-3 rounded-xl border border-[#ff7200]/30 bg-[#0a0a0c] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[#ff7200]" />
          Kapanış Senaryoları — {strategy.ticker} · {strategy.name}
        </h3>
        <button onClick={onClose} className="rounded p-1 text-white/90 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content: Table left 2/3, Summary right 1/3 */}
      <div className="flex flex-col lg:flex-row gap-6 p-4">
        {/* Table — left 2/3 */}
        <div className="lg:w-[66%] overflow-x-auto rounded-lg border border-white/[0.06] bg-white/[0.01] px-4 py-3">
          <table className="w-full text-sm font-bold tabular-nums">
            <thead>
              <tr className="border-b border-white/10 text-xs text-white font-bold">
                <th className="pb-2 text-left font-bold">Kapanış</th>
                <th className="pb-2 text-center font-bold">Değişim</th>
                <th className="pb-2 text-right font-bold">Kâr / Zarar</th>
                <th className="pb-2 text-center font-bold w-20">Görsel</th>
                <th className="pb-2 text-right font-bold">Sonuç</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((row) => {
                const isSpot = row.changePct === 0;
                const barWidth = Math.abs(row.pnl) / maxAbsPnl * 100;
                return (
                  <tr key={row.changePct} className={cn("border-b border-white/[0.04]", isSpot && "bg-[#ff7200]/5")}>
                    <td className="py-2 text-left">
                      <span className={cn("font-bold", isSpot ? "text-[#ff7200]" : "text-white")}>${row.price.toFixed(2)}</span>
                    </td>
                    <td className="py-2 text-center">
                      <span className={cn("font-bold",
                        row.changePct > 0 ? "text-emerald-400" :
                        row.changePct < 0 ? "text-red-400" :
                        "text-white/90"
                      )}>
                        {row.changePct > 0 ? "+" : ""}{row.changePct}%
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <span className={cn("font-bold", row.pnl > 0 ? "text-emerald-400" : row.pnl < 0 ? "text-red-400" : "text-white/90")}>
                        {row.pnl >= 0 ? "+" : ""}{usd(row.pnl)}
                      </span>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center justify-center h-3">
                        <div className="relative w-full h-1.5 rounded-full bg-white/5">
                          {row.pnl >= 0 ? (
                            <div className="absolute left-1/2 top-0 h-full rounded-r-full bg-emerald-500/60" style={{ width: `${barWidth / 2}%` }} />
                          ) : (
                            <div className="absolute right-1/2 top-0 h-full rounded-l-full bg-red-500/60" style={{ width: `${barWidth / 2}%` }} />
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      <span className={cn("font-bold",
                        row.pnl > 50 ? "text-emerald-400" : row.pnl < -50 ? "text-red-400" : "text-white/90"
                      )}>
                        {row.outcome}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Summary — right 1/3 */}
        <div className="lg:w-[34%] rounded-lg border border-white/[0.06] bg-white/[0.01] px-5 py-4 space-y-4">
          <div className="text-center rounded-lg bg-[#ff7200]/10 border border-[#ff7200]/20 py-3">
            <div className="text-xs font-bold uppercase tracking-wide text-[#ff7200]">Mevcut Fiyat</div>
            <div className="text-xl font-bold text-[#ff7200] tabular-nums">${strategy.tickerPrice.toFixed(2)}</div>
          </div>

          <div className="space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-white">Yatırım</span>
              <span className="text-sm font-bold text-white tabular-nums">{usd(totalInvest)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-white">Teminat</span>
              <span className="text-sm font-bold text-white tabular-nums">{usd(totalCollateral)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-white">Net Prim</span>
              <span className="text-sm font-bold text-emerald-400 tabular-nums">{usd(netCreditTotal)}</span>
            </div>
            <div className="h-px bg-white/[0.08]" />
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-white">Max Kâr</span>
              <span className="text-sm font-bold text-emerald-400 tabular-nums">+{usd(strategy.maxProfit)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-white">Max Zarar</span>
              <span className="text-sm font-bold text-red-400 tabular-nums">{usd(riskAmount)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-white">Kazanma</span>
              <span className="text-sm font-bold text-emerald-400 tabular-nums">{strategy.probability.toFixed(1)}%</span>
            </div>
            <div className="h-px bg-white/[0.08]" />
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-white">Kârlı Senaryo</span>
              <span className="text-sm font-bold text-emerald-400 tabular-nums">{profitableCount}/{scenarios.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-white">En İyi</span>
              <span className="text-sm font-bold text-emerald-400 tabular-nums">+{usd(Math.max(...scenarios.map((s) => s.pnl)))}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-white">En Kötü</span>
              <span className="text-sm font-bold text-red-400 tabular-nums">{usd(Math.min(...scenarios.map((s) => s.pnl)))}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StrategyCard({ strategy, rank }: { strategy: StrategyItem; rank: number }) {
  const [open, setOpen] = useState(false);
  const [showScenarios, setShowScenarios] = useState(false);

  return (
    <div className={cn("rounded-xl border bg-[#0e0e10] transition-all", rank <= 3 ? "border-[#ff7200]/40" : "border-white/10")}>
      {/* Header */}
      <div className="flex w-full items-center justify-between p-4">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-3 text-left flex-1 min-w-0">
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-sm font-bold", scoreBg(strategy.compositeScore), scoreColor(strategy.compositeScore))}>
            {rank}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">{strategy.ticker}</span>
              <span className="text-sm font-bold text-white">${strategy.tickerPrice?.toFixed(2)}</span>
              <TypeBadge type={strategy.type} />
            </div>
            <div className="mt-0.5 text-xs font-bold text-white truncate">{strategy.name} — {strategy.description}</div>
          </div>
        </button>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          <button onClick={(e) => { e.stopPropagation(); setShowScenarios(!showScenarios); }}
            className={cn("flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold transition-colors",
              showScenarios ? "bg-[#ff7200]/20 text-[#ff7200] border border-[#ff7200]/40" : "bg-[#ff7200] text-white hover:bg-[#ff8c3a]")}>
            <BarChart3 className="h-4 w-4" /> Senaryolar
          </button>
          <span className={cn("text-2xl font-bold tabular-nums", scoreColor(strategy.compositeScore))}>
            {strategy.compositeScore.toFixed(0)}
          </span>
          <button onClick={() => setOpen(!open)}>
            {open ? <ChevronDown className="h-4 w-4 text-white/80" /> : <ChevronRight className="h-4 w-4 text-white/80" />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-3">
          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <div className="text-sm font-bold text-white">Kazanma Olasılığı</div>
              <div className="text-sm font-bold text-emerald-400 tabular-nums">{strategy.probability.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-sm font-bold text-white">Max Kâr</div>
              <div className="text-sm font-bold text-emerald-400 tabular-nums">{usd(strategy.maxProfit)}</div>
            </div>
            <div>
              <div className="text-sm font-bold text-white">Max Zarar</div>
              <div className="text-sm font-bold text-red-400 tabular-nums">{usd(Math.abs(strategy.maxLoss))}</div>
            </div>
            <div>
              <div className="text-sm font-bold text-white">EV</div>
              <div className={cn("text-sm font-bold tabular-nums", strategy.ev > 0 ? "text-emerald-400" : "text-red-400")}>{usd(strategy.ev)}</div>
            </div>
            <div>
              <div className="text-sm font-bold text-white">EV%</div>
              <div className={cn("text-sm font-bold tabular-nums", strategy.evPct > 0 ? "text-emerald-400" : "text-red-400")}>{strategy.evPct.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-sm font-bold text-white">Vol Edge</div>
              <div className={cn("text-sm font-bold tabular-nums", strategy.volEdge > 0 ? "text-yellow-400" : "text-blue-400")}>{strategy.volEdge.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-sm font-bold text-white">Net Kredi</div>
              <div className="text-sm font-bold text-white tabular-nums">${strategy.netCredit.toFixed(2)}</div>
            </div>
          </div>

          {/* Signals */}
          {strategy.signals && (
            <div className="flex items-center gap-2">
              <SignalPill label="IV Rank" ok={strategy.signals.ivRankOk} />
              <SignalPill label="Trend" ok={strategy.signals.trendOk} />
              <SignalPill label="DTE" ok={strategy.signals.dteOk} />
              <SignalPill label={strategy.signals.earningsRisk ? "⚠ Earnings" : "✓ Earnings"} ok={!strategy.signals.earningsRisk} />
            </div>
          )}

          {/* Legs */}
          <div>
            <div className="text-sm font-bold text-white mb-1.5">Pozisyonlar</div>
            <div className="space-y-1">
              {strategy.legs.map((leg, i) => (
                <div key={i} className="flex items-center gap-3 text-sm font-bold">
                  <span className={cn("w-10 rounded px-1.5 py-0.5 text-center text-xs font-bold", leg.action === "buy" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400")}>
                    {leg.action === "buy" ? "AL" : "SAT"}
                  </span>
                  <span className="text-white">{leg.type === "stock" ? "100 Hisse" : `${leg.type.toUpperCase()} $${leg.strike.toFixed(0)}`}</span>
                  <span className="text-white/90">@${leg.price.toFixed(2)}</span>
                  <span className="text-white/90">x{leg.contracts}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Why */}
          {strategy.why && (
            <div className="rounded-md bg-[#ff7200]/5 border border-[#ff7200]/20 px-3 py-2 text-sm font-bold text-[#ff7200]">
              💡 {strategy.why}
            </div>
          )}
        </div>
      )}

      {/* Scenario panel (inline) */}
      {showScenarios && <ScenarioPanel strategy={strategy} onClose={() => setShowScenarios(false)} />}
    </div>
  );
}

export default function AIStrategyPage() {
  const fridays = useMemo(() => generateFridays(), []);
  const [mode, setMode] = useState<Mode>("mylist");
  const [myList, setMyList] = useState(DEFAULT_LIST);
  const [customTickers, setCustomTickers] = useState("");
  const [budget, setBudget] = useState(100000);
  const [expiry, setExpiry] = useState(fridays[1]?.date ?? fridays[0]?.date ?? "");
  const [editingList, setEditingList] = useState(false);
  const [scanning, setScanning] = useState(false);

  const scanInput = useMemo(() => {
    if (mode === "all") return { watchlist: "all" as const, customTickers: "", expiry, budget };
    if (mode === "custom") return { watchlist: "custom" as const, customTickers, expiry, budget };
    return { watchlist: "custom" as const, customTickers: myList, expiry, budget };
  }, [mode, customTickers, myList, expiry, budget]);

  const { data, error, refetch, isFetching } = trpc.signallab.aiStrategyScan.useQuery(scanInput, { enabled: false, refetchOnWindowFocus: false });

  const handleScan = useCallback(async () => { setScanning(true); await refetch(); setScanning(false); }, [refetch]);
  const isLoading = isFetching || scanning;

  const inputClass = "rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm font-bold text-white focus:outline-none focus:ring-1 focus:ring-[#ff7200]/50";
  const labelClass = "text-xs font-bold text-white";

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">AI Strateji Motoru</h1>
          <p className="mt-1 text-sm font-bold text-white/90">Opsiyon kombinasyonlarını skorla — en iyi stratejiyi bul</p>
        </div>
        {data && (
          <p className="text-sm font-bold text-white/90 tabular-nums">
            {data.scannedTickers}/{data.totalTickers} ticker · {data.allStrategies.length} strateji
          </p>
        )}
      </div>

      {/* Search Bar */}
      <div className="rounded-xl border border-white/10 bg-[#0b0b0c] p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className={labelClass}>Watchlist</label>
            <div className="flex items-center gap-1">
              {(["mylist", "all", "custom"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={cn("rounded-md px-3 py-2 text-sm font-bold transition-colors", mode === m ? "bg-[#ff7200] text-white" : "bg-white/5 text-white/90 hover:bg-white/10")}>
                  {m === "mylist" ? "Listem" : m === "all" ? "Tümü" : "Özel"}
                </button>
              ))}
              <button onClick={() => setEditingList((v) => !v)} title="Listeyi düzenle" className="rounded-md p-2 text-white/90 hover:bg-white/10 hover:text-white">
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          </div>

          {editingList && (
            <div className="w-full space-y-1.5">
              <label className={labelClass}>Listem (virgülle)</label>
              <textarea value={myList} onChange={(e) => setMyList(e.target.value.toUpperCase())} rows={2} className={cn(inputClass, "w-full")} />
            </div>
          )}

          {mode === "custom" && (
            <div className="min-w-[200px] flex-1 space-y-1.5">
              <label className={labelClass}>Tickers</label>
              <input type="text" value={customTickers} onChange={(e) => setCustomTickers(e.target.value)} placeholder="TSLA,NVDA..." className={cn(inputClass, "w-full")} />
            </div>
          )}

          <div className="space-y-1.5">
            <label className={labelClass}>Bütçe</label>
            <input type="text" inputMode="numeric" value={usd(budget)}
              onChange={(e) => setBudget(Number(e.target.value.replace(/[^\d]/g, "")) || 0)}
              className={cn(inputClass, "w-32 tabular-nums")} />
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>Vade</label>
            <select value={expiry} onChange={(e) => setExpiry(e.target.value)} className={inputClass}>
              {fridays.map((f) => <option key={f.date} value={f.date}>{f.label}</option>)}
            </select>
          </div>

          <button onClick={handleScan} disabled={isLoading}
            className="flex items-center gap-2 rounded-md bg-[#ff7200] px-6 py-2 text-sm font-bold text-white hover:bg-[#ff8c3a] disabled:opacity-50">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            {isLoading ? "Analiz ediliyor..." : "Analiz Et"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error.message}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && !data && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl border border-white/10 bg-[#0e0e10]" />)}
        </div>
      )}

      {/* Results */}
      {data && data.topStrategies.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Brain className="h-4 w-4 text-[#ff7200]" /> En İyi Stratejiler
          </h2>
          {data.topStrategies.map((s, i) => (
            <StrategyCard key={`${s.ticker}-${s.name}-${i}`} strategy={s as unknown as StrategyItem} rank={i + 1} />
          ))}
        </div>
      )}

      {/* Diagnostics */}
      {data && data.diagnostics.length > 0 && (
        <details className="rounded-lg border border-white/10 bg-[#0b0b0c]">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-bold text-white/90">
            <AlertTriangle className="h-4 w-4" /> Diagnostics ({data.diagnostics.length})
          </summary>
          <div className="space-y-1.5 px-4 pb-3">
            {data.diagnostics.map((d) => (
              <div key={d.ticker} className="flex items-center gap-3 text-sm font-bold">
                <span className="w-14 font-bold text-white">{d.ticker}</span>
                <span className="text-white/90">{d.reason}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Empty state */}
      {!data && !isLoading && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Brain className="mb-4 h-12 w-12 text-white/15" />
          <p className="text-sm font-bold text-white/90">Watchlist ve vade seçip <span className="text-[#ff7200]">Analiz Et</span>&apos;e basın</p>
        </div>
      )}

      {data && data.topStrategies.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Brain className="mb-4 h-10 w-10 text-white/15" />
          <p className="text-sm font-bold text-white/90">Bütçeye uygun strateji bulunamadı. Bütçeyi artırın veya farklı tickerlar deneyin.</p>
        </div>
      )}
    </div>
  );
}
