"use client";

import { trpc } from "@/lib/trpc/client";
import { Card } from "@/components/ui/Card";

export default function OverviewPage() {
  const { data: signals } = trpc.signal.latest.useQuery();
  const { data: videos } = trpc.video.recent.useQuery();

  return (
    <div>
      <h1 className="text-lg font-semibold text-text-primary mb-4">Genel Bakış</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-sm font-semibold mb-2">Son Sinyaller</h3>
          {!signals || signals.length === 0 ? (
            <p className="text-xs text-text-muted">Henüz sinyal yok.</p>
          ) : (
            <div className="space-y-1">
              {signals.slice(0, 8).map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs">
                  <span className="font-medium">{s.ticker}</span>
                  <span className={s.signal === "BUY" ? "text-up" : s.signal === "SELL" ? "text-down" : "text-text-muted"}>
                    {s.signal} ({s.score.toFixed(2)})
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-sm font-semibold mb-2">Son Videolar</h3>
          {!videos || videos.length === 0 ? (
            <p className="text-xs text-text-muted">Henüz video yok.</p>
          ) : (
            <div className="space-y-1">
              {videos.map((v) => (
                <div key={v.id} className="text-xs">
                  <span className="font-medium">{v.title.slice(0, 50)}</span>
                  {v.sentiment && (
                    <span className={`ml-1 ${v.sentiment === "bullish" ? "text-up" : v.sentiment === "bearish" ? "text-down" : "text-text-muted"}`}>
                      [{v.sentiment}]
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
