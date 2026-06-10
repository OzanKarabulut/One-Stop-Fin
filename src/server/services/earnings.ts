import { fetchJSON } from "./yahoo-finance";

const earningsCache = new Map<string, { result: boolean | null; ts: number }>();
const EARNINGS_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

export async function earningsInWindow(ticker: string, expiryIso: string): Promise<boolean | null> {
  const key = ticker.toUpperCase();
  const cached = earningsCache.get(key);
  if (cached && Date.now() - cached.ts < EARNINGS_CACHE_TTL) {
    if (cached.result === null) return null;
  }

  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(key)}?modules=calendarEvents`;
    const json = await fetchJSON(url) as { quoteSummary?: { result?: Array<{ calendarEvents?: { earnings?: { earningsDate?: Array<{ raw?: number }> } } }> } };
    const dates = json?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate;
    if (!Array.isArray(dates) || dates.length === 0) {
      earningsCache.set(key, { result: false, ts: Date.now() });
      return false;
    }
    const now = Date.now();
    const expiry = new Date(expiryIso + "T23:59:59Z").getTime();
    const inWindow = dates.some((d: { raw?: number }) => {
      if (!d.raw) return false;
      const ts = d.raw * 1000;
      return ts >= now && ts <= expiry;
    });
    earningsCache.set(key, { result: inWindow, ts: Date.now() });
    return inWindow;
  } catch {
    earningsCache.set(key, { result: null, ts: Date.now() });
    return null;
  }
}
