/**
 * SignalLab tRPC Router — Options analysis, CSP screener, market data
 */

import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import * as yahoo from "../services/yahoo-finance";
import * as math from "../services/math-engine";
import { impliedVolBisection } from "../services/black-scholes";
import { scoreCSPContract, type IVBucket } from "../services/csp-scoring";
import { earningsInWindow } from "../services/earnings";
import { marketData } from "../services/market-data";
import { getCboeChain } from "../services/market-data/cboe";
import { db } from "@/lib/db";
import type { GexContractInput } from "@/lib/gex";
import { expectedPnl, probProfit, pnlExtremes, type Leg, type RWParams } from "@/lib/real-world-pricing";
import { SkewedDist, quantile, probBelow, probAbove, skewShift, pinGravity, pointForecast, ladderLevels, type PinCandidate, type PointForecast } from "@/lib/forecast-math";
import { generateMarketEvents } from "@/lib/market-calendar";

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
  priceQuality: "live" | "last";
  hasEarnings: boolean;
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
      // Pre-filter order: strike range → last price → then BS IV (cheap-first)
      const strike = put.strike;
      if (!strike || strike < low || strike > high) continue;
      inRange++;

      const bid = put.bid;
      const ask = put.ask;
      const last = put.last;
      if (last <= 0) continue;
      let mid = last;
      let priceQuality: "live" | "last" = "last";
      if (bid > 0 && ask > 0 && ask >= bid) {
        mid = Math.min(Math.max(last, bid), ask);
        priceQuality = "live";
      }
      if (mid <= 0) continue;
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
        bid, ask, mid, priceQuality, hasEarnings: false,
        iv, ivSource, ivClass: cspClassify(iv),
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

function nextTradingDays(from: Date, count: number): Date[] {
  const days: Date[] = [];
  const d = new Date(from);
  while (days.length < count) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(new Date(d));
  }
  return days;
}

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
      const capped = tickers.length > 80;
      const originalCount = tickers.length;
      const cappedTickers = capped ? tickers.slice(0, 80) : tickers;

      const allContracts: CSPContract[] = [];
      const allDiags: CSPDiagnostic[] = [];

      // Ticker'ları paralel işle — gerçek eşzamanlılık yahoo-finance semaphore'unda sınırlı
      const settled = await Promise.all(cappedTickers.map(async (t) => {
        try {
          const result = await fetchCSPTicker(t, input.expiry, input.minOI);
          // Earnings check — once per ticker
          const hasErn = await earningsInWindow(t, input.expiry);
          if (hasErn === true) {
            for (const c of result.contracts) {
              c.cspScore = Math.round(c.cspScore * 0.75);
              c.hasEarnings = true;
            }
          }
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

      const { computeGexProfile } = await import("@/lib/gex");

      const groups = await Promise.all(Array.from(grouped.entries()).map(async ([tk, items]) => {
        const sorted = [...items].sort((a, b) => b.yieldPct - a.yieldPct);
        const ivs = sorted.map((s) => s.iv).filter((v): v is number => v !== null);
        const atmItem = sorted.reduce((best, cur) => Math.abs(cur.moneyness) < Math.abs(best.moneyness) ? cur : best, sorted[0]);
        const expiry = sorted[0]?.expiry ?? "";
        const spot = sorted[0]?.spot ?? 0;

        // Put Wall from CBOE
        let putWall: number | null = null;
        try {
          const cboe = await getCboeChain(tk);
          if (cboe && expiry) {
            const cboeExpiries = [...new Set(cboe.options.map(o => o.expiry))];
            const targetMs = new Date(expiry + "T00:00:00Z").getTime();
            const bestExp = cboeExpiries.reduce((best, exp) => {
              const diff = Math.abs(new Date(exp + "T00:00:00Z").getTime() - targetMs);
              const bestDiff = Math.abs(new Date(best + "T00:00:00Z").getTime() - targetMs);
              return diff < bestDiff ? exp : best;
            }, cboeExpiries[0] ?? "");
            if (bestExp) {
              const expiryOpts = cboe.options.filter(o => o.expiry === bestExp && o.oi > 0);
              const oiSum = expiryOpts.reduce((s, o) => s + o.oi, 0);
              if (expiryOpts.length >= 10 && oiSum >= 500) {
                const T = Math.max((sorted[0]?.dte ?? 30), 1) / 365;
                const gexSpot = spot > 0 ? spot : cboe.spot;
                const atmIv = ivs.length > 0 ? (ivs.reduce((a, b) => a + b, 0) / ivs.length) / 100 : 0.30;
                const gexContracts: GexContractInput[] = expiryOpts.map(o => ({
                  strike: o.strike,
                  type: o.type,
                  openInterest: o.oi,
                  iv: (o.iv > 0.03 && o.iv < 5) ? o.iv : atmIv,
                }));
                const gex = computeGexProfile(gexSpot, T, gexContracts);
                putWall = gex.putWall;
              }
            }
          }
        } catch {}

        return {
          ticker: tk,
          spot,
          expiry,
          dte: sorted[0]?.dte ?? 0,
          strikes: sorted,
          maxIV: ivs.length > 0 ? Math.max(...ivs) : null,
          atmIV: atmItem?.iv ?? null,
          maxYield: sorted[0]?.yieldPct ?? 0,
          bestClass: Math.min(...sorted.map((s) => s.ivClass)),
          putWall,
        };
      }));

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

      return { groups, topPicks, diagnostics: allDiags.sort((a, b) => a.ticker.localeCompare(b.ticker)), classDist, totalContracts: allContracts.length, capped, originalCount };
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

  // AI Strategy Scan — multi-ticker strategy finder (real-world pricing)
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
      let tickers = tickerStr.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
      const capped = tickers.length > 40;
      const originalCount = tickers.length;
      if (capped) tickers = tickers.slice(0, 40);

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

      const results = await Promise.all(tickers.map(async (ticker) => {
        try {
          const quote = await yahoo.fetchQuote(ticker);
          const spot = quote.price;

          const hv20Raw = await yahoo.fetchHV(ticker, 20).catch(() => null);
          const hv60Raw = await yahoo.fetchHV(ticker, 60).catch(() => null);
          const hv20 = typeof hv20Raw === "number" ? hv20Raw : null;
          const hv60 = typeof hv60Raw === "number" ? hv60Raw : null;
          let sigmaReal = hv20 !== null && hv60 !== null ? 0.6 * hv20 + 0.4 * hv60
            : hv20 ?? hv60;
          if (sigmaReal === null) return { ticker, price: spot, buckets: { bullish: [] as never[], neutral: [] as never[], bearish: [] as never[] }, debugReason: "HV verisi yok" };
          sigmaReal = Math.min(Math.max(sigmaReal, 0.10), 3.0);

          const expiryInfo = await marketData.getExpirations(ticker);
          const matchedExpiry = findBestExpiry(expiryInfo.expirations, input.expiry);
          if (!matchedExpiry) return { ticker, price: spot, buckets: { bullish: [] as never[], neutral: [] as never[], bearish: [] as never[] }, debugReason: "Vade bulunamadı" };
          const ts = expiryInfo.expirationTimestamps[matchedExpiry];
          const chain = await marketData.getChain(ticker, matchedExpiry, ts);
          const dte = chain.dte;
          const T = Math.max(dte, 1) / 365;

          // ATM IV
          let atmIv: number | null = null;
          for (const band of [0.05, 0.12]) {
            const ivs: number[] = [];
            for (const c of chain.calls) if (Math.abs(c.strike - spot) <= spot * band) { const v = solveIvPct(c, spot, T, true); if (v !== null) ivs.push(v); }
            for (const p of chain.puts) if (Math.abs(p.strike - spot) <= spot * band) { const v = solveIvPct(p, spot, T, false); if (v !== null) ivs.push(v); }
            const m = median(ivs);
            if (m !== null && ivs.length >= 2) { atmIv = m; break; }
          }
          const vrp = atmIv !== null && hv20 !== null ? atmIv / 100 - hv20 : null;

          const priceOpt = (o: { last: number; bid: number; ask: number }) => {
            let p = o.last;
            if (o.bid > 0 && o.ask > 0 && o.ask >= o.bid) p = Math.min(Math.max(o.last, o.bid), o.ask);
            return p;
          };
          const validCalls = chain.calls.filter(c => c.last > 0).sort((a, b) => a.strike - b.strike);
          const validPuts = chain.puts.filter(p => p.last > 0).sort((a, b) => b.strike - a.strike);

          if (validCalls.length === 0 || validPuts.length === 0) return { ticker, price: spot, buckets: { bullish: [] as never[], neutral: [] as never[], bearish: [] as never[] }, debugReason: "Likit opsiyon yok" };

          const atmCall = validCalls.reduce((best, c) => Math.abs(c.strike - spot) < Math.abs(best.strike - spot) ? c : best, validCalls[0]);
          const atmPut = validPuts.reduce((best, p) => Math.abs(p.strike - spot) < Math.abs(best.strike - spot) ? p : best, validPuts[0]);
          const otmCall = validCalls.find(c => c.strike >= spot * 1.03) ?? atmCall;
          const otmPut = validPuts.find(p => p.strike <= spot * 0.97) ?? atmPut;
          const deepOtmPut = validPuts.find(p => p.strike <= spot * 0.93) ?? otmPut;

          const rwp: RWParams = { S0: spot, sigma: sigmaReal, T };

          const strategies: Array<{ name: string; bucket: "bullish" | "neutral" | "bearish"; desc: string; legs: Leg[] }> = [
            { name: "Long Call", bucket: "bullish", desc: "Yükseliş beklentisi — call al", legs: [{ kind: "call", qty: 100, strike: otmCall.strike, price: priceOpt(otmCall) }] },
            { name: "Long Put", bucket: "bearish", desc: "Düşüş beklentisi — put al", legs: [{ kind: "put", qty: 100, strike: otmPut.strike, price: priceOpt(otmPut) }] },
            { name: "Covered Call", bucket: "neutral", desc: "Hisse + call sat — theta geliri", legs: [{ kind: "stock", qty: 100, price: spot }, { kind: "call", qty: -100, strike: otmCall.strike, price: priceOpt(otmCall) }] },
            { name: "Cash-Secured Put", bucket: "bullish", desc: "OTM put sat — prim topla", legs: [{ kind: "put", qty: -100, strike: otmPut.strike, price: priceOpt(otmPut) }] },
            { name: "Wheel", bucket: "bullish", desc: "CSP → CC döngüsü — sürekli gelir", legs: [{ kind: "put", qty: -100, strike: otmPut.strike, price: priceOpt(otmPut) }] },
            { name: "Collar", bucket: "neutral", desc: "Hisse + call sat + put al — sınırlı risk", legs: [{ kind: "stock", qty: 100, price: spot }, { kind: "call", qty: -100, strike: otmCall.strike, price: priceOpt(otmCall) }, { kind: "put", qty: 100, strike: deepOtmPut.strike, price: priceOpt(deepOtmPut) }] },
            { name: "Covered Strangle", bucket: "neutral", desc: "Hisse + call sat + put sat — max theta", legs: [{ kind: "stock", qty: 100, price: spot }, { kind: "call", qty: -100, strike: otmCall.strike, price: priceOpt(otmCall) }, { kind: "put", qty: -100, strike: otmPut.strike, price: priceOpt(otmPut) }] },
          ];

          const scored = strategies.map(s => {
            const ev = expectedPnl(s.legs, rwp);
            const pWin = probProfit(s.legs, rwp);
            const { maxLoss, maxGain } = pnlExtremes(s.legs);
            const rawKelly = maxGain > 0 && maxLoss < 0 ? pWin - (1 - pWin) / (maxGain / Math.abs(maxLoss)) : 0;
            const kellyPct = Math.min(Math.max(rawKelly, 0), 1) * 25;

            const isShortPrem = ["Cash-Secured Put", "Wheel", "Covered Call", "Covered Strangle", "Collar"].includes(s.name);
            const evRatio = maxLoss !== 0 && isFinite(maxLoss) ? Math.min(Math.max(ev / Math.abs(maxLoss), -1), 1) : 0;
            const evScore = (evRatio + 1) / 2 * 40;
            const pWinScore = pWin * 30;
            const vrpVal = vrp ?? 0;
            const vrpScore = isShortPrem ? Math.min(Math.max(vrpVal / 0.05, -1), 1) * 7.5 + 7.5 : Math.min(Math.max(-vrpVal / 0.05, -1), 1) * 7.5 + 7.5;
            const priceQ = 15;
            const compositeScore = Math.min(Math.max(evScore + pWinScore + vrpScore + priceQ, 0), 100);

            const netCredit = s.legs.reduce((sum, l) => sum + (l.qty < 0 ? -l.qty * l.price : -l.qty * l.price), 0);

            const edgeLabel = isShortPrem
              ? (vrp !== null && vrp > 0 ? `Edge: VRP +${(vrp * 100).toFixed(1)} puan (IV ${atmIv?.toFixed(0) ?? "?"}% > HV ${hv20 !== null ? (hv20 * 100).toFixed(0) : "?"}%)` : `Edge yok: VRP negatif`)
              : (vrp !== null && vrp < 0 ? `Edge: VRP −${(-vrp * 100).toFixed(1)} puan (IV < HV — al tarafı avantajlı)` : `Edge yok: VRP pozitif — prim satıcısı favori`);

            return {
              ticker, tickerPrice: spot, name: s.name, type: s.bucket, description: s.desc,
              legs: s.legs.map(l => ({ action: (l.qty > 0 ? "buy" : "sell") as "buy" | "sell", type: l.kind, strike: l.strike ?? 0, price: l.price, contracts: Math.abs(l.qty) })),
              compositeScore: Math.round(compositeScore),
              probability: pWin * 100, maxProfit: maxGain, maxLoss, ev, evPct: maxLoss !== 0 && isFinite(maxLoss) ? ev / Math.abs(maxLoss) * 100 : 0,
              kellyPct, vrp, atmIv, hv20, sigmaUsed: sigmaReal, priceQuality: "live" as const,
              netCredit, why: edgeLabel,
              signals: { ivRankOk: (vrp ?? 0) > 0, trendOk: true, dteOk: dte >= 7 && dte <= 90, earningsRisk: false },
            };
          });

          return {
            ticker, price: spot,
            buckets: {
              bullish: scored.filter(s => s.type === "bullish").sort((a, b) => b.compositeScore - a.compositeScore),
              neutral: scored.filter(s => s.type === "neutral").sort((a, b) => b.compositeScore - a.compositeScore),
              bearish: scored.filter(s => s.type === "bearish").sort((a, b) => b.compositeScore - a.compositeScore),
            },
            debugReason: "",
          };
        } catch (err) {
          return { ticker, price: 0, buckets: { bullish: [] as never[], neutral: [] as never[], bearish: [] as never[] }, debugReason: err instanceof Error ? err.message : "Hata" };
        }
      }));

      const allStrategies = results.flatMap(r => [...r.buckets.bullish, ...r.buckets.neutral, ...r.buckets.bearish]);
      const affordable = allStrategies.filter(s => Math.abs(s.maxLoss) <= input.budget || !isFinite(s.maxLoss));

      return {
        totalTickers: tickers.length,
        scannedTickers: results.filter(r => r.debugReason === "").length,
        topStrategies: affordable.sort((a, b) => b.compositeScore - a.compositeScore).slice(0, 20),
        allStrategies: affordable,
        buckets: {
          bullish: affordable.filter(s => s.type === "bullish").sort((a, b) => b.compositeScore - a.compositeScore),
          neutral: affordable.filter(s => s.type === "neutral").sort((a, b) => b.compositeScore - a.compositeScore),
          bearish: affordable.filter(s => s.type === "bearish").sort((a, b) => b.compositeScore - a.compositeScore),
        },
        diagnostics: results.filter(r => r.debugReason).map(r => ({ ticker: r.ticker, reason: r.debugReason })),
        capped,
        originalCount,
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
      const capped = tickers.length > 80;
      const originalCount = tickers.length;
      const cappedTickers = capped ? tickers.slice(0, 80) : tickers;
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

      const results = await Promise.all(cappedTickers.map(async (ticker) => {
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
          let earningsInWin: boolean | null = null;
          try {
            earningsInWin = await earningsInWindow(ticker, frontExpiry ?? "");
          } catch {}

          // Sell gate — neutral when no IV data
          const gate = atmIvFront === null
            ? { color: "neutral" as const, label: "VERİ YOK", reasons: ["IV verisi alınamadı — piyasa kapalı olabilir veya zincir verisi eksik"] }
            : sellGate({ vrp, termContango, earningsInWindow: earningsInWin, ivPercentile: ivData.ivRank });

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
            earningsInWindow: earningsInWin,
            gate,
            diag,
            error: null,
          };
        } catch (err) {
          return { ticker, spot: 0, hv20: null, hv60: null, atmIvFront: null, atmIvBack: null, vrp: null, termContango: null, skew25: null, gex: null, gexSkipReason: null as string | null, ivPercentile: null, earningsInWindow: null, gate: null, diag: null, error: err instanceof Error ? err.message : "Hata" };
        }
      }));

      return { results, capped, originalCount };
    }),

  // Forecast Center
  forecast: publicProcedure
    .input(z.object({ ticker: z.string(), targetDate: z.string(), mode: z.enum(["single", "week"]).default("single") }))
    .query(async ({ input }) => {
      const ticker = input.ticker.toUpperCase();

      // ═══ WEEK MODE ═══
      if (input.mode === "week") {
        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);
        const madeOnDay = new Date(todayStr + "T00:00:00Z");
        const targetDays = nextTradingDays(today, 5);
        const lastDay = targetDays[targetDays.length - 1];
        const lastDayStr = lastDay.toISOString().slice(0, 10);

        // Fetch spot
        const chartUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=3mo`;
        const chartJson = (await yahoo.fetchJSON(chartUrl)) as {
          chart?: { result?: Array<{ meta?: { regularMarketPrice?: number }; indicators?: { quote?: Array<{ close?: (number | null)[] }> } }> };
        };
        const spot = chartJson?.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0;
        if (spot <= 0) throw new Error("Spot fiyat alınamadı");

        // Chain nearest last target day
        const expiryInfo = await marketData.getExpirations(ticker);
        const matchedExpiry = findBestExpiry(expiryInfo.expirations, lastDayStr, 7);
        if (!matchedExpiry) throw new Error("Uygun vade bulunamadı");
        const ts = expiryInfo.expirationTimestamps[matchedExpiry];
        const chain = await marketData.getChain(ticker, matchedExpiry, ts);
        const chainT = Math.max(chain.dte, 1) / 365;

        // ATM IV + sigmaUp/sigmaDown
        const solveIv = (o: { strike: number; last: number; iv: number }, isCall: boolean): number | null => {
          if (o.last > 0 && chainT > 0) {
            const bs = impliedVolBisection(o.last, spot, o.strike, chainT, 0.045, isCall);
            if (bs !== null && bs > 0.03 && bs < 5) return bs;
          }
          return o.iv > 3 ? o.iv / 100 : null;
        };
        const atmIvs: number[] = [];
        for (const c of chain.calls) if (Math.abs(c.strike - spot) <= spot * 0.05) { const v = solveIv(c, true); if (v) atmIvs.push(v); }
        for (const p of chain.puts) if (Math.abs(p.strike - spot) <= spot * 0.05) { const v = solveIv(p, false); if (v) atmIvs.push(v); }
        const atmIv = atmIvs.length > 0 ? atmIvs.sort((a, b) => a - b)[Math.floor(atmIvs.length / 2)] : 0.30;

        const upIvs: number[] = [];
        for (const c of chain.calls) { const m = (c.strike - spot) / spot; if (m >= 0.03 && m <= 0.12) { const v = solveIv(c, true); if (v) upIvs.push(v); } }
        const sigmaUp = upIvs.length > 0 ? upIvs.reduce((a, b) => a + b, 0) / upIvs.length : atmIv;

        const downIvs: number[] = [];
        for (const p of chain.puts) { const m = (spot - p.strike) / spot; if (m >= 0.03 && m <= 0.12) { const v = solveIv(p, false); if (v) downIvs.push(v); } }
        const sigmaDown = downIvs.length > 0 ? downIvs.reduce((a, b) => a + b, 0) / downIvs.length : atmIv;

        // GEX + pin candidates
        const { computeGexProfile } = await import("@/lib/gex");
        let gexResult = { putWall: null as number | null, callWall: null as number | null, flip: null as number | null };
        let pinCandidates: PinCandidate[] = [];
        try {
          const cboe = await getCboeChain(ticker);
          if (cboe) {
            const cboeExpiries = [...new Set(cboe.options.map(o => o.expiry))];
            const lastDayMs = lastDay.getTime();
            const bestExp = cboeExpiries.reduce((best, exp) => {
              const diff = Math.abs(new Date(exp + "T00:00:00Z").getTime() - lastDayMs);
              const bestDiff = Math.abs(new Date(best + "T00:00:00Z").getTime() - lastDayMs);
              return diff < bestDiff ? exp : best;
            }, cboeExpiries[0] ?? "");
            if (bestExp) {
              const expiryOpts = cboe.options.filter(o => o.expiry === bestExp && o.oi > 0);
              if (expiryOpts.length >= 10) {
                const gexContracts = expiryOpts.map(o => ({
                  strike: o.strike, type: o.type, openInterest: o.oi,
                  iv: (o.iv > 0.03 && o.iv < 5) ? o.iv : atmIv,
                }));
                const gex = computeGexProfile(spot, chainT, gexContracts);
                gexResult = { putWall: gex.putWall, callWall: gex.callWall, flip: gex.flip };
                const nearby = gex.levels.filter(l => Math.abs(l.strike - spot) / spot <= 0.07);
                const sorted = [...nearby].sort((a, b) => Math.abs(b.netGex) - Math.abs(a.netGex)).slice(0, 3);
                const totalGex = sorted.reduce((s, l) => s + Math.abs(l.netGex), 0);
                pinCandidates = sorted.map(l => ({ strike: l.strike, gammaShare: totalGex > 0 ? Math.abs(l.netGex) / totalGex : 0 }));
              }
            }
          }
        } catch {}

        // Events & expirations set
        const allEvents = generateMarketEvents(2026);
        const expirationSet = new Set(expiryInfo.expirations);

        // Build per-day forecasts
        type DayForecast = { date: string; point: PointForecast; band: [number, number]; isExpiryDay: boolean; events: import("@/lib/market-calendar").MarketEvent[] };
        const days: DayForecast[] = targetDays.map(d => {
          const dateStr = d.toISOString().slice(0, 10);
          const daysTo = Math.max(Math.ceil((d.getTime() - Date.now()) / 86400000), 1);
          const T_d = daysTo / 365;
          const dist_d: SkewedDist = { S: spot, sigmaUp, sigmaDown, T: T_d };
          const isExpiryDay = expirationSet.has(dateStr);
          const pin_d = pinGravity(spot, daysTo, isExpiryDay, pinCandidates);
          const point_d = pointForecast(dist_d, pin_d);
          const band: [number, number] = [quantile(0.16, dist_d), quantile(0.84, dist_d)];
          const events = allEvents.filter(e => e.date === dateStr);
          return { date: dateStr, point: point_d, band, isExpiryDay, events };
        });

        // Upsert 5 PredictionLog rows + settle
        let calibration = { count: 0, meanZ: 0, stdZ: 0, meanAbsZ: 0 };
        try {
          for (const day of days) {
            try {
              const daysTo = Math.max(Math.ceil((new Date(day.date + "T00:00:00Z").getTime() - Date.now()) / 86400000), 1);
              const T_d = daysTo / 365;
              await db.predictionLog.upsert({
                where: { ticker_targetDate_madeOnDay: { ticker, targetDate: new Date(day.date + "T00:00:00Z"), madeOnDay } },
                create: { ticker, targetDate: new Date(day.date + "T00:00:00Z"), madeOnDay, spot, sigmaUp, sigmaDown, tYears: T_d, median: day.point.median, skewComponent: day.point.skewComponent, pinComponent: day.point.pinComponent, pointPrice: day.point.price },
                update: { spot, sigmaUp, sigmaDown, tYears: T_d, median: day.point.median, skewComponent: day.point.skewComponent, pinComponent: day.point.pinComponent, pointPrice: day.point.price },
              });
            } catch {}
          }
          // Settle past
          const unsettled = await db.predictionLog.findMany({ where: { ticker, realized: null, targetDate: { lt: madeOnDay } } });
          for (const row of unsettled) {
            try {
              const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d&period1=${Math.floor(row.targetDate.getTime() / 1000 - 86400)}&period2=${Math.floor(row.targetDate.getTime() / 1000 + 86400 * 3)}`;
              const json = (await yahoo.fetchJSON(url)) as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: (number | null)[] }> } }> } };
              const timestamps = json?.chart?.result?.[0]?.timestamp ?? [];
              const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
              const tgt = row.targetDate.getTime() / 1000;
              let realized: number | null = null;
              for (let i = 0; i < timestamps.length; i++) {
                if (timestamps[i] >= tgt && closes[i] != null) { realized = closes[i]!; break; }
              }
              if (realized !== null) {
                const sigma = realized > row.spot ? row.sigmaUp : row.sigmaDown;
                const zScore = Math.log(realized / row.spot) / (sigma * Math.sqrt(row.tYears));
                await db.predictionLog.update({ where: { id: row.id }, data: { realized, zScore } });
              }
            } catch {}
          }
          // Calibration
          const settledRows = await db.predictionLog.findMany({ where: { ticker, realized: { not: null }, zScore: { not: null } } });
          if (settledRows.length > 0) {
            const zs = settledRows.map(r => r.zScore!);
            const meanZ = zs.reduce((a, b) => a + b, 0) / zs.length;
            const stdZ = Math.sqrt(zs.map(z => (z - meanZ) ** 2).reduce((a, b) => a + b, 0) / zs.length);
            const meanAbsZ = zs.map(z => Math.abs(z)).reduce((a, b) => a + b, 0) / zs.length;
            calibration = { count: settledRows.length, meanZ, stdZ, meanAbsZ };
          }
        } catch {}

        return {
          mode: "week" as const,
          ticker, spot, sigmaUp, sigmaDown,
          gex: gexResult,
          days,
          calibration,
        };
      }

      // ═══ SINGLE MODE (existing) ═══
      const targetDate = input.targetDate;
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const madeOnDay = new Date(todayStr + "T00:00:00Z");
      const targetMs = new Date(targetDate + "T00:00:00Z").getTime();
      const daysTo = Math.max(Math.ceil((targetMs - Date.now()) / 86400000), 1);
      const T = daysTo / 365;

      // 1. Spot + closes
      const chartUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=3mo`;
      const chartJson = (await yahoo.fetchJSON(chartUrl)) as {
        chart?: { result?: Array<{ meta?: { regularMarketPrice?: number }; indicators?: { quote?: Array<{ close?: (number | null)[] }> } }> };
      };
      const spot = chartJson?.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0;
      if (spot <= 0) throw new Error("Spot fiyat alınamadı");

      // 2. Option chain closest to targetDate
      const expiryInfo = await marketData.getExpirations(ticker);
      const matchedExpiry = findBestExpiry(expiryInfo.expirations, targetDate, 7);
      if (!matchedExpiry) throw new Error("Uygun vade bulunamadı");
      const ts = expiryInfo.expirationTimestamps[matchedExpiry];
      const chain = await marketData.getChain(ticker, matchedExpiry, ts);
      const chainT = Math.max(chain.dte, 1) / 365;

      // 3. ATM IV + sigmaUp/sigmaDown via bisection
      const solveIv = (o: { strike: number; last: number; iv: number }, isCall: boolean): number | null => {
        if (o.last > 0 && chainT > 0) {
          const bs = impliedVolBisection(o.last, spot, o.strike, chainT, 0.045, isCall);
          if (bs !== null && bs > 0.03 && bs < 5) return bs;
        }
        return o.iv > 3 ? o.iv / 100 : null;
      };

      const atmIvs: number[] = [];
      for (const c of chain.calls) if (Math.abs(c.strike - spot) <= spot * 0.05) { const v = solveIv(c, true); if (v) atmIvs.push(v); }
      for (const p of chain.puts) if (Math.abs(p.strike - spot) <= spot * 0.05) { const v = solveIv(p, false); if (v) atmIvs.push(v); }
      const atmIv = atmIvs.length > 0 ? atmIvs.sort((a, b) => a - b)[Math.floor(atmIvs.length / 2)] : 0.30;

      // sigmaUp: avg IV of calls 3-12% above spot
      const upIvs: number[] = [];
      for (const c of chain.calls) {
        const m = (c.strike - spot) / spot;
        if (m >= 0.03 && m <= 0.12) { const v = solveIv(c, true); if (v) upIvs.push(v); }
      }
      const sigmaUp = upIvs.length > 0 ? upIvs.reduce((a, b) => a + b, 0) / upIvs.length : atmIv;

      // sigmaDown: avg IV of puts 3-12% below spot
      const downIvs: number[] = [];
      for (const p of chain.puts) {
        const m = (spot - p.strike) / spot;
        if (m >= 0.03 && m <= 0.12) { const v = solveIv(p, false); if (v) downIvs.push(v); }
      }
      const sigmaDown = downIvs.length > 0 ? downIvs.reduce((a, b) => a + b, 0) / downIvs.length : atmIv;

      // 4. GEX + pin candidates
      const { computeGexProfile } = await import("@/lib/gex");
      let gexResult = { putWall: null as number | null, callWall: null as number | null, flip: null as number | null };
      let pinCandidates: PinCandidate[] = [];
      try {
        const cboe = await getCboeChain(ticker);
        if (cboe) {
          const cboeExpiries = [...new Set(cboe.options.map(o => o.expiry))];
          const bestExp = cboeExpiries.reduce((best, exp) => {
            const diff = Math.abs(new Date(exp + "T00:00:00Z").getTime() - targetMs);
            const bestDiff = Math.abs(new Date(best + "T00:00:00Z").getTime() - targetMs);
            return diff < bestDiff ? exp : best;
          }, cboeExpiries[0] ?? "");
          if (bestExp) {
            const expiryOpts = cboe.options.filter(o => o.expiry === bestExp && o.oi > 0);
            if (expiryOpts.length >= 10) {
              const gexContracts = expiryOpts.map(o => ({
                strike: o.strike, type: o.type, openInterest: o.oi,
                iv: (o.iv > 0.03 && o.iv < 5) ? o.iv : atmIv,
              }));
              const gex = computeGexProfile(spot, chainT, gexContracts);
              gexResult = { putWall: gex.putWall, callWall: gex.callWall, flip: gex.flip };
              // Pin candidates: 3 strikes with largest |netGex| within ±7% of spot
              const nearby = gex.levels.filter(l => Math.abs(l.strike - spot) / spot <= 0.07);
              const sorted = [...nearby].sort((a, b) => Math.abs(b.netGex) - Math.abs(a.netGex)).slice(0, 3);
              const totalGex = sorted.reduce((s, l) => s + Math.abs(l.netGex), 0);
              pinCandidates = sorted.map(l => ({ strike: l.strike, gammaShare: totalGex > 0 ? Math.abs(l.netGex) / totalGex : 0 }));
            }
          }
        }
      } catch {}

      // 5. Events
      const allEvents = generateMarketEvents(2026);
      const events = allEvents.filter(e => e.date >= todayStr && e.date <= targetDate);

      // 6. Build distribution + cone + quantiles + ladder + point forecast
      const isExpiryDay = matchedExpiry === targetDate;
      const dist: SkewedDist = { S: spot, sigmaUp, sigmaDown, T };
      const pin = pinGravity(spot, daysTo, isExpiryDay, pinCandidates);
      const point = pointForecast(dist, pin);

      // Daily cone (weekdays from tomorrow to targetDate)
      const cone: Array<{ date: string; lower: number; upper: number; median: number }> = [];
      const cur = new Date(todayStr + "T00:00:00Z");
      cur.setUTCDate(cur.getUTCDate() + 1);
      while (cur.getTime() <= targetMs) {
        const dow = cur.getUTCDay();
        if (dow !== 0 && dow !== 6) {
          const partialDays = Math.ceil((cur.getTime() - Date.now()) / 86400000);
          const partialT = Math.max(partialDays, 1) / 365;
          const partialDist: SkewedDist = { S: spot, sigmaUp, sigmaDown, T: partialT };
          cone.push({
            date: cur.toISOString().slice(0, 10),
            lower: quantile(0.16, partialDist),
            upper: quantile(0.84, partialDist),
            median: quantile(0.5, partialDist),
          });
        }
        cur.setUTCDate(cur.getUTCDate() + 1);
      }

      // Quantiles
      const quantiles = { p10: quantile(0.10, dist), p25: quantile(0.25, dist), p50: quantile(0.50, dist), p75: quantile(0.75, dist), p90: quantile(0.90, dist) };

      // Ladder
      const levels = ladderLevels(dist, gexResult.putWall, gexResult.callWall);
      const ladder = levels.map(strike => ({
        strike,
        probBelow: probBelow(strike, dist),
        probAbove: probAbove(strike, dist),
        isWall: strike === gexResult.putWall || strike === gexResult.callWall,
        wallType: strike === gexResult.putWall ? "put" as const : strike === gexResult.callWall ? "call" as const : null,
      }));

      // 7. Upsert PredictionLog (fire-and-forget — never break forecast response)
      let calibration = { count: 0, meanZ: 0, stdZ: 0, meanAbsZ: 0 };
      try {
        await db.predictionLog.upsert({
          where: { ticker_targetDate_madeOnDay: { ticker, targetDate: new Date(targetDate + "T00:00:00Z"), madeOnDay } },
          create: { ticker, targetDate: new Date(targetDate + "T00:00:00Z"), madeOnDay, spot, sigmaUp, sigmaDown, tYears: T, median: point.median, skewComponent: point.skewComponent, pinComponent: point.pinComponent, pointPrice: point.price },
          update: { spot, sigmaUp, sigmaDown, tYears: T, median: point.median, skewComponent: point.skewComponent, pinComponent: point.pinComponent, pointPrice: point.price },
        });

        // 8. Settle past predictions
        const unsettled = await db.predictionLog.findMany({ where: { ticker, realized: null, targetDate: { lt: madeOnDay } } });
        for (const row of unsettled) {
          try {
            const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d&period1=${Math.floor(row.targetDate.getTime() / 1000 - 86400)}&period2=${Math.floor(row.targetDate.getTime() / 1000 + 86400 * 3)}`;
            const json = (await yahoo.fetchJSON(url)) as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: (number | null)[] }> } }> } };
            const timestamps = json?.chart?.result?.[0]?.timestamp ?? [];
            const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
            const tgt = row.targetDate.getTime() / 1000;
            let realized: number | null = null;
            for (let i = 0; i < timestamps.length; i++) {
              if (timestamps[i] >= tgt && closes[i] != null) { realized = closes[i]!; break; }
            }
            if (realized !== null) {
              const sigma = realized > row.spot ? row.sigmaUp : row.sigmaDown;
              const zScore = Math.log(realized / row.spot) / (sigma * Math.sqrt(row.tYears));
              await db.predictionLog.update({ where: { id: row.id }, data: { realized, zScore } });
            }
          } catch { /* skip individual settle failures */ }
        }

        // 9. Calibration stats
        const settled = await db.predictionLog.findMany({ where: { ticker, realized: { not: null }, zScore: { not: null } } });
        if (settled.length > 0) {
          const zs = settled.map(r => r.zScore!);
          const meanZ = zs.reduce((a, b) => a + b, 0) / zs.length;
          const stdZ = Math.sqrt(zs.map(z => (z - meanZ) ** 2).reduce((a, b) => a + b, 0) / zs.length);
          const meanAbsZ = zs.map(z => Math.abs(z)).reduce((a, b) => a + b, 0) / zs.length;
          calibration = { count: settled.length, meanZ, stdZ, meanAbsZ };
        }
      } catch (e) {
        console.warn("[forecast] DB write/settle failed:", e instanceof Error ? e.message : e);
      }

      return {
        mode: "single" as const,
        ticker, spot, targetDate,
        dist: { sigmaUp, sigmaDown, T },
        cone, quantiles, ladder,
        gex: gexResult,
        point,
        events,
        calibration,
        pinCandidates,
      };
    }),

  // ═══ Anomali Radarı: anomalyScan ═══════════════════════════════════════════
  anomalyScan: publicProcedure
    .input(z.object({ tickers: z.array(z.string()).max(300), debugTicker: z.string().optional() }))
    .query(async ({ input }) => {
      const { getSparkCloses } = await import("../services/market-data/yahoo");
      const { sectorEtfFor, SECTOR_ETF } = await import("@/lib/ticker-universe");
      const { historicalVol, probITMPut } = await import("@/lib/vol-math");
      const { computeGexProfile } = await import("@/lib/gex");

      const DROP_1D = 0.07;
      const DROP_3D = 0.12;
      const today = new Date(new Date().toISOString().slice(0, 10));
      const stage1Start = Date.now();

      // Collect all sector ETFs needed
      const etfSet = new Set(Object.values(SECTOR_ETF));
      etfSet.add("SPY");
      const allSymbols = [...new Set([...input.tickers, ...etfSet])];

      // Stage 1: batch spark closes
      const sparkData = await getSparkCloses(allSymbols);

      // Compute ETF drops for sector-relative
      const etfDrop1d = new Map<string, number>();
      const etfPrevDrop = new Map<string, number>();
      const etfDrop3d = new Map<string, number>();
      for (const etf of etfSet) {
        const closes = sparkData.get(etf);
        if (closes && closes.length >= 2) {
          etfDrop1d.set(etf, closes[closes.length - 1] / closes[closes.length - 2] - 1);
        }
        if (closes && closes.length >= 3) {
          etfPrevDrop.set(etf, closes[closes.length - 2] / closes[closes.length - 3] - 1);
        }
        if (closes && closes.length >= 4) {
          etfDrop3d.set(etf, closes[closes.length - 1] / closes[closes.length - 4] - 1);
        }
      }

      // Stage 1 filter + near-misses
      interface Triggered { ticker: string; drop1d: number; prevDayDrop: number; drop3d: number; dd5: number; spot: number; trigger: "bugün" | "dün" | "3g"; triggerDrop: number; triggerDays: number; }
      interface TickerMetrics { drop1d: number; prevDayDrop: number; drop3d: number; dd5: number; spot: number; trigger: "bugün" | "dün" | "3g" | null; triggerDrop: number; triggerDays: number; }

      function computeTickerMetrics(closes: number[]): TickerMetrics {
        const last = closes[closes.length - 1];
        const drop1d = last / closes[closes.length - 2] - 1;
        const prevDayDrop = closes.length >= 3 ? closes[closes.length - 2] / closes[closes.length - 3] - 1 : 0;
        const drop3d = closes.length >= 4 ? last / closes[closes.length - 4] - 1 : 0;
        const dd5 = last / Math.max(...closes.slice(-5)) - 1;
        const by1d = drop1d <= -DROP_1D;
        const byPrev = prevDayDrop <= -DROP_1D;
        const by3d = drop3d <= -DROP_3D;
        const trigger = by1d ? "bugün" as const : byPrev ? "dün" as const : by3d ? "3g" as const : null;
        const triggerDrop = by1d ? drop1d : byPrev ? prevDayDrop : drop3d;
        const triggerDays = trigger === "3g" ? 3 : 1;
        return { drop1d, prevDayDrop, drop3d, dd5, spot: last, trigger, triggerDrop, triggerDays };
      }

      const triggered: Triggered[] = [];
      const nearMissPool: { ticker: string; window: "bugün" | "dün" | "3g"; drop: number; threshold: number; proximity: number }[] = [];
      const skippedTickers: string[] = [];

      for (const ticker of input.tickers) {
        const closes = sparkData.get(ticker);
        if (!closes || closes.length < 3) { skippedTickers.push(ticker); continue; }
        const m = computeTickerMetrics(closes);
        if (m.trigger) {
          triggered.push({ ticker, drop1d: m.drop1d, prevDayDrop: m.prevDayDrop, drop3d: m.drop3d, dd5: m.dd5, spot: m.spot, trigger: m.trigger, triggerDrop: m.triggerDrop, triggerDays: m.triggerDays });
        } else {
          const prox1d = m.drop1d / -DROP_1D;
          const proxPrev = m.prevDayDrop / -DROP_1D;
          const prox3d = closes.length >= 4 ? m.drop3d / -DROP_3D : 0;
          const proximity = Math.max(prox1d, proxPrev, prox3d);
          if (proximity > 0.3) {
            const best = prox1d >= proxPrev && prox1d >= prox3d ? "bugün" as const : proxPrev >= prox3d ? "dün" as const : "3g" as const;
            const drop = best === "bugün" ? m.drop1d : best === "dün" ? m.prevDayDrop : m.drop3d;
            nearMissPool.push({ ticker, window: best, drop, threshold: best === "3g" ? -DROP_3D : -DROP_1D, proximity });
          }
        }
      }
      nearMissPool.sort((a, b) => b.proximity - a.proximity);
      const nearMisses = nearMissPool.slice(0, 5);

      // Debug ticker
      let debug: { ticker: string; inUniverse: boolean; sparkFound: boolean; closes: number[] | null; drop1d: number | null; prevDayDrop: number | null; drop3d: number | null; dd5: number | null; wouldTrigger: string | null } | undefined;
      if (input.debugTicker) {
        const dt = input.debugTicker.toUpperCase();
        const closes = sparkData.get(dt) ?? null;
        const inUniverse = input.tickers.includes(dt);
        if (closes && closes.length >= 3) {
          const m = computeTickerMetrics(closes);
          debug = { ticker: dt, inUniverse, sparkFound: true, closes, drop1d: m.drop1d, prevDayDrop: m.prevDayDrop, drop3d: m.drop3d, dd5: m.dd5, wouldTrigger: m.trigger };
        } else {
          debug = { ticker: dt, inUniverse, sparkFound: !!closes, closes: closes ? [...closes] : null, drop1d: null, prevDayDrop: null, drop3d: null, dd5: null, wouldTrigger: null };
        }
      }

      const stage1Ms = Date.now() - stage1Start;

      // Stage 2: deep analysis (semaphore 4)
      const sem = { running: 0, queue: [] as Array<() => void> };
      function acquire(): Promise<void> {
        if (sem.running < 4) { sem.running++; return Promise.resolve(); }
        return new Promise<void>(r => sem.queue.push(r));
      }
      function release() { sem.running--; const next = sem.queue.shift(); if (next) { sem.running++; next(); } }

      interface AnomalyCard {
        ticker: string; spot: number; drop1d: number; prevDayDrop: number; drop3d: number; dd5: number;
        trigger: "bugün" | "dün" | "3g"; triggerDrop: number; triggerDays: number;
        hv20: number; sigmaMove: number; sectorRel: number; sectorLabel: string;
        ivPct: number; ivHvRatio: number; ivPercentile: number | null; ivPercentilePrev: number | null;
        earningsInWin: boolean | null;
        putWall: number | null;
        expiry: string; dte: number;
        conservative: StrikeSuggestion | null; aggressive: StrikeSuggestion | null;
        opportunityScore: number;
      }
      interface StrikeSuggestion {
        strike: number; premium: number; totalCredit: number;
        annualizedYieldPct: number; pAssign: number; buffer: number;
        effectiveCost: number; effectiveCostVsSpotPct: number; oi: number;
      }

      const cards: AnomalyCard[] = [];

      await Promise.all(triggered.map(async (t) => {
        await acquire();
        try {
          // 6-month closes for HV
          const chartJson = await yahoo.fetchJSON(`https://query2.finance.yahoo.com/v8/finance/chart/${t.ticker}?interval=1d&range=6mo`) as {
            chart?: { result?: Array<{ indicators?: { quote?: Array<{ close?: (number | null)[] }> } }> };
          };
          const closes = (chartJson?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter((c): c is number => c != null);
          const hv20 = historicalVol(closes, 20);
          if (!hv20 || hv20 <= 0) return;

          // sigma of the triggering window: hv20 scaled to triggerDays
          const windowSigma = hv20 * Math.sqrt(t.triggerDays / 252);
          const sigmaMove = Math.abs(t.triggerDrop) / windowSigma;
          const sectorEtf = sectorEtfFor(t.ticker);
          const sectorDrop = (t.trigger === "3g" ? etfDrop3d : t.trigger === "dün" ? etfPrevDrop : etfDrop1d).get(sectorEtf) ?? 0;
          const sectorRel = t.triggerDrop - sectorDrop;
          const sectorLabel = sectorRel <= -0.04 ? "şirket-ağırlıklı" : "sektörle birlikte";

          // Expiry: nearest with DTE in [5,15], fallback nearest ≥5
          const expiryInfo = await marketData.getExpirations(t.ticker);
          const now = Date.now();
          let bestExpiry: string | null = null;
          for (const exp of expiryInfo.expirations) {
            const dte = Math.ceil((new Date(exp + "T00:00:00Z").getTime() - now) / 86400000);
            if (dte >= 5 && dte <= 15) { bestExpiry = exp; break; }
          }
          if (!bestExpiry) {
            for (const exp of expiryInfo.expirations) {
              const dte = Math.ceil((new Date(exp + "T00:00:00Z").getTime() - now) / 86400000);
              if (dte >= 5) { bestExpiry = exp; break; }
            }
          }
          if (!bestExpiry) return;
          const dte = Math.ceil((new Date(bestExpiry + "T00:00:00Z").getTime() - now) / 86400000);
          const T = dte / 365;

          // Chain + bisection ATM IV
          const chain = await marketData.getChain(t.ticker, bestExpiry, expiryInfo.expirationTimestamps?.[bestExpiry]);
          const spot = chain.price || t.spot;

          // ATM IV (median band)
          const solveIv = (o: { strike: number; last: number; iv: number }, isCall: boolean): number | null => {
            if (o.last > 0 && T > 0) {
              const bs = impliedVolBisection(o.last, spot, o.strike, T, CSP_RISK_FREE_RATE, isCall);
              if (bs !== null && bs > 0.03 && bs < 5) return bs * 100;
            }
            return o.iv > 3 && o.iv < 500 ? o.iv : null;
          };
          let ivPct = 0;
          for (const band of [0.05, 0.12]) {
            const ivs: number[] = [];
            for (const c of chain.calls) if (Math.abs(c.strike - spot) <= spot * band) { const v = solveIv(c, true); if (v) ivs.push(v); }
            for (const p of chain.puts) if (Math.abs(p.strike - spot) <= spot * band) { const v = solveIv(p, false); if (v) ivs.push(v); }
            if (ivs.length >= 2) { ivs.sort((a, b) => a - b); ivPct = ivs[Math.floor(ivs.length / 2)]; break; }
          }
          if (!ivPct) return;

          const ivHvRatio = (ivPct / 100) / hv20;

          // Vol snapshot upsert
          try {
            void db.volSnapshot.upsert({
              where: { ticker_date: { ticker: t.ticker, date: today } },
              create: { ticker: t.ticker, date: today, atmIv: ivPct, hv20 },
              update: { atmIv: ivPct, hv20 },
            });
          } catch { /* never break */ }

          // IV percentile from history
          let ivPercentile: number | null = null;
          let ivPercentilePrev: number | null = null;
          try {
            const snaps = await db.volSnapshot.findMany({ where: { ticker: t.ticker }, orderBy: { date: "desc" }, take: 60 });
            if (snaps.length >= 20) {
              const ivs = snaps.map(s => s.atmIv).sort((a, b) => a - b);
              ivPercentile = Math.round((ivs.filter(v => v <= ivPct).length / ivs.length) * 100);
              if (snaps.length >= 2) {
                const prevIv = snaps[1].atmIv;
                ivPercentilePrev = Math.round((ivs.filter(v => v <= prevIv).length / ivs.length) * 100);
              }
            }
          } catch { /* ok */ }

          // Earnings
          const earningsInWin = await earningsInWindow(t.ticker, bestExpiry);

          // GEX for putWall
          let putWall: number | null = null;
          try {
            const cboeChain = await getCboeChain(t.ticker);
            if (cboeChain) {
              const gexContracts: GexContractInput[] = [];
              for (const o of cboeChain.options) {
                if (o.expiry !== bestExpiry || o.oi <= 0) continue;
                gexContracts.push({ strike: o.strike, type: o.type, openInterest: o.oi, iv: o.iv });
              }
              if (gexContracts.length > 0) putWall = computeGexProfile(spot, T, gexContracts).putWall;
            }
          } catch { /* cboe may fail */ }

          // Strike suggestions (last-first clamp pricing)
          const puts = chain.puts.filter(p => p.strike < spot);
          function pickStrike(maxStrike: number): StrikeSuggestion | null {
            const candidates = puts.filter(p => p.strike <= maxStrike).sort((a, b) => b.strike - a.strike);
            if (candidates.length === 0) return null;
            const p = candidates[0];
            const premium = p.bid > 0 ? p.bid : p.last > 0 ? p.last : 0;
            if (premium <= 0) return null;
            const pAssign = probITMPut(spot, p.strike, T, ivPct / 100);
            return {
              strike: p.strike, premium, totalCredit: premium * 100,
              annualizedYieldPct: (premium / p.strike) * (365 / dte) * 100,
              pAssign: Math.round(pAssign * 10000) / 100,
              buffer: (spot - p.strike) / spot,
              effectiveCost: p.strike - premium,
              effectiveCostVsSpotPct: (spot - (p.strike - premium)) / spot,
              oi: p.oi,
            };
          }

          const conservativeMax = Math.min(putWall ?? spot * 0.88, spot * 0.88);
          const conservative = pickStrike(conservativeMax);

          // Aggressive: closest to spot*0.91
          const aggressiveTarget = spot * 0.91;
          const aggressiveCandidates = puts.filter(p => p.strike <= aggressiveTarget).sort((a, b) => Math.abs(a.strike - aggressiveTarget) - Math.abs(b.strike - aggressiveTarget));
          let aggressive: StrikeSuggestion | null = null;
          if (aggressiveCandidates.length > 0) {
            const p = aggressiveCandidates[0];
            const premium = p.bid > 0 ? p.bid : p.last > 0 ? p.last : 0;
            if (premium > 0) {
              const pAssign = probITMPut(spot, p.strike, T, ivPct / 100);
              aggressive = {
                strike: p.strike, premium, totalCredit: premium * 100,
                annualizedYieldPct: (premium / p.strike) * (365 / dte) * 100,
                pAssign: Math.round(pAssign * 10000) / 100,
                buffer: (spot - p.strike) / spot,
                effectiveCost: p.strike - premium,
                effectiveCostVsSpotPct: (spot - (p.strike - premium)) / spot,
                oi: p.oi,
              };
            }
          }

          const opportunityScore = ivHvRatio * sigmaMove * (1 + Math.abs(t.dd5));

          cards.push({
            ticker: t.ticker, spot, drop1d: t.drop1d, prevDayDrop: t.prevDayDrop, drop3d: t.drop3d, dd5: t.dd5,
            trigger: t.trigger, triggerDrop: t.triggerDrop, triggerDays: t.triggerDays,
            hv20, sigmaMove, sectorRel, sectorLabel, ivPct, ivHvRatio,
            ivPercentile, ivPercentilePrev, earningsInWin, putWall,
            expiry: bestExpiry, dte, conservative, aggressive, opportunityScore,
          });

          // Log to DB
          try {
            await db.anomalyLog.upsert({
              where: { ticker_expiry_detectedOnDay: { ticker: t.ticker, expiry: new Date(bestExpiry), detectedOnDay: today } },
              create: {
                ticker: t.ticker, detectedOnDay: today, expiry: new Date(bestExpiry),
                spot, dropPct: t.triggerDrop, triggerWindow: t.trigger, sigmaMove, sectorRel, ivHvRatio,
                strikeConservative: conservative?.strike ?? 0, premiumConservative: conservative?.premium ?? 0,
                strikeAggressive: aggressive?.strike ?? 0, premiumAggressive: aggressive?.premium ?? 0,
              },
              update: { spot, dropPct: t.triggerDrop, triggerWindow: t.trigger, sigmaMove, sectorRel, ivHvRatio },
            });
          } catch { /* never break */ }
        } catch { /* skip ticker */ }
        finally { release(); }
      }));

      // Settle expired logs
      try {
        const unsettled = await db.anomalyLog.findMany({ where: { expiry: { lt: today }, outcome: null } });
        for (const log of unsettled) {
          try {
            const cJson = await yahoo.fetchJSON(`https://query2.finance.yahoo.com/v8/finance/chart/${log.ticker}?interval=1d&range=1mo`) as {
              chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: (number | null)[] }> } }> };
            };
            const timestamps = cJson?.chart?.result?.[0]?.timestamp ?? [];
            const closes = cJson?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
            const expTs = log.expiry.getTime() / 1000;
            let closeOnExpiry: number | null = null;
            for (let i = 0; i < timestamps.length; i++) {
              if (timestamps[i] >= expTs - 86400 && timestamps[i] <= expTs + 86400 && closes[i] != null) {
                closeOnExpiry = closes[i] as number; break;
              }
            }
            if (closeOnExpiry != null) {
              const outcome = closeOnExpiry >= log.strikeConservative ? "MAX_KAR" : "ASSIGNMENT";
              await db.anomalyLog.update({ where: { id: log.id }, data: { settledClose: closeOnExpiry, outcome } });
            }
          } catch { /* skip */ }
        }
      } catch { /* settle failed */ }

      // Sort by opportunityScore desc
      cards.sort((a, b) => b.opportunityScore - a.opportunityScore);

      // Calibration stats
      let calibration: { total: number; maxKar: number; assignment: number; bySigma: { low: { total: number; maxKar: number }; high: { total: number; maxKar: number } }; bySector: { company: { total: number; maxKar: number }; sector: { total: number; maxKar: number } }; byTrigger: { d1: { total: number; maxKar: number }; d3: { total: number; maxKar: number } } } | null = null;
      try {
        const settled = await db.anomalyLog.findMany({ where: { outcome: { not: null } } });
        if (settled.length > 0) {
          const maxKar = settled.filter(s => s.outcome === "MAX_KAR").length;
          const highSigma = settled.filter(s => s.sigmaMove >= 3);
          const lowSigma = settled.filter(s => s.sigmaMove < 3);
          const company = settled.filter(s => s.sectorRel <= -0.04);
          const sector = settled.filter(s => s.sectorRel > -0.04);
          const d1 = settled.filter(s => s.triggerWindow === "1g");
          const d3 = settled.filter(s => s.triggerWindow === "3g");
          calibration = {
            total: settled.length, maxKar, assignment: settled.length - maxKar,
            bySigma: {
              low: { total: lowSigma.length, maxKar: lowSigma.filter(s => s.outcome === "MAX_KAR").length },
              high: { total: highSigma.length, maxKar: highSigma.filter(s => s.outcome === "MAX_KAR").length },
            },
            bySector: {
              company: { total: company.length, maxKar: company.filter(s => s.outcome === "MAX_KAR").length },
              sector: { total: sector.length, maxKar: sector.filter(s => s.outcome === "MAX_KAR").length },
            },
            byTrigger: {
              d1: { total: d1.length, maxKar: d1.filter(s => s.outcome === "MAX_KAR").length },
              d3: { total: d3.length, maxKar: d3.filter(s => s.outcome === "MAX_KAR").length },
            },
          };
        }
      } catch { /* ok */ }

      return {
        cards, calibration,
        meta: { scanned: input.tickers.length, stage1Ms, triggeredCount: triggered.length, nearMisses, skipped: { count: skippedTickers.length, sample: skippedTickers.slice(0, 10) }, debug },
      };
    }),
});
