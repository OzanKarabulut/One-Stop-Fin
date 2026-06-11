"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { DetayButton } from "@/components/ui/DetailPanel";
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";

export default function ForecastCenterPage() {
  const [ticker, setTicker] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [mode, setMode] = useState<"single" | "week" | "range">("single");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [queryInput, setQueryInput] = useState<{ ticker: string; targetDate: string; mode: "single" | "week" } | null>(null);

  const { data, error, isFetching, refetch } = trpc.signallab.forecast.useQuery(
    queryInput!,
    { enabled: false, refetchOnWindowFocus: false },
  );

  const handleSubmit = () => {
    if (!ticker) return;
    if (mode === "single" && !targetDate) return;
    if (mode === "range" && (!rangeStart || !rangeEnd)) return;
    const effectiveDate = mode === "single" ? targetDate : mode === "range" ? rangeEnd : new Date().toISOString().slice(0, 10);
    const effectiveMode = mode === "range" ? "week" as const : mode === "single" ? "single" as const : "week" as const;
    setQueryInput({ ticker: ticker.toUpperCase(), targetDate: effectiveDate, mode: effectiveMode });
    setTimeout(() => refetch(), 0);
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header Controls */}
      <div className="rounded-lg border border-white/10 bg-[#101013] p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="TICKER"
            className="rounded-lg bg-[#1a1a1f] border border-white/10 px-3 py-2 font-bold text-white/90 w-28 uppercase"
          />
          <div className="flex gap-1">
            <button onClick={() => setMode("single")}
              className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${mode === "single" ? "bg-[#ff7200] text-white" : "bg-white/10 text-white/90"}`}>
              Tek Gün
            </button>
            <button onClick={() => setMode("week")}
              className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${mode === "week" ? "bg-[#ff7200] text-white" : "bg-white/10 text-white/90"}`}>
              1 Haftalık
            </button>
            <button onClick={() => setMode("range")}
              className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${mode === "range" ? "bg-[#ff7200] text-white" : "bg-white/10 text-white/90"}`}>
              Aralık
            </button>
          </div>
          {mode === "single" && (
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              style={{ colorScheme: "dark" }}
              className="rounded-lg bg-[#1a1a1f] border border-white/10 px-3 py-2 font-bold text-white/90 cursor-pointer"
            />
          )}
          {mode === "range" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                style={{ colorScheme: "dark" }}
                className="rounded-lg bg-[#1a1a1f] border border-white/10 px-3 py-2 font-bold text-white/90 cursor-pointer"
              />
              <span className="text-sm font-bold text-white/90">→</span>
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                style={{ colorScheme: "dark" }}
                className="rounded-lg bg-[#1a1a1f] border border-white/10 px-3 py-2 font-bold text-white/90 cursor-pointer"
              />
            </div>
          )}
          <button
            onClick={handleSubmit}
            disabled={isFetching || !ticker || (mode === "single" && !targetDate)}
            className="bg-[#ff7200] text-white font-bold rounded-lg px-5 py-2 hover:bg-[#ff8a2b] transition-colors disabled:opacity-50"
          >
            {isFetching ? "Hesaplanıyor..." : "Hesapla"}
          </button>
        </div>
        {error && <p className="mt-2 text-red-400 font-bold text-sm">{error.message}</p>}
      </div>

      {/* ═══ WEEK MODE RESULTS ═══ */}
      {data && data.mode === "week" && (
        <>
          {/* Cone Charts: 2/5 simple price path + 3/5 band chart */}
          <div className="grid grid-cols-5 gap-3">
            {/* Left 2/5: Simple price line (no band, just daily points) */}
            <div className="col-span-2 rounded-lg border border-white/10 bg-[#101013] p-3">
              <div className="font-bold text-white text-xs mb-2">Fiyat Yolu</div>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={data.days.map(d => ({ date: d.date.slice(8), point: d.point.price }))} margin={{ top: 25, right: 30, bottom: 10, left: 10 }}>
                  <XAxis dataKey="date" tick={{ fill: "#fff", fontSize: 11, fontWeight: "bold" }} axisLine={{ stroke: "#fff", strokeWidth: 2 }} tickLine={{ stroke: "#fff" }} />
                  <YAxis domain={[(dataMin: number) => Math.floor(dataMin * 0.995), (dataMax: number) => Math.ceil(dataMax * 1.005)]} tick={{ fill: "#fff", fontSize: 11, fontWeight: "bold" }} width={45} axisLine={{ stroke: "#fff", strokeWidth: 2 }} tickLine={{ stroke: "#fff" }} />
                  <Line type="monotone" dataKey="point" stroke="#ff7200" strokeWidth={3} dot={{ fill: "#ffffff", r: 5, strokeWidth: 2, stroke: "#ff7200" }} label={({ x, y, value, index }: { x: number; y: number; value: number; index: number }) => (<text x={index === 0 ? x + 23 : x} y={y - 10} fill="#ffffff" fontSize={12} fontWeight="bold" textAnchor="middle">${value.toFixed(1)}</text>)} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Right 3/5: Full band chart */}
            <div className="col-span-3 rounded-lg border border-white/10 bg-[#101013] p-3">
              <div className="font-bold text-white text-xs mb-2">1σ Bant + Yapısal Seviyeler</div>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={data.days.map(d => ({ date: d.date.slice(8), lower: d.band[0], upper: d.band[1], point: d.point.price }))} margin={{ top: 25, right: 20, bottom: 10, left: 20 }}>
                  <XAxis dataKey="date" tick={{ fill: "#fff", fontSize: 11, fontWeight: "bold" }} axisLine={{ stroke: "#fff", strokeWidth: 2 }} tickLine={{ stroke: "#fff" }} />
                  <YAxis domain={[(dataMin: number) => Math.floor(dataMin * 0.98), (dataMax: number) => Math.ceil(dataMax * 1.02)]} tick={{ fill: "#fff", fontSize: 11, fontWeight: "bold" }} axisLine={{ stroke: "#fff", strokeWidth: 2 }} tickLine={{ stroke: "#fff" }} />
                  <Tooltip contentStyle={{ background: "#1a1a1f", border: "1px solid rgba(255,255,255,0.1)", fontWeight: "bold" }} />
                  <Area type="monotone" dataKey="upper" stroke="none" fill="#ff720030" />
                  <Area type="monotone" dataKey="lower" stroke="none" fill="#101013" />
                  <Line type="monotone" dataKey="upper" stroke="#ffffff" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                  <Line type="monotone" dataKey="lower" stroke="#ffffff" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                  <Line type="monotone" dataKey="point" stroke="#ff7200" strokeWidth={2} dot={{ fill: "#ffffff", r: 4, strokeWidth: 2, stroke: "#ff7200" }} label={({ x, y, value, index }: { x: number; y: number; value: number; index: number }) => (<text x={index === 0 ? x + 23 : x} y={y - 10} fill="#ffffff" fontSize={12} fontWeight="bold" textAnchor="middle">${value.toFixed(1)}</text>)} />
                  {data.gex.putWall && <ReferenceLine y={data.gex.putWall} stroke="#ef4444" strokeDasharray="3 3" ifOverflow="discard" label={{ value: "PW", fill: "#ff6b6b", fontSize: 11, fontWeight: "900", position: "insideTopRight" }} />}
                  {data.gex.callWall && <ReferenceLine y={data.gex.callWall} stroke="#22c55e" strokeDasharray="3 3" ifOverflow="discard" label={{ value: "CW", fill: "#4ade80", fontSize: 11, fontWeight: "900", position: "insideTopRight" }} />}
                  {data.days.map((d, i) => d.events.length > 0 ? <ReferenceLine key={`ev-${i}`} x={d.date.slice(8)} stroke="#fbbf24" strokeDasharray="2 2" /> : null)}
                  {data.days.map((d, i) => d.isExpiryDay ? <ReferenceLine key={`exp-${i}`} x={d.date.slice(8)} stroke="#a855f7" strokeDasharray="4 2" label={{ value: "OPEX", fill: "#c084fc", fontSize: 10, fontWeight: "900", position: "top", offset: 12 }} /> : null)}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 5-row table */}
          <div className="rounded-lg border border-white/10 bg-[#101013] p-4">
            <div className="font-bold text-white/90 text-sm mb-2">Günlük Detay</div>
            <table className="w-full text-xs font-bold">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-1 text-white/90">Gün</th>
                  <th className="text-right py-1 text-white/90">Model Tahmini</th>
                  <th className="text-right py-1 text-white/90">1σ Bant</th>
                  <th className="text-right py-1 text-white/90">Bileşenler</th>
                  <th className="text-left py-1 pl-3 text-white/90">Olaylar</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((d, i) => (
                  <tr key={i} className={`border-b border-white/5 ${d.isExpiryDay ? "bg-purple-500/10" : ""}`}>
                    <td className="py-1.5 text-white/90">{d.date}</td>
                    <td className="text-right py-1.5 text-white">${d.point.price.toFixed(2)}</td>
                    <td className="text-right py-1.5 text-white/90">${d.band[0].toFixed(2)} — ${d.band[1].toFixed(2)}</td>
                    <td className="text-right py-1.5 text-white/70">
                      Skew:{d.point.skewComponent >= 0 ? "+" : ""}{d.point.skewComponent.toFixed(2)}
                      {d.isExpiryDay && <span className="ml-1 text-purple-300">Pin:{d.point.pinComponent >= 0 ? "+" : ""}{d.point.pinComponent.toFixed(2)}</span>}
                    </td>
                    <td className="text-left py-1.5 pl-3 text-yellow-300/90">
                      {d.events.map(e => e.name).join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Honesty Box */}
          <div className="rounded-lg border-2 border-yellow-500/50 bg-yellow-500/5 p-4">
            <p className="text-xs font-bold text-yellow-300/90">
              ⚠️ Bu tahmin yalnızca mekanik bir modeldir; piyasa koşullarını garanti etmez. Opsiyon piyasasından türetilen volatilite ile lognormal dağılım kullanılır. Gerçek sonuçlar modellerden sapabilir. Yatırım tavsiyesi değildir. 5 günlük tahminler aynı IV fotoğrafından üretilmiştir — birbirleriyle koreledir ve her sabah yenilenmeleri gerekir.
            </p>
          </div>

          {/* Calibration */}
          {data.calibration.count > 0 && (
            <div className="rounded-lg border border-white/10 bg-[#101013] p-4">
              <div className="font-bold text-white/90 text-sm mb-2">Kalibrasyon ({data.calibration.count} tahmin)</div>
              <div className="grid grid-cols-3 gap-4 text-center text-xs font-bold">
                <div><div className="text-white/60">Ortalama Z</div><div className="text-white">{data.calibration.meanZ.toFixed(3)}</div></div>
                <div><div className="text-white/60">Std Z</div><div className="text-white">{data.calibration.stdZ.toFixed(3)}</div></div>
                <div><div className="text-white/60">Ort |Z|</div><div className="text-white">{data.calibration.meanAbsZ.toFixed(3)}</div></div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ SINGLE MODE RESULTS ═══ */}
      {data && data.mode === "single" && (
        <>
          {/* Point Forecast Strip */}
          <div className="rounded-lg border border-white/10 bg-[#101013] p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <span className="text-white/60 font-bold text-sm">Nokta Tahmin</span>
                <div className="text-3xl font-bold text-white">${data.point.price.toFixed(2)}</div>
              </div>
              <div className="text-sm font-bold text-white/90 space-y-0.5">
                <div>Medyan: ${data.point.median.toFixed(2)}</div>
                <div>Skew: {data.point.skewComponent >= 0 ? "+" : ""}{data.point.skewComponent.toFixed(2)}</div>
                <div>Pin: {data.point.pinComponent >= 0 ? "+" : ""}{data.point.pinComponent.toFixed(2)}</div>
              </div>
              <div className="text-sm font-bold text-white/70">
                1σ Bant: ${data.quantiles.p25.toFixed(2)} — ${data.quantiles.p75.toFixed(2)}
              </div>
              <DetayButton content={{
                title: "Nokta Tahmin Decomposizyonu",
                logic: `Medyan (log-normal ortanca) + Skew bileşeni (put/call IV farkı) + Pin bileşeni (gamma pinning etkisi).\nσ↑=${(data.dist.sigmaUp*100).toFixed(1)}% σ↓=${(data.dist.sigmaDown*100).toFixed(1)}% T=${data.dist.T.toFixed(3)}`,
                scenarios: [
                  { durum: "Spot > Tahmin", sonuc: "Yukarı momentum / call tarafı baskın", renk: "green" },
                  { durum: "Spot < Tahmin", sonuc: "Aşağı baskı / put tarafı baskın", renk: "red" },
                  { durum: "Pin etkisi yüksek", sonuc: "Vade günü strike'a yapışma olasılığı", renk: "yellow" },
                ],
              }} />
            </div>
          </div>

          {/* Cone Chart */}
          {data.cone.length > 0 && (
            <div className="rounded-lg border border-white/10 bg-[#101013] p-4">
              <div className="font-bold text-white/90 text-sm mb-2">Volatilite Konisi (1σ Bandı)</div>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={data.cone} margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
                  <XAxis dataKey="date" tick={{ fill: "#aaa", fontSize: 10, fontWeight: "bold" }} angle={-45} textAnchor="end" height={50} />
                  <YAxis domain={[(dataMin: number) => Math.floor(dataMin * 0.98), (dataMax: number) => Math.ceil(dataMax * 1.02)]} tick={{ fill: "#aaa", fontSize: 11, fontWeight: "bold" }} />
                  <Tooltip contentStyle={{ background: "#1a1a1f", border: "1px solid rgba(255,255,255,0.1)", fontWeight: "bold" }} />
                  <Area type="monotone" dataKey="upper" stroke="none" fill="#ff720030" />
                  <Area type="monotone" dataKey="lower" stroke="none" fill="#101013" />
                  <Line type="monotone" dataKey="median" stroke="#ff7200" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="upper" stroke="#ff720080" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="lower" stroke="#ff720080" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                  {data.gex.putWall && <ReferenceLine y={data.gex.putWall} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "PW", fill: "#ef4444", fontSize: 10, fontWeight: "bold" }} />}
                  {data.gex.callWall && <ReferenceLine y={data.gex.callWall} stroke="#22c55e" strokeDasharray="3 3" label={{ value: "CW", fill: "#22c55e", fontSize: 10, fontWeight: "bold" }} />}
                  {data.events.map((ev, i) => {
                    const coneEntry = data.cone.find(c => c.date === ev.date);
                    return coneEntry ? <ReferenceLine key={i} x={ev.date} stroke="#fbbf24" strokeDasharray="2 2" /> : null;
                  })}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Two-column grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* LEFT: Probability Ladder */}
            <div className="rounded-lg border border-white/10 bg-[#101013] p-4">
              <div className="font-bold text-white/90 text-sm mb-2">Olasılık Merdiveni</div>
              <table className="w-full text-xs font-bold">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-1 text-white">Seviye</th>
                    <th className="text-right py-1 text-white">P(Altında)</th>
                    <th className="text-right py-1 text-white">P(Üstünde)</th>
                    <th className="text-right py-1 text-white">Duvar</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ladder.map((l, i) => (
                    <tr key={i} className={`border-b border-white/5 ${l.strike < data.spot ? "text-red-300" : "text-emerald-300"}`}>
                      <td className="py-1">${l.strike.toFixed(1)}</td>
                      <td className="text-right py-1">{(l.probBelow * 100).toFixed(1)}%</td>
                      <td className="text-right py-1">{(l.probAbove * 100).toFixed(1)}%</td>
                      <td className="text-right py-1">{l.isWall ? (l.wallType === "put" ? "🟥 PW" : "🟩 CW") : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* RIGHT: Percentiles + Interpretation */}
            <div className="space-y-4">
              <div className="rounded-lg border border-white/10 bg-[#101013] p-4">
                <div className="font-bold text-white/90 text-sm mb-2">Persentiller</div>
                <div className="grid grid-cols-5 gap-2 text-center text-xs font-bold">
                  {(["p10", "p25", "p50", "p75", "p90"] as const).map(k => (
                    <div key={k}>
                      <div className="text-white/60">{k.toUpperCase()}</div>
                      <div className="text-white">${data.quantiles[k].toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#101013] p-4">
                <div className="font-bold text-white/90 text-sm mb-2">Mekanik Yorum</div>
                <ul className="text-xs font-bold text-white/90 space-y-1 list-disc list-inside">
                  {data.gex.flip && (
                    <li>{data.spot > data.gex.flip ? "Spot flip üstünde → pozitif gamma rejimi (düşük vol beklenir)" : "Spot flip altında → negatif gamma rejimi (yüksek vol beklenir)"}</li>
                  )}
                  {data.pinCandidates.length > 0 && (
                    <li>Pin adayları: {data.pinCandidates.map(p => `$${p.strike.toFixed(0)} (%${(p.gammaShare*100).toFixed(0)})`).join(", ")}</li>
                  )}
                  {data.events.length > 0 && (
                    <li>Dönem içi olaylar: {data.events.slice(0, 3).map(e => `${e.name} (${e.date})`).join(", ")}{data.events.length > 3 ? ` +${data.events.length - 3} daha` : ""}</li>
                  )}
                  {data.gex.putWall && <li>Put Wall: ${data.gex.putWall.toFixed(1)} — destek bölgesi</li>}
                  {data.gex.callWall && <li>Call Wall: ${data.gex.callWall.toFixed(1)} — direnç bölgesi</li>}
                </ul>
              </div>
            </div>
          </div>

          {/* Honesty Box */}
          <div className="rounded-lg border-2 border-yellow-500/50 bg-yellow-500/5 p-4">
            <p className="text-xs font-bold text-yellow-300/90">
              ⚠️ Bu tahmin yalnızca mekanik bir modeldir; piyasa koşullarını garanti etmez. Opsiyon piyasasından türetilen volatilite ile lognormal dağılım kullanılır. Gerçek sonuçlar modellerden sapabilir. Yatırım tavsiyesi değildir.
            </p>
          </div>

          {/* Calibration */}
          {data.calibration.count > 0 && (
            <div className="rounded-lg border border-white/10 bg-[#101013] p-4">
              <div className="font-bold text-white/90 text-sm mb-2">Kalibrasyon ({data.calibration.count} tahmin)</div>
              <div className="grid grid-cols-3 gap-4 text-center text-xs font-bold">
                <div>
                  <div className="text-white/60">Ortalama Z</div>
                  <div className="text-white">{data.calibration.meanZ.toFixed(3)}</div>
                </div>
                <div>
                  <div className="text-white/60">Std Z</div>
                  <div className="text-white">{data.calibration.stdZ.toFixed(3)}</div>
                </div>
                <div>
                  <div className="text-white/60">Ort |Z|</div>
                  <div className="text-white">{data.calibration.meanAbsZ.toFixed(3)}</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
