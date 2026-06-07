"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/root";
import {
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Loader2,
  AlertTriangle,
  Target,
  Pencil,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";

type CSPScan = inferRouterOutputs<AppRouter>["signallab"]["cspScan"];
type Pick = CSPScan["topPicks"]["70-100"][number];
type Group = CSPScan["groups"][number];

type Mode = "mylist" | "all" | "custom";
type SortKey = "score" | "maxIV" | "atmIV" | "maxYield" | "ticker";

const DEFAULT_CSP_LIST = "NASA,RKLB,DRAM,MRVL,NNE,AMBA,CBRS,OSCR,EOSE,BMNR,IREN,CLS,MU,CRDO,SNDK,AAOI,PENG,GLW";
const IV_BUCKETS = ["70-100", "100-140", "140+"] as const;

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

interface BasketItem {
  id: string; ticker: string; strike: number; expiry: string; dte: number;
  mid: number; iv: number | null; collateral: number; premium: number; qty: number;
  cspScore?: number; spot?: number;
}

function scoreColor(score: number): string {
  if (score >= 72) return "text-emerald-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

function IVClassBadge({ ivClass }: { ivClass: number }) {
  const colors: Record<number, string> = {
    1: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    2: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    3: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    4: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  };
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold border", colors[ivClass] ?? colors[4])}>
      K{ivClass}
    </span>
  );
}

function hitToStrike(spot: number, strike: number): number {
  return spot > 0 ? ((spot - strike) / spot) * 100 : 0;
}

function PickCard({ pick, budget, onAdd }: { pick: Pick; budget: number; onAdd: (p: Pick) => void }) {
  const contracts = pick.collateral > 0 ? Math.floor(budget / pick.collateral) : 0;
  const periodIncome = contracts * pick.executablePremiumAmount;
  const hts = hitToStrike(pick.spot, pick.strike);
  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#0e0e10] p-3 space-y-2">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-bold text-white">
            {pick.ticker} <span className="text-white/60">${pick.strike.toFixed(0)}P</span>
          </div>
          <div className="text-[11px] text-white/40">
            Spot: <span className="text-white/70">${pick.spot.toFixed(2)}</span>
            {" · "}
            <span className="text-blue-400">↓{hts.toFixed(1)}%</span>
            {" · "}{pick.dte}g
          </div>
        </div>
        <div className="flex flex-col items-center leading-none">
          <span className={cn("text-xl font-bold tabular-nums", scoreColor(pick.cspScore))}>{pick.cspScore.toFixed(0)}</span>
          <span className="text-[8px] uppercase tracking-wider text-white/30">skor</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-white/50">
        <span>Prim: <b className="text-emerald-400 text-sm">${pick.executablePremiumAmount.toFixed(0)}</b></span>
        <span>Getiri: <b className="text-emerald-400">{pick.yieldPct.toFixed(2)}%</b></span>
        <span>IV: <b className="text-yellow-400">{pick.iv ? `${pick.iv.toFixed(0)}%` : "—"}</b></span>
        <span>Buffer: <b className="text-blue-400">{hts.toFixed(1)}%</b></span>
        <span>Delta: <b className="text-white">{pick.delta != null ? pick.delta.toFixed(2) : "—"}</b></span>
        <span>P(ITM): <b className="text-white">{pick.probabilityITM != null ? `${pick.probabilityITM.toFixed(0)}%` : "—"}</b></span>
      </div>

      <div className="rounded bg-emerald-500/10 px-2 py-1 text-[11px] text-white/70">
        💰 {contracts} kontrat → <b className="text-emerald-400">${periodIncome.toLocaleString()}</b>
      </div>

      <button onClick={() => onAdd(pick)}
        className="flex w-full items-center justify-center gap-1 rounded bg-emerald-500/20 py-1 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/30">
        <ShoppingCart className="h-3 w-3" /> Sepete ekle
      </button>
    </div>
  );
}

/* ─── Collapsible Ticker Row ────────────────────────────────────────────── */
function TickerGroup({ group, onAdd }: { group: Group; onAdd: (s: Pick) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/[0.06] last:border-b-0">
      <button onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center gap-3">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-white/40" /> : <ChevronRight className="h-3.5 w-3.5 text-white/40" />}
          <span className="text-sm font-bold text-white">{group.ticker}</span>
          <span className="text-xs text-white/50">${group.spot.toFixed(2)}</span>
          <IVClassBadge ivClass={group.bestClass} />
        </div>
        <div className="flex items-center gap-4 text-[11px] text-white/50">
          <span>{group.strikes.length} kontrat</span>
          {group.maxIV != null && <span>IV: <span className="text-yellow-400">{group.maxIV.toFixed(0)}%</span></span>}
          <span>Max: <span className="text-emerald-400">{group.maxYield.toFixed(2)}%</span></span>
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto border-t border-white/[0.04]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] text-white/40">
                <th className="px-3 py-1.5 text-left font-medium">Strike</th>
                <th className="px-3 py-1.5 text-center font-medium">Buffer</th>
                <th className="px-3 py-1.5 text-right font-medium">Prim$</th>
                <th className="px-3 py-1.5 text-right font-medium">Getiri%</th>
                <th className="px-3 py-1.5 text-center font-medium">Skor</th>
                <th className="px-3 py-1.5 text-right font-medium">IV%</th>
                <th className="px-3 py-1.5 text-right font-medium">P(ITM)</th>
                <th className="px-3 py-1.5 text-right font-medium">Last</th>
                <th className="px-3 py-1.5 text-right font-medium">OI</th>
                <th className="px-3 py-1.5 text-center font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {group.strikes.map((s) => {
                const hts = hitToStrike(group.spot, s.strike);
                return (
                  <tr key={`${s.ticker}-${s.strike}`} className="border-b border-white/[0.03] hover:bg-white/[0.03]">
                    <td className="px-3 py-1.5 font-medium text-white">${s.strike.toFixed(1)}</td>
                    <td className="px-3 py-1.5 text-center text-blue-400">{hts.toFixed(1)}%</td>
                    <td className="px-3 py-1.5 text-right font-bold text-emerald-400">${s.premium.toFixed(0)}</td>
                    <td className="px-3 py-1.5 text-right text-emerald-400">{s.yieldPct.toFixed(2)}%</td>
                    <td className="px-3 py-1.5 text-center"><span className={cn("font-bold", scoreColor(s.cspScore))}>{s.cspScore.toFixed(0)}</span></td>
                    <td className="px-3 py-1.5 text-right text-yellow-400">{s.iv ? `${s.iv.toFixed(0)}%` : "—"}</td>
                    <td className="px-3 py-1.5 text-right text-white/70">{s.probabilityITM != null ? `${s.probabilityITM.toFixed(0)}%` : "—"}</td>
                    <td className="px-3 py-1.5 text-right text-white/60">{(s.last ?? s.mid)?.toFixed(2) ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right text-white/50">{s.oi > 0 ? s.oi.toLocaleString() : "—"}</td>
                    <td className="px-3 py-1.5 text-center">
                      <button onClick={() => onAdd(s)} title="Sepete ekle"
                        className="rounded p-1 text-white/40 hover:bg-[#ff7200]/10 hover:text-[#ff7200]">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Floating Basket ───────────────────────────────────────────────────── */
function FloatingBasket({ basket, onRemove, onUpdateQty, onClear }: {
  basket: BasketItem[];
  onRemove: (i: number) => void;
  onUpdateQty: (i: number, d: number) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const totals = useMemo(() => {
    const totalCollateral = basket.reduce((s, b) => s + b.collateral * b.qty, 0);
    const totalPremium = basket.reduce((s, b) => s + b.premium * b.qty, 0);
    const totalQty = basket.reduce((s, b) => s + b.qty, 0);
    const yieldPct = totalCollateral > 0 ? (totalPremium / totalCollateral) * 100 : 0;
    return { totalCollateral, totalPremium, totalQty, yieldPct };
  }, [basket]);

  if (basket.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="mb-3 w-[380px] max-h-[60vh] overflow-hidden rounded-xl border border-white/[0.12] bg-[#0c0c0e] shadow-2xl flex flex-col">
          <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-emerald-400" /> Sepet
            </h3>
            <div className="flex items-center gap-2">
              <button onClick={onClear} className="text-[10px] text-white/40 hover:text-red-400">Temizle</button>
              <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04] px-4">
            {basket.map((item, idx) => (
              <div key={item.id} className="flex items-center justify-between py-2 text-xs">
                <div>
                  <span className="font-medium text-white">{item.ticker}</span>
                  <span className="text-white/50 ml-1.5">${item.strike}P</span>
                  <span className="text-white/30 ml-1.5">{item.expiry}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">${item.premium.toFixed(0)}</span>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => onUpdateQty(idx, -1)} className="rounded p-0.5 hover:bg-white/10"><Minus className="h-3 w-3 text-white/50" /></button>
                    <span className="w-5 text-center text-white">{item.qty}</span>
                    <button onClick={() => onUpdateQty(idx, 1)} className="rounded p-0.5 hover:bg-white/10"><Plus className="h-3 w-3 text-white/50" /></button>
                  </div>
                  <button onClick={() => onRemove(idx)} className="text-white/30 hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-white/[0.08] px-4 py-3 grid grid-cols-3 gap-2 text-center">
            <div><p className="text-[10px] text-white/40">Teminat</p><p className="text-xs font-bold text-white">${totals.totalCollateral.toLocaleString()}</p></div>
            <div><p className="text-[10px] text-white/40">Prim</p><p className="text-xs font-bold text-emerald-400">${totals.totalPremium.toFixed(0)}</p></div>
            <div><p className="text-[10px] text-white/40">Getiri</p><p className="text-xs font-bold text-emerald-400">{totals.yieldPct.toFixed(2)}%</p></div>
          </div>
        </div>
      )}

      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full bg-[#ff7200] px-5 py-3 font-semibold text-white shadow-lg hover:bg-[#ff8c3a] transition-colors">
        <ShoppingCart className="h-5 w-5" />
        <span>{totals.totalQty}</span>
        <span className="text-white/70 text-sm">·</span>
        <span className="text-sm">${totals.totalPremium.toFixed(0)}</span>
      </button>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */
export default function CSPScreenerPage() {
  const fridays = useMemo(() => generateFridays(), []);
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window !== "undefined") return (localStorage.getItem("csp_mode") as Mode) || "mylist";
    return "mylist";
  });
  const [cspList, setCspList] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("csp_my_list") || DEFAULT_CSP_LIST;
    return DEFAULT_CSP_LIST;
  });
  const [customTickers, setCustomTickers] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("csp_custom_tickers") || "";
    return "";
  });
  const [budget, setBudget] = useState(() => {
    if (typeof window !== "undefined") return Number(localStorage.getItem("csp_budget")) || 250000;
    return 250000;
  });
  const [editingList, setEditingList] = useState(false);
  const [expiry, setExpiry] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("csp_expiry");
      if (saved && fridays.some((f) => f.date === saved)) return saved;
    }
    return fridays[1]?.date ?? fridays[0]?.date ?? "";
  });
  const [minOI, setMinOI] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [hideK4, setHideK4] = useState(false);
  const [basket, setBasket] = useState<BasketItem[]>(() => {
    if (typeof window !== "undefined") {
      try { const s = localStorage.getItem("csp_basket"); if (s) return JSON.parse(s); } catch {}
    }
    return [];
  });
  const [scanning, setScanning] = useState(false);

  const scanInput = useMemo(() => {
    if (mode === "all") return { watchlist: "all" as const, customTickers: "", expiry, minOI };
    if (mode === "custom") return { watchlist: "custom" as const, customTickers, expiry, minOI };
    return { watchlist: "custom" as const, customTickers: cspList, expiry, minOI };
  }, [mode, customTickers, cspList, expiry, minOI]);

  const { data, refetch, isFetching } = trpc.signallab.cspScan.useQuery(scanInput, { enabled: false, refetchOnWindowFocus: false });

  const handleScan = useCallback(async () => { setScanning(true); await refetch(); setScanning(false); }, [refetch]);
  const isLoading = isFetching || scanning;

  useEffect(() => { localStorage.setItem("csp_mode", mode); }, [mode]);
  useEffect(() => { localStorage.setItem("csp_my_list", cspList); }, [cspList]);
  useEffect(() => { localStorage.setItem("csp_custom_tickers", customTickers); }, [customTickers]);
  useEffect(() => { localStorage.setItem("csp_budget", String(budget)); }, [budget]);
  useEffect(() => { localStorage.setItem("csp_expiry", expiry); }, [expiry]);
  useEffect(() => { localStorage.setItem("csp_basket", JSON.stringify(basket)); }, [basket]);

  const filteredGroups = useMemo<Group[]>(() => {
    if (!data?.groups) return [];
    let groups = [...data.groups];
    if (hideK4) groups = groups.filter((g) => g.bestClass <= 3);
    switch (sortKey) {
      case "maxIV": groups.sort((a, b) => (b.maxIV ?? -1) - (a.maxIV ?? -1)); break;
      case "atmIV": groups.sort((a, b) => (b.atmIV ?? -1) - (a.atmIV ?? -1)); break;
      case "maxYield": groups.sort((a, b) => b.maxYield - a.maxYield); break;
      case "ticker": groups.sort((a, b) => a.ticker.localeCompare(b.ticker)); break;
      default: groups.sort((a, b) => {
        const aScore = Math.max(...a.strikes.map(s => s.cspScore));
        const bScore = Math.max(...b.strikes.map(s => s.cspScore));
        return bScore - aScore;
      });
    }
    return groups;
  }, [data?.groups, hideK4, sortKey]);

  const addToBasket = useCallback((c: Pick) => {
    setBasket((prev) => {
      const id = `${c.ticker}-${c.strike}-${c.expiry}`;
      const idx = prev.findIndex((b) => b.id === id);
      if (idx >= 0) { const copy = [...prev]; copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 }; return copy; }
      return [...prev, { id, ticker: c.ticker, strike: c.strike, expiry: c.expiry, dte: c.dte, mid: c.mid, iv: c.iv, collateral: c.collateral, premium: c.premium, qty: 1, cspScore: c.cspScore, spot: c.spot }];
    });
  }, []);

  const hasPicks = data?.topPicks && IV_BUCKETS.some((b) => data.topPicks[b].length > 0);

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">CSP Fırsat Motoru</h1>
          <p className="text-sm text-white/50">Max prim / min assignment — cash-secured put taraması</p>
        </div>
        {data && <p className="text-xs text-white/40">{data.totalContracts} kontrat · {data.groups.length} ticker</p>}
      </div>

      {/* Filter Bar */}
      <div className="rounded-lg border border-white/[0.08] bg-[#0b0b0c] p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-white/50">Watchlist</label>
            <div className="flex items-center gap-1">
              {(["mylist", "all", "custom"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={cn("rounded px-3 py-1.5 text-xs font-medium", mode === m ? "bg-[#ff7200] text-white" : "bg-white/5 text-white/60 hover:bg-white/10")}>
                  {m === "mylist" ? "CSP Listem" : m === "all" ? "Tümü" : "Özel"}
                </button>
              ))}
              <button onClick={() => setEditingList((v) => !v)} className="rounded p-1.5 text-white/40 hover:bg-white/10 hover:text-white">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {editingList && (
            <div className="w-full space-y-1">
              <label className="text-xs font-medium text-white/50">CSP Listem (virgülle)</label>
              <textarea value={cspList} onChange={(e) => setCspList(e.target.value.toUpperCase())} rows={2}
                className="w-full rounded border border-white/[0.08] bg-[#050505] px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#ff7200]/50" />
            </div>
          )}
          {mode === "custom" && (
            <div className="flex-1 min-w-[200px] space-y-1">
              <label className="text-xs font-medium text-white/50">Tickers</label>
              <input type="text" value={customTickers} onChange={(e) => setCustomTickers(e.target.value)} placeholder="TSLA,NVDA..."
                className="w-full rounded border border-white/[0.08] bg-[#050505] px-3 py-1.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-[#ff7200]/50" />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-white/50">Bütçe ($)</label>
            <input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} min={0} step={10000}
              className="w-28 rounded border border-white/[0.08] bg-[#050505] px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#ff7200]/50" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-white/50">Vade</label>
            <select value={expiry} onChange={(e) => setExpiry(e.target.value)}
              className="rounded border border-white/[0.08] bg-[#050505] px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#ff7200]/50">
              {fridays.map((f) => <option key={f.date} value={f.date}>{f.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-white/50">Min OI</label>
            <input type="number" value={minOI} onChange={(e) => setMinOI(Number(e.target.value))} min={0}
              className="w-20 rounded border border-white/[0.08] bg-[#050505] px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#ff7200]/50" />
          </div>
          <button onClick={handleScan} disabled={isLoading}
            className="flex items-center gap-2 rounded bg-[#ff7200] px-5 py-1.5 text-sm font-semibold text-white hover:bg-[#ff8c3a] disabled:opacity-50">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
            {isLoading ? "Taranıyor..." : "Tara"}
          </button>
        </div>
      </div>

      {/* ─── En İyi Fırsatlar (Framed) ─────────────────────────────────────── */}
      {hasPicks && (
        <div className="rounded-xl border-2 border-[#ff7200]/30 bg-[#0a0a0c] p-5 space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <Target className="h-4 w-4 text-[#ff7200]" /> En İyi Fırsatlar
            <span className="text-white/30 font-normal ml-2 text-[11px]">IV kovasına göre top 3</span>
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {IV_BUCKETS.map((bucket) => {
              const picks = data!.topPicks[bucket];
              return (
                <div key={bucket} className="space-y-2">
                  <h3 className="text-xs font-semibold text-white/60">IV {bucket}%</h3>
                  {picks.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-[11px] text-white/30">Uygun fırsat yok</div>
                  ) : (
                    picks.map((p, i) => <PickCard key={`${p.ticker}-${p.strike}-${i}`} pick={p} budget={budget} onAdd={addToBasket} />)
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Tüm Kontratlar (Collapsible Ticker Rows) ──────────────────────── */}
      {filteredGroups.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-[#0a0a0c] overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
            <h2 className="text-sm font-bold text-white">Tüm Kontratlar</h2>
            <div className="flex items-center gap-3">
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="rounded border border-white/[0.08] bg-[#050505] px-2 py-1 text-[11px] text-white focus:outline-none">
                <option value="score">Skor</option>
                <option value="maxIV">Max IV</option>
                <option value="maxYield">Max Getiri</option>
                <option value="ticker">Ticker</option>
              </select>
              <label className="flex items-center gap-1.5 text-[11px] text-white/50 cursor-pointer">
                <input type="checkbox" checked={hideK4} onChange={(e) => setHideK4(e.target.checked)} className="rounded border-white/20 h-3 w-3" />
                K4 gizle
              </label>
              <span className="text-[11px] text-white/30">{filteredGroups.length} ticker</span>
            </div>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {filteredGroups.map((group) => (
              <TickerGroup key={group.ticker} group={group} onAdd={addToBasket} />
            ))}
          </div>
        </div>
      )}

      {/* Diagnostics */}
      {data?.diagnostics && data.diagnostics.some((d) => d.reason) && (
        <details className="rounded-lg border border-white/[0.08] bg-[#0b0b0c]">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-2 text-xs font-medium text-white/50">
            <AlertTriangle className="h-3.5 w-3.5" /> Diagnostics ({data.diagnostics.filter((d) => d.reason).length})
          </summary>
          <div className="space-y-1 px-4 pb-3">
            {data.diagnostics.filter((d) => d.reason).map((d) => (
              <div key={d.ticker} className="flex items-center gap-2 text-xs">
                <span className="w-12 font-medium text-white">{d.ticker}</span>
                <span className="text-white/50">{d.reason}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Empty State */}
      {!data && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Target className="mb-4 h-12 w-12 text-white/20" />
          <p className="text-sm text-white/50">Watchlist ve vade seçip <span className="text-[#ff7200]">Tara</span>&apos;ya basın</p>
        </div>
      )}

      {/* Floating Basket */}
      <FloatingBasket
        basket={basket}
        onRemove={(i) => setBasket((prev) => prev.filter((_, idx) => idx !== i))}
        onUpdateQty={(i, d) => setBasket((prev) => { const c = [...prev]; c[i] = { ...c[i], qty: Math.max(1, c[i].qty + d) }; return c; })}
        onClear={() => setBasket([])}
      />
    </div>
  );
}
