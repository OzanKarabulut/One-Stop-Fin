"use client";

import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

export default function OverviewPage() {
  const { data: channels } = trpc.channel.list.useQuery();
  const { data: videos } = trpc.video.list.useQuery({ limit: 10 });
  const { data: leaders } = trpc.signal.leaders.useQuery();
  const { data: heatmap } = trpc.signal.heatmap.useQuery();

  const channelCount = channels?.length ?? 0;
  const videoCount = videos?.length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Genel Bakış</h1>
        <p className="text-sm text-text-muted">Kanal, video ve sinyal özeti</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-card-border bg-card-bg p-4">
          <p className="text-xs text-text-muted">Aktif Kanallar</p>
          <p className="text-2xl font-bold text-text-primary">{channelCount}</p>
        </div>
        <div className="rounded-lg border border-card-border bg-card-bg p-4">
          <p className="text-xs text-text-muted">Analiz Edilen Videolar</p>
          <p className="text-2xl font-bold text-text-primary">{videoCount}</p>
        </div>
        <div className="rounded-lg border border-card-border bg-card-bg p-4">
          <p className="text-xs text-text-muted">Aktif Sinyaller</p>
          <p className="text-2xl font-bold text-text-primary">{heatmap?.length ?? 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Signal Leaders */}
        <div className="rounded-lg border border-card-border bg-card-bg p-4">
          <h2 className="font-bold text-text-primary mb-3">Sinyal Liderleri</h2>
          {leaders && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-text-muted mb-2">📈 Yükseliş</p>
                {leaders.bullish.slice(0, 5).map((s) => (
                  <div key={s.ticker} className="flex justify-between text-xs py-1">
                    <span className="font-medium">{s.ticker}</span>
                    <span className="text-up">{(s.score * 100).toFixed(0)}%</span>
                  </div>
                ))}
                {leaders.bullish.length === 0 && <p className="text-xs text-text-muted">Henüz veri yok</p>}
              </div>
              <div>
                <p className="text-xs text-text-muted mb-2">📉 Düşüş</p>
                {leaders.bearish.slice(0, 5).map((s) => (
                  <div key={s.ticker} className="flex justify-between text-xs py-1">
                    <span className="font-medium">{s.ticker}</span>
                    <span className="text-down">{(s.score * 100).toFixed(0)}%</span>
                  </div>
                ))}
                {leaders.bearish.length === 0 && <p className="text-xs text-text-muted">Henüz veri yok</p>}
              </div>
            </div>
          )}
        </div>

        {/* Heatmap */}
        <div className="rounded-lg border border-card-border bg-card-bg p-4">
          <h2 className="font-bold text-text-primary mb-3">Sinyal Haritası</h2>
          {heatmap && heatmap.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {heatmap.slice(0, 20).map((cell) => (
                <div key={cell.ticker} className={cn("rounded px-2 py-1 text-xs font-medium", cell.score > 0.2 ? "bg-green-100 text-up" : cell.score < -0.2 ? "bg-red-100 text-down" : "bg-gray-100 text-text-muted")}>
                  {cell.ticker} ({cell.count})
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted">Henüz veri yok</p>
          )}
        </div>
      </div>

      {/* Recent Videos */}
      <div className="rounded-lg border border-card-border bg-card-bg p-4">
        <h2 className="font-bold text-text-primary mb-3">Son Analiz Edilen Videolar</h2>
        {videos && videos.length > 0 ? (
          <div className="space-y-2">
            {videos.slice(0, 8).map((v) => (
              <div key={v.id} className="flex items-center justify-between py-1 border-b border-card-border/50 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">{v.title}</p>
                  <p className="text-xs text-text-muted">{v.channel.name} • {new Date(v.publishedAt).toLocaleDateString("tr-TR")}</p>
                </div>
                {v.sentiment && (
                  <span className={cn("text-xs px-2 py-0.5 rounded ml-2", v.sentiment === "bullish" ? "bg-green-100 text-up" : v.sentiment === "bearish" ? "bg-red-100 text-down" : "bg-gray-100 text-text-muted")}>{v.sentiment}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted">Henüz video analiz edilmedi.</p>
        )}
      </div>
    </div>
  );
}
