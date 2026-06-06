import type { MarketDataProvider, ExpiryInfo, OptionChain, OptionRow } from "./types";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15";

// ─── Cache ───────────────────────────────────────────────────────────────────
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;
function getCached<T>(key: string): T | null {
  const e = cache.get(key);
  if (!e || Date.now() - e.ts > CACHE_TTL) { cache.delete(key); return null; }
  return e.data as T;
}
function setCache(key: string, data: unknown) { cache.set(key, { data, ts: Date.now() }); }

// ─── Serial queue: 1 request at a time, 400ms between ───────────────────────
let lastRequestTime = 0;
const DELAY_MS = 400;
const mutex = { locked: false, queue: [] as Array<() => void> };

async function serialFetch<T>(fn: () => Promise<T>): Promise<T> {
  // Wait for lock
  if (mutex.locked) {
    await new Promise<void>((resolve) => mutex.queue.push(resolve));
  }
  mutex.locked = true;
  try {
    const elapsed = Date.now() - lastRequestTime;
    if (elapsed < DELAY_MS) await sleep(DELAY_MS - elapsed);
    const result = await fn();
    lastRequestTime = Date.now();
    return result;
  } finally {
    mutex.locked = false;
    const next = mutex.queue.shift();
    if (next) next();
  }
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ─── Crumb management ────────────────────────────────────────────────────────
let crumb: string | null = null;
let crumbCookies: string | null = null;
let crumbFetchedAt = 0;

async function ensureCrumb(): Promise<{ crumb: string; cookies: string }> {
  if (crumb && crumbCookies && Date.now() - crumbFetchedAt < 14400_000) {
    return { crumb, cookies: crumbCookies };
  }
  // Fetch with backoff
  const seedResp = await fetchWithBackoff("https://finance.yahoo.com", {
    headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" },
    redirect: "follow",
  });
  const setCookieHeaders = seedResp.headers.getSetCookie?.() ?? (seedResp.headers.get("set-cookie")?.split(", ") ?? []);
  const cookies = setCookieHeaders.map((c) => c.split(";")[0]).join("; ");

  const crumbResp = await fetchWithBackoff("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Referer: "https://finance.yahoo.com", Accept: "text/plain", Cookie: cookies },
  });
  const text = await crumbResp.text();
  if (!text || text === "null") throw new Error("Crumb is empty");

  crumb = text; crumbCookies = cookies; crumbFetchedAt = Date.now();
  return { crumb: text, cookies };
}

// ─── Fetch with exponential backoff on 429 ───────────────────────────────────
async function fetchWithBackoff(url: string, init?: RequestInit, retries = 4): Promise<Response> {
  let delay = 1000;
  for (let i = 0; i < retries; i++) {
    const resp = await fetch(url, init);
    if (resp.status !== 429) return resp;
    // Check Retry-After header
    const retryAfter = resp.headers.get("Retry-After");
    const wait = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay;
    await sleep(Math.max(wait, delay));
    delay *= 2;
  }
  throw new Error(`Yahoo 429 after ${retries} retries: ${url.split("?")[0]}`);
}

// ─── Low-level Yahoo JSON fetch (with crumb + backoff) ───────────────────────
async function fetchYahooJSON(urlStr: string): Promise<unknown> {
  const { crumb: c, cookies } = await ensureCrumb();
  const sep = urlStr.includes("?") ? "&" : "?";
  const fullURL = `${urlStr}${sep}crumb=${encodeURIComponent(c)}`;

  const resp = await fetchWithBackoff(fullURL, {
    headers: { "User-Agent": UA, Referer: "https://finance.yahoo.com", Accept: "application/json", Cookie: cookies },
  });

  if (resp.status === 401) {
    crumb = null; crumbCookies = null; crumbFetchedAt = 0;
    return fetchYahooJSON(urlStr); // retry with fresh crumb
  }
  if (!resp.ok) throw new Error(`Yahoo HTTP ${resp.status}`);
  return resp.json();
}

// ─── Provider ────────────────────────────────────────────────────────────────
export const yahooProvider: MarketDataProvider = {
  name: "yahoo",

  async getQuote(ticker: string) {
    const key = `yq:${ticker}`;
    const c = getCached<{ price: number; name: string }>(key);
    if (c) return c;

    return serialFetch(async () => {
      const json = await fetchYahooJSON(`https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`) as Record<string, unknown>;
      const meta = (json as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; shortName?: string } }> } })?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) throw new Error(`Quote error: ${ticker}`);
      const result = { price: meta.regularMarketPrice, name: meta.shortName ?? ticker };
      setCache(key, result);
      return result;
    });
  },

  async getExpirations(ticker: string) {
    const key = `ye:${ticker}`;
    const c = getCached<ExpiryInfo>(key);
    if (c) return c;

    return serialFetch(async () => {
      const json = await fetchYahooJSON(`https://query2.finance.yahoo.com/v7/finance/options/${ticker}`) as Record<string, unknown>;
      const result = (json as { optionChain?: { result?: Array<{ quote?: { regularMarketPrice?: number }; expirationDates?: number[] }> } })?.optionChain?.result?.[0];
      if (!result?.quote?.regularMarketPrice || !result?.expirationDates) throw new Error(`Expirations error: ${ticker}`);

      const price = result.quote.regularMarketPrice;
      const tsMap: Record<string, number> = {};
      const expirations = result.expirationDates.map((ts) => {
        const d = new Date(ts * 1000).toISOString().split("T")[0];
        tsMap[d] = ts;
        return d;
      });
      const info: ExpiryInfo = { ticker, price, expirations, expirationTimestamps: tsMap };
      setCache(key, info);
      return info;
    });
  },

  async getChain(ticker: string, expiry: string, expiryTimestamp?: number) {
    const ts = expiryTimestamp ?? Math.floor(new Date(expiry + "T00:00:00Z").getTime() / 1000);
    const key = `yc:${ticker}:${ts}`;
    const c = getCached<OptionChain>(key);
    if (c) return c;

    return serialFetch(async () => {
      const json = await fetchYahooJSON(`https://query2.finance.yahoo.com/v7/finance/options/${ticker}?date=${ts}`) as Record<string, unknown>;
      const r = (json as { optionChain?: { result?: Array<{ quote?: { regularMarketPrice?: number }; options?: Array<{ calls?: Array<Record<string, number>>; puts?: Array<Record<string, number>> }> }> } })?.optionChain?.result?.[0];
      const price = r?.quote?.regularMarketPrice ?? 0;
      if (!price) throw new Error(`Chain error: ${ticker}`);

      const expDate = new Date(expiry + "T00:00:00Z");
      const dte = Math.max(Math.ceil((expDate.getTime() - Date.now()) / 86400000), 0);
      const opts = r?.options?.[0] ?? {};

      const mapRow = (o: Record<string, number>): OptionRow => ({
        strike: o.strike ?? 0,
        last: o.lastPrice ?? 0,
        bid: o.bid ?? 0,
        ask: o.ask ?? 0,
        iv: ((o.impliedVolatility ?? 0.25) * 100),
        oi: o.openInterest ?? 0,
        volume: o.volume ?? 0,
      });

      const calls = ((opts.calls ?? []) as Array<Record<string, number>>).map(mapRow).filter((r) => r.strike > 0).sort((a, b) => a.strike - b.strike);
      const puts = ((opts.puts ?? []) as Array<Record<string, number>>).map(mapRow).filter((r) => r.strike > 0).sort((a, b) => a.strike - b.strike);

      const chain: OptionChain = { ticker, price, expiry, dte, calls, puts };
      setCache(key, chain);
      return chain;
    });
  },
};
