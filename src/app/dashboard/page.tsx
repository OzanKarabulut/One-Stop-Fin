"use client";

import { trpc } from "@/lib/trpc/client";
import { IndexStrip } from "@/components/ui/IndexStrip";
import { SummaryCard } from "@/components/ui/SummaryCard";

export default function HomePage() {
  const { data: market } = trpc.signallab.marketOverview.useQuery();
  const { data: signals } = trpc.signal.leaders.useQuery();
  const { data: csp } = trpc.signallab.cspScreener.useQuery({ maxDte: 45 });
  const { data: videos } = trpc.video.recent.useQuery();
  const { data: watchlist } = trpc.watchlist.list.useQuery();
  const { data: aiPicks } = trpc.signallab.aiPick.useQuery();

  const indexItems = (market || []).map((m) => ({
    symbol: m.symbol,
    price: m.price,
    change: m.changePct,
  }));

  return (
    <div>
      <h1 className="text-lg font-semibold text-text-primary mb-2">Ana Sayfa</h1>
      <IndexStrip items={indexItems} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Piyasa Sinyalleri */}
        <SummaryCard title="Piyasa Sinyalleri" href="/dashboard/signallab/market-overview" loading={!market} empty={!market?.length}>
          <div className="space-y-1">
            {market?.slice(0, 4).map((m) => (
              <div key={m.symbol} className="flex justify-between text-xs">
                <span>{m.name}</span>
                <span className={m.changePct >= 0 ? "text-up" : "text-down"}>
                  {m.changePct >= 0 ? "+" : ""}{m.changePct}%
                </span>
              </div>
            ))}
          </div>
        </SummaryCard>

        {/* Sinyal Liderleri */}
        <SummaryCard title="Sinyal Liderleri" href="/dashboard/signal-leaders" loading={!signals} empty={!signals?.length}>
          <div className="space-y-1">
            {signals?.slice(0, 5).map((s) => (
              <div key={s.id} className="flex justify-between text-xs">
                <span className="font-medium">{s.ticker}</span>
                <span className={s.score > 0 ? "text-up" : "text-down"}>
                  {s.signal} ({s.score.toFixed(2)})
                </span>
              </div>
            ))}
          </div>
        </SummaryCard>

        {/* CSP Tarayıcı */}
        <SummaryCard title="CSP Tarayıcı (Bugün)" href="/dashboard/signallab/csp-screener" loading={!csp} empty={!csp?.length}>
          <div className="space-y-1">
            {csp?.slice(0, 4).map((row, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span>{row.symbol} ${row.strike}</span>
                <span className="text-up">{row.annualized}% yıllık</span>
              </div>
            ))}
          </div>
        </SummaryCard>

        {/* Son Video Özetleri */}
        <SummaryCard title="Son Video Özetleri" href="/dashboard/summaries/youtube" loading={!videos} empty={!videos?.length}>
          <div className="space-y-1">
            {videos?.slice(0, 4).map((v) => (
              <div key={v.id} className="text-xs truncate">
                <span className="font-medium">{v.title.slice(0, 40)}</span>
                {v.sentiment && (
                  <span className={`ml-1 ${v.sentiment === "bullish" ? "text-up" : v.sentiment === "bearish" ? "text-down" : ""}`}>
                    [{v.sentiment}]
                  </span>
                )}
              </div>
            ))}
          </div>
        </SummaryCard>

        {/* Earnings / AI Picks */}
        <SummaryCard title="Earnings" href="/dashboard/signallab/ai-strategy" loading={!aiPicks} empty={!aiPicks?.length}>
          <div className="space-y-1">
            {aiPicks?.slice(0, 4).map((p) => (
              <div key={p.symbol} className="flex justify-between text-xs">
                <span>{p.symbol}</span>
                <span className={p.change >= 0 ? "text-up" : "text-down"}>
                  {p.change >= 0 ? "+" : ""}{p.change}%
                </span>
              </div>
            ))}
          </div>
        </SummaryCard>

        {/* İzleme Listesi */}
        <SummaryCard title="İzleme Listesi" href="/dashboard/signallab/watchlist" loading={!watchlist} empty={!watchlist?.length}>
          <div className="space-y-1">
            {watchlist?.slice(0, 5).map((w) => (
              <div key={w.ticker} className="flex justify-between text-xs">
                <span className="font-medium">{w.ticker}</span>
                {w.change !== undefined && w.change !== null && (
                  <span className={w.change >= 0 ? "text-up" : "text-down"}>
                    {w.change >= 0 ? "+" : ""}{w.change.toFixed(2)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </SummaryCard>
      </div>
    </div>
  );
}
