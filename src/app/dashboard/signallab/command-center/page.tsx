"use client";

import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { usd } from "@/lib/format";
import { positionActions, type ActionSignal } from "@/lib/position-actions";
import { generateMarketEvents } from "@/lib/market-calendar";
import { probITMPut, probITMCall } from "@/lib/vol-math";
import { Shield, BookOpen, Loader2, Plus, X } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { DetayButton } from "@/components/ui/DetailPanel";
import { actionDetail } from "@/lib/detail-content";

type Tab = "open" | "closed";

function ActionBadge({ signal }: { signal: ActionSignal }) {
  const colors: Record<string, string> = {
    green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    yellow: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    red: "bg-red-500/15 text-red-400 border-red-500/30",
    neutral: "bg-white/5 text-white/90 border-white/10",
  };
  return <span className={cn("rounded-md border px-2 py-0.5 text-xs font-bold", colors[signal.severity])}>{signal.label}</span>;
}

function EventBadge({ name }: { name: string }) {
  return <span className="rounded bg-[#ff7200]/15 px-1.5 py-0.5 text-xs font-bold text-[#ff7200]">{name}</span>;
}

const SEVERITY_ORDER: Record<string, number> = { red: 0, yellow: 1, green: 2, neutral: 3 };

export default function CommandCenterPage() {
  const [tab, setTab] = useState<Tab>("open");
  const [showForm, setShowForm] = useState(false);
  const [closeId, setCloseId] = useState<number | null>(null);
  const [exitDebit, setExitDebit] = useState("");

  const openPositions = trpc.positions.list.useQuery({ status: "open" });
  const closedPositions = trpc.positions.list.useQuery({ status: "closed" });
  const utils = trpc.useUtils();

  const closeMut = trpc.positions.close.useMutation({
    onSuccess: () => { utils.positions.list.invalidate(); setCloseId(null); setExitDebit(""); },
  });
  const removeMut = trpc.positions.remove.useMutation({
    onSuccess: () => { utils.positions.list.invalidate(); },
  });
  const createMut = trpc.positions.create.useMutation({
    onSuccess: () => { utils.positions.list.invalidate(); setShowForm(false); },
  });

  // Fetch real marks for open positions
  const positionsForMarks = useMemo(() => {
    if (!openPositions.data) return [];
    return openPositions.data.map((p) => ({
      id: p.id,
      ticker: p.ticker,
      strike: p.strike,
      expiry: new Date(p.expiry).toISOString().slice(0, 10),
      optionType: p.optionType,
    }));
  }, [openPositions.data]);

  const marksQuery = trpc.signallab.positionMarks.useQuery(
    { positions: positionsForMarks },
    { enabled: positionsForMarks.length > 0, refetchOnWindowFocus: false },
  );

  const marksMap = useMemo(() => {
    const m = new Map<number, { spot: number; mark: number | null; iv: number | null }>();
    if (marksQuery.data) for (const r of marksQuery.data) m.set(r.id, r);
    return m;
  }, [marksQuery.data]);

  const events = useMemo(() => generateMarketEvents(), []);

  // Portfolio strip for open positions
  const portfolio = useMemo(() => {
    const positions = openPositions.data ?? [];
    const totalCredit = positions.reduce((s, p) => s + p.entryCredit, 0);
    const count = positions.length;
    return { totalCredit, count };
  }, [openPositions.data]);

  const hasEventBeforeExpiry = (expiry: Date): { has: boolean; names: string[] } => {
    const today = new Date().toISOString().slice(0, 10);
    const expiryStr = expiry.toISOString().slice(0, 10);
    const matched = events.filter((e) => e.date >= today && e.date <= expiryStr && e.importance >= 2);
    return { has: matched.length > 0, names: matched.map((e) => e.name) };
  };

  // Sorted open positions by action severity
  const sortedOpen = useMemo(() => {
    if (!openPositions.data) return [];
    return [...openPositions.data].sort((a, b) => {
      const markA = marksMap.get(a.id);
      const markB = marksMap.get(b.id);
      const dteA = Math.max(0, Math.ceil((new Date(a.expiry).getTime() - Date.now()) / 86400000));
      const dteB = Math.max(0, Math.ceil((new Date(b.expiry).getTime() - Date.now()) / 86400000));
      const eA = hasEventBeforeExpiry(new Date(a.expiry));
      const eB = hasEventBeforeExpiry(new Date(b.expiry));
      const profitA = markA?.mark != null ? (a.entryCredit - markA.mark * 100 * a.contracts) / a.entryCredit : 0;
      const profitB = markB?.mark != null ? (b.entryCredit - markB.mark * 100 * b.contracts) / b.entryCredit : 0;
      const sigA = positionActions({ profitPct: profitA, dte: dteA, spot: markA?.spot ?? a.strike * 0.97, strike: a.strike, optionType: a.optionType, hasEventBeforeExpiry: eA.has });
      const sigB = positionActions({ profitPct: profitB, dte: dteB, spot: markB?.spot ?? b.strike * 0.97, strike: b.strike, optionType: b.optionType, hasEventBeforeExpiry: eB.has });
      const sevA = Math.min(...sigA.map((s) => SEVERITY_ORDER[s.severity] ?? 3));
      const sevB = Math.min(...sigB.map((s) => SEVERITY_ORDER[s.severity] ?? 3));
      return sevA - sevB;
    });
  }, [openPositions.data, marksMap]);

  // Closed tab stats
  const closedStats = useMemo(() => {
    const closed = closedPositions.data ?? [];
    const total = closed.length;
    const wins = closed.filter((p) => (p.realizedPnl ?? 0) > 0).length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const totalPnl = closed.reduce((s, p) => s + (p.realizedPnl ?? 0), 0);
    const avgPnl = total > 0 ? totalPnl / total : 0;
    return { total, wins, winRate, totalPnl, avgPnl };
  }, [closedPositions.data]);

  // Calibration data
  const calibration = useMemo(() => {
    const closed = closedPositions.data ?? [];
    const withPwin = closed.filter((p) => p.predictedPwin != null && p.predictedPwin > 0);
    if (withPwin.length < 30) return { enough: false as const, count: withPwin.length };
    // Bucket into 5 ranges: 0-20, 20-40, 40-60, 60-80, 80-100
    const buckets = [
      { range: "0-20%", min: 0, max: 0.2, trades: 0, wins: 0 },
      { range: "20-40%", min: 0.2, max: 0.4, trades: 0, wins: 0 },
      { range: "40-60%", min: 0.4, max: 0.6, trades: 0, wins: 0 },
      { range: "60-80%", min: 0.6, max: 0.8, trades: 0, wins: 0 },
      { range: "80-100%", min: 0.8, max: 1.01, trades: 0, wins: 0 },
    ];
    for (const p of withPwin) {
      const pwin = p.predictedPwin!;
      const won = (p.realizedPnl ?? 0) > 0;
      for (const b of buckets) {
        if (pwin >= b.min && pwin < b.max) { b.trades++; if (won) b.wins++; break; }
      }
    }
    const chartData = buckets.filter((b) => b.trades > 0).map((b) => ({
      range: b.range,
      predicted: ((b.min + b.max) / 2) * 100,
      realized: (b.wins / b.trades) * 100,
    }));
    return { enough: true as const, count: withPwin.length, chartData };
  }, [closedPositions.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Komuta Merkezi</h1>
          <p className="mt-1 text-sm font-bold text-white/90">Pozisyon yönetimi, aksiyon sinyalleri, journal</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 rounded-md bg-[#ff7200] px-4 py-2 text-sm font-bold text-white hover:bg-[#ff8c3a]">
          <Plus className="h-4 w-4" /> Yeni Pozisyon
        </button>
      </div>

      {/* Portfolio strip */}
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-white/10 bg-[#0b0b0c] p-4 sm:grid-cols-4">
        <div><p className="text-xs font-bold text-white/90">Açık Pozisyon</p><p className="text-lg font-bold text-white tabular-nums">{portfolio.count}</p></div>
        <div><p className="text-xs font-bold text-white/90">Toplam Kredi</p><p className="text-lg font-bold text-emerald-400 tabular-nums">{usd(portfolio.totalCredit)}</p></div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {([["open", "Açık Pozisyonlar", Shield], ["closed", "Kapalı / Journal", BookOpen]] as const).map(([t, label, Icon]) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold transition-colors", tab === t ? "bg-[#ff7200] text-white" : "bg-white/5 text-white/90 hover:bg-white/10")}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* Open Positions */}
      {tab === "open" && (
        <div className="space-y-3">
          {openPositions.isLoading && <div className="flex items-center gap-2 text-sm font-bold text-white/90"><Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor...</div>}
          {openPositions.data?.length === 0 && <p className="py-12 text-center text-sm font-bold text-white/90">Açık pozisyon yok</p>}
          {sortedOpen.map((pos) => {
            const dte = Math.max(0, Math.ceil((new Date(pos.expiry).getTime() - Date.now()) / 86400000));
            const eventInfo = hasEventBeforeExpiry(new Date(pos.expiry));
            const markInfo = marksMap.get(pos.id);
            const marksLoading = positionsForMarks.length > 0 && marksQuery.isLoading;

            // Real profit calculation
            let profitPct = 0;
            let pItm: number | null = null;
            if (markInfo?.mark != null) {
              profitPct = (pos.entryCredit - markInfo.mark * 100 * pos.contracts) / pos.entryCredit;
              if (markInfo.iv != null && markInfo.spot > 0) {
                const T = dte / 365;
                const sigma = markInfo.iv / 100;
                pItm = pos.optionType === "put"
                  ? probITMPut(markInfo.spot, pos.strike, T, sigma)
                  : probITMCall(markInfo.spot, pos.strike, T, sigma);
              }
            } else if (!marksLoading) {
              // Fallback: time-decay estimate
              const totalDte = Math.ceil((new Date(pos.expiry).getTime() - new Date(pos.openedAt).getTime()) / 86400000);
              const elapsed = totalDte - dte;
              profitPct = totalDte > 0 ? Math.min(elapsed / totalDte, 0.95) : 0;
            }

            const signals = positionActions({ profitPct, dte, spot: markInfo?.spot ?? pos.strike * 0.97, strike: pos.strike, optionType: pos.optionType, hasEventBeforeExpiry: eventInfo.has });

            return (
              <div key={pos.id} className="rounded-xl border border-white/10 bg-[#0a0a0c] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-base font-bold text-white">{pos.ticker}</span>
                    <span className="text-sm font-bold text-white/90">{pos.strategy} · {pos.strike.toFixed(1)} {pos.optionType.toUpperCase()}</span>
                    <span className="text-sm font-bold text-white/90 tabular-nums">{pos.contracts}x</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {signals.map((s, i) => (
                      <span key={i} className="inline-flex items-center gap-1">
                        <ActionBadge signal={s} />
                        {s.code !== "HOLD" && <DetayButton content={actionDetail(s.code, { entryCredit: pos.entryCredit, strike: pos.strike, contracts: pos.contracts })} />}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-bold tabular-nums">
                  <span className="text-white/90">Kredi: <span className="text-emerald-400">{usd(pos.entryCredit)}</span></span>
                  <span className="text-white/90">Vade: <span className="text-white">{new Date(pos.expiry).toLocaleDateString("tr-TR")}</span></span>
                  <span className="text-white/90">DTE: <span className={cn(dte <= 7 ? "text-red-400" : "text-white")}>{dte}</span></span>
                  <span className="text-white/90">Kâr: <span className={cn(profitPct >= 0.5 ? "text-emerald-400" : "text-white")}>{marksLoading ? "—" : `${(profitPct * 100).toFixed(0)}%`}</span></span>
                  {pItm !== null && <span className="text-white/90">P(ITM): <span className="text-white">{(pItm * 100).toFixed(0)}%</span></span>}
                  {pos.predictedPwin && <span className="text-white/90">P(win): <span className="text-white">{(pos.predictedPwin * 100).toFixed(0)}%</span></span>}
                  {eventInfo.names.slice(0, 2).map((n, i) => <EventBadge key={i} name={n} />)}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {closeId === pos.id ? (
                    <>
                      <input type="number" placeholder="Exit Debit ($)" value={exitDebit} onChange={(e) => setExitDebit(e.target.value)}
                        className="rounded-md border border-white/10 bg-[#050505] px-3 py-1.5 text-sm font-bold text-white w-32" />
                      <button onClick={() => closeMut.mutate({ id: pos.id, exitDebit: Number(exitDebit) || 0 })}
                        className="rounded-md bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/25">Kapat</button>
                      <button onClick={() => setCloseId(null)} className="text-white/90 hover:text-white"><X className="h-4 w-4" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setCloseId(pos.id)} className="rounded-md bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/25">Pozisyonu Kapat</button>
                      <button onClick={() => removeMut.mutate({ id: pos.id })} className="rounded-md bg-red-500/15 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/25">Sil</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Closed Positions / Journal */}
      {tab === "closed" && (
        <div className="space-y-4">
          {/* Summary strip */}
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-white/10 bg-[#0b0b0c] p-4 sm:grid-cols-4">
            <div><p className="text-xs font-bold text-white/90">Toplam Trade</p><p className="text-lg font-bold text-white tabular-nums">{closedStats.total}</p></div>
            <div><p className="text-xs font-bold text-white/90">Kazanma Oranı</p><p className="text-lg font-bold text-emerald-400 tabular-nums">{closedStats.winRate.toFixed(0)}%</p></div>
            <div><p className="text-xs font-bold text-white/90">Toplam P&L</p><p className={cn("text-lg font-bold tabular-nums", closedStats.totalPnl >= 0 ? "text-emerald-400" : "text-red-400")}>{usd(closedStats.totalPnl)}</p></div>
            <div><p className="text-xs font-bold text-white/90">Ortalama P&L</p><p className={cn("text-lg font-bold tabular-nums", closedStats.avgPnl >= 0 ? "text-emerald-400" : "text-red-400")}>{usd(closedStats.avgPnl)}</p></div>
          </div>

          {/* Calibration section */}
          {!calibration.enough ? (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm font-bold text-yellow-300">
              ⚠ Kalibrasyon için yeterli veri yok ({calibration.count}/30 trade ile P(win) tahmini). Daha fazla pozisyon kapatıldığında model doğruluğu ölçülebilecek.
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-[#0b0b0c] p-4 space-y-3">
              <h3 className="text-sm font-bold text-white">📊 Model Kalibrasyonu ({calibration.count} trade)</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={calibration.chartData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                  <XAxis dataKey="range" tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#1a1a1e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                  <ReferenceLine y={20} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
                  <ReferenceLine y={40} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
                  <ReferenceLine y={60} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
                  <ReferenceLine y={80} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
                  <Bar dataKey="predicted" name="Tahmin" fill="#ff7200" opacity={0.4} />
                  <Bar dataKey="realized" name="Gerçekleşen" fill="#34d399" />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs font-bold text-white/90">
                Turuncu: model tahmini (orta nokta), Yeşil: gerçekleşen kazanma oranı. İkisi yakınsa model kalibre demektir.
              </p>
            </div>
          )}

          {/* Closed positions list */}
          <div className="space-y-3">
            {closedPositions.isLoading && <div className="flex items-center gap-2 text-sm font-bold text-white/90"><Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor...</div>}
            {closedPositions.data?.length === 0 && <p className="py-12 text-center text-sm font-bold text-white/90">Henüz kapatılmış pozisyon yok</p>}
            {closedPositions.data?.map((pos) => (
              <div key={pos.id} className="rounded-xl border border-white/10 bg-[#0a0a0c] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-base font-bold text-white">{pos.ticker}</span>
                    <span className="text-sm font-bold text-white/90">{pos.strategy} · {pos.strike.toFixed(1)} {pos.optionType.toUpperCase()}</span>
                  </div>
                  <span className={cn("text-sm font-bold tabular-nums", (pos.realizedPnl ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                    P&L: {usd(pos.realizedPnl ?? 0)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-xs font-bold tabular-nums text-white/90">
                  <span>Kredi: <span className="text-emerald-400">{usd(pos.entryCredit)}</span></span>
                  <span>Debit: <span className="text-red-400">{usd(pos.exitDebit ?? 0)}</span></span>
                  <span>Kapanış: {pos.closedAt ? new Date(pos.closedAt).toLocaleDateString("tr-TR") : "—"}</span>
                  {pos.predictedPwin && <span>P(win): {(pos.predictedPwin * 100).toFixed(0)}%</span>}
                  {pos.notes && <span className="text-white/90">Not: {pos.notes}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Position Form */}
      {showForm && <NewPositionForm onClose={() => setShowForm(false)} onCreate={(d) => createMut.mutate(d)} />}
    </div>
  );
}

function NewPositionForm({ onClose, onCreate }: { onClose: () => void; onCreate: (d: { ticker: string; strategy: string; optionType: string; strike: number; expiry: Date; contracts: number; entryCredit: number; notes?: string }) => void }) {
  const [ticker, setTicker] = useState("");
  const [strategy, setStrategy] = useState("CSP");
  const [optionType, setOptionType] = useState("put");
  const [strike, setStrike] = useState("");
  const [expiry, setExpiry] = useState("");
  const [contracts, setContracts] = useState("1");
  const [entryCredit, setEntryCredit] = useState("");
  const [notes, setNotes] = useState("");

  const inputClass = "rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm font-bold text-white focus:outline-none focus:ring-1 focus:ring-[#ff7200]/50 w-full";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0c0c0e] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Yeni Pozisyon</h2>
          <button onClick={onClose} className="text-white/90 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-bold text-white/90">Ticker</label><input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} className={inputClass} /></div>
          <div><label className="text-xs font-bold text-white/90">Strateji</label>
            <select value={strategy} onChange={(e) => setStrategy(e.target.value)} className={inputClass}>
              <option value="CSP">CSP</option><option value="CC">CC</option><option value="WHEEL">WHEEL</option>
            </select>
          </div>
          <div><label className="text-xs font-bold text-white/90">Tip</label>
            <select value={optionType} onChange={(e) => setOptionType(e.target.value)} className={inputClass}>
              <option value="put">Put</option><option value="call">Call</option>
            </select>
          </div>
          <div><label className="text-xs font-bold text-white/90">Strike</label><input type="number" value={strike} onChange={(e) => setStrike(e.target.value)} className={inputClass} /></div>
          <div><label className="text-xs font-bold text-white/90">Vade</label><input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={inputClass} /></div>
          <div><label className="text-xs font-bold text-white/90">Kontrat</label><input type="number" value={contracts} onChange={(e) => setContracts(e.target.value)} className={inputClass} /></div>
          <div className="col-span-2"><label className="text-xs font-bold text-white/90">Alınan Prim ($)</label><input type="number" value={entryCredit} onChange={(e) => setEntryCredit(e.target.value)} className={inputClass} /></div>
          <div className="col-span-2"><label className="text-xs font-bold text-white/90">Not</label><input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></div>
        </div>
        <button onClick={() => onCreate({ ticker, strategy, optionType, strike: Number(strike), expiry: new Date(expiry + "T00:00:00Z"), contracts: Number(contracts), entryCredit: Number(entryCredit), notes: notes || undefined })}
          className="w-full rounded-md bg-[#ff7200] py-2.5 text-sm font-bold text-white hover:bg-[#ff8c3a]">Kaydet</button>
      </div>
    </div>
  );
}
