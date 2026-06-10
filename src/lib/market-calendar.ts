// Piyasa takvimi: mekanik/yapısal günler kuralla üretilir; FOMC + makro 2026 statik.
// Mekanik günler (OPEX, witching, VIX expiry, JPM roll, Russell, tatiller) API gerektirmez.

export type EventCategory = "makro" | "opsiyon" | "yapisal" | "tatil";

export type EventType =
  | "cpi" | "ppi" | "pce" | "nfp" | "fomc" | "retail-sales" | "ism" | "jolts" | "gdp" | "jobless-claims"
  | "opex" | "triple-witching" | "vix-expiry"
  | "jpm-collar" | "russell-recon" | "quarter-end"
  | "holiday";

export type Importance = 1 | 2 | 3;

export interface MarketEvent {
  date: string;          // YYYY-MM-DD
  name: string;
  category: EventCategory;
  type: EventType;
  importance: Importance;
  time?: string;         // ör. "15:30 TR"
  note?: string;
}

// ─── Tarih yardımcıları (yalnız takvim, UTC) ─────────────────────────────────
function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function mkDate(y: number, m: number, day: number): Date { return new Date(Date.UTC(y, m, day)); }

function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = mkDate(year, month, 1);
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  return mkDate(year, month, 1 + shift + (n - 1) * 7);
}
function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = mkDate(year, month + 1, 0);
  const shift = (last.getUTCDay() - weekday + 7) % 7;
  return mkDate(year, month, last.getUTCDate() - shift);
}

const HOLIDAYS_2026: Record<string, string> = {
  "2026-01-01": "Yılbaşı",
  "2026-01-19": "MLK Günü",
  "2026-02-16": "Başkanlar Günü",
  "2026-04-03": "Good Friday",
  "2026-05-25": "Anma Günü",
  "2026-06-19": "Juneteenth",
  "2026-07-03": "Bağımsızlık Günü (gözlem)",
  "2026-09-07": "İşçi Bayramı",
  "2026-11-26": "Şükran Günü",
  "2026-12-25": "Noel",
};
function isHoliday(d: Date): boolean { return !!HOLIDAYS_2026[ymd(d)]; }
function isWeekend(d: Date): boolean { const x = d.getUTCDay(); return x === 0 || x === 6; }
function prevBusinessDay(d: Date): Date {
  const x = new Date(d);
  while (isWeekend(x) || isHoliday(x)) x.setUTCDate(x.getUTCDate() - 1);
  return x;
}

const QUARTER_MONTHS = [2, 5, 8, 11];

function opexAndWitching(year: number): MarketEvent[] {
  const out: MarketEvent[] = [];
  for (let m = 0; m < 12; m++) {
    let d = nthWeekday(year, m, 5, 3);
    if (isHoliday(d) || isWeekend(d)) d = prevBusinessDay(d);
    if (QUARTER_MONTHS.includes(m)) {
      out.push({ date: ymd(d), name: "Triple Witching + Aylık OPEX", category: "opsiyon", type: "triple-witching", importance: 3, note: "üçlü vade — en yüksek hacim/volatilite" });
    } else {
      out.push({ date: ymd(d), name: "Aylık OPEX", category: "opsiyon", type: "opex", importance: 2, note: "gamma unwind" });
    }
  }
  return out;
}

function vixExpiries(year: number): MarketEvent[] {
  const out: MarketEvent[] = [];
  for (let m = 0; m < 12; m++) {
    const ny = m === 11 ? year + 1 : year;
    const nm = m === 11 ? 0 : m + 1;
    const nextThirdFri = nthWeekday(ny, nm, 5, 3);
    let v = new Date(nextThirdFri);
    v.setUTCDate(v.getUTCDate() - 30);
    if (isHoliday(v) || isWeekend(v)) v = prevBusinessDay(v);
    out.push({ date: ymd(v), name: "VIX Vade Sonu", category: "opsiyon", type: "vix-expiry", importance: 2, note: "vol-of-vol" });
  }
  return out;
}

function jpmRolls(year: number): MarketEvent[] {
  return QUARTER_MONTHS.map((m) => {
    const d = prevBusinessDay(mkDate(year, m + 1, 0));
    return { date: ymd(d), name: "JPM Collar Roll (JHEQX)", category: "yapisal" as const, type: "jpm-collar" as const, importance: 2 as const, note: "çeyrek sonu dealer hedging akışı" };
  });
}
function russellRecon(year: number): MarketEvent[] {
  const d = lastWeekday(year, 5, 5);
  return [{ date: ymd(d), name: "Russell Yeniden Yapılanma", category: "yapisal", type: "russell-recon", importance: 3, note: "yılın en yüksek hacimli kapanışlarından" }];
}

function nfpDays(year: number): MarketEvent[] {
  const out: MarketEvent[] = [];
  for (let m = 0; m < 12; m++) {
    let d = nthWeekday(year, m, 5, 1);
    if (isHoliday(d)) d = prevBusinessDay(d);
    out.push({ date: ymd(d), name: "Tarım Dışı İstihdam (NFP)", category: "makro", type: "nfp", importance: 3, time: "15:30 TR", note: "istihdam raporu" });
  }
  return out;
}

const FOMC_2026 = ["2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09"];
const FOMC_SEP = new Set(["2026-03-18", "2026-06-17", "2026-09-16", "2026-12-09"]);
function fomc(): MarketEvent[] {
  return FOMC_2026.map((date) => ({
    date,
    name: FOMC_SEP.has(date) ? "FOMC Faiz Kararı + Dot Plot" : "FOMC Faiz Kararı",
    category: "makro" as const, type: "fomc" as const, importance: 3 as const, time: "21:00 TR",
  }));
}

// Makro veri statik tablosu — BLS/BEA takvimine göre DOĞRULA/GÜNCELLE.
const MACRO_2026: MarketEvent[] = [
  { date: "2026-06-10", name: "CPI (Mayıs enflasyon)", category: "makro", type: "cpi", importance: 3, time: "15:30 TR" },
  { date: "2026-06-11", name: "PPI (Üretici Fiyatları)", category: "makro", type: "ppi", importance: 2, time: "15:30 TR" },
  { date: "2026-06-26", name: "PCE (Çekirdek Enflasyon)", category: "makro", type: "pce", importance: 3, time: "15:30 TR" },
  { date: "2026-07-15", name: "CPI (Haziran enflasyon)", category: "makro", type: "cpi", importance: 3, time: "15:30 TR" },
];

export function generateMarketEvents(year = 2026): MarketEvent[] {
  return [
    ...opexAndWitching(year),
    ...vixExpiries(year),
    ...jpmRolls(year),
    ...russellRecon(year),
    ...nfpDays(year),
    ...fomc(),
    ...MACRO_2026,
    ...Object.entries(HOLIDAYS_2026).map(([date, name]): MarketEvent => ({
      date, name: `${name} — Piyasa Kapalı`, category: "tatil", type: "holiday", importance: 1,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export interface GroupedEvents {
  thisWeek: MarketEvent[];
  nextWeek: MarketEvent[];
  horizon: MarketEvent[];
}

function startOfWeek(d: Date): Date {
  const x = mkDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

export function groupUpcoming(events: MarketEvent[], today = new Date(), horizonDays = 45): GroupedEvents {
  const thisWeekStart = startOfWeek(today);
  const nextWeekStart = new Date(thisWeekStart); nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + 7);
  const weekAfterStart = new Date(thisWeekStart); weekAfterStart.setUTCDate(weekAfterStart.getUTCDate() + 14);
  const horizonEnd = new Date(thisWeekStart); horizonEnd.setUTCDate(horizonEnd.getUTCDate() + horizonDays);
  const todayStr = ymd(mkDate(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const out: GroupedEvents = { thisWeek: [], nextWeek: [], horizon: [] };
  for (const e of events) {
    if (e.date < todayStr || e.date >= ymd(horizonEnd)) continue;
    if (e.date < ymd(nextWeekStart)) out.thisWeek.push(e);
    else if (e.date < ymd(weekAfterStart)) out.nextWeek.push(e);
    else out.horizon.push(e);
  }
  return out;
}
