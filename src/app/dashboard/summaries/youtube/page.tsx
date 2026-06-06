"use client";

import { trpc } from "@/lib/trpc/client";
import { Card } from "@/components/ui/Card";

export default function YouTubeSummariesPage() {
  const { data, isLoading } = trpc.video.list.useQuery({ limit: 20 });

  return (
    <div>
      <h1 className="text-lg font-semibold text-text-primary mb-4">YouTube Özetleri</h1>
      {isLoading && <p className="text-sm text-text-muted">Yükleniyor...</p>}
      {data && data.length === 0 && <p className="text-sm text-text-muted">Henüz işlenmiş video yok.</p>}
      {data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((video) => (
            <Card key={video.id}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-text-primary">{video.title}</h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                    <span>{video.channel.name}</span>
                    <span>•</span>
                    <span>{new Date(video.publishedAt).toLocaleDateString("tr-TR")}</span>
                  </div>
                  {video.summary && <p className="text-xs text-text-muted mt-2 line-clamp-2">{video.summary}</p>}
                </div>
                {video.sentiment && (
                  <span className={`text-xs px-2 py-0.5 rounded ml-2 ${
                    video.sentiment === "bullish" ? "bg-up/10 text-up" :
                    video.sentiment === "bearish" ? "bg-down/10 text-down" : "bg-gray-100 text-text-muted"
                  }`}>
                    {video.sentiment}
                  </span>
                )}
              </div>
              {video.stockMentions.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {video.stockMentions.map((m) => (
                    <span key={m.id} className="text-[10px] bg-page-bg px-1.5 py-0.5 rounded">{m.ticker}</span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
