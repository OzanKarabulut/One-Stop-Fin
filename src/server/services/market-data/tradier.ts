import type { MarketDataProvider, ExpiryInfo, OptionChain, OptionRow } from "./types";

const BASE = "https://sandbox.tradier.com/v1";

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.TRADIER_TOKEN || ""}`,
    Accept: "application/json",
  };
}

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const e = cache.get(key);
  if (!e || Date.now() - e.ts > CACHE_TTL) { cache.delete(key); return null; }
  return e.data as T;
}
function setCache(key: string, data: unknown) { cache.set(key, { data, ts: Date.now() }); }

async function fetchJSON(url: string) {
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Tradier ${res.status}: ${url}`);
  return res.json();
}

export const tradierProvider: MarketDataProvider = {
  name: "tradier",

  async getQuote(ticker: string) {
    const key = `tq:${ticker}`;
    const c = getCached<{ price: number; name: string }>(key);
    if (c) return c;

    const json = await fetchJSON(`${BASE}/markets/quotes?symbols=${ticker}`);
    const q = json?.quotes?.quote;
    const price = q?.last ?? q?.close ?? 0;
    const name = q?.description ?? ticker;
    const result = { price, name };
    setCache(key, result);
    return result;
  },

  async getExpirations(ticker: string) {
    const key = `te:${ticker}`;
    const c = getCached<ExpiryInfo>(key);
    if (c) return c;

    const { price } = await this.getQuote(ticker);
    const json = await fetchJSON(`${BASE}/markets/options/expirations?symbol=${ticker}&includeAllRoots=true`);
    const dates: string[] = json?.expirations?.date ?? [];
    const tsMap: Record<string, number> = {};
    for (const d of dates) tsMap[d] = Math.floor(new Date(d + "T00:00:00Z").getTime() / 1000);

    const result: ExpiryInfo = { ticker, price, expirations: dates, expirationTimestamps: tsMap };
    setCache(key, result);
    return result;
  },

  async getChain(ticker: string, expiry: string) {
    const key = `tc:${ticker}:${expiry}`;
    const c = getCached<OptionChain>(key);
    if (c) return c;

    const { price } = await this.getQuote(ticker);
    const json = await fetchJSON(`${BASE}/markets/options/chains?symbol=${ticker}&expiration=${expiry}&greeks=true`);
    const options = json?.options?.option ?? [];

    const now = new Date();
    const expDate = new Date(expiry + "T00:00:00Z");
    const dte = Math.max(Math.ceil((expDate.getTime() - now.getTime()) / 86400000), 0);

    const calls: OptionRow[] = [];
    const puts: OptionRow[] = [];

    for (const o of options) {
      const row: OptionRow = {
        strike: o.strike ?? 0,
        last: o.last ?? 0,
        bid: o.bid ?? 0,
        ask: o.ask ?? 0,
        iv: (o.greeks?.mid_iv ?? 0) * 100,
        oi: o.open_interest ?? 0,
        volume: o.volume ?? 0,
      };
      if (!row.strike) continue;
      if (o.option_type === "call") calls.push(row);
      else puts.push(row);
    }

    calls.sort((a, b) => a.strike - b.strike);
    puts.sort((a, b) => a.strike - b.strike);

    const result: OptionChain = { ticker, price, expiry, dte, calls, puts };
    setCache(key, result);
    return result;
  },
};
