"use client";

import { useState, useMemo, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { useScanState } from "@/hooks/useScanState";
import { TickerChips, resolveTickers } from "@/components/ui/TickerChips";
import { cn } from "@/lib/utils";
import { TrendingUp, Loader2, AlertTriangle, Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/root";
import { gateDetail, gexDetail } from "@/lib/detail-content";

const DEFAULT_CSP_LIST = "NASA,RKLB,DRAM,MRVL,NNE,AMBA,CBRS,OSCR,EOSE,BMNR,IREN,CLS,MU,CRDO,SNDK,AAOI,PENG,GLW,BE,LITE";

type VolResult = inferRouterOutputs<AppRouter>["signallab"]["volScan"]["results"][number];

function GateDetailContent({ r }: { r: VolResult }) {
  const content = gateDetail({ ticker: r.ticker, verdict: r.gate!, vrp: r.vrp, atmIvFront: r.atmIvFront, hv20: r.hv20, termContango: r.termContango, ivPercentile: r.ivPercentile, earningsInWindow: r.earningsInWindow });
  return (
    <>
      <div className="text-xs font-bold text-white/90 whitespace-pre-line">{content.logic}</div>
      {content.scenarios.length > 0 && (
        <table className="w-full text-xs font-bold mt-3">
          <thead><tr className="border-b border-white/10"><th className="text-left py-1 text-white">Durum</th><th className="text-left py-1 text-white">Sonuç</th></tr></thead>
          <tbody>
            {content.scenarios.map((s, i) => (
              <tr key={i} className="border-b border-white/5">
                <td className="py-1.5 text-white/90">{s.durum}</td>
                <td className={`py-1.5 ${s.renk === "green" ? "text-emerald-400" : s.renk === "red" ? "text-red-400" : "text-yellow-400"}`}>{s.sonuc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {content.glossary && content.glossary.length > 0 && (
        <div className="border-t border-white/10 pt-2 mt-3 space-y-1.5">
          <div className="text-xs font-bold text-white/90">Sözlük</div>
          {content.glossary.map((g, i) => (
            <div key={i} className="text-xs font-bold">
              <span className="text-[#ff7200]">{g.term}:</span> <span className="text-white/90">{g.def}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function GexChartCard({ r }: { r: VolResult }) {
  const [showGlossary, setShowGlossary] = useState(false);

  const chartData = useMemo(() => {
    if (!r.gex) return [];
    return [...r.gex.levels]
      .sort((a, b) => Math.abs(a.strike - r.spot) - Math.abs(b.strike - r.spot))
      .slice(0, 15)
      .sort((a, b) => a.strike - b.strike);
  }, [r.gex, r.spot]);

  const fmtVal = (v: number) => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(0) + "K" : String(Math.round(v));

  return (
    <>
      <div className="flex items-center gap-3 mb-2 text-xs font-bold">
        <span className="text-sm font-bold text-white">GEX Profili</span>
        <span>CW <span className="text-emerald-400">${r.gex!.callWall ?? "—"}</span></span>
        <span>PW <span className="text-red-400">${r.gex!.putWall ?? "—"}</span></span>
        <span>Flip <span className="text-yellow-400">${r.gex!.flip?.toFixed(0) ?? "—"}</span></span>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <XAxis dataKey="strike" type="number" domain={["dataMin", "dataMax"]} tickCount={7} tickFormatter={(v: number) => String(Math.round(v))} tick={{ fontSize: 10, fontWeight: "bold", fill: "rgba(255,255,255,0.7)" }} />
          <YAxis width={44} tickCount={4} tickFormatter={fmtVal} tick={{ fontSize: 10, fontWeight: "bold", fill: "rgba(255,255,255,0.7)" }} />
          <Tooltip formatter={(v: number) => fmtVal(v)} labelFormatter={(l: number) => `Strike $${l}`} />
          <ReferenceLine x={r.spot} stroke="rgba(255,255,255,0.7)" strokeDasharray="4 4" />
          {r.gex!.putWall && <ReferenceLine x={r.gex!.putWall} stroke="#f87171" strokeDasharray="4 4" />}
          {r.gex!.callWall && <ReferenceLine x={r.gex!.callWall} stroke="#34d399" strokeDasharray="4 4" />}
          {r.gex!.flip && <ReferenceLine x={r.gex!.flip} stroke="#facc15" strokeDasharray="4 4" />}
          <Bar dataKey="netGex" maxBarSize={28} radius={[3, 3, 0, 0]}>
            {chartData.map((l, i) => <Cell key={i} fill={l.netGex >= 0 ? "#34d399" : "#f87171"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="text-[10px] font-bold text-white/50 mt-1">kesikli çizgiler: beyaz Spot · kırmızı PW · yeşil CW · sarı Flip</div>

      <div className="mt-3 text-xs font-bold">
        <div className="text-white/90 mb-1">CSP strike&apos;ını Put Wall altında seç → dealer hedging yapısal destek sağlar.</div>
        <table className="w-full">
          <tbody>
            {gexDetail().scenarios.map((s, i) => (
              <tr key={i} className="border-b border-white/5">
                <td className="py-1 text-white/90">{s.durum}</td>
                <td className={`py-1 ${s.renk === "green" ? "text-emerald-400" : s.renk === "red" ? "text-red-400" : "text-yellow-400"}`}>{s.sonuc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button onClick={() => setShowGlossary(!showGlossary)} className="mt-2 text-xs text-[#ff7200] font-bold">
        {showGlossary ? "Kavramları gizle" : "Kavramları göster"}
      </button>
      {showGlossary && gexDetail().glossary && (
        <div className="mt-2 space-y-1">
          {gexDetail().glossary!.map((g, i) => (
            <div key={i} className="text-xs font-bold">
              <span className="text-[#ff7200]">{g.term}:</span> <span className="text-white/90">{g.def}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function VolConsolePage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm font-bold text-white/40">Yükleniyor…</div>}>
      <VolConsoleInner />
    </Suspense>
  );
}

function VolConsoleInner() {
  const searchParams = useSearchParams();
  const {
    list, setList, customTickers, setCustomTickers,
    editingList, setEditingList,
  } = useScanState({ prefix: "csp", defaultList: DEFAULT_CSP_LIST, defaultBudget: 0 });
  const [dte, setDte] = useState(30);
  const [scanning, setScanning] = useState(false);
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});
  const toggleDetail = useCallback((t: string) => setOpenDetails(prev => ({ ...prev, [t]: !prev[t] })), []);

  const [activeChips, setActiveChips] = useState<string[]>(["listem"]);

  const personalTickers = list.split(",").map(t => t.trim()).filter(Boolean);
  const resolvedTickers = resolveTickers(activeChips, personalTickers, customTickers);

  useEffect(() => {
    const dteParam = searchParams.get("dte");
    if (dteParam) setDte(Number(dteParam) || 30);
  }, [searchParams]);

  const scanInput = useMemo(
    () => ({ watchlist: "custom" as const, customTickers: resolvedTickers.join(","), dte }),
    [resolvedTickers, dte],
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
          <div className="space-y-1.5 flex-1">
            <TickerChips value={activeChips} onChange={setActiveChips} personalTickers={personalTickers} onPersonalTickersChange={(next) => setList(next.join(","))} customText={customTickers} onCustomTextChange={setCustomTickers} editingList={editingList} onEditingListChange={setEditingList} />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-5 mt-4">
          <div className="space-y-1.5">
            <label className={labelClass}>DTE</label>
            <input type="number" value={dte} onChange={(e) => setDte(Number(e.target.value) || 30)} min={7} max={90} className={cn(inputClass, "w-20 tabular-nums")} />
          </div>

          <button onClick={handleScan} disabled={isLoading}
            className="flex items-center gap-2 rounded-md bg-[#ff7200] px-6 py-2 text-sm font-bold text-white hover:bg-[#ff8c3a] disabled:opacity-50">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
            {isLoading ? "Taranıyor..." : "Tara"}
          </button>
          <span className={`text-sm font-bold ${resolvedTickers.length > 60 ? "text-yellow-400" : "text-white/90"}`} title={resolvedTickers.length > 60 ? "Büyük tarama — süre uzayacak" : ""}>
            {resolvedTickers.length} hisse · ~{resolvedTickers.length * 2}sn
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error.message}
        </div>
      )}

      {(data as typeof data & { capped?: boolean; originalCount?: number })?.capped && (
        <div className="text-yellow-400 font-bold text-sm">İlk 80 hisse tarandı ({(data as typeof data & { originalCount?: number })?.originalCount} seçilmişti)</div>
      )}

      {/* Results */}
      {data?.results && (
        <div className="space-y-3">
          {data.results.filter((r) => !r.error).map((r) => (
            <div key={r.ticker} className="rounded-xl border border-white/10 bg-[#0e0e10] p-3">
              {/* Row 1: metrics left, gate+detay right */}
              <div className="flex items-center justify-between text-xs font-bold">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-bold text-white">{r.ticker}</span>
                  <span className="text-white/90">${r.spot.toFixed(2)}</span>
                  <span>HV20 <span className="text-white">{r.hv20 ? (r.hv20 * 100).toFixed(1) : "—"}</span></span>
                  <span>HV60 <span className="text-white">{r.hv60 ? (r.hv60 * 100).toFixed(1) : "—"}</span></span>
                  <span>IV(F) <span className="text-yellow-400">{r.atmIvFront?.toFixed(1) ?? "—"}</span></span>
                  <span>IV(B) <span className="text-white/90">{r.atmIvBack?.toFixed(1) ?? "—"}</span></span>
                  <span>VRP <span className={r.vrp !== null && r.vrp >= 0.03 ? "text-emerald-400" : r.vrp !== null && r.vrp < -0.02 ? "text-red-400" : "text-white/90"}>{r.vrp !== null ? (r.vrp * 100).toFixed(1) : "—"}</span></span>
                  <span>Term <span className={r.termContango === true ? "text-emerald-400" : r.termContango === false ? "text-red-400" : "text-white/90"}>{r.termContango === true ? "C" : r.termContango === false ? "B" : "—"}</span></span>
                  <span>Skew <span className="text-white/90">{r.skew25?.toFixed(1) ?? "—"}</span></span>
                  <span>IV%ile <span className="text-white/90">{typeof r.ivPercentile === "number" ? r.ivPercentile.toFixed(0) : "—"}</span></span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  {/* Gate badge */}
                  {r.gate && (
                    <span className={`rounded-lg px-4 py-3 text-sm font-bold ${
                      r.gate.color === "green" ? "bg-emerald-500/20 text-emerald-400" :
                      r.gate.color === "yellow" ? "bg-yellow-500/20 text-yellow-400" :
                      r.gate.color === "red" ? "bg-red-500/20 text-red-400" :
                      "bg-white/10 text-white/70"
                    }`}>{r.gate.label}</span>
                  )}
                  {/* Detay button */}
                  {r.gate && r.gate.color !== "neutral" && (
                    <button onClick={() => toggleDetail(r.ticker)}
                      className={cn("flex items-center justify-center gap-1.5 rounded-lg w-[120px] py-3 text-sm font-bold transition-colors",
                        openDetails[r.ticker] ? "bg-[#ff7200]/20 text-[#ff7200] border border-[#ff7200]/40" : "bg-[#ff7200] text-white hover:bg-[#ff8a2b]")}>
                      Detay {openDetails[r.ticker] ? "▾" : "▸"}
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2: GEX summary line */}
              {r.gex ? (
                <div className="mt-3 flex items-center gap-3 text-xs font-bold">
                  <span>CW <span className="text-emerald-400">${r.gex.callWall ?? "—"}</span></span>
                  <span>PW <span className="text-red-400">${r.gex.putWall ?? "—"}</span></span>
                  <span>Flip <span className="text-yellow-400">${r.gex.flip?.toFixed(0) ?? "—"}</span></span>
                  {r.gex.putWall && <span className="text-white/90 ml-2">Önerilen CSP bölgesi: &lt; ${r.gex.putWall}</span>}
                  {r.gate && r.gate.color !== "red" && r.gate.color !== "neutral" && (
                    <a href={`/dashboard/signallab/csp-screener?ticker=${r.ticker}${r.gex.putWall ? `&maxStrike=${r.gex.putWall}` : ""}`}
                      className="ml-auto flex items-center justify-center rounded-lg w-[120px] py-3 text-sm font-bold bg-[#ff7200] text-white hover:bg-[#ff8a2b]">
                      CSP Tara →
                    </a>
                  )}
                </div>
              ) : r.gexSkipReason ? (
                <div className="mt-1.5 text-xs font-bold text-white/50">{r.gexSkipReason}</div>
              ) : null}

              {/* Detail area (toggled) */}
              {openDetails[r.ticker] && (
                <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-white/10 bg-[#0b0b0c] p-4">
                    <div className="text-sm font-bold text-white mb-2">Hüküm Detayı</div>
                    <GateDetailContent r={r} />
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#0b0b0c] p-4">
                    {r.gex && r.gex.levels.length > 0 ? (
                      <GexChartCard r={r} />
                    ) : (
                      <div className="text-center text-white/50 font-bold py-8">{r.gexSkipReason ?? "GEX verisi yok"}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Diagnostics */}
              {r.diag && (
                <details className="mt-2">
                  <summary className="text-xs font-bold text-white/50 cursor-pointer">Tanı</summary>
                  <pre className="mt-1 text-xs font-bold text-white/70 font-mono overflow-x-auto">{JSON.stringify(r.diag, null, 2)}</pre>
                </details>
              )}
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
