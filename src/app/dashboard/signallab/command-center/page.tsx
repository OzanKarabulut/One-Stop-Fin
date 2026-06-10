"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { usd } from "@/lib/format";
import { positionActions, type ActionSignal } from "@/lib/position-actions";
import { generateMarketEvents } from "@/lib/market-calendar";
import { Shield, BookOpen, Loader2, Plus, X } from "lucide-react";

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
          {openPositions.data?.map((pos) => {
            const dte = Math.max(0, Math.ceil((new Date(pos.expiry).getTime() - Date.now()) / 86400000));
            const eventInfo = hasEventBeforeExpiry(new Date(pos.expiry));
            // Estimated profit (simplified: without live data, use 50% decay assumption based on DTE)
            const totalDte = Math.ceil((new Date(pos.expiry).getTime() - new Date(pos.openedAt).getTime()) / 86400000);
            const elapsed = totalDte - dte;
            const profitPct = totalDte > 0 ? Math.min(elapsed / totalDte, 0.95) : 0;
            const signals = positionActions({ profitPct, dte, spot: pos.strike * 0.97, strike: pos.strike, optionType: pos.optionType, hasEventBeforeExpiry: eventInfo.has });

            return (
              <div key={pos.id} className="rounded-xl border border-white/10 bg-[#0a0a0c] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-base font-bold text-white">{pos.ticker}</span>
                    <span className="text-sm font-bold text-white/90">{pos.strategy} · {pos.strike.toFixed(1)} {pos.optionType.toUpperCase()}</span>
                    <span className="text-sm font-bold text-white/90 tabular-nums">{pos.contracts}x</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {signals.map((s, i) => <ActionBadge key={i} signal={s} />)}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-bold tabular-nums">
                  <span className="text-white/90">Kredi: <span className="text-emerald-400">{usd(pos.entryCredit)}</span></span>
                  <span className="text-white/90">Vade: <span className="text-white">{new Date(pos.expiry).toLocaleDateString("tr-TR")}</span></span>
                  <span className="text-white/90">DTE: <span className={cn(dte <= 7 ? "text-red-400" : "text-white")}>{dte}</span></span>
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
                {pos.notes && <span className="text-white/90">Not: {pos.notes}</span>}
              </div>
            </div>
          ))}
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
