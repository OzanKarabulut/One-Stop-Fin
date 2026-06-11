"use client";

import { trpc } from "@/lib/trpc/client";
import { TickerChips, resolveTickers } from "@/components/ui/TickerChips";
import { DetayButton, DetailPanel } from "@/components/ui/DetailPanel";
import type { DetailContent } from "@/components/ui/DetailPanel";
import { BROAD_UNIVERSE } from "@/lib/ticker-universe";
import type { TickerCategory } from "@/lib/ticker-universe";
import { useScanState } from "@/hooks/useScanState";
import { useState, useEffect, useMemo } from "react";

const EXTRA_CATS: TickerCategory[] = [{ id: "broad", label: "Geniş Evren", tickers: BROAD_UNIVERSE }];

export default function AnomalyRadarPage() {
  const {
    list, setList, customTickers, setCustomTickers,
    editingList, setEditingList, activeChips, setActiveChips,
  } = useScanState({ prefix: "anomaly", defaultList: "", defaultBudget: 0, defaultChips: ["broad"] });

  const personalTickers = list.split(",").map(t => t.trim()).filter(Boolean);
  const [queryInput, setQueryInput] = useState<{ tickers: string[]; debugTicker?: string } | null>(null);
  const [sortMode, setSortMode] = useState<"math" | "balanced">("balanced");

  useEffect(() => {
    const saved = localStorage.getItem("anomaly_sortMode");
    if (saved === "math" || saved === "balanced") setSortMode(saved);
  }, []);
  useEffect(() => { localStorage.setItem("anomaly_sortMode", sortMode); }, [sortMode]);

  const { data, isFetching } = trpc.signallab.anomalyScan.useQuery(
    queryInput!,
    { enabled: !!queryInput, refetchOnWindowFocus: false },
  );

  const sortedCards = useMemo(() => {
    if (!data?.cards) return [];
    const cards = [...data.cards];
    if (sortMode === "balanced") cards.sort((a, b) => b.balancedScore - a.balancedScore);
    return cards;
  }, [data?.cards, sortMode]);

  const handleScan = () => {
    const resolved = resolveTickers(activeChips, personalTickers, customTickers, EXTRA_CATS).slice(0, 300);
    setQueryInput({ tickers: resolved });
  };

  const resolvedCount = resolveTickers(activeChips, personalTickers, customTickers, EXTRA_CATS).length;

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="rounded-lg border border-white/10 bg-[#101013] p-4">
        <h1 className="text-2xl font-bold tracking-tight text-white mb-3">Anomali Radarı</h1>
        <TickerChips
          value={activeChips} onChange={setActiveChips}
          personalTickers={personalTickers} onPersonalTickersChange={(next) => setList(next.join(","))}
          customText={customTickers} onCustomTextChange={setCustomTickers}
          editingList={editingList} onEditingListChange={setEditingList}
          extraCategories={EXTRA_CATS}
        />
        <div className="border-t border-white/10 mt-4 pt-4 flex flex-wrap items-center gap-4">
          <button onClick={handleScan} disabled={isFetching}
            className="bg-[#ff7200] text-white font-bold rounded-lg px-8 py-3 text-base hover:bg-[#ff8a2b] transition-colors disabled:opacity-50">
            {isFetching ? "Taranıyor…" : "Anomali Tara"}
          </button>
          <span className="text-sm font-bold text-white/70">
            {resolvedCount} hisse taranacak — sert düşenler ve artan IV&apos;ler analiz edilir, en mantıklı CSP seçenekleri listelenir ve puanlanır
          </span>
        </div>
      </div>

      {/* Skipped warning */}
      {data && (data.meta.skipped.count > 0 || (data.meta.invalidSymbols && data.meta.invalidSymbols.length > 0)) && (
        <div className="text-xs font-bold text-yellow-400 px-1 space-y-1">
          {data.meta.skipped.count > 0 && (
            <p>
              ⚠ {data.meta.skipped.count} hisse spark verisi eksik/kısa: {data.meta.skipped.sample.join(", ")}{data.meta.skipped.count > 10 ? "…" : ""}
              {data.meta.chunkResults && (() => {
                const counts: Record<number, number> = {};
                data.meta.chunkResults.forEach((c: { status: number }) => { counts[c.status] = (counts[c.status] ?? 0) + 1; });
                return ` (chunk durumları: ${Object.entries(counts).map(([s, n]) => `${s}×${n}`).join(", ")})`;
              })()}
            </p>
          )}
          {data.meta.invalidSymbols && data.meta.invalidSymbols.length > 0 && (
            <p>Yahoo&apos;nun tanımadığı semboller: {data.meta.invalidSymbols.join(", ")}</p>
          )}
        </div>
      )}

      {/* Results */}
      {data && data.cards.length > 0 && (
        <div className="space-y-4">
          <div className="font-bold text-white text-lg">Düşüş Fırsatları</div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSortMode("balanced")} className={`rounded-lg px-5 py-2.5 text-sm font-bold border-2 border-[#ff7200] transition-colors ${sortMode === "balanced" ? "bg-[#ff7200] text-white" : "bg-transparent text-[#ff7200] hover:bg-[#ff7200]/10"}`}>Kalite Dengeli</button>
            <button onClick={() => setSortMode("math")} className={`rounded-lg px-5 py-2.5 text-sm font-bold border-2 border-[#ff7200] transition-colors ${sortMode === "math" ? "bg-[#ff7200] text-white" : "bg-transparent text-[#ff7200] hover:bg-[#ff7200]/10"}`}>Salt Matematik</button>
          </div>
          {sortedCards.map((c) => (
            <AnomalyCardRow key={c.ticker} c={c} sortMode={sortMode} />
          ))}
        </div>
      )}

      {/* Near misses — shown always when data exists */}
      {data && data.meta.nearMisses.length > 0 && (
        <p className="text-sm font-bold text-white/70 px-1">
          Eşiğe en yakınlar:{" "}
          {data.meta.nearMisses.map((nm, i) => (
            <span key={i} title={`eşik: ${(nm.threshold * 100).toFixed(0)}%`}>
              {i > 0 && " · "}{nm.ticker} {(nm.drop * 100).toFixed(1)}%/{nm.window}
            </span>
          ))}
        </p>
      )}

      {/* Empty state */}
      {data && data.cards.length === 0 && (
        <div className="rounded-lg border border-white/10 bg-[#101013] p-6 text-center">
          <p className="text-sm font-bold text-white/90">
            Bugün radar sessiz — {data.meta.scanned} hissede %7+/1g (bugün veya dün) veya %12+/3g düşüş yok.
          </p>
          <p className="text-xs font-bold text-white/60 mt-2">
            Tarama: {data.meta.scanned} hisse · {data.meta.stage1Ms}ms · {data.meta.triggeredCount} tetiklendi
          </p>
        </div>
      )}

      {/* Calibration */}
      {data?.calibration && (
        <details className="rounded-lg border border-white/10 bg-[#101013] p-4">
          <summary className="font-bold text-white/90 text-sm cursor-pointer">Kalibrasyon ({data.calibration.total} fırsat)</summary>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-xs font-bold">
            <div><div className="text-white/60">Toplam</div><div className="text-white">{data.calibration.total}</div></div>
            <div><div className="text-white/60">MAX_KAR</div><div className="text-emerald-400">{data.calibration.maxKar} (%{data.calibration.total > 0 ? Math.round(data.calibration.maxKar / data.calibration.total * 100) : 0})</div></div>
            <div><div className="text-white/60">Assignment</div><div className="text-red-400">{data.calibration.assignment}</div></div>
            <div><div className="text-white/60">&lt;3σ MAX_KAR</div><div className="text-white">{data.calibration.bySigma.low.total > 0 ? `${data.calibration.bySigma.low.maxKar}/${data.calibration.bySigma.low.total}` : "—"}</div></div>
            <div><div className="text-white/60">≥3σ MAX_KAR</div><div className="text-white">{data.calibration.bySigma.high.total > 0 ? `${data.calibration.bySigma.high.maxKar}/${data.calibration.bySigma.high.total}` : "—"}</div></div>
            <div><div className="text-white/60">Şirket-ağırlıklı</div><div className="text-white">{data.calibration.bySector.company.total > 0 ? `${data.calibration.bySector.company.maxKar}/${data.calibration.bySector.company.total}` : "—"}</div></div>
            <div><div className="text-white/60">Sektörle birlikte</div><div className="text-white">{data.calibration.bySector.sector.total > 0 ? `${data.calibration.bySector.sector.maxKar}/${data.calibration.bySector.sector.total}` : "—"}</div></div>
            <div><div className="text-white/60">1g tetik</div><div className="text-white">{data.calibration.byTrigger.d1.total > 0 ? `${data.calibration.byTrigger.d1.maxKar}/${data.calibration.byTrigger.d1.total}` : "—"}</div></div>
            <div><div className="text-white/60">3g tetik</div><div className="text-white">{data.calibration.byTrigger.d3.total > 0 ? `${data.calibration.byTrigger.d3.maxKar}/${data.calibration.byTrigger.d3.total}` : "—"}</div></div>
          </div>
          {data.calibration.total < 30 && <p className="text-xs font-bold text-white/50 mt-2">veri birikiyor ({data.calibration.total}/30)</p>}
        </details>
      )}

      {/* Honesty box */}
      <div className="rounded-lg border-2 border-yellow-500/50 bg-yellow-500/5 p-4">
        <p className="text-xs font-bold text-yellow-300/90">
          ⚠️ Radar eleme yapmaz — fırsatı ve riski sayılarla gösterir, karar senindir. P(assignment) çöküş SONRASI şişkin IV ile hesaplanır; piyasanın korkusu rakamların içindedir.
        </p>
      </div>
    </div>
  );
}

// eslint-disable-next-line
function AnomalyCardRow({ c, sortMode }: { c: any; sortMode: "math" | "balanced" }) {
  const [detayOpen, setDetayOpen] = useState(false);
  const detayContent: DetailContent = {
    title: `${c.ticker} — Anomali Analizi`,
    logic: `Düşüş: ${(c.triggerDrop * 100).toFixed(1)}% (${c.trigger}) → ${c.sigmaMove.toFixed(1)}σ\n1g: ${(c.drop1d * 100).toFixed(1)}% · dün: ${(c.prevDayDrop * 100).toFixed(1)}% · 3g: ${(c.drop3d * 100).toFixed(1)}%\nHV20: ${(c.hv20 * 100).toFixed(0)}% · IV: %${c.ivPct.toFixed(0)} · IV/HV: ${c.ivHvRatio.toFixed(1)}x\nSektör (${c.trigger}): ${(c.sectorRel * 100).toFixed(1)}% → ${c.sectorLabel}\n5g: ${(c.dd5 * 100).toFixed(1)}% → ×${(1 + Math.abs(c.dd5)).toFixed(2)}${c.premiumFactor != null && c.premiumFactor < 1 ? ` · prim ×${c.premiumFactor.toFixed(2)}` : ""}\nSkor: ${c.opportunityScore.toFixed(2)} → ${c.displayScore}/100\nKalite: ${c.qualityScore ?? "?"}/100 (${c.qualitySource ?? "?"}) — ${(c.qualityWhy ?? []).join(", ")}\nDenge = ${c.displayScore} × ${c.qualityScore ?? "?"}/100 = ${c.balancedScore ?? "?"}`,
    scenarios: [
      { durum: "Fiyat toparlar", sonuc: `Prim cebinde — %${c.conservative?.annualizedYieldPct.toFixed(0) ?? "?"}/yıl`, renk: "green" },
      { durum: "Strike kırılır", sonuc: `Sahiplik $${c.conservative?.effectiveCost.toFixed(1) ?? "?"}`, renk: "yellow" },
      { durum: "Düşüş devam", sonuc: "Kayıp mümkün", renk: "red" },
    ],
  };

  return (
    <div className="rounded-lg border border-white/10 bg-[#101013] p-4 space-y-3">
      <div className="flex items-center justify-between">
        {/* LEFT: content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl font-bold text-white">{c.ticker}</span>
            <span className="text-lg font-bold text-white">${c.spot.toFixed(2)}</span>
            <span className="bg-red-500/20 text-red-400 font-bold text-sm rounded px-2 py-0.5">{c.trigger} {(c.triggerDrop * 100).toFixed(1)}%</span>
            <span className="text-xs font-bold text-white/70">
              {c.trigger === "dün" && `bugün ${c.drop1d >= 0 ? "+" : ""}${(c.drop1d * 100).toFixed(1)}% (${c.drop1d >= 0 ? "toparlama" : "devam"})`}
              {c.trigger === "bugün" && `5g: ${(c.dd5 * 100).toFixed(1)}%`}
              {c.trigger === "3g" && `bugün: ${(c.drop1d * 100).toFixed(1)}% · 5g: ${(c.dd5 * 100).toFixed(1)}%`}
            </span>
            {c.trigger !== "bugün" && <span className="text-xs font-bold text-white/70">5g: {(c.dd5 * 100).toFixed(1)}%</span>}
            <span className="font-bold text-white text-xs">{c.sigmaMove.toFixed(1)}σ</span>
            <span className="bg-white/10 text-white/90 font-bold text-[11px] rounded px-1.5 py-0.5">{c.sectorLabel}</span>
            <span className={`font-bold text-[11px] rounded px-1.5 py-0.5 ${c.ivHvRatio < 1 ? "bg-white/10 text-white/60" : "bg-white/10 text-white/90"}`}>IV/HV {c.ivHvRatio.toFixed(1)}x</span>
            {c.earningsInWin && <span className="bg-white/10 text-white/90 font-bold text-[11px] rounded px-1.5 py-0.5">📊</span>}
          </div>
          {c.conservative && !c.aggressive && (
            <div className="text-xs font-bold text-white/90 truncate">🛡 ${c.conservative.strike}P — ${c.conservative.premium.toFixed(2)} · %{c.conservative.annualizedYieldPct.toFixed(0)}/yıl · %{(c.conservative.buffer * 100).toFixed(0)} tampon</div>
          )}
          {c.conservative && c.aggressive && (
            <div className="text-xs font-bold text-white/90 truncate">🛡 ${c.conservative.strike}P %{c.conservative.annualizedYieldPct.toFixed(0)}/yıl · ⚡ ${c.aggressive.strike}P %{c.aggressive.annualizedYieldPct.toFixed(0)}/yıl</div>
          )}
          {c.conservative && (
            <div className="text-[11px] font-bold text-white/60 truncate">Plan B: ${c.conservative.effectiveCost.toFixed(2)} maliyet (%{(c.conservative.effectiveCostVsSpotPct * 100).toFixed(0)} iskonto)</div>
          )}
        </div>

        {/* RIGHT: scores + buttons same row */}
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <span className={`rounded-lg px-4 py-2 text-sm font-bold border-2 border-transparent h-12 flex items-center ${(c.qualityScore ?? 50) >= 65 ? "bg-emerald-500/15 text-emerald-400" : (c.qualityScore ?? 50) >= 40 ? "bg-yellow-500/15 text-yellow-400" : "bg-red-500/15 text-red-400"}`} title={(c.qualityWhy ?? []).join(", ")}>Kalite {c.qualityScore ?? "?"}</span>
          <span className={`rounded-lg px-4 py-2 text-sm font-bold border-2 border-transparent h-12 flex items-center ${c.displayScore >= 65 ? "bg-emerald-500/15 text-emerald-400" : c.displayScore >= 40 ? "bg-yellow-500/15 text-yellow-400" : "bg-red-500/15 text-red-400"}`}>Fırsat {c.displayScore}</span>
          <div className={`flex items-center justify-center rounded-lg px-6 h-12 border-2 border-transparent ${(() => { const v = sortMode === "balanced" ? (c.balancedScore ?? 0) : c.displayScore; return v >= 75 ? "bg-emerald-500/20 text-emerald-400" : v >= 50 ? "bg-yellow-500/20 text-yellow-400" : "bg-white/10 text-white/70"; })()}`}>
            <span className="text-2xl font-bold leading-none">{sortMode === "balanced" ? (c.balancedScore ?? "?") : c.displayScore}</span>
          </div>
          <button onClick={() => setDetayOpen(!detayOpen)}
            className="rounded-lg px-4 py-2 text-sm font-bold border-2 border-[#ff7200] text-[#ff7200] bg-transparent hover:bg-[#ff7200]/10 transition-colors h-12 flex items-center">
            Detay {detayOpen ? "▾" : "▸"}
          </button>
          <a href={`/dashboard/signallab/csp-screener?ticker=${c.ticker}${c.putWall ? `&maxStrike=${c.putWall}` : `&maxStrike=${c.conservative?.strike ?? ""}`}`}
            className="rounded-lg px-4 py-2 text-sm font-bold bg-[#ff7200] text-white hover:bg-[#ff8a2b] whitespace-nowrap transition-colors h-12 flex items-center">
            CSP Tara
          </a>
        </div>
      </div>

      {/* Detay panel — full width below */}
      {detayOpen && <DetailPanel content={detayContent} />}
    </div>
  );
}
