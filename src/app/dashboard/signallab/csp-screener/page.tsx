"use client";

import { useState, useMemo, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/root";
import { useScanState } from "@/hooks/useScanState";
import { TickerChips, resolveTickers } from "@/components/ui/TickerChips";
import { usd, otmPct } from "@/lib/format";
import {
  TrendingUp,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Loader2,
  AlertTriangle,
  Target,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";

type CSPScan = inferRouterOutputs<AppRouter>["signallab"]["cspScan"];
type Pick = CSPScan["topPicks"]["70-100"][number];
type Group = CSPScan["groups"][number];

type SortKey = "score" | "maxIV" | "maxYield" | "ticker";

const DEFAULT_CSP_LIST = "NASA,RKLB,DRAM,MRVL,NNE,AMBA,CBRS,OSCR,EOSE,BMNR,IREN,CLS,MU,CRDO,SNDK,AAOI,PENG,GLW,BE,LITE";
const IV_BUCKETS = ["all", "below-70", "70-100", "100-140", "140+"] as const;

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

function QualityBadge({ grade }: { grade: string }) {
  const colors: Record<string, string> = {
    A: "bg-emerald-500/15 text-emerald-400",
    B: "bg-blue-500/15 text-blue-400",
    C: "bg-yellow-500/15 text-yellow-400",
  };
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-xs font-bold", colors[grade] ?? "bg-zinc-500/15 text-zinc-400")}>
      {grade}
    </span>
  );
}

function IVClassBadge({ ivClass }: { ivClass: number }) {
  const colors: Record<number, string> = {
    1: "bg-emerald-500/15 text-emerald-400",
    2: "bg-blue-500/15 text-blue-400",
    3: "bg-yellow-500/15 text-yellow-400",
    4: "bg-zinc-500/15 text-zinc-400",
  };
  return <span className={cn("rounded px-1.5 py-0.5 text-xs font-bold", colors[ivClass] ?? colors[4])}>K{ivClass}</span>;
}

function Metric({ label, value, color, align = "left" }: { label: string; value: string; color?: string; align?: "left" | "right" }) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className="text-xs font-bold text-white/90">{label}</div>
      <div className={cn("text-sm font-bold tabular-nums", color ?? "text-white")}>{value}</div>
    </div>
  );
}

function PickCard({ pick, budget, onAdd, putWall }: { pick: Pick; budget: number; onAdd: (p: Pick) => void; putWall?: number | null }) {
  const contracts = pick.collateral > 0 ? Math.floor(budget / pick.collateral) : 0;
  const periodIncome = contracts * pick.executablePremiumAmount;
  const breakeven = pick.strike - pick.premium / 100;
  const note = pick.riskNotes?.[0];

  return (
    <div className="flex flex-col rounded-lg border border-white/10 bg-[#0e0e10] p-3.5 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-base font-bold tracking-tight text-white">
            {pick.ticker} <span className="text-white/90">{pick.strike.toFixed(0)}P</span>{putWall && pick.strike < putWall && <span className="ml-1" title="Put wall altında — dealer long gamma destek bölgesi">🛡</span>}
            <QualityBadge grade={pick.companyQuality} />
            {(pick as Pick & { hasEarnings?: boolean }).hasEarnings && (
              <span className="text-red-400 text-xs font-bold" title="Vade içinde earnings — binary event riski, skor düşürüldü">📊 ERN</span>
            )}
          </div>
          <div className="mt-0.5 text-xs font-bold text-white/90 tabular-nums">Spot ${pick.spot.toFixed(2)} · {pick.dte} gün</div>
        </div>
        <span className={cn("text-2xl font-bold tabular-nums tracking-tight", scoreColor(pick.cspScore))}>{pick.cspScore.toFixed(0)}</span>
      </div>

      <div className="h-px bg-white/[0.07]" />

      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <Metric label="Prim" value={usd(pick.executablePremiumAmount)} color="text-emerald-400" />
        <div className="text-right">
          <div className="text-xs font-bold text-white/90">Getiri</div>
          <div className="text-sm font-bold tabular-nums text-emerald-400">
            {pick.yieldPct.toFixed(2)}%
            {(pick as Pick & { priceQuality?: string }).priceQuality === "last" && <span className="ml-1 text-white/50 text-[10px]">(son işlem)</span>}
          </div>
        </div>
        <Metric label="IV" value={pick.iv ? `${pick.iv.toFixed(0)}%` : "—"} color="text-yellow-400" />
        <Metric label="Buffer" value={`${otmPct(pick.spot, pick.strike).toFixed(0)}%`} align="right" />
        <Metric label="Breakeven" value={`$${breakeven.toFixed(0)}`} />
        <Metric label={`${contracts} kontrat`} value={usd(periodIncome)} color="text-emerald-400" align="right" />
      </div>

      <div className="text-xs font-bold text-orange-400 min-h-[2.5rem]">{note ? `⚠ ${note}` : "\u00A0"}</div>

      <button onClick={() => onAdd(pick)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-500/15 py-1.5 text-sm font-bold text-emerald-400 hover:bg-emerald-500/25 transition-colors mt-auto">
        <ShoppingCart className="h-3.5 w-3.5" /> Sepete ekle
      </button>
    </div>
  );
}

function TickerGroup({ group, onAdd, maxStrike }: { group: Group; onAdd: (s: Pick) => void; maxStrike?: number | null }) {
  const [open, setOpen] = useState(false);
  const best = useMemo(() => group.strikes.reduce((a, b) => (b.cspScore > a.cspScore ? b : a), group.strikes[0]), [group.strikes]);
  const pw = (group as Group & { putWall?: number | null }).putWall ?? null;
  const effectiveMaxStrike = maxStrike ?? pw;

  return (
    <div className="border-b border-white/[0.06] last:border-b-0">
      <button onClick={() => setOpen(!open)}
        className="flex w-full items-center px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center gap-3 w-[220px] shrink-0">
          {open ? <ChevronDown className="h-4 w-4 text-white/90" /> : <ChevronRight className="h-4 w-4 text-white/90" />}
          <span className="text-sm font-bold text-white w-12">{group.ticker}</span>
          <span className="text-sm font-bold text-white/90 tabular-nums w-[72px]">${group.spot.toFixed(2)}</span>
          <IVClassBadge ivClass={group.bestClass} />
        </div>
        <div className="flex items-center gap-5 text-sm font-bold text-white/90 tabular-nums ml-auto">
          {pw && <span className="text-red-400">Put Wall: ${pw.toFixed(0)}</span>}
          {best && (
            <span className="hidden sm:inline w-[140px]">
              En iyi <span className="text-white">${best.strike.toFixed(0)}P</span>
              {" · "}<span className={scoreColor(best.cspScore)}>{best.cspScore.toFixed(0)}</span>
            </span>
          )}
          {group.maxIV != null && <span className="w-[70px]">IV <span className="text-yellow-400">{group.maxIV.toFixed(0)}%</span></span>}
          <span className="text-white/90 w-[30px] text-right">{group.strikes.length}</span>
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto border-t border-white/[0.04]">
          <table className="w-full text-sm font-bold tabular-nums">
            <thead>
              <tr className="border-b border-white/[0.06] text-xs font-bold text-white">
                <th className="w-16 pl-4 pr-0 py-2 text-left font-bold">Strike</th>
                <th className="pl-0 pr-2 py-2 text-center font-bold">Buffer</th>
                <th className="px-2 py-2 text-center font-bold">Prim</th>
                <th className="px-2 py-2 text-center font-bold">Getiri</th>
                <th className="px-2 py-2 text-center font-bold">Skor</th>
                <th className="px-2 py-2 text-center font-bold">IV</th>
                <th className="px-2 py-2 text-center font-bold">Delta</th>
                <th className="px-2 py-2 text-center font-bold">P(ITM)</th>
                <th className="px-2 py-2 text-center font-bold">OI</th>
                <th className="px-2 py-2 text-center font-bold"></th>
              </tr>
            </thead>
            <tbody>
              {group.strikes.map((s) => (
                <tr key={`${s.ticker}-${s.strike}`} className="border-b border-white/[0.03] hover:bg-white/[0.03]">
                  <td className="pl-4 pr-0 py-2 font-bold text-white whitespace-nowrap">
                    <span>${s.strike.toFixed(1)}</span>{effectiveMaxStrike && s.strike < effectiveMaxStrike && <span className="ml-1" title="Put wall altında — dealer long gamma destek bölgesi">🛡</span>}
                    {(s as Pick & { hasEarnings?: boolean }).hasEarnings && (
                      <span className="ml-1 text-red-400 text-xs" title="Vade içinde earnings — binary event riski, skor düşürüldü">📊 ERN</span>
                    )}
                  </td>
                  <td className="pl-0 pr-2 py-2 text-center font-bold text-[#ff7200]">{otmPct(group.spot, s.strike).toFixed(1).replace(".", ",")}%</td>
                  <td className="px-2 py-2 text-center font-bold text-emerald-400">
                    {usd(s.premium)}
                    {(s as Pick & { priceQuality?: string }).priceQuality === "last" && <span className="ml-0.5 text-white/50 text-[10px]">(son işlem)</span>}
                  </td>
                  <td className="px-2 py-2 text-center text-emerald-400">{s.yieldPct.toFixed(2)}%</td>
                  <td className="px-2 py-2 text-center"><span className={cn("font-bold", scoreColor(s.cspScore))}>{s.cspScore.toFixed(0)}</span></td>
                  <td className="px-2 py-2 text-center text-yellow-400">{s.iv ? `${s.iv.toFixed(0)}%` : "—"}</td>
                  <td className="px-2 py-2 text-center text-white/90">{s.delta != null ? s.delta.toFixed(2) : "—"}</td>
                  <td className="px-2 py-2 text-center text-white/90">{s.probabilityITM != null ? `${s.probabilityITM.toFixed(0)}%` : "—"}</td>
                  <td className="px-2 py-2 text-center text-white/90">{s.oi > 0 ? s.oi.toLocaleString("tr-TR") : "—"}</td>
                  <td className="px-2 py-2 text-center">
                    <button onClick={() => onAdd(s)} title="Sepete ekle"
                      className="rounded p-1 text-white/90 hover:bg-[#ff7200]/10 hover:text-[#ff7200]">
                      <Plus className="h-4 w-4" />
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

function FloatingBasket({ basket, budget, onRemove, onUpdateQty, onClear }: {
  basket: BasketItem[]; budget: number;
  onRemove: (i: number) => void; onUpdateQty: (i: number, d: number) => void; onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const totals = useMemo(() => {
    const totalCollateral = basket.reduce((s, b) => s + b.collateral * b.qty, 0);
    const totalPremium = basket.reduce((s, b) => s + b.premium * b.qty, 0);
    const totalQty = basket.reduce((s, b) => s + b.qty, 0);
    const yieldPct = totalCollateral > 0 ? (totalPremium / totalCollateral) * 100 : 0;
    const budgetUse = budget > 0 ? (totalCollateral / budget) * 100 : 0;
    return { totalCollateral, totalPremium, totalQty, yieldPct, budgetUse };
  }, [basket, budget]);

  if (basket.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="mb-3 flex max-h-[70vh] w-[600px] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0c0c0e] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h3 className="flex items-center gap-2 text-lg font-bold text-white">
              <ShoppingCart className="h-5 w-5 text-emerald-400" /> Sepet
            </h3>
            <div className="flex items-center gap-3">
              <button onClick={onClear} className="text-sm font-bold text-white hover:text-red-400">Temizle</button>
              <button onClick={() => setOpen(false)} className="text-white hover:text-white"><X className="h-5 w-5" /></button>
            </div>
          </div>

          <div className="flex-1 divide-y divide-white/15 overflow-y-auto px-5">
            {basket.map((item, idx) => (
              <div key={item.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="flex items-center gap-2 text-base font-bold text-white"><span>{item.ticker}</span> <span className="text-white">${item.strike}P</span> <span className="text-[#ff7200]">B:{item.spot ? otmPct(item.spot, item.strike).toFixed(1).replace(".", ",") : "—"}%</span></div>
                  <div className="text-sm font-bold text-white">{item.expiry} · {item.dte} gün</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-base font-bold tabular-nums text-emerald-400">{usd(item.premium * item.qty)}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => onUpdateQty(idx, -1)} className="rounded-md p-1 hover:bg-white/10"><Minus className="h-5 w-5 text-white" /></button>
                    <span className="w-7 text-center text-base font-bold tabular-nums text-white">{item.qty}</span>
                    <button onClick={() => onUpdateQty(idx, 1)} className="rounded-md p-1 hover:bg-white/10"><Plus className="h-5 w-5 text-white" /></button>
                  </div>
                  <button onClick={() => onRemove(idx)} className="text-white hover:text-red-400"><Trash2 className="h-5 w-5" /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 px-5 py-4 space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="text-sm font-bold text-white">Teminat</p><p className="text-lg font-bold tabular-nums text-white">{usd(totals.totalCollateral)}</p></div>
              <div><p className="text-sm font-bold text-white">Prim</p><p className="text-lg font-bold tabular-nums text-emerald-400">{usd(totals.totalPremium)}</p></div>
              <div><p className="text-sm font-bold text-white">Getiri</p><p className="text-lg font-bold tabular-nums text-emerald-400">{totals.yieldPct.toFixed(2)}%</p></div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-sm font-bold text-white">
                <span>Bütçe kullanımı</span>
                <span className="tabular-nums">{usd(totals.totalCollateral)} / {usd(budget)} · %{totals.budgetUse.toFixed(0)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className={cn("h-full rounded-full", totals.budgetUse > 100 ? "bg-red-500" : "bg-[#ff7200]")}
                  style={{ width: `${Math.min(100, totals.budgetUse)}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 rounded-full bg-[#ff7200] px-6 py-3.5 text-base font-bold text-white shadow-lg hover:bg-[#ff8c3a] transition-colors">
        <ShoppingCart className="h-5 w-5" />
        <span className="tabular-nums">{totals.totalQty}</span>
        <span className="text-white">·</span>
        <span className="tabular-nums">{usd(totals.totalPremium)}</span>
      </button>
    </div>
  );
}

export default function CSPScreenerPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm font-bold text-white/90">Yükleniyor...</div>}>
      <CSPScreenerInner />
    </Suspense>
  );
}

function CSPScreenerInner() {
  const searchParams = useSearchParams();
  const paramTicker = searchParams.get("ticker");
  const paramMaxStrike = searchParams.get("maxStrike") ? Number(searchParams.get("maxStrike")) : null;
  const autoScanned = useRef(false);

  const {
    fridays, list: cspList, setList: setCspList,
    customTickers, setCustomTickers, budget, setBudget,
    expiry, setExpiry, editingList, setEditingList,
  } = useScanState({ prefix: "csp", defaultList: DEFAULT_CSP_LIST, defaultBudget: 250000 });
  const [minOI, setMinOI] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [hideK4, setHideK4] = useState(false);
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [scanning, setScanning] = useState(false);

  const [activeChips, setActiveChips] = useState<string[]>(["listem"]);

  const personalTickers = cspList.split(",").map(t => t.trim()).filter(Boolean);
  const resolvedTickers = resolveTickers(activeChips, personalTickers, customTickers);

  // Load basket from localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    try { const s = localStorage.getItem("csp_basket"); if (s) setBasket(JSON.parse(s) as BasketItem[]); } catch { /* ignore */ }
  }, []);

  const scanInput = useMemo(
    () => ({
      watchlist: "custom" as const,
      customTickers: paramTicker && !autoScanned.current ? paramTicker : resolvedTickers.join(","),
      expiry, minOI,
    }),
    [resolvedTickers, expiry, minOI, paramTicker],
  );

  const { data, error, refetch, isFetching } = trpc.signallab.cspScan.useQuery(scanInput, { enabled: false, refetchOnWindowFocus: false });

  const handleScan = useCallback(async () => { setScanning(true); await refetch(); setScanning(false); }, [refetch]);
  const isLoading = isFetching || scanning;

  // Fake progress: cycle through tickers while scanning
  const [scanProgress, setScanProgress] = useState(0);
  useEffect(() => {
    if (!isLoading) { setScanProgress(0); return; }
    const interval = setInterval(() => {
      setScanProgress((p) => (p + 1) % resolvedTickers.length);
    }, 1600);
    return () => clearInterval(interval);
  }, [isLoading, resolvedTickers.length]);

  // Auto-scan when ticker param present
  useEffect(() => {
    if (paramTicker && !autoScanned.current) {
      autoScanned.current = true;
      setCustomTickers(paramTicker.toUpperCase());
      setActiveChips(["ozel"]);
      setTimeout(() => { refetch(); }, 100);
    }
  }, [paramTicker, setCustomTickers, refetch]);

  useEffect(() => { localStorage.setItem("csp_basket", JSON.stringify(basket)); }, [basket]);

  const filteredGroups = useMemo<Group[]>(() => {
    if (!data?.groups) return [];
    let groups = [...data.groups];
    if (hideK4) groups = groups.filter((g) => g.bestClass <= 3);
    switch (sortKey) {
      case "maxIV": groups.sort((a, b) => (b.maxIV ?? -1) - (a.maxIV ?? -1)); break;
      case "maxYield": groups.sort((a, b) => b.maxYield - a.maxYield); break;
      case "ticker": groups.sort((a, b) => a.ticker.localeCompare(b.ticker)); break;
      default: groups.sort((a, b) => {
        const aS = Math.max(...a.strikes.map((s) => s.cspScore));
        const bS = Math.max(...b.strikes.map((s) => s.cspScore));
        return bS - aS;
      });
    }
    return groups;
  }, [data?.groups, hideK4, sortKey]);

  const putWallMap = useMemo(() => {
    const m = new Map<string, number | null>();
    if (data?.groups) for (const g of data.groups) m.set(g.ticker, (g as Group & { putWall?: number | null }).putWall ?? null);
    return m;
  }, [data?.groups]);

  const addToBasket = useCallback((c: Pick) => {
    setBasket((prev) => {
      const id = `${c.ticker}-${c.strike}-${c.expiry}`;
      const idx = prev.findIndex((b) => b.id === id);
      if (idx >= 0) { const copy = [...prev]; copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 }; return copy; }
      return [...prev, { id, ticker: c.ticker, strike: c.strike, expiry: c.expiry, dte: c.dte, mid: c.mid, iv: c.iv, collateral: c.collateral, premium: c.premium, qty: 1, cspScore: c.cspScore, spot: c.spot }];
    });
  }, []);

  const hasPicks = data?.topPicks && data.topPicks["all"].length > 0;
  const inputClass = "rounded-md border border-white/10 bg-[#050505] px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-1 focus:ring-[#ff7200]/50";
  const labelClass = "text-sm font-bold text-white";

  return (
    <div className="space-y-6 pb-28">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">CSP Fırsat Motoru</h1>
          <p className="mt-1 text-sm font-bold text-white/90">Max prim / min assignment — cash-secured put taraması</p>
        </div>
        {data && <p className="text-sm font-bold text-white/90 tabular-nums">{data.totalContracts} kontrat · {data.groups.length} ticker</p>}
      </div>

      <div className="rounded-xl border border-white/10 bg-[#0b0b0c] p-4">
        <div className="flex flex-wrap items-end gap-5">
          <div className="space-y-1.5 flex-1">
            <TickerChips value={activeChips} onChange={setActiveChips} personalTickers={personalTickers} onPersonalTickersChange={(next) => setCspList(next.join(","))} customText={customTickers} onCustomTextChange={setCustomTickers} editingList={editingList} onEditingListChange={setEditingList} />
          </div>
        </div>

        <div className="border-t border-white/10 mt-4 pt-4 flex flex-wrap items-center gap-5">

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

          <div className="space-y-1.5">
            <label className={labelClass}>Min OI&nbsp;</label>
            <input type="number" value={minOI} onChange={(e) => setMinOI(Number(e.target.value))} min={0} className={cn(inputClass, "w-24 tabular-nums")} />
          </div>

          <button onClick={handleScan} disabled={isLoading}
            className="flex items-center gap-2 rounded-md bg-[#ff7200] px-6 py-2 text-sm font-bold text-white hover:bg-[#ff8c3a] disabled:opacity-50">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
            {isLoading ? "Taranıyor..." : "Tara"}
          </button>
          <span className={`text-sm font-bold ${resolvedTickers.length > 60 ? "text-yellow-400" : "text-white/90"}`} title={resolvedTickers.length > 60 ? "Büyük tarama — süre uzayacak" : ""}>
            {resolvedTickers.length} hisse · ~{resolvedTickers.length * 2}sn
            {isLoading && <span className="ml-2 text-[#ff7200]">{resolvedTickers[scanProgress]} ({scanProgress + 1}/{resolvedTickers.length})</span>}
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Tarama başarısız: {error.message}
        </div>
      )}

      {paramMaxStrike && (
        <div className="flex items-center gap-2 rounded-lg border border-[#ff7200]/30 bg-[#ff7200]/10 px-4 py-3 text-sm font-bold text-[#ff7200]">
          🛡 GEX Put Wall filtresi aktif — Strike &lt; ${paramMaxStrike} kontratlar işaretlendi
        </div>
      )}

      {(data as typeof data & { capped?: boolean; originalCount?: number })?.capped && (
        <div className="text-yellow-400 font-bold text-sm">İlk 80 hisse tarandı ({(data as typeof data & { originalCount?: number }).originalCount} seçilmişti)</div>
      )}

      {isLoading && !data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((c) => (
            <div key={c} className="space-y-3">
              <div className="h-3 w-20 rounded bg-white/10" />
              {[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-lg border border-white/10 bg-[#0e0e10]" />)}
            </div>
          ))}
        </div>
      )}

      {hasPicks && (
        <details open className="rounded-2xl border border-[#ff7200]/30 bg-[#0a0a0c]">
          <summary className="flex cursor-pointer items-center gap-2 p-5 text-base font-bold text-white select-none">
            <Target className="h-5 w-5 text-[#ff7200]" /> En İyi Fırsatlar
          </summary>
          <div className="px-5 pb-5 space-y-5">
          {/* Top 3 overall */}
          {data!.topPicks["all"].length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-[#ff7200]">🏆 Tüm Kontratlar Arasında En İyi 3</h3>
              <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3">
                {data!.topPicks["all"].map((p, i) => <PickCard key={`all-${p.ticker}-${p.strike}-${i}`} pick={p} budget={budget} onAdd={addToBasket} putWall={putWallMap.get(p.ticker)} />)}
              </div>
            </div>
          )}
          {/* IV bucket breakdown */}
          <div className="space-y-1.5">
            {(["below-70", "70-100", "100-140", "140+"] as const).map((bucket) => {
              const picks = data!.topPicks[bucket];
              const colors: Record<string, string> = {
                "below-70": "border-blue-500/40 bg-blue-500/[0.03]",
                "70-100": "border-emerald-500/40 bg-emerald-500/[0.03]",
                "100-140": "border-yellow-500/40 bg-yellow-500/[0.03]",
                "140+": "border-red-500/40 bg-red-500/[0.03]",
              };
              const badgeColors: Record<string, string> = {
                "below-70": "bg-blue-500/20 text-blue-300 border-blue-500/30",
                "70-100": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
                "100-140": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
                "140+": "bg-red-500/20 text-red-300 border-red-500/30",
              };
              return (
                <div key={bucket} className={cn("rounded-xl border p-3 space-y-3", colors[bucket])}>
                  <div className={cn("inline-block rounded-md border px-2.5 py-1 text-xs font-bold uppercase tracking-wide", badgeColors[bucket])}>
                    IV {bucket === "below-70" ? "<70" : bucket}%
                  </div>
                  {picks.length === 0 ? (
                    <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-white/10 text-sm font-bold text-white/90">Uygun fırsat yok</div>
                  ) : (
                    <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3">
                      {picks.map((p, i) => <PickCard key={`${p.ticker}-${p.strike}-${i}`} pick={p} budget={budget} onAdd={addToBasket} putWall={putWallMap.get(p.ticker)} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </div>
        </details>
      )}

      {filteredGroups.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0c]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-bold text-white">Tüm Kontratlar</h2>
            <div className="flex items-center gap-4">
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="rounded-md border border-white/10 bg-[#050505] px-2.5 py-1.5 text-xs font-bold text-white focus:outline-none">
                <option value="score">Skor</option>
                <option value="maxIV">Max IV</option>
                <option value="maxYield">Max Getiri</option>
                <option value="ticker">Ticker</option>
              </select>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-white/90">
                <input type="checkbox" checked={hideK4} onChange={(e) => setHideK4(e.target.checked)} className="h-3.5 w-3.5 rounded border-white/20" />
                K4 gizle
              </label>
              <span className="text-xs font-bold text-white/90 tabular-nums">{filteredGroups.length} ticker</span>
            </div>
          </div>
          <div>
            {filteredGroups.map((group) => <TickerGroup key={group.ticker} group={group} onAdd={addToBasket} maxStrike={paramMaxStrike} />)}
          </div>
        </div>
      )}

      {data?.diagnostics && data.diagnostics.some((d) => d.reason) && (
        <details className="rounded-lg border border-white/10 bg-[#0b0b0c]">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-bold text-white/90">
            <AlertTriangle className="h-4 w-4" /> Diagnostics ({data.diagnostics.filter((d) => d.reason).length})
          </summary>
          <div className="space-y-1.5 px-4 pb-3">
            {data.diagnostics.filter((d) => d.reason).map((d) => (
              <div key={d.ticker} className="flex items-center gap-3 text-sm font-bold">
                <span className="w-14 font-bold text-white">{d.ticker}</span>
                <span className="text-white/90">{d.reason}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {!data && !isLoading && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Target className="mb-4 h-12 w-12 text-white/15" />
          <p className="text-sm font-bold text-white/90">Watchlist ve vade seçip <span className="text-[#ff7200]">Tara</span>&apos;ya basın</p>
        </div>
      )}

      <FloatingBasket
        basket={basket}
        budget={budget}
        onRemove={(i) => setBasket((prev) => prev.filter((_, idx) => idx !== i))}
        onUpdateQty={(i, d) => setBasket((prev) => { const c = [...prev]; c[i] = { ...c[i], qty: Math.max(1, c[i].qty + d) }; return c; })}
        onClear={() => setBasket([])}
      />
    </div>
  );
}
