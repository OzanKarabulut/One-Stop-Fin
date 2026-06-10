"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { generateMarketEvents, groupUpcoming, type MarketEvent, type EventCategory } from "@/lib/market-calendar";
import { EVENT_KNOWLEDGE } from "@/lib/event-knowledge";
import { sellClimate } from "@/lib/sell-climate";
import { DetayButton } from "@/components/ui/DetailPanel";

const TREASURY_LABEL: Record<string, string> = { "^IRX": "US 3 Ay", "^FVX": "US 5Y", "^TNX": "US 10Y", "^TYX": "US 30Y" };
const FUTURES_LABEL: Record<string, string> = { "ES=F": "S&P Futures", "NQ=F": "Nasdaq Futures" };
const COMMODITY_LABEL: Record<string, string> = { "GC=F": "Altın", "SI=F": "Gümüş", "CL=F": "Petrol (WTI)" };
const INDEX_LABEL: Record<string, string> = { "^GSPC": "S&P 500", "^NDX": "NASDAQ-100", "^DJI": "Dow Jones", "^RUT": "Russell 2000", "^KS11": "KOSPI" };
const SECTOR_LABEL: Record<string, string> = { XLK: "Teknoloji (XLK)", XLE: "Enerji (XLE)", XLF: "Finans (XLF)", XLV: "Sağlık (XLV)", XLP: "Tüketim Ür. (XLP)" };
const SECTOR_ORDER = ["XLK", "XLE", "XLF", "XLV", "XLP"];

const BADGE: Record<EventCategory, { label: string; cls: string }> = {
  makro: { label: "MAKRO", cls: "bg-blue-500/15 text-blue-400" },
  opsiyon: { label: "OPSİYON", cls: "bg-purple-500/15 text-purple-400" },
  yapisal: { label: "YAPISAL", cls: "bg-[#ff7200]/15 text-[#ff9a4a]" },
  tatil: { label: "TATİL", cls: "bg-zinc-500/20 text-zinc-400" },
};

const TR_DAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return `${TR_DAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

function pctClass(v: number): string {
  return v >= 0 ? "text-up" : "text-down";
}
function pct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2.5 inline-block rounded-md bg-[#ff7200] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
      {children}
    </span>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0e0e10] p-3">
      <CardTitle>{title}</CardTitle>
      <div className="divide-y divide-white/5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between text-[13px] font-bold py-1">
      <span className="text-white/90 font-bold">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function SignalBars({ level }: { level: 1 | 2 | 3 }) {
  const heights = [7, 11, 15];
  return (
    <span className="inline-flex items-end gap-[2px]" style={{ height: 15 }}>
      {heights.map((h, i) => (
        <i
          key={i}
          className="block w-[4px] rounded-[1px]"
          style={{ height: h, background: i < level ? "#34d399" : "rgba(255,255,255,0.12)" }}
        />
      ))}
    </span>
  );
}

function EventRow({ ev, open, onToggle, router }: { ev: MarketEvent; open: boolean; onToggle: () => void; router: ReturnType<typeof useRouter> }) {
  const badge = BADGE[ev.category];
  const detail = EVENT_KNOWLEDGE[ev.type];
  return (
    <div className="relative rounded-xl border border-white/20 bg-[#0e0e10] p-3 hover:border-white/40 transition-colors overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl ${
        ev.importance === 3 ? "bg-red-400" : ev.importance === 2 ? "bg-yellow-400" : "bg-emerald-400"
      }`} />
      <div className="flex pl-2">
        {/* Left 2/3: event info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-14 text-center shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-xs font-bold text-white">{dayLabel(ev.date)}</span>
            <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${badge.cls}`}>{badge.label}</span>
            <span className="text-sm font-bold text-white">{ev.name}</span>
            {detail?.volProfile === "vol_up" && <span className="text-xs font-bold text-yellow-400 rounded px-1.5 py-0.5 bg-yellow-500/10">VOL ↑</span>}
            {detail?.volProfile === "iv_crush" && <span className="text-xs font-bold text-emerald-400 rounded px-1.5 py-0.5 bg-emerald-500/10">IV CRUSH</span>}
          </div>
          {detail?.sellerNote && (
            <div className="mt-1 text-xs font-bold text-white/90">💡 {detail.sellerNote}</div>
          )}
        </div>
        {/* Right 1/3: time + buttons in one row */}
        <div className="shrink-0 flex items-center gap-2 ml-4">
          <span className="text-xs font-bold text-white/90">{ev.time ?? ""}</span>
          <button onClick={onToggle}
            className={cn("rounded-lg px-4 py-2 text-sm font-bold transition-colors",
              open ? "bg-[#ff7200]/20 text-[#ff7200] border border-[#ff7200]/40" : "bg-[#ff7200] text-white hover:bg-[#ff8a2b]")}>
            Detay {open ? "▾" : "▸"}
          </button>
          <button onClick={() => router.push(`/dashboard/signallab/vol-console?dte=${Math.max(1, Math.ceil((new Date(ev.date + "T00:00:00Z").getTime() - Date.now()) / 86400000))}`)}
            className="rounded-lg px-4 py-2 text-sm font-bold bg-[#ff7200] text-white hover:bg-[#ff8a2b] transition-colors">
            Vol Tara →
          </button>
        </div>
      </div>
      {open && detail && (
        <div className="mt-3 rounded-lg border border-white/10 bg-[#101013] px-4 py-3 text-sm font-bold leading-relaxed">
          <div className="mb-2"><span className="text-[#ff7200]">Mantık:</span> <span className="text-white/90">{detail.mantik}</span></div>
          {detail.sicak && <div className="mb-1.5"><span className="text-emerald-400">▲ Sıcak:</span> <span className="text-white/90">{detail.sicak}</span></div>}
          {detail.soguk && <div className="mb-1.5"><span className="text-red-400">▼ Soğuk:</span> <span className="text-white/90">{detail.soguk}</span></div>}
          <div className="mb-1.5"><span className="text-white">Tarihsel:</span> <span className="text-white/90">{detail.tarihsel}</span></div>
          <div><span className="text-purple-400">Opsiyon:</span> <span className="text-white/90">{detail.opsiyon}</span></div>
        </div>
      )}
    </div>
  );
}

function CalendarSection({ title, events, openKey, setOpenKey, router }: {
  title: string; accent: string; events: MarketEvent[];
  openKey: string | null; setOpenKey: (k: string | null) => void;
  router: ReturnType<typeof useRouter>;
}) {
  if (events.length === 0) return null;
  return (
    <div className="mb-2">
      <div className="text-[#ff7200] font-bold text-sm tracking-wide mt-6 mb-3">{title}</div>
      <div className="space-y-4">
        {events.map((ev) => {
          const key = `${ev.date}|${ev.type}|${ev.name}`;
          return (
            <EventRow key={key} ev={ev} open={openKey === key} onToggle={() => setOpenKey(openKey === key ? null : key)} router={router} />
          );
        })}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => setMounted(true), []);

  const { data: market } = trpc.signallab.marketOverview.useQuery(undefined, { enabled: mounted });
  const { data: sectors } = trpc.signallab.sectors.useQuery(undefined, { enabled: mounted });

  const events = useMemo(() => generateMarketEvents(2026), []);
  const grouped = useMemo(() => (mounted ? groupUpcoming(events, new Date()) : null), [events, mounted]);

  const sectorRows = useMemo(() => {
    if (!sectors) return [];
    return SECTOR_ORDER
      .map((sym) => sectors.find((s) => s.symbol === sym))
      .filter((s): s is NonNullable<typeof s> => !!s);
  }, [sectors]);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-white">Ana Sayfa</h1>

      {market && (() => {
        const climate = sellClimate({ vix: market.vix, vixChangePct: null, fearGreed: market.fearGreed.value });
        const climateColors = climate.climate === "favorable" ? "bg-emerald-500/20 text-emerald-400" :
          climate.climate === "poor" ? "bg-red-500/20 text-red-400" :
          "bg-yellow-500/20 text-yellow-400";
        return (
          <div className="mb-4 rounded-xl border border-white/10 bg-[#0b0b0c] p-4 flex items-center gap-4">
            <span className={`rounded-lg px-4 py-2 text-base font-bold ${climateColors}`}>
              Prim Satış İklimi: {climate.label}
            </span>
            <DetayButton content={{ title: "Prim Satış İklimi", logic: climate.reasons.join("\n"), scenarios: [], glossary: [
              { term: "VIX", def: "S&P 500 opsiyon volatilitesi endeksi — yüksekse prim zengin ama risk de yüksek" },
              { term: "Fear & Greed", def: "CNN piyasa duyarlılık endeksi — düşükse korku (IV şişkin), yüksekse açgözlülük (IV ince)" },
              { term: "IV Crush", def: "Olay sonrası implied volatility'nin çökmesi — prim satıcısının ana kâr kaynağı" },
            ]}} />
            {climate.reasons[0] && <span className="text-sm font-bold text-white/90 ml-auto">{climate.reasons[0]}</span>}
          </div>
        );
      })()}

      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card title="Endeksler">
          {market?.indices.map((m) => (
            <Row key={m.symbol} label={INDEX_LABEL[m.symbol] ?? m.name} value={<span className={pctClass(m.changePct)}>{pct(m.changePct)}</span>} />
          )) ?? <span className="text-[13px] font-bold text-white/70">Yükleniyor…</span>}
        </Card>

        <Card title="Sektörler">
          {sectorRows.length > 0
            ? sectorRows.map((s) => (
                <Row key={s.symbol} label={SECTOR_LABEL[s.symbol] ?? s.symbol} value={<span className={pctClass(s.change1d)}>{pct(s.change1d)}</span>} />
              ))
            : <span className="text-[13px] font-bold text-white/70">Yükleniyor…</span>}
        </Card>

        <Card title="Tahvil Faizleri">
          {market?.treasuries.map((m) => (
            <Row key={m.symbol} label={TREASURY_LABEL[m.symbol] ?? m.name}
              value={<span>{m.price.toFixed(2)}% <span className={pctClass(m.changePct)}>{pct(m.changePct)}</span></span>} />
          )) ?? <span className="text-[13px] font-bold text-white/70">Yükleniyor…</span>}
        </Card>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card title="VIX & Fear/Greed">
          {market ? (
            <>
              <Row label="VIX" value={<span className={market.vix > 25 ? "text-down" : "text-up"}>{market.vix.toFixed(2)}</span>} />
              <Row label="Fear & Greed" value={`${market.fearGreed.value} — ${market.fearGreed.classification}`} />
            </>
          ) : <span className="text-[13px] font-bold text-white/70">Yükleniyor…</span>}
        </Card>

        <Card title="Futures (pre-market)">
          {market?.futures.map((m) => (
            <Row key={m.symbol} label={FUTURES_LABEL[m.symbol] ?? m.name} value={<span className={pctClass(m.changePct)}>{pct(m.changePct)}</span>} />
          )) ?? <span className="text-[13px] font-bold text-white/70">Yükleniyor…</span>}
        </Card>

        <Card title="Emtia">
          {market?.commodities.map((m) => (
            <Row key={m.symbol} label={COMMODITY_LABEL[m.symbol] ?? m.name} value={<span className={pctClass(m.changePct)}>{pct(m.changePct)}</span>} />
          )) ?? <span className="text-[13px] font-bold text-white/70">Yükleniyor…</span>}
        </Card>
      </div>

      <div className="rounded-xl border border-[#ff7200]/30 bg-[#0a0a0c] p-4">
        <div className="mb-3.5 flex items-center justify-between">
          <div className="text-[15px] font-bold text-white">📅 Ekonomik &amp; Mekanik Takvim — Risk Haritası</div>
          <div className="flex items-center gap-3.5 text-[11px] font-bold text-white/70">
            {([["düşük", 1], ["orta", 2], ["yüksek", 3]] as const).map(([lbl, lv]) => (
              <span key={lbl} className="inline-flex items-center gap-1.5"><SignalBars level={lv} />{lbl}</span>
            ))}
          </div>
        </div>

        {!grouped ? (
          <div className="py-6 text-center text-[13px] font-bold text-white/70">Takvim yükleniyor…</div>
        ) : (grouped.thisWeek.length + grouped.nextWeek.length + grouped.horizon.length === 0) ? (
          <div className="py-6 text-center text-[13px] font-bold text-white/70">Önümüzdeki dönemde planlı önemli olay yok.</div>
        ) : (
          <>
            <CalendarSection title="BU HAFTA" accent="#ff7200" events={grouped.thisWeek} openKey={openKey} setOpenKey={setOpenKey} router={router} />
            <CalendarSection title="ÖNÜMÜZDEKİ HAFTA" accent="#ff7200" events={grouped.nextWeek} openKey={openKey} setOpenKey={setOpenKey} router={router} />
            <CalendarSection title="UFUKTA" accent="#9aa0a8" events={grouped.horizon} openKey={openKey} setOpenKey={setOpenKey} router={router} />
          </>
        )}
      </div>
    </div>
  );
}
