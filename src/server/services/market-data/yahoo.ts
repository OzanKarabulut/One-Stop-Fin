import type { MarketDataProvider, ExpiryInfo, OptionChain, OptionRow } from "./types";
import { execFileSync } from "child_process";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// ─── Cache ───────────────────────────────────────────────────────────────────
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;
function getCached<T>(key: string): T | null {
  const e = cache.get(key);
  if (!e || Date.now() - e.ts > CACHE_TTL) { cache.delete(key); return null; }
  return e.data as T;
}
function setCache(key: string, data: unknown) { cache.set(key, { data, ts: Date.now() }); }

// ─── Serial queue: 1 request at a time, 2s between ──────────────────────────
let lastRequestTime = 0;
const DELAY_MS = 2000;

async function serialFetch<T>(fn: () => Promise<T>): Promise<T> {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < DELAY_MS) await sleep(DELAY_MS - elapsed);
  lastRequestTime = Date.now();
  return fn();
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ─── cURL-based fetcher ──────────────────────────────────────────────────────
function curlFetch(url: string, cookies?: string): { status: number; body: string } {
  const args = [
    "-s", "-L", "--max-time", "30",
    "-w", "\n%{http_code}",
    "-H", `User-Agent: ${UA}`,
    "-H", "Accept: application/json",
    "-H", "Accept-Language: en-US,en;q=0.9",
    "-H", "Referer: https://finance.yahoo.com",
  ];
  if (cookies) args.push("-H", `Cookie: ${cookies}`);
  args.push(url);

  const raw = execFileSync("/usr/bin/curl", args, { encoding: "utf-8", timeout: 35000 });
  const lines = raw.trimEnd().split("\n");
  const statusStr = lines.pop() ?? "0";
  return { status: parseInt(statusStr, 10), body: lines.join("\n") };
}

// ─── Crumb management ────────────────────────────────────────────────────────
let crumb: string | null = null;
let crumbCookies: string | null = null;
let crumbFetchedAt = 0;

async function ensureCrumb(): Promise<{ crumb: string; cookies: string }> {
  if (crumb && crumbCookies && Date.now() - crumbFetchedAt < 14400_000) {
    return { crumb, cookies: crumbCookies };
  }

  // fc.yahoo.com sets A3 cookie even from TR/EU regions
  const cookieJar = `/tmp/yf_md_cookies_${process.pid}.txt`;
  execFileSync("/usr/bin/curl", [
    "-s", "-c", cookieJar, "-o", "/dev/null",
    "-H", `User-Agent: ${UA}`,
    "https://fc.yahoo.com",
  ], { encoding: "utf-8", timeout: 15000 });

  // Fetch crumb using cookie jar
  const crumbRaw = execFileSync("/usr/bin/curl", [
    "-s", "-b", cookieJar, "-w", "\n%{http_code}",
    "-H", `User-Agent: ${UA}`, "-H", "Accept: text/plain",
    "-H", "Referer: https://finance.yahoo.com",
    "https://query2.finance.yahoo.com/v1/test/getcrumb",
  ], { encoding: "utf-8", timeout: 15000 });

  const crumbLines = crumbRaw.trimEnd().split("\n");
  const crumbStatus = parseInt(crumbLines.pop() ?? "0", 10);
  const crumbText = crumbLines.join("").trim();

  if (crumbStatus !== 200 || !crumbText || crumbText.includes("Too Many")) {
    throw new Error(`Options verisi alınamıyor — crumb fetch failed (HTTP ${crumbStatus})`);
  }

  // Read cookies from jar (handle #HttpOnly_ prefix)
  const { readFileSync, unlinkSync } = await import("fs");
  const jarContent = readFileSync(cookieJar, "utf-8");
  const cookies = jarContent.split("\n")
    .map(l => l.startsWith("#HttpOnly_") ? l.slice(10) : l)
    .filter(l => l && !l.startsWith("#") && l.includes("\t"))
    .map(l => { const p = l.split("\t"); return p.length >= 7 ? `${p[5]}=${p[6]}` : ""; })
    .filter(Boolean).join("; ");
  try { unlinkSync(cookieJar); } catch {}

  crumb = crumbText; crumbCookies = cookies; crumbFetchedAt = Date.now();
  return { crumb: crumbText, cookies };
}

// ─── Low-level Yahoo JSON fetch ──────────────────────────────────────────────
async function fetchYahooJSON(urlStr: string): Promise<unknown> {
  const isChartAPI = urlStr.includes("/v8/finance/chart/");

  if (isChartAPI) {
    const result = curlFetch(urlStr);
    if (result.status === 200) return JSON.parse(result.body);
    if (result.status === 429) throw new Error(`Yahoo 429: ${urlStr}`);
  }

  // Options endpoints need crumb
  const { crumb: c, cookies } = await ensureCrumb();
  const sep = urlStr.includes("?") ? "&" : "?";
  const result = curlFetch(`${urlStr}${sep}crumb=${encodeURIComponent(c)}`, cookies);

  if (result.status === 401) {
    crumb = null; crumbCookies = null; crumbFetchedAt = 0;
    throw new Error(`Yahoo 401 crumb expired`);
  }
  if (result.status === 429) throw new Error(`Yahoo 429: ${urlStr}`);
  if (result.status !== 200) throw new Error(`Yahoo HTTP ${result.status}`);
  return JSON.parse(result.body);
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
