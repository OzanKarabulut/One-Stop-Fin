"use client";

import { trpc } from "@/lib/trpc/client";

export default function CSPScreenerPage() {
  const { data, isLoading, error } = trpc.signallab.cspScreener.useQuery({ maxDte: 45 });

  return (
    <div>
      <h1 className="text-lg font-semibold text-text-primary mb-4">CSP Tarayıcı</h1>
      {isLoading && <p className="text-sm text-text-muted">Yükleniyor...</p>}
      {error && <p className="text-sm text-down">Hata: {error.message}</p>}
      {data && data.length === 0 && <p className="text-sm text-text-muted">Sonuç bulunamadı.</p>}
      {data && data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-card-border text-left text-text-muted">
                <th className="py-2 px-2">Sembol</th>
                <th className="py-2 px-2">Fiyat</th>
                <th className="py-2 px-2">Strike</th>
                <th className="py-2 px-2">Bid</th>
                <th className="py-2 px-2">DTE</th>
                <th className="py-2 px-2">Getiri %</th>
                <th className="py-2 px-2">Yıllık %</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-b border-card-border hover:bg-page-bg">
                  <td className="py-2 px-2 font-medium">{row.symbol}</td>
                  <td className="py-2 px-2">${row.price}</td>
                  <td className="py-2 px-2">${row.strike}</td>
                  <td className="py-2 px-2">${row.bid}</td>
                  <td className="py-2 px-2">{row.dte}g</td>
                  <td className="py-2 px-2 text-up">{row.returnPct}%</td>
                  <td className="py-2 px-2 text-up font-medium">{row.annualized}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
