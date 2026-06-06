"use client";

import { trpc } from "@/lib/trpc/client";
import { Card } from "@/components/ui/Card";

export default function SignalLeadersPage() {
  const { data: leaders, isLoading: loadingLeaders } = trpc.signal.leaders.useQuery();
  const { data: heatmap, isLoading: loadingHeatmap } = trpc.signal.heatmap.useQuery();

  return (
    <div>
      <h1 className="text-lg font-semibold text-text-primary mb-4">Sinyal Liderleri</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h2 className="text-sm font-semibold mb-2">En Güçlü Sinyaller</h2>
          {loadingLeaders && <p className="text-xs text-text-muted">Yükleniyor...</p>}
          {leaders && leaders.length === 0 && <p className="text-xs text-text-muted">Sinyal yok.</p>}
          {leaders && leaders.length > 0 && (
            <div className="space-y-2">
              {leaders.map((s) => (
                <Card key={s.id} className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">{s.ticker}</span>
                    <span className="ml-2 text-xs text-text-muted">{s.sources} kaynak</span>
                  </div>
                  <span className={`text-xs font-medium ${s.score > 0 ? "text-up" : s.score < 0 ? "text-down" : "text-text-muted"}`}>
                    {s.signal} ({s.score.toFixed(2)})
                  </span>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm font-semibold mb-2">Isı Haritası</h2>
          {loadingHeatmap && <p className="text-xs text-text-muted">Yükleniyor...</p>}
          {heatmap && heatmap.length === 0 && <p className="text-xs text-text-muted">Veri yok.</p>}
          {heatmap && heatmap.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {heatmap.map((h) => (
                <div
                  key={h.ticker}
                  className={`p-2 rounded text-center text-xs font-medium ${
                    h.avgScore > 0.3 ? "bg-up/20 text-up" :
                    h.avgScore < -0.3 ? "bg-down/20 text-down" : "bg-gray-100 text-text-muted"
                  }`}
                >
                  <div>{h.ticker}</div>
                  <div className="text-[10px]">{h.avgScore.toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
