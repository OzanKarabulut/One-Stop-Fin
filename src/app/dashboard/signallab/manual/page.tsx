"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Calculator, Loader2, Plus, Trash2 } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";

interface LegInput {
  id: number;
  action: "buy" | "sell";
  type: "call" | "put";
  strike: number;
  last: number;
  contracts: number;
}

function generateFridays(): { date: string; label: string }[] {
  const fridays: { date: string; label: string }[] = [];
  const now = new Date();
  for (let i = 1; i < 120 && fridays.length < 10; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    if (d.getUTCDay() === 5) {
      const dateStr = d.toISOString().split("T")[0];
      const label = `${d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} (${i}g)`;
      fridays.push({ date: dateStr, label });
    }
  }
  return fridays;
}

let nextId = 1;

export default function ManualAnalysisPage() {
  const fridays = useMemo(() => generateFridays(), []);
  const [ticker, setTicker] = useState("TSLA");
  const [expiry, setExpiry] = useState(fridays[1]?.date ?? "");
  const [capital, setCapital] = useState(100000);
  const [legs, setLegs] = useState<LegInput[]>([
    { id: nextId++, action: "sell", type: "put", strike: 200, last: 3.5, contracts: 1 },
  ]);
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading, error } = trpc.signallab.manualAnalysis.useQuery(
    { ticker: ticker.toUpperCase(), expiry, legs: legs.map(({ action, type, strike, last, contracts }) => ({ action, type, strike, last, contracts })), capital },
    { enabled: submitted, refetchOnWindowFocus: false },
  );

  const addLeg = () => {
    setLegs([...legs, { id: nextId++, action: "sell", type: "put", strike: 0, last: 0, contracts: 1 }]);
    setSubmitted(false);
  };

  const removeLeg = (id: number) => {
    setLegs(legs.filter((l) => l.id !== id));
    setSubmitted(false);
  };

  const updateLeg = (id: number, field: keyof LegInput, value: string | number) => {
    setLegs(legs.map((l) => l.id === id ? { ...l, [field]: value } : l));
    setSubmitted(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Manuel Analiz</h1>
        <p className="text-sm text-white/50">Custom legs → P&L, Monte Carlo, EV, Kelly, breakevens</p>
      </div>

      {/* Controls */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-white/50">Ticker</label>
            <input type="text" value={ticker} onChange={(e) => { setTicker(e.target.value); setSubmitted(false); }}
              className="w-24 rounded border border-border bg-background px-3 py-1.5 text-sm font-medium uppercase focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-white/50">Vade</label>
            <select value={expiry} onChange={(e) => { setExpiry(e.target.value); setSubmitted(false); }}
              className="rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              {fridays.map((f) => <option key={f.date} value={f.date}>{f.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-white/50">Sermaye ($)</label>
            <input type="number" value={capital} onChange={(e) => { setCapital(Number(e.target.value)); setSubmitted(false); }}
              className="w-28 rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>

        {/* Legs */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-white/50">Legs</span>
            <button onClick={addLeg} className="flex items-center gap-1 text-xs text-[#ff7200] hover:text-[#ff7200]/80">
              <Plus className="h-3 w-3" /> Leg Ekle
            </button>
          </div>
          {legs.map((leg) => (
            <div key={leg.id} className="flex items-center gap-2 text-xs">
              <select value={leg.action} onChange={(e) => updateLeg(leg.id, "action", e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 text-xs">
                <option value="buy">AL</option>
                <option value="sell">SAT</option>
              </select>
              <select value={leg.type} onChange={(e) => updateLeg(leg.id, "type", e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 text-xs">
                <option value="call">CALL</option>
                <option value="put">PUT</option>
              </select>
              <input type="number" value={leg.strike} onChange={(e) => updateLeg(leg.id, "strike", Number(e.target.value))}
                placeholder="Strike" className="w-20 rounded border border-border bg-background px-2 py-1 text-xs" />
              <input type="number" value={leg.last} onChange={(e) => updateLeg(leg.id, "last", Number(e.target.value))}
                placeholder="Fiyat" step="0.01" className="w-20 rounded border border-border bg-background px-2 py-1 text-xs" />
              <input type="number" value={leg.contracts} onChange={(e) => updateLeg(leg.id, "contracts", Number(e.target.value))}
                placeholder="Adet" min={1} className="w-16 rounded border border-border bg-background px-2 py-1 text-xs" />
              <button onClick={() => removeLeg(leg.id)} className="text-white/50 hover:text-red-400">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <button onClick={() => setSubmitted(true)} disabled={isLoading || legs.length === 0}
          className="rounded bg-[#ff7200] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#ff8c3a] disabled:opacity-50 flex items-center gap-2">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
          Analiz Et
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error.message}</p>}

      {data && (
        <div className="space-y-4">
          {/* Results Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="rounded-lg border border-border bg-card p-3 text-center">
              <p className="text-[10px] text-white/50">Net Prim</p>
              <p className={cn("text-sm font-bold", data.netPremium >= 0 ? "text-emerald-400" : "text-red-400")}>${data.netPremium.toFixed(0)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 text-center">
              <p className="text-[10px] text-white/50">Max Kâr</p>
              <p className="text-sm font-bold text-emerald-400">${data.maxProfit.toFixed(0)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 text-center">
              <p className="text-[10px] text-white/50">Max Zarar</p>
              <p className="text-sm font-bold text-red-400">${data.maxLoss.toFixed(0)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 text-center">
              <p className="text-[10px] text-white/50">Kazanma Olasılığı</p>
              <p className="text-sm font-bold text-foreground">{data.mcProbability.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 text-center">
              <p className="text-[10px] text-white/50">EV</p>
              <p className={cn("text-sm font-bold", data.ev >= 0 ? "text-emerald-400" : "text-red-400")}>${data.ev.toFixed(0)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 text-center">
              <p className="text-[10px] text-white/50">Kelly%</p>
              <p className="text-sm font-bold text-foreground">{data.kellyFraction.toFixed(1)}%</p>
            </div>
          </div>

          {/* Additional metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border bg-card p-3 text-center">
              <p className="text-[10px] text-white/50">Vol Edge</p>
              <p className="text-sm font-bold text-yellow-400">{data.volEdge.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 text-center">
              <p className="text-[10px] text-white/50">EV%</p>
              <p className={cn("text-sm font-bold", data.evPct >= 0 ? "text-emerald-400" : "text-red-400")}>{data.evPct.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 text-center">
              <p className="text-[10px] text-white/50">Risk%</p>
              <p className="text-sm font-bold text-red-400">{data.riskPct.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 text-center">
              <p className="text-[10px] text-white/50">Breakevens</p>
              <p className="text-sm font-bold text-foreground">{data.breakevens.map((b) => `$${b.toFixed(1)}`).join(", ") || "—"}</p>
            </div>
          </div>

          {/* P&L Chart */}
          {data.scenarios.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-xs font-bold text-white/50 mb-3">P&L Grafiği</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.scenarios} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="price"
                      tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={10}
                    />
                    <YAxis
                      tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={10}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                      labelFormatter={(v: number) => `Fiyat: $${v.toFixed(2)}`}
                      formatter={(v: number) => [`$${v.toFixed(0)}`, "P&L"]}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                    <ReferenceLine x={data.currentPrice} stroke="hsl(var(--primary))" strokeDasharray="3 3" label={{ value: "Spot", fill: "hsl(var(--primary))", fontSize: 10 }} />
                    <Line
                      type="monotone"
                      dataKey="pnl"
                      stroke="#1af280"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: "#1af280" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* P&L Scenarios Table */}
          {data.scenarios.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-xs font-bold text-white/50 mb-2">Fiyat Senaryoları</h3>
              <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-2">
                {data.scenarios.filter((_, i) => i % 3 === 0).map((s) => (
                  <div key={s.price} className="text-center">
                    <p className="text-[10px] text-white/50">${s.price.toFixed(0)}</p>
                    <p className={cn("text-xs font-bold", s.pnl >= 0 ? "text-emerald-400" : "text-red-400")}>${s.pnl.toFixed(0)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Time Scenarios */}
          {data.timeScenarios && data.timeScenarios.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-xs font-bold text-white/50 mb-3">Zaman Senaryoları</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-white/50">
                      <th className="px-2 py-1.5 text-left font-medium">Gün</th>
                      {data.timeScenarios[0]?.scenarios.map((s, i) => (
                        <th key={i} className="px-2 py-1.5 text-right font-medium">
                          {((s.price / data.currentPrice - 1) * 100).toFixed(0)}%
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.timeScenarios.map((ts) => (
                      <tr key={ts.label} className="border-b border-border/50">
                        <td className="px-2 py-1.5 font-medium text-foreground">{ts.label}</td>
                        {ts.scenarios.map((s, i) => (
                          <td key={i} className={cn("px-2 py-1.5 text-right font-medium", s.pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                            ${s.pnl.toFixed(0)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
