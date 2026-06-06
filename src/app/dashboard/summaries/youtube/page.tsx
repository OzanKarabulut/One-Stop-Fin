"use client";

import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

export default function YouTubeSummariesPage() {
  const { data: videos, isLoading } = trpc.video.list.useQuery({ limit: 30 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">YouTube Özetleri</h1>
        <p className="text-sm text-text-muted">Analiz edilen video özetleri ve hisse bahisleri</p>
      </div>

      {isLoading && <div className="text-center py-10 text-text-muted">Yükleniyor...</div>}

      {videos && videos.length > 0 ? (
        <div className="space-y-3">
          {videos.map((v) => (
            <div key={v.id} className="rounded-lg border border-card-border bg-card-bg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-text-primary">{v.title}</h3>
                  <p className="text-xs text-text-muted mt-0.5">{v.channel.name} • {new Date(v.publishedAt).toLocaleDateString("tr-TR")}</p>
                  {v.summary && <p className="text-xs text-text-muted mt-2 line-clamp-2">{v.summary}</p>}
                </div>
                {v.sentiment && (
                  <span className={cn("text-xs px-2 py-0.5 rounded shrink-0", v.sentiment === "bullish" ? "bg-green-100 text-up" : v.sentiment === "bearish" ? "bg-red-100 text-down" : "bg-gray-100 text-text-muted")}>{v.sentiment}</span>
                )}
              </div>
              {v.stockMentions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {v.stockMentions.map((sm) => (
                    <span key={sm.id} className={cn("text-[10px] px-1.5 py-0.5 rounded", sm.sentiment === "bullish" ? "bg-green-50 text-up" : sm.sentiment === "bearish" ? "bg-red-50 text-down" : "bg-gray-50 text-text-muted")}>
                      ${sm.ticker}
                    </span>
                  ))}
                </div>
              )}
              {v.keyPoints.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {v.keyPoints.slice(0, 3).map((kp) => (
                    <p key={kp.id} className="text-xs text-text-muted">• {kp.point}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : !isLoading ? (
        <div className="text-center py-10 text-text-muted">Henüz video analiz edilmedi. Kanal ekleyerek başlayın.</div>
      ) : null}
    </div>
  );
}
