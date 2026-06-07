/**
 * Yahoo Finance Service — Node.js port of SignalLab's YahooFinanceService.swift
 *
 * Handles crumb/cookie auth, quote fetching, HV calculation, option chains,
 * IV rank, RSI, market overview, watchlist, and sectors.
 */

import { greeks as bsGreeks, realWorldProbability } from "./black-scholes";

// ─── Retry helper ────────────────────────────────────────────────────────────
async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
async function withRetry<T>(fn: () => Promise<T>, retries = 2, baseDelay = 15000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); } catch (e) {
      if (i === retries - 1) throw e;
      const delay = baseDelay * Math.pow(2, i);
      await sleep(delay);
    }
  }
  throw new Error("unreachable");
}

// ─── cURL-based fetcher (bypasses Node.js TLS fingerprinting) ────────────────
import { execFileSync } from "child_process";

function curlFetch(url: string, cookies?: string): { status: number; body: string } {
  const args = [
    "-s", "-L", "--max-time", "30",
    "-w", "\n%{http_code}",
    "-H", `User-Agent: ${UA}`,
    "-H", "Accept: application/json",
    "-H", "Accept-Language: en-US,en;q=0.9",
    "-H", "Referer: https://finance.yahoo.com",
  ];
  if (cookies) {
    args.push("-H", `Cookie: ${cookies}`);
  }
  args.push(url);

  const raw = execFileSync("/usr/bin/curl", args, {
    encoding: "utf-8",
    timeout: 35000,
  });

  const lines = raw.trimEnd().split("\n");
  const statusStr = lines.pop() ?? "0";
  const body = lines.join("\n");
  return { status: parseInt(statusStr, 10), body };
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExpiryInfo {
  ticker: string;
  price: number;
  expirations: string[];
  expirationTimestamps: Record<string, number>;
}

export interface OptionRow {
  strike: number;
  last: number;
  bid: number;
  ask: number;
  iv: number;
  oi: number;
  delta: number;
  theta: number;
  vega: number;
  itm: boolean;
  winProbLong: number;
  winProbShort: number;
}

export interface OptionChain {
  ticker: string;
  price: number;
  expiry: string;
  dte: number;
  calls: OptionRow[];
  puts: OptionRow[];
}

export interface MarketIndex {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
}

export interface FearGreedData {
  value: number;
  classification: string;
}

export interface MarketOverviewData {
  indices: MarketIndex[];
  commodities: MarketIndex[];
  fearGreed: FearGreedData;
  vix: number;
}

export interface WatchlistItem {
  symbol: string;
  price: number;
  changePct: number;
  ivRank: number;
  hv: number;
  trend: string;
  rsi: number;
}

export interface SectorItem {
  symbol: string;
  name: string;
  price: number;
  change1d: number;
  change1w: number;
  change1m: number;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// ─── Request throttle (avoid Yahoo 429) ──────────────────────────────────────
let lastRequestTime = 0;
const MIN_REQUEST_GAP = 2000; // 2 seconds between requests

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_GAP) {
    await sleep(MIN_REQUEST_GAP - elapsed);
  }
  lastRequestTime = Date.now();
}

// ─── Crumb Management ────────────────────────────────────────────────────────

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

let crumb: string | null = null;
let crumbCookies: string | null = null;
let crumbFetchedAt = 0;

async function ensureCrumb(): Promise<{ crumb: string; cookies: string }> {
  // Return cached crumb if fresh (< 4 hours)
  if (crumb && crumbCookies && Date.now() - crumbFetchedAt < 14400 * 1000) {
    return { crumb, cookies: crumbCookies };
  }

  // fc.yahoo.com sets A3 cookie even from TR/EU regions
  const cookieJar = `/tmp/yf_cookies_${process.pid}.txt`;
  execFileSync("/usr/bin/curl", [
    "-s", "-c", cookieJar, "-o", "/dev/null",
    "-H", `User-Agent: ${UA}`,
    "https://fc.yahoo.com",
  ], { encoding: "utf-8", timeout: 15000 });

  // Step 2: Fetch crumb using cookie jar
  const crumbRaw = execFileSync("/usr/bin/curl", [
    "-s", "-b", cookieJar,
    "-H", `User-Agent: ${UA}`,
    "-H", "Accept: text/plain",
    "-H", "Referer: https://finance.yahoo.com",
    "-w", "\n%{http_code}",
    "https://query2.finance.yahoo.com/v1/test/getcrumb",
  ], { encoding: "utf-8", timeout: 15000 });

  const crumbLines = crumbRaw.trimEnd().split("\n");
  const crumbStatus = parseInt(crumbLines.pop() ?? "0", 10);
  const crumbText = crumbLines.join("").trim();

  if (crumbStatus === 429) {
    throw new Error("Yahoo 429 rate limited on crumb fetch");
  }
  if (crumbStatus !== 200 || !crumbText || crumbText === "null" || crumbText.includes("Too Many")) {
    throw new Error(`Crumb fetch failed: HTTP ${crumbStatus} body="${crumbText}"`);
  }

  // Read cookies from jar file (handle #HttpOnly_ prefix)
  const { readFileSync, unlinkSync } = await import("fs");
  const jarContent = readFileSync(cookieJar, "utf-8");
  const cookies = jarContent.split("\n")
    .map(l => l.startsWith("#HttpOnly_") ? l.slice(10) : l)
    .filter(l => l && !l.startsWith("#") && l.includes("\t"))
    .map(l => {
      const parts = l.split("\t");
      return parts.length >= 7 ? `${parts[5]}=${parts[6]}` : "";
    })
    .filter(Boolean)
    .join("; ");

  try { unlinkSync(cookieJar); } catch {}

  crumb = crumbText;
  crumbCookies = cookies;
  crumbFetchedAt = Date.now();

  return { crumb: crumbText, cookies };
}

// ─── Low-level fetch ─────────────────────────────────────────────────────────

async function fetchJSON(urlStr: string): Promise<unknown> {
  // v8 chart endpoints work without crumb
  const isChartAPI = urlStr.includes("/v8/finance/chart/");

  await throttle();

  if (isChartAPI) {
    const result = curlFetch(urlStr);
    if (result.status === 200) return JSON.parse(result.body);
    if (result.status === 429) {
      // Don't retry immediately — just fail and let cache handle it next time
      throw new Error(`Yahoo 429 rate limited: ${urlStr}`);
    }
    // For other errors on chart API, fall through to crumb-based approach
  }

  // For endpoints requiring crumb (options, etc)
  return withRetry(async () => {
    await throttle();
    const { crumb: c, cookies } = await ensureCrumb();
    const separator = urlStr.includes("?") ? "&" : "?";
    const fullURL = `${urlStr}${separator}crumb=${encodeURIComponent(c)}`;

    const result = curlFetch(fullURL, cookies);

    if (result.status === 429) {
      throw new Error(`Yahoo 429 rate limited: ${urlStr}`);
    }
    if (result.status === 401) {
      crumb = null;
      crumbCookies = null;
      crumbFetchedAt = 0;
      throw new Error(`Yahoo 401 crumb expired: ${urlStr}`);
    }
    if (result.status !== 200) {
      throw new Error(`Yahoo API error: HTTP ${result.status}`);
    }
    return JSON.parse(result.body);
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function fetchQuote(
  ticker: string,
): Promise<{ price: number; name: string }> {
  const cacheKey = `quote:${ticker}`;
  const cached = getCached<{ price: number; name: string }>(cacheKey);
  if (cached) return cached;

  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
  const json = (await fetchJSON(url)) as {
    chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; shortName?: string } }> };
  };

  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) {
    throw new Error(`Quote parse error: ${ticker}`);
  }

  const result = { price: meta.regularMarketPrice, name: meta.shortName ?? ticker };
  setCache(cacheKey, result);
  return result;
}

export async function fetchHV(ticker: string, days = 30): Promise<number> {
  const cacheKey = `hv:${ticker}:${days}`;
  const cached = getCached<number>(cacheKey);
  if (cached !== null) return cached;

  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=3mo`;
  const json = (await fetchJSON(url)) as {
    chart?: {
      result?: Array<{
        indicators?: { quote?: Array<{ close?: (number | null)[] }> };
      }>;
    };
  };

  const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
  if (!closes) return 0.25;

  const clean = closes.filter((c): c is number => c !== null && c !== undefined);
  if (clean.length < 2) return 0.25;

  const window = Math.min(days + 1, clean.length);
  const slice = clean.slice(-window);
  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    returns.push(Math.log(slice[i] / slice[i - 1]));
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.map((r) => (r - mean) ** 2).reduce((a, b) => a + b, 0) /
    (returns.length - 1);

  const hv = Math.sqrt(variance) * Math.sqrt(252);
  setCache(cacheKey, hv);
  return hv;
}

export async function fetchChangePct(ticker: string): Promise<number> {
  const cacheKey = `chg:${ticker}`;
  const cached = getCached<number>(cacheKey);
  if (cached !== null) return cached;

  const json = (await fetchJSON(
    `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`,
  )) as {
    chart?: {
      result?: Array<{
        meta?: { regularMarketPrice?: number; chartPreviousClose?: number };
      }>;
    };
  };

  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice || !meta?.chartPreviousClose || meta.chartPreviousClose === 0) {
    return 0;
  }

  const pct = ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100;
  setCache(cacheKey, pct);
  return pct;
}

export async function getExpirations(ticker: string): Promise<ExpiryInfo> {
  const cacheKey = `exp:${ticker}`;
  const cached = getCached<ExpiryInfo>(cacheKey);
  if (cached) return cached;

  const url = `https://query2.finance.yahoo.com/v7/finance/options/${ticker}`;
  const json = (await fetchJSON(url)) as {
    optionChain?: {
      result?: Array<{
        quote?: { regularMarketPrice?: number };
        expirationDates?: number[];
      }>;
    };
  };

  const result = json?.optionChain?.result?.[0];
  if (!result?.quote?.regularMarketPrice || !result?.expirationDates) {
    throw new Error(`Expirations parse error: ${ticker}`);
  }

  const price = result.quote.regularMarketPrice;
  const tsMap: Record<string, number> = {};
  const expirations = result.expirationDates.map((ts) => {
    const d = new Date(ts * 1000);
    const dateStr = d.toISOString().split("T")[0];
    tsMap[dateStr] = ts;
    return dateStr;
  });

  const info: ExpiryInfo = { ticker, price, expirations, expirationTimestamps: tsMap };
  setCache(cacheKey, info);
  return info;
}

export async function getChain(
  ticker: string,
  expiry: string,
  expiryTimestamp?: number,
): Promise<OptionChain> {
  const ts = expiryTimestamp ?? Math.floor(new Date(expiry + "T00:00:00Z").getTime() / 1000);
  const cacheKey = `chain:${ticker}:${ts}`;
  const cached = getCached<OptionChain>(cacheKey);
  if (cached) return cached;

  const url = `https://query2.finance.yahoo.com/v7/finance/options/${ticker}?date=${ts}`;
  const json = (await fetchJSON(url)) as {
    optionChain?: {
      result?: Array<{
        quote?: { regularMarketPrice?: number };
        options?: Array<{
          calls?: Array<Record<string, unknown>>;
          puts?: Array<Record<string, unknown>>;
        }>;
      }>;
    };
  };

  const result = json?.optionChain?.result?.[0];
  const price = result?.quote?.regularMarketPrice ?? 0;
  if (!price) throw new Error(`Chain parse error: ${ticker}`);

  const options = result?.options?.[0] ?? {};
  const expDate = new Date(expiry + "T00:00:00Z");
  const now = new Date();
  const dte = Math.max(
    Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    0,
  );
  const T = dte / 365;
  const r = 0.05;

  // Fetch HV for real-world probability
  let hv: number;
  try {
    hv = await fetchHV(ticker);
  } catch {
    hv = 0.25;
  }

  function parseRows(
    raw: Array<Record<string, unknown>>,
    isCall: boolean,
  ): OptionRow[] {
    return raw
      .map((o) => {
        const strike = Number(o.strike) || 0;
        if (!strike) return null;
        const last = Number(o.lastPrice) || 0;
        const bid = Number(o.bid) || 0;
        const ask = Number(o.ask) || 0;
        const iv = ((Number(o.impliedVolatility) || 0.25) * 100);
        const oi = Number(o.openInterest) || 0;
        const sigma = iv / 100;

        const g = bsGreeks(price, strike, T, r, sigma, isCall);
        const itm = isCall ? price > strike : price < strike;

        const wpl = realWorldProbability(price, strike, T, hv, 0, isCall, false);
        const wps = realWorldProbability(price, strike, T, hv, 0, isCall, true);

        return {
          strike,
          last,
          bid,
          ask,
          iv,
          oi,
          delta: g.delta,
          theta: g.theta,
          vega: g.vega,
          itm,
          winProbLong: wpl * 100,
          winProbShort: wps * 100,
        } satisfies OptionRow;
      })
      .filter((r): r is OptionRow => r !== null)
      .sort((a, b) => a.strike - b.strike);
  }

  const callsRaw = (options.calls as Array<Record<string, unknown>>) ?? [];
  const putsRaw = (options.puts as Array<Record<string, unknown>>) ?? [];

  const chain: OptionChain = {
    ticker,
    price,
    expiry,
    dte,
    calls: parseRows(callsRaw, true),
    puts: parseRows(putsRaw, false),
  };

  setCache(cacheKey, chain);
  return chain;
}

export async function fetchIVRank(
  ticker: string,
): Promise<{ ivRank: number; currentIV: number }> {
  const cacheKey = `ivrank:${ticker}`;
  const cached = getCached<{ ivRank: number; currentIV: number }>(cacheKey);
  if (cached) return cached;

  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1wk&range=1y`;
  const json = (await fetchJSON(url)) as {
    chart?: {
      result?: Array<{
        indicators?: { quote?: Array<{ close?: (number | null)[] }> };
      }>;
    };
  };

  const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
  if (!closes) return { ivRank: 50, currentIV: 25 };

  const clean = closes.filter((c): c is number => c !== null && c !== undefined);
  if (clean.length < 4) return { ivRank: 50, currentIV: 25 };

  // Rolling 4-week HV as IV proxy
  const hvSeries: number[] = [];
  const step = 4;
  for (let i = step; i <= clean.length; i++) {
    const slice = clean.slice(i - step, i);
    const rets: number[] = [];
    for (let j = 1; j < slice.length; j++) {
      rets.push(Math.log(slice[j] / slice[j - 1]));
    }
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const v =
      rets.map((r) => (r - mean) ** 2).reduce((a, b) => a + b, 0) /
      Math.max(rets.length - 1, 1);
    hvSeries.push(Math.sqrt(v) * Math.sqrt(52) * 100);
  }

  const currentIV = hvSeries[hvSeries.length - 1] ?? 25;
  const lo = Math.min(...hvSeries);
  const hi = Math.max(...hvSeries);
  const ivRank = hi > lo ? ((currentIV - lo) / (hi - lo)) * 100 : 50;

  const result = { ivRank, currentIV };
  setCache(cacheKey, result);
  return result;
}

export async function fetchRSI(ticker: string, period = 14): Promise<number> {
  const cacheKey = `rsi:${ticker}:${period}`;
  const cached = getCached<number>(cacheKey);
  if (cached !== null) return cached;

  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=3mo`;
  const json = (await fetchJSON(url)) as {
    chart?: {
      result?: Array<{
        indicators?: { quote?: Array<{ close?: (number | null)[] }> };
      }>;
    };
  };

  const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
  if (!closes) return 50;

  const clean = closes.filter((c): c is number => c !== null && c !== undefined);
  if (clean.length <= period + 1) return 50;

  let gains = 0;
  let losses = 0;
  for (let i = clean.length - period; i < clean.length; i++) {
    const diff = clean[i] - clean[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  if (losses === 0) return 100;
  const rs = gains / period / (losses / period);
  const rsi = 100 - 100 / (1 + rs);
  setCache(cacheKey, rsi);
  return rsi;
}

export async function fetchMarketOverview(): Promise<MarketOverviewData> {
  const cacheKey = "market-overview";
  const cached = getCached<MarketOverviewData>(cacheKey);
  if (cached) return cached;

  const symbols = ["^GSPC", "^NDX", "^DJI", "^RUT", "GC=F", "CL=F"];
  const indices: MarketIndex[] = [];

  // Sequential to avoid rate limiting
  for (const sym of symbols) {
    try {
      const { price, name } = await fetchQuote(sym);
      const chg = await fetchChangePct(sym).catch(() => 0);
      indices.push({ symbol: sym, name, price, changePct: chg });
    } catch { /* skip failed */ }
  }

  let vixPrice = 20;
  try {
    const vq = await fetchQuote("^VIX");
    vixPrice = vq.price;
  } catch {
    /* fallback */
  }

  const fearGreed = fearGreedApprox(vixPrice);

  const data: MarketOverviewData = {
    indices: indices.slice(0, 4),
    commodities: indices.slice(4),
    fearGreed,
    vix: vixPrice,
  };

  setCache(cacheKey, data);
  return data;
}

function fearGreedApprox(vix: number): FearGreedData {
  if (vix < 12) return { value: 85, classification: "Extreme Greed" };
  if (vix < 16) return { value: 65, classification: "Greed" };
  if (vix < 20) return { value: 50, classification: "Neutral" };
  if (vix < 25) return { value: 35, classification: "Fear" };
  if (vix < 30) return { value: 20, classification: "Extreme Fear" };
  return { value: 10, classification: "Extreme Fear" };
}

export async function fetchWatchlist(tickers: string[]): Promise<WatchlistItem[]> {
  const items: WatchlistItem[] = [];

  for (const t of tickers) {
    try {
      const { price } = await fetchQuote(t);
      const chg = await fetchChangePct(t).catch(() => 0);
      const hv = await fetchHV(t).catch(() => 0.25);
      const ivData = await fetchIVRank(t).catch(() => ({ ivRank: 50, currentIV: hv * 100 }));
      const rsi = await fetchRSI(t).catch(() => 50);
      const trend = rsi > 55 ? "bullish" : rsi < 45 ? "bearish" : "neutral";
      items.push({ symbol: t, price, changePct: chg, ivRank: ivData.ivRank, hv: hv * 100, trend, rsi });
    } catch { /* skip */ }
  }

  return items.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export async function fetchSectors(): Promise<SectorItem[]> {
  const cacheKey = "sectors";
  const cached = getCached<SectorItem[]>(cacheKey);
  if (cached) return cached;

  const etfs: [string, string][] = [
    ["XLK", "Technology"],
    ["XLF", "Financials"],
    ["XLV", "Health Care"],
    ["XLE", "Energy"],
    ["XLI", "Industrials"],
    ["XLY", "Cons. Discret."],
    ["XLP", "Cons. Staples"],
    ["XLB", "Materials"],
    ["XLU", "Utilities"],
    ["XLRE", "Real Estate"],
    ["XLC", "Comm. Services"],
  ];

  const sectors: SectorItem[] = [];
  for (const [sym, name] of etfs) {
    try {
      const { price } = await fetchQuote(sym);
      const d1 = await fetchChangePct(sym).catch(() => 0);
      sectors.push({ symbol: sym, name, price, change1d: d1, change1w: 0, change1m: 0 });
    } catch { /* skip */ }
  }

  setCache(cacheKey, sectors);
  return sectors;
}
