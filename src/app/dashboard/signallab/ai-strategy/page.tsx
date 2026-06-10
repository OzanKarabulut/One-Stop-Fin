"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/root";
import { useScanState } from "@/hooks/useScanState";
import { TickerChips, resolveTickers } from "@/components/ui/TickerChips";
import { usd } from "@/lib/format";
import { pnlAt, type Leg } from "@/lib/real-world-pricing";
import {
  Brain,
  Loader2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronRight,
  X,
  BarChart3,
} from "lucide-react";

const DEFAULT_PERSONAL = "NASA,RKLB,DRAM,MRVL,NNE,AMBA,CBRS,OSCR,EOSE,BMNR,IREN,CLS,MU,CRDO,SNDK,AAOI,PENG,GLW";

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

type StrategyItem = inferRouterOutputs<AppRouter>["signallab"]["aiStrategyScan"]["topStrategies"][number];

interface ScenarioRow {
  price: number;
  changePct: number;
  pnl: number;
  outcome: string;
}

function calcScenarios(strategy: StrategyItem): ScenarioRow[] {
  const spot = strategy.tickerPrice;
  const legs: Leg[] = strategy.legs.map(l => ({
    kind: l.type as "stock" | "call" | "put",
    qty: l.action === "buy" ? l.contracts : -l.contracts,
    strike: l.strike || undefined,
    price: l.price,
  }));
  const pcts = [-20, -15, -10, -5, -3, 0, 3, 5, 10, 15, 20];
  return pcts.map(pct => {
    const price = spot * (1 + pct / 100);
    const pnl = pnlAt(price, legs);
    return { price, changePct: pct, pnl, outcome: pnl > 50 ? "Kâr ✓" : pnl < -50 ? "Zarar ✗" : "Nötr" };
  });
}

function ScenarioPanel({ strategy, onClose }: { strategy: StrategyItem; onClose: () => void }) {
  const scenarios = useMemo(() => calcScenarios(strategy), [strategy]);
  const maxAbsPnl = Math.max(...scenarios.map((s) => Math.abs(s.pnl)), 1);

  const totalInvest = strategy.legs.reduce((sum, leg) => {
    if (leg.type === "stock" && leg.action === "buy") return sum + leg.price * leg.contracts;
    if (leg.type !== "stock" && leg.action === "buy") return sum + leg.price * leg.contracts * 100;
    return sum;
  }, 0);
  const totalCollateral = strategy.legs.reduce((sum, leg) => {
    if (leg.type === "put" && leg.action === "sell") return sum + leg.strike * leg.contracts * 100;
    return sum;
  }, 0);
  const netCreditTotal = strategy.netCredit * 100;
  const riskAmount = Math.abs(strategy.maxLoss);
  const profitableCount = scenarios.filter((s) => s.pnl > 50).length;

  return (
    <div className="mt-3 rounded-xl border border-[#ff7200]/30 bg-[#0a0a0c] overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[#ff7200]" />
          Kapanış Senaryoları — {strategy.ticker} · {strategy.name}
        </h3>
        <button onClick={onClose} className="rounded p-1 text-white/90 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 p-4">
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
                      <span className={cn("font-bold", row.changePct > 0 ? "text-emerald-400" : row.changePct < 0 ? "text-red-400" : "text-white/90")}>
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
                      <span className={cn("font-bold", row.pnl > 50 ? "text-emerald-400" : row.pnl < -50 ? "text-red-400" : "text-white/90")}>
                        {row.outcome}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

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

          {strategy.sigmaUsed && (
            <div className="text-xs font-bold text-white/90 mt-2 border-t border-white/10 pt-2">
              <div className="text-[#ff7200] mb-1">Varsayımlar</div>
              <div>σ = HV {(strategy.sigmaUsed * 100).toFixed(1)}%</div>
              <div>drift = 0</div>
              <div>fiyat = piyasa</div>
              <div>olasılıklar = gerçek-dünya</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StrategyCard({ strategy, rank }: { strategy: StrategyItem; rank: number }) {
  const [open, setOpen] = useState(false);
  const [showScenarios, setShowScenarios] = useState(false);

  const isShortPrem = ["Cash-Secured Put", "Wheel", "Covered Call", "Covered Strangle", "Collar"].includes(strategy.name);
  const edgePositive = isShortPrem ? (strategy.vrp ?? 0) > 0 : (strategy.vrp ?? 0) < 0;

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
          <div className="text-right">
            <span className={cn("text-2xl font-bold tabular-nums", scoreColor(strategy.compositeScore))}>
              {strategy.compositeScore.toFixed(0)}
            </span>
            {strategy.kellyPct != null && (
              <div className="text-xs font-bold text-white/70">¼ Kelly: {strategy.kellyPct.toFixed(1)}%</div>
            )}
          </div>
          <button onClick={() => setOpen(!open)}>
            {open ? <ChevronDown className="h-4 w-4 text-white/80" /> : <ChevronRight className="h-4 w-4 text-white/80" />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-3">
          {/* Edge label */}
          {strategy.why && (
            <div className={cn("rounded-md px-3 py-2 text-sm font-bold",
              edgePositive ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border border-red-500/20 text-red-400")}>
              💡 {strategy.why}
            </div>
          )}

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <div className="text-sm font-bold text-white">Kazanma Olasılığı</div>
              <div className="text-sm font-bold text-emerald-400 tabular-nums">{strategy.probability.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-sm font-bold text-white">Max Kâr</div>
              <div className="text-sm font-bold text-emerald-400 tabular-nums">{isFinite(strategy.maxProfit) ? usd(strategy.maxProfit) : "∞"}</div>
            </div>
            <div>
              <div className="text-sm font-bold text-white">Max Zarar</div>
              <div className="text-sm font-bold text-red-400 tabular-nums">{isFinite(strategy.maxLoss) ? usd(Math.abs(strategy.maxLoss)) : "∞"}</div>
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
              <div className="text-sm font-bold text-white">VRP</div>
              <div className={cn("text-sm font-bold tabular-nums", (strategy.vrp ?? 0) > 0 ? "text-yellow-400" : "text-blue-400")}>
                {strategy.vrp !== null ? `${(strategy.vrp * 100).toFixed(1)}%` : "—"}
              </div>
            </div>
            <div>
              <div className="text-sm font-bold text-white">Net Kredi</div>
              <div className="text-sm font-bold text-white tabular-nums">${strategy.netCredit.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-sm font-bold text-white">¼ Kelly</div>
              <div className="text-sm font-bold text-white tabular-nums">{strategy.kellyPct?.toFixed(1) ?? "—"}%</div>
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
        </div>
      )}

      {/* Scenario panel (inline) */}
      {showScenarios && <ScenarioPanel strategy={strategy} onClose={() => setShowScenarios(false)} />}
    </div>
  );
}

export default function AIStrategyPage() {
  const {
    fridays, customTickers, setCustomTickers, budget, setBudget,
    expiry, setExpiry, editingList, setEditingList,
  } = useScanState({ prefix: "ai", defaultList: DEFAULT_PERSONAL, defaultBudget: 250000 });

  const [personalList, setPersonalList] = useState(DEFAULT_PERSONAL);
  useEffect(() => {
    const saved = localStorage.getItem("csp_my_list");
    if (saved) setPersonalList(saved);
  }, []);
  useEffect(() => { localStorage.setItem("csp_my_list", personalList); }, [personalList]);

  const [activeChips, setActiveChips] = useState<string[]>(["listem"]);
  const [scanning, setScanning] = useState(false);

  const personalTickers = personalList.split(",").map(t => t.trim()).filter(Boolean);
  const resolvedTickers = resolveTickers(activeChips, personalTickers, customTickers);

  const SECONDS_PER_TICKER = 2;
  const tickerCount = resolvedTickers.length;

  const scanInput = useMemo(
    () => ({ watchlist: "custom" as const, customTickers: resolvedTickers.join(","), expiry, budget }),
    [resolvedTickers, expiry, budget],
  );

  const { data, error, refetch, isFetching } = trpc.signallab.aiStrategyScan.useQuery(scanInput, { enabled: false, refetchOnWindowFocus: false });

  const handleScan = useCallback(async () => { setScanning(true); await refetch(); setScanning(false); }, [refetch]);
  const isLoading = isFetching || scanning;

  const inputClass = "rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm font-bold text-white focus:outline-none focus:ring-1 focus:ring-[#ff7200]/50";
  const labelClass = "text-sm font-bold text-white";

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
        <TickerChips
          value={activeChips}
          onChange={setActiveChips}
          personalTickers={personalTickers}
          onPersonalTickersChange={(next) => setPersonalList(next.join(","))}
          customText={customTickers}
          onCustomTextChange={setCustomTickers}
          editingList={editingList}
          onEditingListChange={setEditingList}
        />

        <div className="border-t border-white/10 mt-4 pt-4 flex flex-wrap items-center gap-4">
          <div className="space-y-1.5">
            <label className={labelClass}>Bütçe&nbsp;</label>
            <input type="text" inputMode="numeric" value={usd(budget)}
              onChange={(e) => setBudget(Number(e.target.value.replace(/[^\d]/g, "")) || 0)}
              className={cn(inputClass, "w-32 tabular-nums")} />
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>Vade&nbsp;</label>
            <select value={expiry} onChange={(e) => setExpiry(e.target.value)} className={inputClass}>
              {fridays.map((f) => <option key={f.date} value={f.date}>{f.label}</option>)}
            </select>
          </div>

          <button onClick={handleScan} disabled={isLoading}
            className="flex items-center gap-2 rounded-md bg-[#ff7200] px-6 py-2 text-sm font-bold text-white hover:bg-[#ff8c3a] disabled:opacity-50">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            {isLoading ? "Analiz ediliyor..." : "Analiz Et"}
          </button>

          <span className={`text-sm font-bold ${tickerCount > 25 ? "text-yellow-400" : "text-white/90"}`}
            title={tickerCount > 25 ? "Geniş tarama — sonuç listesi çok uzayacak" : ""}>
            {tickerCount} hisse · ~{tickerCount * SECONDS_PER_TICKER}sn
          </span>
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

      {/* Capped warning */}
      {data?.capped && <div className="text-yellow-400 font-bold text-sm mb-2">İlk 40 hisse tarandı ({data.originalCount} seçilmişti)</div>}

      {/* Bucket Results */}
      {data && (
        <>
          {data.buckets.bullish.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">🐂 Yükseliş</h2>
              {data.buckets.bullish.map((s, i) => <StrategyCard key={`${s.ticker}-${s.name}-bull-${i}`} strategy={s} rank={i + 1} />)}
            </div>
          )}
          {data.buckets.neutral.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">⚖️ Nötr / Gelir</h2>
              {data.buckets.neutral.map((s, i) => <StrategyCard key={`${s.ticker}-${s.name}-neut-${i}`} strategy={s} rank={i + 1} />)}
            </div>
          )}
          {data.buckets.bearish.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">🐻 Düşüş</h2>
              {data.buckets.bearish.map((s, i) => <StrategyCard key={`${s.ticker}-${s.name}-bear-${i}`} strategy={s} rank={i + 1} />)}
            </div>
          )}
        </>
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

      {data && data.allStrategies.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Brain className="mb-4 h-10 w-10 text-white/15" />
          <p className="text-sm font-bold text-white/90">Bütçeye uygun strateji bulunamadı. Bütçeyi artırın veya farklı tickerlar deneyin.</p>
        </div>
      )}
    </div>
  );
}
