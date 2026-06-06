"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import {
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Loader2,
  AlertTriangle,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

type WatchlistType = "all" | "ozan" | "custom";
type SortKey = "maxIV" | "atmIV" | "maxYield" | "ticker";

function generateFridays(): { date: string; label: string }[] {
  const fridays: { date: string; label: string }[] = [];
  const now = new Date();
  for (let i = 1; i < 120 && fridays.length < 10; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    if (d.getUTCDay() === 5) {
      const days = i;
      const dateStr = d.toISOString().split("T")[0];
      const label = `${d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} (${days}g)`;
      fridays.push({ date: dateStr, label });
    }
  }
  return fridays;
}

// ─── Basket Item Type ────────────────────────────────────────────────────────

interface BasketItem {
  id: string;
  ticker: string;
  strike: number;
  expiry: string;
  dte: number;
  mid: number;
  iv: number | null;
  collateral: number;
  premium: number;
  qty: number;
  executablePremium?: number;
  cspScore?: number;
  actionLabel?: string;
  companyQuality?: string;
  delta?: number | null;
  probabilityITM?: number | null;
  riskNotes?: string[];
}

// ─── IV Class Badge ──────────────────────────────────────────────────────────

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

// ─── Page Component ──────────────────────────────────────────────────────────

export default function CSPScreenerPage() {
  const fridays = useMemo(() => generateFridays(), []);
  const [watchlist, setWatchlist] = useState<WatchlistType>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("csp_watchlist") as WatchlistType) || "all";
    }
    return "all";
  });
  const [customTickers, setCustomTickers] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("csp_custom_tickers") || "";
    }
    return "";
  });
  const [expiry, setExpiry] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("csp_expiry");
      if (saved && fridays.some((f) => f.date === saved)) return saved;
    }
    return fridays[1]?.date ?? fridays[0]?.date ?? "";
  });
  const [minOI, setMinOI] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("maxIV");
  const [hideK4, setHideK4] = useState(false);
  const [basket, setBasket] = useState<BasketItem[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("csp_basket");
        if (saved) return JSON.parse(saved);
      } catch { /* ignore */ }
    }
    return [];
  });
  const [scanning, setScanning] = useState(false);

  const { data, refetch, isFetching } = trpc.signallab.cspScan.useQuery(
    { watchlist, customTickers, expiry, minOI },
    { enabled: false, refetchOnWindowFocus: false },
  );

  const handleScan = useCallback(async () => {
    setScanning(true);
    await refetch();
    setScanning(false);
  }, [refetch]);

  const isLoading = isFetching || scanning;

  // Persist state to localStorage
  useEffect(() => { localStorage.setItem("csp_watchlist", watchlist); }, [watchlist]);
  useEffect(() => { localStorage.setItem("csp_custom_tickers", customTickers); }, [customTickers]);
  useEffect(() => { localStorage.setItem("csp_expiry", expiry); }, [expiry]);
  useEffect(() => { localStorage.setItem("csp_basket", JSON.stringify(basket)); }, [basket]);

  // Filtered & sorted groups
  const filteredGroups = useMemo(() => {
    if (!data?.groups) return [];
    let groups = [...data.groups];
    if (hideK4) groups = groups.filter((g) => g.bestClass <= 3);
    switch (sortKey) {
      case "maxIV": groups.sort((a, b) => (b.maxIV ?? -1) - (a.maxIV ?? -1)); break;
      case "atmIV": groups.sort((a, b) => (b.atmIV ?? -1) - (a.atmIV ?? -1)); break;
      case "maxYield": groups.sort((a, b) => b.maxYield - a.maxYield); break;
      case "ticker": groups.sort((a, b) => a.ticker.localeCompare(b.ticker)); break;
    }
    return groups;
  }, [data?.groups, hideK4, sortKey]);

  // Basket functions
  const addToBasket = useCallback((contract: { ticker: string; strike: number; expiry: string; dte: number; mid: number; iv: number | null; collateral: number; premium: number; executablePremium?: number; cspScore?: number; actionLabel?: string; companyQuality?: string; delta?: number | null; probabilityITM?: number | null; riskNotes?: string[] }) => {
    setBasket((prev) => {
      const id = `${contract.ticker}-${contract.strike}-${contract.expiry}`;
      const existing = prev.findIndex((b) => b.id === id);
      if (existing >= 0) {
        const copy = [...prev];
        copy[existing] = { ...copy[existing], qty: copy[existing].qty + 1 };
        return copy;
      }
      return [...prev, { ...contract, id, qty: 1 }];
    });
  }, []);

  const removeFromBasket = useCallback((index: number) => {
    setBasket((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateQty = useCallback((index: number, delta: number) => {
    setBasket((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], qty: Math.max(1, copy[index].qty + delta) };
      return copy;
    });
  }, []);

  // Basket totals
  const basketTotals = useMemo(() => {
    const totalCollateral = basket.reduce((s, b) => s + b.collateral * b.qty, 0);
    const totalPremium = basket.reduce((s, b) => s + b.premium * b.qty, 0);
    const yieldPct = totalCollateral > 0 ? (totalPremium / totalCollateral) * 100 : 0;
    const totalQty = basket.reduce((s, b) => s + b.qty, 0);
    const avgDTE = totalQty > 0 ? basket.reduce((s, b) => s + b.dte * b.qty, 0) / totalQty : 0;
    const annYield = avgDTE > 0 ? yieldPct * (365 / avgDTE) : 0;
    return { totalCollateral, totalPremium, yieldPct, annYield, totalQty, avgDTE };
  }, [basket]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CSP Screener</h1>
          <p className="text-sm text-muted-foreground">Cash-Secured Put tarama — IV klasman, getiri analizi, sepet yönetimi</p>
        </div>
        {data && (
          <p className="text-xs text-muted-foreground">
            {data.totalContracts} kontrat | {data.groups.length} ticker
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Watchlist */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Watchlist</label>
            <div className="flex gap-1">
              {(["all", "ozan", "custom"] as const).map((w) => (
                <button key={w} onClick={() => setWatchlist(w)}
                  className={cn("rounded px-3 py-1.5 text-xs font-medium transition-colors",
                    watchlist === w ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent")}>
                  {w === "all" ? "All (34)" : w === "ozan" ? "Ozan (11)" : "Custom"}
                </button>
              ))}
            </div>
          </div>

          {/* Custom tickers input */}
          {watchlist === "custom" && (
            <div className="space-y-1 flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground">Tickers (virgülle)</label>
              <input type="text" value={customTickers} onChange={(e) => setCustomTickers(e.target.value)}
                placeholder="TSLA,NVDA,AMD..."
                className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          )}

          {/* Expiry */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Vade</label>
            <select value={expiry} onChange={(e) => setExpiry(e.target.value)}
              className="rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              {fridays.map((f) => <option key={f.date} value={f.date}>{f.label}</option>)}
            </select>
          </div>

          {/* Min OI */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Min OI</label>
            <input type="number" value={minOI} onChange={(e) => setMinOI(Number(e.target.value))} min={0}
              className="w-20 rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>

          {/* Sort */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Sırala</label>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="maxIV">Max IV</option>
              <option value="atmIV">ATM IV</option>
              <option value="maxYield">Max Getiri%</option>
              <option value="ticker">Ticker</option>
            </select>
          </div>

          {/* Hide K4 */}
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={hideK4} onChange={(e) => setHideK4(e.target.checked)}
              className="rounded border-border" />
            K4 gizle
          </label>

          {/* Scan button */}
          <button onClick={handleScan} disabled={isLoading}
            className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
            {isLoading ? "Taranıyor..." : "Tara"}
          </button>
        </div>
      </div>

      {/* Class Distribution */}
      {data?.classDist && (
        <div className="flex gap-3">
          {([1, 2, 3, 4] as const).map((k) => (
            <div key={k} className="flex items-center gap-1.5 text-xs">
              <IVClassBadge ivClass={k} />
              <span className="text-muted-foreground">{data.classDist[k]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Top CSP Picks by IV Bucket */}
      {data?.topPicks && (Object.values(data.topPicks).some((arr: unknown[]) => arr.length > 0)) && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-foreground">🎯 Top CSP Picks</h2>
          {(["70-100", "100-140", "140+"] as const).map((bucket) => {
            const picks = (data.topPicks as Record<string, Array<{ ticker: string; strike: number; expiry: string; dte: number; mid: number; iv: number | null; collateral: number; premium: number; cspScore: number; executablePremiumAmount: number; delta: number | null; probabilityITM: number | null; expectedMoveBuffer: number | null; spreadPct: number | null; companyQuality: string; actionLabel: string; riskNotes: string[]; executablePremium: number }>>)[bucket];
            if (!picks || picks.length === 0) return null;
            return (
              <div key={bucket}>
                <h3 className="text-xs font-semibold text-muted-foreground mb-2">IV {bucket}%</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {picks.map((p, i) => (
                    <div key={i} className="rounded border border-border bg-card p-3 text-xs space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-foreground">{p.ticker} {p.strike}P</span>
                        <span className={cn("font-bold", p.cspScore >= 72 ? "text-emerald-400" : p.cspScore >= 50 ? "text-yellow-400" : "text-red-400")}>{p.cspScore}</span>
                      </div>
                      <div className="text-muted-foreground">{p.expiry} • {p.dte}g</div>
                      <div className="grid grid-cols-2 gap-x-3 text-muted-foreground">
                        <span>Premium: <b className="text-foreground">${p.executablePremiumAmount?.toFixed(0)}</b></span>
                        <span>IV: <b className="text-foreground">{p.iv?.toFixed(0)}%</b></span>
                        <span>Delta: {p.delta?.toFixed(2) ?? "—"}</span>
                        <span>P(ITM): {p.probabilityITM?.toFixed(1) ?? "—"}%</span>
                        <span>EM Buffer: {p.expectedMoveBuffer?.toFixed(1) ?? "—"}x</span>
                        <span>Spread: {p.spreadPct?.toFixed(0) ?? "—"}%</span>
                      </div>
                      <div className="flex justify-between items-center pt-1">
                        <span className={cn("text-[10px]", p.companyQuality === "A" ? "text-emerald-400" : p.companyQuality === "B" ? "text-blue-400" : "text-yellow-400")}>{p.companyQuality} • {p.actionLabel}</span>
                        <button onClick={() => addToBasket(p)} className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded hover:bg-emerald-500/30">+ Basket</button>
                      </div>
                      {p.riskNotes?.length > 0 && <div className="text-[10px] text-orange-400/80">{p.riskNotes.slice(0, 2).join(" • ")}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Results Table */}
      {filteredGroups.length > 0 && (
        <div className="space-y-4">
          {filteredGroups.map((group) => (
            <div key={group.ticker} className="rounded-lg border border-border bg-card overflow-hidden">
              {/* Group Header */}
              <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-foreground">{group.ticker}</span>
                  <span className="text-xs text-muted-foreground">${group.spot.toFixed(2)}</span>
                  <IVClassBadge ivClass={group.bestClass} />
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {group.maxIV && <span>Max IV: <span className="text-yellow-400 font-medium">{group.maxIV.toFixed(0)}%</span></span>}
                  {group.atmIV && <span>ATM IV: <span className="text-blue-400 font-medium">{group.atmIV.toFixed(0)}%</span></span>}
                  <span>Max Getiri: <span className="text-emerald-400 font-medium">{group.maxYield.toFixed(2)}%</span></span>
                  <span>{group.expiry} ({group.dte}g)</span>
                </div>
              </div>

              {/* Strikes Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Strike</th>
                      <th className="px-3 py-2 text-center font-medium">Score</th>
                      <th className="px-3 py-2 text-right font-medium">Bid</th>
                      <th className="px-3 py-2 text-right font-medium">Ask</th>
                      <th className="px-3 py-2 text-right font-medium">Mid</th>
                      <th className="px-3 py-2 text-right font-medium">IV%</th>
                      <th className="px-3 py-2 text-center font-medium">Klas</th>
                      <th className="px-3 py-2 text-right font-medium">Getiri%</th>
                      <th className="px-3 py-2 text-right font-medium">Yıllık%</th>
                      <th className="px-3 py-2 text-right font-medium">İskonto%</th>
                      <th className="px-3 py-2 text-right font-medium">Teminat</th>
                      <th className="px-3 py-2 text-right font-medium">Prim</th>
                      <th className="px-3 py-2 text-right font-medium">OI</th>
                      <th className="px-3 py-2 text-center font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.strikes.map((s) => (
                      <tr key={`${s.ticker}-${s.strike}`} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-1.5 font-medium text-foreground">${s.strike.toFixed(1)}</td>
                        <td className="px-3 py-1.5 text-center"><span className={cn("font-bold", (s as any).cspScore >= 72 ? "text-emerald-400" : (s as any).cspScore >= 50 ? "text-yellow-400" : "text-red-400")}>{(s as any).cspScore ?? "—"}</span></td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">{s.bid.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">{s.ask.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-foreground">{s.mid.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right text-yellow-400">{s.iv ? `${s.iv.toFixed(0)}%` : "—"}</td>
                        <td className="px-3 py-1.5 text-center"><IVClassBadge ivClass={s.ivClass} /></td>
                        <td className="px-3 py-1.5 text-right text-emerald-400 font-medium">{s.yieldPct.toFixed(2)}%</td>
                        <td className="px-3 py-1.5 text-right text-emerald-400">{s.annYield.toFixed(0)}%</td>
                        <td className="px-3 py-1.5 text-right text-blue-400">{s.discount.toFixed(1)}%</td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">${s.collateral.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right text-foreground">${s.premium.toFixed(0)}</td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">{s.oi > 0 ? s.oi.toLocaleString() : "—"}</td>
                        <td className="px-3 py-1.5 text-center">
                          <button onClick={() => addToBasket(s)}
                            className="rounded p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Sepete ekle">
                            <ShoppingCart className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Basket */}
      {basket.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-400" /> Sepet ({basketTotals.totalQty} kontrat)
            </h2>
            <button onClick={() => setBasket([])} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
              Temizle
            </button>
          </div>

          {/* Basket Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="rounded border border-border p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Toplam Teminat</p>
              <p className="text-sm font-bold text-foreground">${basketTotals.totalCollateral.toLocaleString()}</p>
            </div>
            <div className="rounded border border-border p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Toplam Prim</p>
              <p className="text-sm font-bold text-emerald-400">${basketTotals.totalPremium.toFixed(0)}</p>
            </div>
            <div className="rounded border border-border p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Getiri%</p>
              <p className="text-sm font-bold text-emerald-400">{basketTotals.yieldPct.toFixed(2)}%</p>
            </div>
            <div className="rounded border border-border p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Yıllık%</p>
              <p className="text-sm font-bold text-emerald-400">{basketTotals.annYield.toFixed(0)}%</p>
            </div>
            <div className="rounded border border-border p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Ort. DTE</p>
              <p className="text-sm font-bold text-foreground">{basketTotals.avgDTE.toFixed(0)}g</p>
            </div>
          </div>

          {/* Basket Items */}
          <div className="space-y-1">
            {basket.map((item, idx) => (
              <div key={item.id} className="flex items-center justify-between rounded border border-border/50 px-3 py-1.5 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-foreground">{item.ticker}</span>
                  <span className="text-muted-foreground">${item.strike} P</span>
                  <span className="text-muted-foreground">{item.expiry}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-emerald-400">${item.premium.toFixed(0)}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(idx, -1)} className="rounded p-0.5 hover:bg-muted"><Minus className="h-3 w-3" /></button>
                    <span className="w-5 text-center font-medium">{item.qty}</span>
                    <button onClick={() => updateQty(idx, 1)} className="rounded p-0.5 hover:bg-muted"><Plus className="h-3 w-3" /></button>
                  </div>
                  <button onClick={() => removeFromBasket(idx)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diagnostics */}
      {data?.diagnostics && data.diagnostics.some((d) => d.reason) && (
        <details className="rounded-lg border border-border bg-card">
          <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" /> Diagnostics ({data.diagnostics.filter((d) => d.reason).length} sorun)
          </summary>
          <div className="px-4 pb-3 space-y-1">
            {data.diagnostics.filter((d) => d.reason).map((d) => (
              <div key={d.ticker} className="flex items-center gap-2 text-xs">
                <span className="font-medium text-foreground w-12">{d.ticker}</span>
                <span className="text-muted-foreground">{d.reason}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Empty state */}
      {!data && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <DollarSign className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-sm text-muted-foreground">Watchlist ve vade seçip &quot;Tara&quot; butonuna basın</p>
        </div>
      )}
    </div>
  );
}
