"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Card } from "@/components/ui/Card";

export default function ManualAnalysisPage() {
  const [symbol, setSymbol] = useState("AAPL");
  const [strike, setStrike] = useState(150);
  const [dte, setDte] = useState(30);

  const { data, isLoading, error, refetch } = trpc.signallab.manualAnalysis.useQuery(
    { symbol, strikePrice: strike, daysToExpiry: dte },
    { enabled: false }
  );

  const handleAnalyze = () => refetch();

  return (
    <div>
      <h1 className="text-lg font-semibold text-text-primary mb-4">Manuel Analiz</h1>
      <Card className="mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-text-muted block mb-1">Sembol</label>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="border border-card-border rounded px-2 py-1 text-sm w-24" />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Strike ($)</label>
            <input type="number" value={strike} onChange={(e) => setStrike(+e.target.value)} className="border border-card-border rounded px-2 py-1 text-sm w-24" />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">DTE (gün)</label>
            <input type="number" value={dte} onChange={(e) => setDte(+e.target.value)} className="border border-card-border rounded px-2 py-1 text-sm w-20" />
          </div>
          <button onClick={handleAnalyze} className="bg-accent text-white px-4 py-1.5 rounded text-sm hover:bg-accent-hover">
            Analiz Et
          </button>
        </div>
      </Card>

      {isLoading && <p className="text-sm text-text-muted">Hesaplanıyor...</p>}
      {error && <p className="text-sm text-down">Hata: {error.message}</p>}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><div className="text-xs text-text-muted">Mevcut Fiyat</div><div className="text-sm font-medium">${data.currentPrice}</div></Card>
          <Card><div className="text-xs text-text-muted">Volatilite</div><div className="text-sm font-medium">{(data.volatility * 100).toFixed(1)}%</div></Card>
          <Card><div className="text-xs text-text-muted">Call Fiyatı</div><div className="text-sm font-medium">${data.callPrice.toFixed(2)}</div></Card>
          <Card><div className="text-xs text-text-muted">Put Fiyatı</div><div className="text-sm font-medium">${data.putPrice.toFixed(2)}</div></Card>
          <Card><div className="text-xs text-text-muted">Call Delta</div><div className="text-sm font-medium">{data.callDelta.toFixed(3)}</div></Card>
          <Card><div className="text-xs text-text-muted">Put Delta</div><div className="text-sm font-medium">{data.putDelta.toFixed(3)}</div></Card>
          <Card><div className="text-xs text-text-muted">Gamma</div><div className="text-sm font-medium">{data.gamma.toFixed(4)}</div></Card>
          <Card><div className="text-xs text-text-muted">Vega</div><div className="text-sm font-medium">{data.vega.toFixed(3)}</div></Card>
        </div>
      )}
    </div>
  );
}
