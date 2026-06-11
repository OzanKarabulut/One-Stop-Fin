"use client";

import { trpc } from "@/lib/trpc/client";
import { TickerChips, resolveTickers } from "@/components/ui/TickerChips";
import { DetayButton } from "@/components/ui/DetailPanel";
import { BROAD_UNIVERSE } from "@/lib/ticker-universe";
import type { TickerCategory } from "@/lib/ticker-universe";
import { useScanState } from "@/hooks/useScanState";
import { useState } from "react";

const EXTRA_CATS: TickerCategory[] = [{ id: "broad", label: "Geniş Evren", tickers: BROAD_UNIVERSE }];

export default function AnomalyRadarPage() {
  const {
    list, setList, customTickers, setCustomTickers,
    editingList, setEditingList, activeChips, setActiveChips,
  } = useScanState({ prefix: "anomaly", defaultList: "", defaultBudget: 0, defaultChips: ["broad"] });

  const personalTickers = list.split(",").map(t => t.trim()).filter(Boolean);
  const [debugTicker, setDebugTicker] = useState("");
  const [queryInput, setQueryInput] = useState<{ tickers: string[]; debugTicker?: string } | null>(null);

  const { data, isFetching } = trpc.signallab.anomalyScan.useQuery(
    queryInput!,
    { enabled: !!queryInput, refetchOnWindowFocus: false },
  );

  const handleScan = () => {
    const resolved = resolveTickers(activeChips, personalTickers, customTickers, EXTRA_CATS).slice(0, 300);
    setQueryInput({ tickers: resolved, debugTicker: debugTicker.trim() || undefined });
  };

  const resolvedCount = resolveTickers(activeChips, personalTickers, customTickers, EXTRA_CATS).length;

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="rounded-lg border border-white/10 bg-[#101013] p-4 space-y-3">
        <h1 className="text-2xl font-bold tracking-tight text-white">⚡ Anomali Radarı</h1>
        <TickerChips
          value={activeChips} onChange={setActiveChips}
          personalTickers={personalTickers} onPersonalTickersChange={(next) => setList(next.join(","))}
          customText={customTickers} onCustomTextChange={setCustomTickers}
          editingList={editingList} onEditingListChange={setEditingList}
          extraCategories={EXTRA_CATS}
        />
        <div className="flex items-center gap-4">
          <button onClick={handleScan} disabled={isFetching}
            className="bg-[#ff7200] text-white font-bold rounded-lg px-6 py-2.5 text-sm hover:bg-[#ff8a2b] transition-colors disabled:opacity-50">
            {isFetching ? "Taranıyor…" : "Radar Tara"}
          </button>
          <input value={debugTicker} onChange={e => setDebugTicker(e.target.value.toUpperCase())} placeholder="Tanı" className="rounded-lg bg-[#1a1a1f] border border-white/10 px-3 py-2 font-bold text-white/90 w-20 text-sm" />
          <span className="text-sm font-bold text-white/70">
            {resolvedCount} hisse · Aşama 1 saniyeler, derin analiz sadece yakalananlara
          </span>
        </div>
      </div>

      {/* Skipped warning */}
      {data && data.meta.skipped.count > 0 && (
        <p className="text-xs font-bold text-yellow-400 px-1">⚠ {data.meta.skipped.count} hisse spark verisi eksik/kısa: {data.meta.skipped.sample.join(", ")}{data.meta.skipped.count > 10 ? "…" : ""}</p>
      )}

      {/* Debug output */}
      {data?.meta.debug && (
        <details className="rounded-lg border border-white/10 bg-[#101013] p-3">
          <summary className="font-bold text-white/90 text-sm cursor-pointer">Tanı: {data.meta.debug.ticker}</summary>
          <pre className="mt-2 text-xs font-mono text-white/80 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(data.meta.debug, null, 2)}</pre>
        </details>
      )}

      {/* Results */}
      {data && data.cards.length > 0 && (
        <div className="space-y-4">
          <div className="font-bold text-white text-lg">🔥 Düşüş Fırsatları</div>
          {data.cards.map((c) => (
            <div key={c.ticker} className="rounded-lg border border-white/10 bg-[#101013] p-4 space-y-3">
              {/* Header row */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xl font-bold text-white">{c.ticker}</span>
                <span className="text-lg font-bold text-white">${c.spot.toFixed(2)}</span>
                <span className="bg-red-500/20 text-red-400 font-bold text-sm rounded px-2 py-0.5">
                  {c.trigger} {(c.triggerDrop * 100).toFixed(1)}%
                </span>
                <span className="text-xs font-bold text-white/70">
                  {c.trigger === "dün" && `bugün ${c.drop1d >= 0 ? "+" : ""}${(c.drop1d * 100).toFixed(1)}% (${c.drop1d >= 0 ? "toparlama" : "devam"})`}
                  {c.trigger === "bugün" && `5g: ${(c.dd5 * 100).toFixed(1)}%`}
                  {c.trigger === "3g" && `bugün: ${(c.drop1d * 100).toFixed(1)}% · 5g: ${(c.dd5 * 100).toFixed(1)}%`}
                </span>
                {c.trigger !== "bugün" && <span className="text-xs font-bold text-white/70">5g: {(c.dd5 * 100).toFixed(1)}%</span>}
                <span className="font-bold text-white text-sm">{c.sigmaMove.toFixed(1)}σ hareket</span>
                <span className="bg-white/10 text-white/90 font-bold text-xs rounded px-2 py-0.5">{c.sectorLabel}</span>
                <span className="bg-white/10 text-white/90 font-bold text-xs rounded px-2 py-0.5">IV/HV {c.ivHvRatio.toFixed(1)}x</span>
                {c.ivPercentile != null && c.ivPercentilePrev != null && (
                  <span className="bg-white/10 text-white/90 font-bold text-xs rounded px-2 py-0.5">IV%ile {c.ivPercentilePrev}→{c.ivPercentile}</span>
                )}
                {c.earningsInWin && <span className="bg-white/10 text-white/90 font-bold text-xs rounded px-2 py-0.5">📊 ERN</span>}
              </div>

              {/* Strike suggestions */}
              {c.conservative && (
                <div className="text-sm font-bold text-white/90">
                  🛡 Muhafazakâr: {c.expiry} ${c.conservative.strike}P — prim ${c.conservative.premium.toFixed(2)} (${c.conservative.totalCredit.toFixed(0)}/kontrat) · yıllık %{c.conservative.annualizedYieldPct.toFixed(0)} · tampon %{(c.conservative.buffer * 100).toFixed(0)} · P(assignment) %{c.conservative.pAssign.toFixed(1)}
                  {c.putWall && c.conservative.strike <= c.putWall && <span className="text-emerald-400 ml-2">put wall altı ✓</span>}
                </div>
              )}
              {c.aggressive && (
                <div className="text-sm font-bold text-white/90">
                  ⚡ Agresif: {c.expiry} ${c.aggressive.strike}P — prim ${c.aggressive.premium.toFixed(2)} (${c.aggressive.totalCredit.toFixed(0)}/kontrat) · yıllık %{c.aggressive.annualizedYieldPct.toFixed(0)} · tampon %{(c.aggressive.buffer * 100).toFixed(0)} · P(assignment) %{c.aggressive.pAssign.toFixed(1)}
                </div>
              )}

              {/* Assignment line */}
              {c.conservative && (
                <div className="text-sm font-bold text-white/90">
                  En kötü: ${c.conservative.strike}&apos;dan sahiplik — efektif maliyet ${c.conservative.effectiveCost.toFixed(2)} (bugünden %{(c.conservative.effectiveCostVsSpotPct * 100).toFixed(0)} aşağı)
                </div>
              )}

              {/* Buttons */}
              <div className="flex items-center gap-3">
                <DetayButton content={{
                  title: `${c.ticker} — Anomali Analizi`,
                  logic: `Düşüş: ${(c.triggerDrop * 100).toFixed(1)}% (${c.trigger}) → ${c.sigmaMove.toFixed(1)}σ (${c.trigger} penceresinin σ'sı = HV20·√(${c.triggerDays}/252))\n1g: ${(c.drop1d * 100).toFixed(1)}% · dün: ${(c.prevDayDrop * 100).toFixed(1)}% · 3g: ${(c.drop3d * 100).toFixed(1)}%\nHV20: ${(c.hv20 * 100).toFixed(0)}%\nSektör relatif (${c.trigger}): ${(c.sectorRel * 100).toFixed(1)}% → ${c.sectorLabel}\nIV: %${c.ivPct.toFixed(0)} vs HV20: %${(c.hv20 * 100).toFixed(0)} → IV/HV: ${c.ivHvRatio.toFixed(1)}x\nSkor çarpanı: 5 günlük drawdown ${(c.dd5 * 100).toFixed(1)}% → ×${(1 + Math.abs(c.dd5)).toFixed(2)}\nŞişkin IV = yüksek prim. Çöküş SONRASI korku fiyatlanmış.\nAssignment = plan B: hisseyi iskontolu sahiplenirsin.`,
                  scenarios: [
                    { durum: "Fiyat toparlar", sonuc: `Prim cebinde kalır — yıllık %${c.conservative?.annualizedYieldPct.toFixed(0) ?? "?"} getiri`, renk: "green" },
                    { durum: "Fiyat düşer, strike kırılır", sonuc: `Hisse $${c.conservative?.effectiveCost.toFixed(1) ?? "?"} maliyetle sahiplenilir (bugünden %${((c.conservative?.effectiveCostVsSpotPct ?? 0) * 100).toFixed(0)} iskonto)`, renk: "yellow" },
                    { durum: "Sert düşüş devam eder", sonuc: "Maliyet avantajlı sahiplik, ama kayıp mümkün", renk: "red" },
                  ],
                }} />
                <a href={`/dashboard/signallab/csp-screener?ticker=${c.ticker}${c.putWall ? `&maxStrike=${c.putWall}` : `&maxStrike=${c.conservative?.strike ?? ""}`}`}
                  className="bg-[#ff7200] text-white font-bold rounded-lg px-4 py-2 text-sm hover:bg-[#ff8a2b] transition-colors">
                  CSP Taramasına Gönder →
                </a>
              </div>
            </div>
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
