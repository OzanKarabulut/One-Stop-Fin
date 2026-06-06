"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Card } from "@/components/ui/Card";
import { Plus, Trash2 } from "lucide-react";

export default function WatchlistPage() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.watchlist.list.useQuery();
  const addMutation = trpc.watchlist.add.useMutation({ onSuccess: () => utils.watchlist.list.invalidate() });
  const removeMutation = trpc.watchlist.remove.useMutation({ onSuccess: () => utils.watchlist.list.invalidate() });
  const [ticker, setTicker] = useState("");

  const handleAdd = () => {
    if (!ticker.trim()) return;
    addMutation.mutate({ ticker: ticker.trim() });
    setTicker("");
  };

  return (
    <div>
      <h1 className="text-lg font-semibold text-text-primary mb-4">İzleme Listesi</h1>
      <Card className="mb-4">
        <div className="flex gap-2">
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Sembol ekle..."
            className="border border-card-border rounded px-2 py-1 text-sm flex-1"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <button onClick={handleAdd} className="bg-accent text-white px-3 py-1 rounded text-sm hover:bg-accent-hover flex items-center gap-1">
            <Plus size={14} /> Ekle
          </button>
        </div>
      </Card>

      {isLoading && <p className="text-sm text-text-muted">Yükleniyor...</p>}
      {data && data.length === 0 && <p className="text-sm text-text-muted">İzleme listesi boş.</p>}
      {data && data.length > 0 && (
        <div className="space-y-2">
          {data.map((item) => (
            <Card key={item.ticker} className="flex items-center justify-between">
              <div>
                <span className="font-medium text-sm">{item.ticker}</span>
                {item.price && <span className="ml-3 text-sm text-text-muted">${item.price.toFixed(2)}</span>}
                {item.change !== undefined && item.change !== null && (
                  <span className={`ml-2 text-xs ${item.change >= 0 ? "text-up" : "text-down"}`}>
                    {item.change >= 0 ? "+" : ""}{item.change.toFixed(2)}%
                  </span>
                )}
              </div>
              <button onClick={() => removeMutation.mutate({ ticker: item.ticker })} className="text-text-muted hover:text-down">
                <Trash2 size={14} />
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
