"use client";

import { trpc } from "@/lib/trpc/client";
import { SummaryCard } from "@/components/ui/SummaryCard";

export default function HomePage() {
  const { data: market } = trpc.signallab.marketOverview.useQuery();
  const { data: signals } = trpc.signal.leaders.useQuery();
  const { data: videos } = trpc.video.recent.useQuery();
  const { data: watchlist } = trpc.watchlist.list.useQuery();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-white mb-4">Ana Sayfa</h1>

      {/* Market index strip */}
      {market && (
        <div className="flex gap-4 overflow-x-auto py-2 mb-4">
          {market.indices.map((idx) => (
            <div key={idx.symbol} className="flex items-center gap-2 text-sm font-bold whitespace-nowrap">
              <span className="font-bold text-white">{idx.name}</span>
              <span className={idx.changePct >= 0 ? "text-up" : "text-down"}>
                {idx.changePct >= 0 ? "+" : ""}{idx.changePct.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Piyasa Sinyalleri */}
        <SummaryCard title="Piyasa Sinyalleri" href="/dashboard/signallab/market-overview" loading={!market} empty={!market?.indices?.length}>
          <div className="space-y-1">
            {market?.indices.map((m) => (
              <div key={m.symbol} className="flex justify-between text-xs font-bold">
                <span>{m.name}</span>
                <span className={m.changePct >= 0 ? "text-up" : "text-down"}>
                  {m.changePct >= 0 ? "+" : ""}{m.changePct.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </SummaryCard>

        {/* Sinyal Liderleri */}
        <SummaryCard title="Sinyal Liderleri" href="/dashboard/signal-leaders" loading={!signals} empty={!signals?.bullish?.length && !signals?.bearish?.length}>
          <div className="space-y-1">
            {signals?.bullish?.slice(0, 5).map((s) => (
              <div key={s.id} className="flex justify-between text-xs font-bold">
                <span className="font-bold">{s.ticker}</span>
                <span className="text-up">
                  {s.signal} ({s.score.toFixed(2)})
                </span>
              </div>
            ))}
          </div>
        </SummaryCard>

        {/* Son Video Özetleri */}
        <SummaryCard title="Son Video Özetleri" href="/dashboard/summaries/youtube" loading={!videos} empty={!videos?.length}>
          <div className="space-y-1">
            {videos?.slice(0, 4).map((v) => (
              <div key={v.id} className="text-xs font-bold truncate">
                <span className="font-bold">{v.title.slice(0, 40)}</span>
                {v.sentiment && (
                  <span className={`ml-1 ${v.sentiment === "bullish" ? "text-up" : v.sentiment === "bearish" ? "text-down" : ""}`}>
                    [{v.sentiment}]
                  </span>
                )}
              </div>
            ))}
          </div>
        </SummaryCard>

        {/* İzleme Listesi */}
        <SummaryCard title="İzleme Listesi" href="/dashboard/signallab/watchlist" loading={!watchlist} empty={!watchlist?.length}>
          <div className="space-y-1">
            {watchlist?.slice(0, 5).map((w) => (
              <div key={w.ticker} className="flex justify-between text-xs font-bold">
                <span className="font-bold">{w.ticker}</span>
                <span className="text-white/90">{w.name || ""}</span>
              </div>
            ))}
          </div>
        </SummaryCard>

        {/* VIX / Fear & Greed */}
        <SummaryCard title="VIX & Fear/Greed" href="/dashboard/signallab/market-overview" loading={!market} empty={!market}>
          {market && (
            <div className="space-y-1 text-xs font-bold">
              <div className="flex justify-between">
                <span>VIX</span>
                <span className={market.vix > 25 ? "text-down" : "text-up"}>{market.vix.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Fear & Greed</span>
                <span>{market.fearGreed.value} — {market.fearGreed.classification}</span>
              </div>
            </div>
          )}
        </SummaryCard>

        {/* CSP Tarayıcı */}
        <SummaryCard title="CSP Tarayıcı" href="/dashboard/signallab/csp-screener" loading={false} empty={false}>
          <p className="text-xs font-bold text-white/90">Put satış fırsatlarını tara →</p>
        </SummaryCard>
      </div>
    </div>
  );
}
