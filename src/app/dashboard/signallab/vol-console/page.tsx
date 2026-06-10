"use client";

import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { useScanState } from "@/hooks/useScanState";
import { cn } from "@/lib/utils";
import { TrendingUp, Loader2, AlertTriangle, Activity, Pencil } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import type { GateVerdict } from "@/lib/sell-gate";
import { DetayButton } from "@/components/ui/DetailPanel";
import { gateDetail, gexDetail } from "@/lib/detail-content";

const DEFAULT_CSP_LIST = "NASA,RKLB,DRAM,MRVL,NNE,AMBA,CBRS,OSCR,EOSE,BMNR,IREN,CLS,MU,CRDO,SNDK,AAOI,PENG,GLW";

function GateBadge({ gate }: { gate: GateVerdict }) {
  const colors: Record<string, string> = {
    green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    yellow: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    red: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  return (
    <span className={cn("rounded-md border px-2.5 py-1 text-xs font-bold", colors[gate.color])}>
      {gate.label}
    </span>
  );
}

export default function VolConsolePage() {
  const {
    mode, setMode, list, setList, customTickers, setCustomTickers,
    editingList, setEditingList, scanWatchlist, scanTickers,
  } = useScanState({ prefix: "csp", defaultList: DEFAULT_CSP_LIST, defaultBudget: 0 });
  const [dte, setDte] = useState(30);
  const [scanning, setScanning] = useState(false);

  const scanInput = useMemo(
    () => ({ watchlist: scanWatchlist, customTickers: scanTickers, dte }),
    [scanWatchlist, scanTickers, dte],
  );

  const { data, error, refetch, isFetching } = trpc.signallab.volScan.useQuery(scanInput, { enabled: false, refetchOnWindowFocus: false });
  const handleScan = useCallback(async () => { setScanning(true); await refetch(); setScanning(false); }, [refetch]);
  const isLoading = isFetching || scanning;

  const inputClass = "rounded-md border border-white/10 bg-[#050505] px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-1 focus:ring-[#ff7200]/50";
  const labelClass = "text-sm font-bold text-white";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Vol Konsolu</h1>
        <p className="mt-1 text-sm font-bold text-white/90">Volatilite analizi — VRP, term structure, GEX, satış kapısı</p>
      </div>

      {/* Controls */}
      <div className="rounded-xl border border-white/10 bg-[#0b0b0c] p-4">
        <div className="flex flex-wrap items-end gap-5">
          <div className="space-y-1.5">
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
              <textarea value={list} onChange={(e) => setList(e.target.value.toUpperCase())} rows={2} className={cn(inputClass, "w-full")} />
            </div>
          )}

          {mode === "custom" && (
            <div className="min-w-[200px] flex-1 space-y-1.5">
              <label className={labelClass}>Tickers</label>
              <input type="text" value={customTickers} onChange={(e) => setCustomTickers(e.target.value.toUpperCase())} placeholder="TSLA,NVDA..." className={cn(inputClass, "w-full uppercase")} />
            </div>
          )}

          <div className="space-y-1.5">
            <label className={labelClass}>DTE</label>
            <input type="number" value={dte} onChange={(e) => setDte(Number(e.target.value) || 30)} min={7} max={90} className={cn(inputClass, "w-20 tabular-nums")} />
          </div>

          <button onClick={handleScan} disabled={isLoading}
            className="flex items-center gap-2 rounded-md bg-[#ff7200] px-6 py-2 text-sm font-bold text-white hover:bg-[#ff8c3a] disabled:opacity-50">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
            {isLoading ? "Taranıyor..." : "Tara"}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error.message}
        </div>
      )}

      {/* Results */}
      {data?.results && (
        <div className="space-y-4">
          {data.results.filter((r) => !r.error).map((r) => (
            <div key={r.ticker} className="rounded-xl border border-white/10 bg-[#0a0a0c] overflow-hidden">
              {/* Top strip: indicators + gate */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3">
                <div className="flex items-center gap-4">
                  <span className="text-base font-bold text-white">{r.ticker}</span>
                  <span className="text-sm font-bold text-white/90 tabular-nums">${r.spot.toFixed(2)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs font-bold tabular-nums">
                  <span className="text-white/90">HV20 <span className="text-white">{r.hv20 !== null ? (r.hv20 * 100).toFixed(1) + "%" : "—"}</span></span>
                  <span className="text-white/90">HV60 <span className="text-white">{r.hv60 !== null ? (r.hv60 * 100).toFixed(1) + "%" : "—"}</span></span>
                  <span className="text-white/90">IV(F) <span className="text-yellow-400">{r.atmIvFront !== null ? r.atmIvFront.toFixed(1) + "%" : "—"}</span></span>
                  <span className="text-white/90">IV(B) <span className="text-white">{r.atmIvBack !== null ? r.atmIvBack.toFixed(1) + "%" : "—"}</span></span>
                  <span className="text-white/90">VRP <span className={cn(r.vrp !== null && r.vrp >= 0.03 ? "text-emerald-400" : r.vrp !== null && r.vrp < -0.02 ? "text-red-400" : "text-white")}>{r.vrp !== null ? (r.vrp * 100).toFixed(1) : "—"}</span></span>
                  <span className="text-white/90">Term <span className={cn(r.termContango ? "text-emerald-400" : "text-red-400")}>{r.termContango === null ? "—" : r.termContango ? "Contango" : "Backw."}</span></span>
                  <span className="text-white/90">Skew25 <span className="text-white">{r.skew25 !== null ? r.skew25.toFixed(1) : "—"}</span></span>
                  <span className="text-white/90">IV%ile <span className="text-white">{r.ivPercentile !== null ? r.ivPercentile.toFixed(0) : "—"}</span></span>
                  {r.gate && (
                    <>
                      <GateBadge gate={r.gate} />
                      <DetayButton content={gateDetail({ ticker: r.ticker, verdict: r.gate, vrp: r.vrp, atmIvFront: r.atmIvFront, hv20: r.hv20, termContango: r.termContango, ivPercentile: r.ivPercentile, earningsInWindow: r.earningsInWindow })} />
                    </>
                  )}
                </div>
              </div>

              {/* Middle: GEX chart */}
              {r.gex && r.gex.levels.length > 0 && (
                <div className="px-5 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4 text-[#ff7200]" />
                    <span className="text-xs font-bold text-white/90">GEX Profili</span>
                    <DetayButton content={gexDetail()} />
                    {r.gex.callWall && <span className="text-xs font-bold text-emerald-400">Call Wall: ${r.gex.callWall.toFixed(0)}</span>}
                    {r.gex.putWall && <span className="text-xs font-bold text-red-400">Put Wall: ${r.gex.putWall.toFixed(0)}</span>}
                    {r.gex.flip && <span className="text-xs font-bold text-yellow-400">Flip: ${r.gex.flip.toFixed(0)}</span>}
                  </div>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={r.gex.levels} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                      <XAxis dataKey="strike" type="number" domain={["dataMin", "dataMax"]} tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 10 }} tickFormatter={(v: number) => v.toFixed(0)} />
                      <YAxis tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 10 }} width={40} />
                      <Tooltip contentStyle={{ background: "#1a1a1e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} labelStyle={{ color: "#fff", fontWeight: 700 }} />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                      {r.spot > 0 && <ReferenceLine x={r.spot} stroke="#ffffff" strokeDasharray="3 3" label={{ value: "Spot", fill: "#fff", fontSize: 9 }} />}
                      {r.gex.flip && <ReferenceLine x={r.gex.flip} stroke="#eab308" strokeDasharray="3 3" label={{ value: "Flip", fill: "#eab308", fontSize: 9 }} />}
                      {r.gex.callWall && <ReferenceLine x={r.gex.callWall} stroke="#34d399" strokeDasharray="3 3" label={{ value: "CW", fill: "#34d399", fontSize: 9 }} />}
                      {r.gex.putWall && <ReferenceLine x={r.gex.putWall} stroke="#f87171" strokeDasharray="3 3" label={{ value: "PW", fill: "#f87171", fontSize: 9 }} />}
                      <Bar dataKey="netGex">
                        {r.gex.levels.map((entry, idx) => (
                          <Cell key={idx} fill={entry.netGex >= 0 ? "#34d399" : "#f87171"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  {r.gex.putWall && (
                    <p className="mt-2 text-xs font-bold text-white">Önerilen CSP bölgesi: &lt; ${r.gex.putWall.toFixed(0)} (put wall altı)</p>
                  )}
                </div>
              )}

              {/* Bottom: gate reasons + CSP bridge */}
              <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-white/90">
                  {r.gate?.reasons.map((reason, i) => <span key={i} className="mr-3">{reason}</span>)}
                </div>
                {r.gate && (r.gate.color === "green" || r.gate.color === "yellow") && (
                  <a href={`/dashboard/signallab/csp-screener?ticker=${r.ticker}${r.gex?.putWall ? `&maxStrike=${r.gex.putWall.toFixed(0)}` : ""}`}
                    className="rounded-md bg-[#ff7200] px-3 py-1 text-xs font-bold text-white hover:bg-[#ff8c3a] transition-colors">
                    CSP Tara →
                  </a>
                )}
              </div>
            </div>
          ))}

          {/* Errors */}
          {data.results.filter((r) => r.error).length > 0 && (
            <details className="rounded-lg border border-white/10 bg-[#0b0b0c]">
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-bold text-white/90">
                <AlertTriangle className="h-4 w-4" /> Hatalar ({data.results.filter((r) => r.error).length})
              </summary>
              <div className="space-y-1 px-4 pb-3">
                {data.results.filter((r) => r.error).map((r) => (
                  <div key={r.ticker} className="flex gap-3 text-sm font-bold">
                    <span className="text-white w-14">{r.ticker}</span>
                    <span className="text-white/90">{r.error}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {!data && !isLoading && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Activity className="mb-4 h-12 w-12 text-white/15" />
          <p className="text-sm font-bold text-white/90">Watchlist seçip <span className="text-[#ff7200]">Tara</span>&apos;ya basın</p>
        </div>
      )}
    </div>
  );
}
