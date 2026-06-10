/**
 * SignalLab tRPC Router — Options analysis, CSP screener, market data
 */

import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import * as yahoo from "../services/yahoo-finance";
import * as math from "../services/math-engine";
import { impliedVolBisection } from "../services/black-scholes";
import { scoreCSPContract, type IVBucket } from "../services/csp-scoring";
import { marketData } from "../services/market-data";
import { getCboeChain } from "../services/market-data/cboe";
import { db } from "@/lib/db";
import type { GexContractInput } from "@/lib/gex";

// ─── CSP Screener Constants ──────────────────────────────────────────────────

const ALL_TICKERS =
  "TSLA,NVDA,AMD,COIN,MSTR,PLTR,MARA,RIOT,GME,AMC,SOFI,RIVN,LCID,NIO,CVNA,SMCI,CRWD,NET,ANET,MRVL,POET,HOOD,RDDT,UBER,SHOP,SPY,QQQ,IWM,AAPL,META,GOOGL,MSFT,AMZN,AVGO";
const OZAN_TICKERS = "NASA,RKLB,DRAM,MRVL,NNE,AMBA,CBRS,OSCR,EOSE,BMNR,IREN,CLS,MU,CRDO,SNDK,AAOI,PENG,GLW";
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
  // Scoring fields
  executablePremium: number;
  executablePremiumAmount: number;
  ivBucket: IVBucket;
  delta: number | null;
  probabilityITM: number | null;
  expectedMove: number | null;
  expectedMoveBuffer: number | null;
  distanceToStrikePct: number;
  breakevenDiscountPct: number;
  spreadPct: number | null;
  premiumYield: number;
  premiumPerDay: number;
  premiumEfficiency: number | null;
  companyQuality: string;
  companyComfortScore: number;
  companyNote: string;
  premiumScore: number;
  safetyScore: number;
  liquidityScore: number;
  qualityScore: number;
  cspScore: number;
  annualizedYield: number;
  actionLabel: string;
  riskNotes: string[];
  rejected: boolean;
  rejectReason: string | null;
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

function findBestExpiry(available: string[], target: string, tolerance = 2): string | null {
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
    const expiryInfo = await marketData.getExpirations(ticker);
    const spot = expiryInfo.price;

    const matchedExpiry = findBestExpiry(expiryInfo.expirations, targetDate);
    if (!matchedExpiry) {
      return { contracts: [], diag: { ticker, spot, expiry: null, rawPuts: 0, inRange: 0, hasMid: 0, oiPass: 0, kept: 0, reason: `no expiry near ${targetDate}` } };
    }

    const ts = expiryInfo.expirationTimestamps[matchedExpiry];
    const chain = await marketData.getChain(ticker, matchedExpiry, ts);
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
      if (last <= 0) continue;
      const mid = last;
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

      const volume = typeof put.volume === "number" && Number.isFinite(put.volume) ? put.volume : -1;
      const oiValue = oiKnown ? oi : -1;

      const scoring = scoreCSPContract({
        ticker, spot, strike, expiry: matchedExpiry, dte,
        bid, ask, mid, iv, collateral, premium, yieldPct, annYield, breakeven, discount, volume, oi: oiValue,
      });

      contracts.push({
        ticker, spot, strike, expiry: matchedExpiry, dte,
        bid, ask, mid, iv, ivSource, ivClass: cspClassify(iv),
        collateral, premium, yieldPct, annYield,
        moneyness, breakeven, discount, volume, oi: oiValue,
        ...scoring,
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

      // Ticker'ları paralel işle — gerçek eşzamanlılık yahoo-finance semaphore'unda sınırlı
      const settled = await Promise.all(tickers.map(async (t) => {
        try {
          const result = await fetchCSPTicker(t, input.expiry, input.minOI);
          return { contracts: result.contracts, diag: result.diag };
        } catch {
          return {
            contracts: [] as CSPContract[],
            diag: { ticker: t, spot: null, expiry: null, rawPuts: 0, inRange: 0, hasMid: 0, oiPass: 0, kept: 0, reason: "fetch error" } as CSPDiagnostic,
          };
        }
      }));
      for (const s of settled) {
        allContracts.push(...s.contracts);
        allDiags.push(s.diag);
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

      const sortByScore = (a: CSPContract, b: CSPContract) => b.cspScore - a.cspScore || b.executablePremiumAmount - a.executablePremiumAmount;
      const eligible = allContracts.filter((c) => !c.rejected && c.cspScore > 0);
      const topPicks = {
        "all": eligible.sort(sortByScore).slice(0, 3),
        "below-70": eligible.filter((c) => c.ivBucket === "below-70").sort(sortByScore).slice(0, 3),
        "70-100": eligible.filter((c) => c.ivBucket === "70-100").sort(sortByScore).slice(0, 3),
        "100-140": eligible.filter((c) => c.ivBucket === "100-140").sort(sortByScore).slice(0, 3),
        "140+": eligible.filter((c) => c.ivBucket === "140+").sort(sortByScore).slice(0, 3),
      };

      return { groups, topPicks, diagnostics: allDiags.sort((a, b) => a.ticker.localeCompare(b.ticker)), classDist, totalContracts: allContracts.length };
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
        const expiryInfo = await marketData.getExpirations(ticker);
        const ts = expiryInfo.expirationTimestamps[expiry];
        chain = await marketData.getChain(ticker, expiry, ts) as unknown as yahoo.OptionChain;
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
      return marketData.getExpirations(input.ticker);
    }),

  // Get option chain
  optionChain: publicProcedure
    .input(z.object({ ticker: z.string(), expiry: z.string(), expiryTimestamp: z.number().optional() }))
    .query(async ({ input }) => {
      return marketData.getChain(input.ticker, input.expiry, input.expiryTimestamp);
    }),

  // AI Strategy Scan — multi-ticker strategy finder
  aiStrategyScan: publicProcedure
    .input(z.object({
      watchlist: z.enum(["all", "ozan", "custom"]).default("all"),
      customTickers: z.string().optional(),
      expiry: z.string(),
      budget: z.number().default(100000),
    }))
    .query(async ({ input }) => {
      let tickerStr: string;
      switch (input.watchlist) {
        case "ozan": tickerStr = OZAN_TICKERS; break;
        case "custom": tickerStr = input.customTickers ?? ALL_TICKERS; break;
        default: tickerStr = ALL_TICKERS;
      }
      const tickers = tickerStr.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);

      const results = await Promise.all(tickers.map(async (ticker) => {
        try {
          const expDate = new Date(input.expiry + "T00:00:00Z");
          const dte = Math.max(Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)), 0);

          const [quote, hv, ivData] = await Promise.all([
            yahoo.fetchQuote(ticker),
            yahoo.fetchHV(ticker).catch(() => 0.25),
            yahoo.fetchIVRank(ticker).catch(() => ({ ivRank: 50, currentIV: 25 })),
          ]);

          let chain: yahoo.OptionChain;
          try {
            const expiryInfo = await marketData.getExpirations(ticker);
            const matchedExpiry = findBestExpiry(expiryInfo.expirations, input.expiry);
            if (!matchedExpiry) return { ticker, price: quote.price, strategies: [], signals: {} as never, debugReason: "Vade bulunamadı" };
            const ts = expiryInfo.expirationTimestamps[matchedExpiry];
            chain = await marketData.getChain(ticker, matchedExpiry, ts) as unknown as yahoo.OptionChain;
          } catch {
            chain = { ticker, price: quote.price, expiry: input.expiry, dte, calls: [], puts: [] };
          }

          const pick = math.buildAIPick(ticker, quote.price, input.expiry, dte, chain, hv, ivData.ivRank, ivData.currentIV);
          return { ticker, price: pick.price, strategies: pick.strategies, signals: pick.signals, debugReason: pick.debugInfo.reason };
        } catch (err) {
          return { ticker, price: 0, strategies: [], signals: {} as never, debugReason: err instanceof Error ? err.message : "Hata" };
        }
      }));

      // Flatten all strategies, attach ticker info, sort by composite score
      const allStrategies = results.flatMap((r) =>
        r.strategies.map((s) => ({ ...s, ticker: r.ticker, tickerPrice: r.price, tickerSignals: r.signals }))
      );
      allStrategies.sort((a, b) => b.compositeScore - a.compositeScore);

      // Budget filter: filter strategies where max loss exceeds budget
      const affordable = allStrategies.filter((s) => Math.abs(s.maxLoss) <= input.budget);

      return {
        totalTickers: tickers.length,
        scannedTickers: results.filter((r) => r.strategies.length > 0).length,
        topStrategies: affordable.slice(0, 20),
        allStrategies: affordable,
        diagnostics: results.filter((r) => r.debugReason).map((r) => ({ ticker: r.ticker, reason: r.debugReason })),
      };
    }),

  // Ticker lists
  tickerLists: publicProcedure.query(() => ({
    all: ALL_TICKERS.split(","),
    ozan: OZAN_TICKERS.split(","),
  })),

  // Position marks (real prices for command center)
  positionMarks: publicProcedure
    .input(z.object({
      positions: z.array(z.object({
        id: z.number(),
        ticker: z.string(),
        strike: z.number(),
        expiry: z.string(),
        optionType: z.string(),
      })),
    }))
    .query(async ({ input }) => {
      const byTicker = new Map<string, typeof input.positions>();
      for (const p of input.positions) {
        const arr = byTicker.get(p.ticker) ?? [];
        arr.push(p);
        byTicker.set(p.ticker, arr);
      }
      const results: Array<{ id: number; spot: number; mark: number | null; iv: number | null }> = [];
      await Promise.all([...byTicker.entries()].map(async ([ticker, positions]) => {
        try {
          const expiryInfo = await marketData.getExpirations(ticker);
          const spot = expiryInfo.price;
          for (const pos of positions) {
            try {
              const ts = expiryInfo.expirationTimestamps[pos.expiry];
              const chain = await marketData.getChain(ticker, pos.expiry, ts);
              const opts = pos.optionType === "call" ? chain.calls : chain.puts;
              const match = opts.find((o) => Math.abs(o.strike - pos.strike) < 0.01);
              const mark = match ? (match.bid + match.ask) / 2 || match.last : null;
              results.push({ id: pos.id, spot, mark, iv: match?.iv ?? null });
            } catch {
              results.push({ id: pos.id, spot, mark: null, iv: null });
            }
          }
        } catch {
          for (const pos of positions) results.push({ id: pos.id, spot: 0, mark: null, iv: null });
        }
      }));
      return results;
    }),

  // Vol Console scan
  volScan: publicProcedure
    .input(z.object({
      watchlist: z.enum(["all", "ozan", "custom"]).default("all"),
      customTickers: z.string().optional(),
      dte: z.number().default(30),
    }))
    .query(async ({ input }) => {
      let tickerStr: string;
      switch (input.watchlist) {
        case "ozan": tickerStr = OZAN_TICKERS; break;
        case "custom": tickerStr = input.customTickers ?? ALL_TICKERS; break;
        default: tickerStr = ALL_TICKERS;
      }
      const tickers = tickerStr.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
      const { historicalVol } = await import("@/lib/vol-math");
      const { computeGexProfile } = await import("@/lib/gex");
      const { sellGate } = await import("@/lib/sell-gate");

      // ─── FIX 1: Black-Scholes bisection helpers ───────────────────────────
      const solveIvPct = (o: { strike: number; last: number; iv: number }, spot: number, T: number, isCall: boolean): number | null => {
        if (o.last > 0 && T > 0) {
          const bs = impliedVolBisection(o.last, spot, o.strike, T, CSP_RISK_FREE_RATE, isCall);
          if (bs !== null && bs > 0.03 && bs < 5) return bs * 100;
        }
        if (o.iv > 3 && o.iv < 500) return o.iv;
        return null;
      };

      const median = (xs: number[]): number | null => {
        if (xs.length === 0) return null;
        const s = [...xs].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
      };

      const atmIvPct = (chain: { calls: Array<{ strike: number; last: number; iv: number }>; puts: Array<{ strike: number; last: number; iv: number }>; dte: number } | null, spot: number): number | null => {
        if (!chain || spot <= 0) return null;
        const T = Math.max(chain.dte, 1) / 365;
        for (const band of [0.05, 0.12]) {
          const ivs: number[] = [];
          for (const c of chain.calls) if (Math.abs(c.strike - spot) <= spot * band) { const v = solveIvPct(c, spot, T, true); if (v !== null) ivs.push(v); }
          for (const p of chain.puts) if (Math.abs(p.strike - spot) <= spot * band) { const v = solveIvPct(p, spot, T, false); if (v !== null) ivs.push(v); }
          const m = median(ivs);
          if (m !== null && ivs.length >= 2) return m;
        }
        return null;
      };

      const results = await Promise.all(tickers.map(async (ticker) => {
        try {
          // Fetch price history for HV
          const chartUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=6mo`;
          const chartJson = await yahoo.fetchJSON(chartUrl) as {
            chart?: { result?: Array<{ meta?: { regularMarketPrice?: number }; indicators?: { quote?: Array<{ close?: (number | null)[] }> } }> };
          };
          const meta = chartJson?.chart?.result?.[0]?.meta;
          const spot = meta?.regularMarketPrice ?? 0;
          const closes = (chartJson?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter((c): c is number => c !== null);

          const hv20 = historicalVol(closes, 20);
          const hv60 = historicalVol(closes, 60);

          // Fetch option chain for ATM IV and GEX
          const expiryInfo = await marketData.getExpirations(ticker);
          const targetDate = new Date(Date.now() + input.dte * 86400000).toISOString().slice(0, 10);
          const frontExpiry = findBestExpiry(expiryInfo.expirations, targetDate) ?? expiryInfo.expirations[0];
          const backExpiry = expiryInfo.expirations.find((e) => {
            const d = new Date(e + "T00:00:00Z");
            const diff = Math.ceil((d.getTime() - Date.now()) / 86400000);
            return diff > input.dte + 14;
          }) ?? expiryInfo.expirations[expiryInfo.expirations.length - 1];

          const frontTs = expiryInfo.expirationTimestamps[frontExpiry ?? ""];
          const frontChain = frontExpiry ? await marketData.getChain(ticker, frontExpiry, frontTs) : null;
          const backTs = expiryInfo.expirationTimestamps[backExpiry ?? ""];
          const backChain = backExpiry && backExpiry !== frontExpiry ? await marketData.getChain(ticker, backExpiry, backTs) : null;

          // ─── FIX 1: ATM IV via bisection ────────────────────────────────────
          const atmIvFront = atmIvPct(frontChain, spot);
          const atmIvBack = backChain ? atmIvPct(backChain, spot) : null;

          // VRP = ATM IV - HV20
          const vrp = atmIvFront !== null && hv20 !== null ? atmIvFront / 100 - hv20 : null;
          // Term contango = front IV < back IV (normal term structure)
          const termContango = atmIvFront !== null && atmIvBack !== null ? atmIvFront < atmIvBack : null;

          // ─── FIX 2: Skew25 via bisection ────────────────────────────────────
          let skew25: number | null = null;
          if (frontChain && atmIvFront !== null && spot > 0) {
            const frontT = Math.max(frontChain.dte, 1) / 365;
            const otmPuts = frontChain.puts.filter(p => {
              const moneyness = (spot - p.strike) / spot;
              return moneyness >= 0.03 && moneyness <= 0.12 && p.last > 0;
            });
            const solvedIvs = otmPuts.map(p => solveIvPct(p, spot, frontT, false)).filter((v): v is number => v !== null);
            if (solvedIvs.length >= 2) {
              const avg = solvedIvs.reduce((a, b) => a + b, 0) / solvedIvs.length;
              skew25 = avg - atmIvFront;
            }
          }

          // ─── GEX from CBOE (has real OI data) ─────────────────────────────
          let gex: ReturnType<typeof computeGexProfile> | null = null;
          let gexSkipReason: string | null = null;
          let cboeDiag: { fetched: boolean; expiryUsed: string | null; contracts: number; oiSum: number } = { fetched: false, expiryUsed: null, contracts: 0, oiSum: 0 };

          const cboe = await getCboeChain(ticker);
          if (!cboe) {
            gexSkipReason = "CBOE verisi alınamadı — GEX hesaplanamaz";
          } else {
            cboeDiag.fetched = true;
            // Find CBOE expiry closest to frontExpiry
            const cboeExpiries = [...new Set(cboe.options.map(o => o.expiry))];
            let bestExpiry = cboeExpiries[0] ?? null;
            if (frontExpiry && cboeExpiries.length > 0) {
              const targetMs = new Date(frontExpiry + "T00:00:00Z").getTime();
              bestExpiry = cboeExpiries.reduce((best, exp) => {
                const diff = Math.abs(new Date(exp + "T00:00:00Z").getTime() - targetMs);
                const bestDiff = Math.abs(new Date(best + "T00:00:00Z").getTime() - targetMs);
                return diff < bestDiff ? exp : best;
              });
            }
            cboeDiag.expiryUsed = bestExpiry;

            const expiryOpts = bestExpiry ? cboe.options.filter(o => o.expiry === bestExpiry && o.oi > 0) : [];
            cboeDiag.contracts = expiryOpts.length;
            cboeDiag.oiSum = expiryOpts.reduce((s, o) => s + o.oi, 0);

            if (expiryOpts.length < 10 || cboeDiag.oiSum < 500) {
              gexSkipReason = "OI yetersiz — GEX güvenilir değil";
            } else {
              const gexSpot = spot > 0 ? spot : cboe.spot;
              const frontT = frontChain ? Math.max(frontChain.dte, 1) / 365 : 30 / 365;
              const gexContracts: GexContractInput[] = expiryOpts.map(o => ({
                strike: o.strike,
                type: o.type,
                openInterest: o.oi,
                iv: (o.iv > 0.03 && o.iv < 5) ? o.iv : ((atmIvFront ?? 30) / 100),
              }));
              gex = computeGexProfile(gexSpot, frontT, gexContracts);
            }
          }

          // GEX levels: windowed ±25% around spot
          let gexLevels: NonNullable<typeof gex>["levels"] = [];
          if (gex) {
            const windowed = gex.levels.filter(l => l.strike >= spot * 0.75 && l.strike <= spot * 1.25);
            gexLevels = windowed.length >= 8 ? windowed : [...gex.levels].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)).slice(0, 20).sort((a, b) => a.strike - b.strike);
          }

          // Fire-and-forget vol snapshot upsert — skip when no IV data
          if (atmIvFront !== null) {
            try { void db.volSnapshot.upsert({ where: { ticker_date: { ticker: ticker.toUpperCase(), date: new Date(new Date().toISOString().slice(0, 10)) } }, create: { ticker: ticker.toUpperCase(), date: new Date(new Date().toISOString().slice(0, 10)), atmIv: atmIvFront, hv20 }, update: { atmIv: atmIvFront, hv20 } }); } catch {}
          }

          // IV percentile
          const ivData = await yahoo.fetchIVRank(ticker).catch(() => ({ ivRank: 50, currentIV: 25 }));

          // Earnings check
          let earningsInWindow: boolean | null = null;
          try {
            const calUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=calendarEvents`;
            const calJson = await yahoo.fetchJSON(calUrl) as { quoteSummary?: { result?: Array<{ calendarEvents?: { earnings?: { earningsDate?: Array<{ raw?: number }> } } }> } };
            const dates = calJson?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate;
            if (dates && dates.length > 0) {
              const now = Date.now();
              const frontExp = new Date((frontExpiry ?? "") + "T00:00:00Z").getTime();
              earningsInWindow = dates.some((d) => d.raw && d.raw * 1000 >= now && d.raw * 1000 <= frontExp);
            }
          } catch {}

          // Sell gate — neutral when no IV data
          const gate = atmIvFront === null
            ? { color: "neutral" as const, label: "VERİ YOK", reasons: ["IV verisi alınamadı — piyasa kapalı olabilir veya zincir verisi eksik"] }
            : sellGate({ vrp, termContango, earningsInWindow, ivPercentile: ivData.ivRank });

          // Diagnostics
          const allFrontOpts = frontChain ? [...frontChain.calls, ...frontChain.puts] : [];
          const diag = frontChain ? {
            expiry: frontExpiry,
            contracts: allFrontOpts.length,
            withOi: allFrontOpts.filter(o => o.oi > 0).length,
            oiSum: allFrontOpts.reduce((s, o) => s + o.oi, 0),
            withBid: allFrontOpts.filter(o => o.bid > 0).length,
            sample: [...allFrontOpts]
              .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))
              .slice(0, 3)
              .map(o => ({ strike: o.strike, bid: o.bid, ask: o.ask, iv: Number(o.iv.toFixed(1)), oi: o.oi, last: o.last })),
            cboe: cboeDiag,
          } : null;

          return {
            ticker, spot, hv20, hv60, atmIvFront, atmIvBack, vrp, termContango, skew25,
            gex: gex ? { levels: gexLevels, flip: gex.flip, callWall: gex.callWall, putWall: gex.putWall, totalNetGex: gex.totalNetGex } : null,
            gexSkipReason,
            ivPercentile: ivData.ivRank,
            earningsInWindow,
            gate,
            diag,
            error: null,
          };
        } catch (err) {
          return { ticker, spot: 0, hv20: null, hv60: null, atmIvFront: null, atmIvBack: null, vrp: null, termContango: null, skew25: null, gex: null, gexSkipReason: null as string | null, ivPercentile: null, earningsInWindow: null, gate: null, diag: null, error: err instanceof Error ? err.message : "Hata" };
        }
      }));

      return { results };
    }),
});
