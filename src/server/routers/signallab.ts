/**
 * SignalLab tRPC Router — Options analysis, CSP screener, market data
 */

import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import * as yahoo from "../services/yahoo-finance";
import * as math from "../services/math-engine";
import { impliedVolBisection } from "../services/black-scholes";

// ─── CSP Screener Constants ──────────────────────────────────────────────────

const ALL_TICKERS =
  "TSLA,NVDA,AMD,COIN,MSTR,PLTR,MARA,RIOT,GME,AMC,SOFI,RIVN,LCID,NIO,CVNA,SMCI,CRWD,NET,ANET,MRVL,POET,HOOD,RDDT,UBER,SHOP,SPY,QQQ,IWM,AAPL,META,GOOGL,MSFT,AMZN,AVGO";
const OZAN_TICKERS = "OSCR,EOSE,BMNR,IREN,CLS,MU,CRDO,SNDK,AAOI,PENG,GLW";
const CSP_RISK_FREE_RATE = 0.045;

// ─── CSP Helper Types ────────────────────────────────────────────────────────

interface CSPContract {
  ticker: string;
  spot: number;
  strike: number;
  expiry: string;
  dte: number;
  bid: number;
  ask: number;
  mid: number;
  iv: number | null;
  ivSource: string;
  ivClass: number;
  collateral: number;
  premium: number;
  yieldPct: number;
  annYield: number;
  moneyness: number;
  breakeven: number;
  discount: number;
  volume: number;
  oi: number;
}

interface CSPDiagnostic {
  ticker: string;
  spot: number | null;
  expiry: string | null;
  rawPuts: number;
  inRange: number;
  hasMid: number;
  oiPass: number;
  kept: number;
  reason: string | null;
}

function cspClassify(ivPct: number | null): number {
  if (!ivPct || ivPct <= 0 || isNaN(ivPct)) return 4;
  if (ivPct >= 100) return 1;
  if (ivPct >= 80) return 2;
  if (ivPct >= 60) return 3;
  return 4;
}

function findBestExpiry(available: string[], target: string, tolerance = 7): string | null {
  const targetDate = new Date(target + "T00:00:00Z");
  const now = new Date();

  let bestFriday: string | null = null;
  let bestFridayDiff = 999;
  let bestAny: string | null = null;
  let bestAnyDiff = 999;

  for (const exp of available) {
    const d = new Date(exp + "T00:00:00Z");
    const daysFromNow = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysFromNow <= 0) continue;
    const diff = Math.abs(Math.ceil((d.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)));

    if (diff < bestAnyDiff) {
      bestAnyDiff = diff;
      bestAny = exp;
    }
    // Friday = day 5 (0=Sun)
    if (d.getUTCDay() === 5 && diff < bestFridayDiff) {
      bestFridayDiff = diff;
      bestFriday = exp;
    }
  }

  if (bestFriday && bestFridayDiff <= tolerance) return bestFriday;
  if (bestAny && bestAnyDiff <= tolerance) return bestAny;
  return null;
}

async function fetchCSPTicker(
  ticker: string,
  targetDate: string,
  minOI: number,
): Promise<{ contracts: CSPContract[]; diag: CSPDiagnostic }> {
  try {
    const expiryInfo = await yahoo.getExpirations(ticker);
    const spot = expiryInfo.price;

    const matchedExpiry = findBestExpiry(expiryInfo.expirations, targetDate);
    if (!matchedExpiry) {
      return { contracts: [], diag: { ticker, spot, expiry: null, rawPuts: 0, inRange: 0, hasMid: 0, oiPass: 0, kept: 0, reason: `no expiry near ${targetDate}` } };
    }

    const ts = expiryInfo.expirationTimestamps[matchedExpiry];
    const chain = await yahoo.getChain(ticker, matchedExpiry, ts);
    const dte = chain.dte;
    if (dte <= 0) {
      return { contracts: [], diag: { ticker, spot, expiry: matchedExpiry, rawPuts: 0, inRange: 0, hasMid: 0, oiPass: 0, kept: 0, reason: "expiry past" } };
    }

    const T = dte / 365;
    const rawPuts = chain.puts.length;
    const low = spot * 0.80;
    const high = spot * 1.05;
    const contracts: CSPContract[] = [];
    let inRange = 0, hasMid = 0, oiPass = 0;
    const maxAboveATM = 5;

    for (const put of chain.puts) {
      const strike = put.strike;
      if (!strike || strike < low || strike > high) continue;
      inRange++;

      const bid = put.bid;
      const ask = put.ask;
      const last = put.last;
      let mid: number;
      if (bid > 0 && ask > 0) mid = (bid + ask) / 2;
      else if (last > 0) mid = last;
      else continue;
      hasMid++;

      const oi = put.oi;
      const oiKnown = oi > 0;
      if (oiKnown && oi < minOI) continue;
      oiPass++;

      // IV via bisection
      const bsIV = impliedVolBisection(mid, spot, strike, T, CSP_RISK_FREE_RATE, false);
      let iv: number | null = null;
      let ivSource = "none";
      if (bsIV && bsIV > 0) { iv = bsIV * 100; ivSource = "bs"; }
      else if (put.iv > 0) { iv = put.iv; ivSource = "yf"; }

      const collateral = strike * 100;
      const premium = mid * 100;
      const yieldPct = (premium / collateral) * 100;
      const annYield = yieldPct * (365 / dte);
      const breakeven = strike - mid;
      const discount = ((spot - breakeven) / spot) * 100;
      const moneyness = ((strike / spot) - 1) * 100;

      contracts.push({
        ticker, spot, strike, expiry: matchedExpiry, dte,
        bid, ask, mid, iv, ivSource, ivClass: cspClassify(iv),
        collateral, premium, yieldPct, annYield,
        moneyness, breakeven, discount, volume: -1, oi: oiKnown ? oi : -1,
      });
    }

    // Keep all below/at spot, only first 5 above spot
    const belowATM = contracts.filter((c) => c.strike <= spot);
    const aboveATM = contracts.filter((c) => c.strike > spot).sort((a, b) => a.strike - b.strike).slice(0, maxAboveATM);
    const finalContracts = [...belowATM, ...aboveATM];

    return { contracts: finalContracts, diag: { ticker, spot, expiry: matchedExpiry, rawPuts, inRange, hasMid, oiPass, kept: finalContracts.length, reason: null } };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return { contracts: [], diag: { ticker, spot: null, expiry: null, rawPuts: 0, inRange: 0, hasMid: 0, oiPass: 0, kept: 0, reason: msg } };
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const signallabRouter = router({
  // CSP Screener
  cspScan: publicProcedure
    .input(z.object({
      watchlist: z.enum(["all", "ozan", "custom"]).default("all"),
      customTickers: z.string().optional(),
      expiry: z.string(),
      minOI: z.number().default(0),
    }))
    .query(async ({ input }) => {
      let tickerStr: string;
      switch (input.watchlist) {
        case "ozan": tickerStr = OZAN_TICKERS; break;
        case "custom": tickerStr = input.customTickers ?? ALL_TICKERS; break;
        default: tickerStr = ALL_TICKERS;
      }
      const tickers = tickerStr.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);

      const allContracts: CSPContract[] = [];
      const allDiags: CSPDiagnostic[] = [];

      // Process in batches of 6
      for (let i = 0; i < tickers.length; i += 6) {
        const batch = tickers.slice(i, i + 6);
        const results = await Promise.allSettled(
          batch.map((t) => fetchCSPTicker(t, input.expiry, input.minOI)),
        );
        for (const r of results) {
          if (r.status === "fulfilled") {
            allContracts.push(...r.value.contracts);
            allDiags.push(r.value.diag);
          }
        }
      }

      // Group by ticker
      const grouped = new Map<string, CSPContract[]>();
      for (const c of allContracts) {
        const arr = grouped.get(c.ticker) ?? [];
        arr.push(c);
        grouped.set(c.ticker, arr);
      }

      const groups = Array.from(grouped.entries()).map(([tk, items]) => {
        const sorted = [...items].sort((a, b) => b.yieldPct - a.yieldPct);
        const ivs = sorted.map((s) => s.iv).filter((v): v is number => v !== null);
        const atmItem = sorted.reduce((best, cur) => Math.abs(cur.moneyness) < Math.abs(best.moneyness) ? cur : best, sorted[0]);
        return {
          ticker: tk,
          spot: sorted[0]?.spot ?? 0,
          expiry: sorted[0]?.expiry ?? "",
          dte: sorted[0]?.dte ?? 0,
          strikes: sorted,
          maxIV: ivs.length > 0 ? Math.max(...ivs) : null,
          atmIV: atmItem?.iv ?? null,
          maxYield: sorted[0]?.yieldPct ?? 0,
          bestClass: Math.min(...sorted.map((s) => s.ivClass)),
        };
      });

      const classDist = { 1: 0, 2: 0, 3: 0, 4: 0 };
      for (const c of allContracts) classDist[c.ivClass as 1|2|3|4]++;

      return { groups, diagnostics: allDiags.sort((a, b) => a.ticker.localeCompare(b.ticker)), classDist, totalContracts: allContracts.length };
    }),

  // Market Overview
  marketOverview: publicProcedure.query(async () => {
    return yahoo.fetchMarketOverview();
  }),

  // Watchlist
  watchlist: publicProcedure
    .input(z.object({ tickers: z.array(z.string()) }))
    .query(async ({ input }) => {
      return yahoo.fetchWatchlist(input.tickers);
    }),

  // Sectors
  sectors: publicProcedure.query(async () => {
    return yahoo.fetchSectors();
  }),

  // AI Strategy Pick
  aiPick: publicProcedure
    .input(z.object({ ticker: z.string(), expiry: z.string() }))
    .query(async ({ input }) => {
      const { ticker, expiry } = input;
      const expDate = new Date(expiry + "T00:00:00Z");
      const dte = Math.max(Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)), 0);

      const [quote, hv, ivData] = await Promise.all([
        yahoo.fetchQuote(ticker),
        yahoo.fetchHV(ticker).catch(() => 0.25),
        yahoo.fetchIVRank(ticker).catch(() => ({ ivRank: 50, currentIV: 25 })),
      ]);

      let chain: yahoo.OptionChain;
      try {
        const expiryInfo = await yahoo.getExpirations(ticker);
        const ts = expiryInfo.expirationTimestamps[expiry];
        chain = await yahoo.getChain(ticker, expiry, ts);
      } catch {
        chain = { ticker, price: quote.price, expiry, dte, calls: [], puts: [] };
      }

      return math.buildAIPick(ticker, quote.price, expiry, dte, chain, hv, ivData.ivRank, ivData.currentIV);
    }),

  // Manual Analysis
  manualAnalysis: publicProcedure
    .input(z.object({
      ticker: z.string(),
      expiry: z.string(),
      legs: z.array(z.object({
        action: z.enum(["buy", "sell"]),
        type: z.enum(["call", "put"]),
        strike: z.number(),
        last: z.number(),
        contracts: z.number(),
      })),
      capital: z.number().default(100000),
    }))
    .query(async ({ input }) => {
      const { ticker, expiry, legs, capital } = input;
      const expDate = new Date(expiry + "T00:00:00Z");
      const dte = Math.max(Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)), 0);
      const hv = await yahoo.fetchHV(ticker).catch(() => 0.25);
      const quote = await yahoo.fetchQuote(ticker);
      return math.analyzeStrategy(ticker, quote.price, expiry, dte, legs, capital, hv);
    }),

  // Get expirations for a ticker
  expirations: publicProcedure
    .input(z.object({ ticker: z.string() }))
    .query(async ({ input }) => {
      return yahoo.getExpirations(input.ticker);
    }),

  // Get option chain
  optionChain: publicProcedure
    .input(z.object({ ticker: z.string(), expiry: z.string(), expiryTimestamp: z.number().optional() }))
    .query(async ({ input }) => {
      return yahoo.getChain(input.ticker, input.expiry, input.expiryTimestamp);
    }),

  // Ticker lists
  tickerLists: publicProcedure.query(() => ({
    all: ALL_TICKERS.split(","),
    ozan: OZAN_TICKERS.split(","),
  })),
});
