/**
 * MathEngine — TypeScript port of SignalLab's MathEngine.swift
 *
 * Layer 1: Volatility Edge (IV vs HV)
 * Layer 2: Monte Carlo real-world probability (HV-based, 10,000 paths)
 * Layer 3: Expected Value + Kelly sizing
 * Layer 4: Composite score (0-100)
 */

import { bsPrice, impliedVol } from "./black-scholes";
import type { OptionChain, OptionRow } from "./yahoo-finance";

// ─── Constants ───────────────────────────────────────────────────────────────

const RISK_FREE_RATE = 0.05;
const SIM_COUNT = 10_000;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Leg {
  action: "buy" | "sell";
  type: "call" | "put";
  strike: number;
  last: number;
  contracts: number;
}

export interface StrategyLeg {
  action: string; // "buy" | "sell"
  type: string;   // "call" | "put" | "stock"
  strike: number;
  price: number;
  contracts: number;
}

export interface PriceScenario {
  price: number;
  pnl: number;
}

export interface TimeScenario {
  day: number;
  label: string;
  scenarios: PriceScenario[];
}

export interface AnalysisResult {
  ticker: string;
  currentPrice: number;
  expiry: string;
  dte: number;
  netPremium: number;
  maxProfit: number;
  maxLoss: number;
  winProbability: number;
  mcProbability: number;
  ev: number;
  evPct: number;
  volEdge: number;
  kellyFraction: number;
  breakevens: number[];
  scenarios: PriceScenario[];
  timeScenarios: TimeScenario[];
  capital: number;
  riskPct: number;
}

export interface StrategySignals {
  ivRankOk: boolean;
  trendOk: boolean;
  dteOk: boolean;
  earningsRisk: boolean;
}

export interface StrategyDirective {
  step: number;
  title: string;
  detail: string;
  icon: string;
  warning: boolean;
}

export interface StrategyScenario {
  price: number;
  pnl: number;
  label: string;
  outcome: string;
  isBE: boolean;
}

export interface StrategyRecommendation {
  name: string;
  type: string;
  description: string;
  probability: number;
  netCredit: number;
  maxProfit: number;
  maxLoss: number;
  ev: number;
  evPct: number;
  volEdge: number;
  compositeScore: number;
  legs: StrategyLeg[];
  signals: StrategySignals;
  why: string;
  directives: StrategyDirective[];
  scenarios: StrategyScenario[];
}

export interface MarketSignals {
  ivRank: number;
  currentIv: number;
  hv: number;
  ivVsHv: string;
  trend: string;
  rsi: number;
  momentum5d: number;
  pcRatio: number;
  maxPain: number;
  maxPainDistPct: number;
  vix: number;
  fearGreed: { value: number; classification: string };
  earnings: { hasEarnings: boolean; earningsDate: string | null; daysAway: number | null };
}

export interface AIPickResult {
  ticker: string;
  price: number;
  expiry: string;
  dte: number;
  signals: MarketSignals;
  strategies: StrategyRecommendation[];
  debugInfo: {
    callCount: number;
    putCount: number;
    liquidCalls: number;
    liquidPuts: number;
    dte: number;
    ivRank: number;
    reason: string;
  };
}

// ─── Layer 1: Volatility Edge ────────────────────────────────────────────────

export function volEdge(iv: number, hv: number): number {
  if (hv <= 0) return 0;
  return (iv - hv) / hv;
}

export function volEdgeScore(iv: number, hv: number): number {
  const edge = volEdge(iv, hv);
  const clamped = Math.max(-0.5, Math.min(0.5, edge));
  return (clamped + 0.5) * 100;
}

// ─── Layer 2: Monte Carlo ────────────────────────────────────────────────────

function boxMullerRandom(): number {
  const u1 = Math.random() || Number.EPSILON;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function monteCarloFull(
  S: number,
  T: number,
  hv: number,
  drift: number,
  optionLegs: Leg[],
  stockShares: number,
  stockEntry: number,
): { probability: number; ev: number } {
  if (T <= 0 || hv <= 0) return { probability: 0, ev: 0 };

  const mu = drift - 0.5 * hv * hv;
  const sigma = hv * Math.sqrt(T);
  let wins = 0;
  let totalPnL = 0;

  for (let i = 0; i < SIM_COUNT; i++) {
    const ST = S * Math.exp(mu * T + sigma * boxMullerRandom());
    let pnl = strategyPnLAtExpiry(optionLegs, ST);
    if (stockShares > 0) pnl += (ST - stockEntry) * stockShares;
    if (pnl > 0) wins++;
    totalPnL += pnl;
  }

  return { probability: wins / SIM_COUNT, ev: totalPnL / SIM_COUNT };
}

// ─── Layer 3: EV & Kelly ─────────────────────────────────────────────────────

export function expectedValue(pWin: number, maxProfit: number, maxLoss: number): number {
  return pWin * maxProfit - (1 - pWin) * Math.abs(maxLoss);
}

export function kellyFraction(pWin: number, maxProfit: number, maxLoss: number): number {
  if (maxLoss <= 0 || maxProfit <= 0) return 0;
  const b = maxProfit / Math.abs(maxLoss);
  const k = (pWin * b - (1 - pWin)) / b;
  return Math.max(0, Math.min(0.25, k));
}

// ─── Layer 4: Composite Score ────────────────────────────────────────────────

export function compositeScore(
  mcProbability: number,
  evPct: number,
  volEdgeScr: number,
  trendAligned: boolean,
  earningsRisk: boolean,
  ivRank: number,
): number {
  const probScore = mcProbability * 100;
  const evScore = Math.max(0, Math.min(100, (evPct + 0.5) * 100));
  const trendScore = trendAligned ? 100 : 30;
  const earningsAdj = earningsRisk ? -20 : 0;

  const raw =
    0.35 * probScore +
    0.25 * evScore +
    0.20 * volEdgeScr +
    0.12 * trendScore +
    0.08 * ivRank +
    earningsAdj;

  return Math.max(0, Math.min(100, raw));
}

// ─── P&L Calculators ─────────────────────────────────────────────────────────

export function strategyPnLAtExpiry(legs: Leg[], price: number): number {
  return legs.reduce((total, leg) => {
    const intrinsic =
      leg.type === "call"
        ? Math.max(price - leg.strike, 0)
        : Math.max(leg.strike - price, 0);
    const cost = leg.last * leg.contracts * 100;
    const value = intrinsic * leg.contracts * 100;
    return total + (leg.action === "sell" ? cost - value : value - cost);
  }, 0);
}

export function strategyPnLFromLegs(legs: StrategyLeg[], price: number): number {
  return legs.reduce((total, leg) => {
    if (leg.type === "stock") {
      const pnl = (price - leg.price) * leg.contracts;
      return total + (leg.action === "buy" ? pnl : -pnl);
    }
    const isCall = leg.type === "call";
    const intrinsic = isCall ? Math.max(price - leg.strike, 0) : Math.max(leg.strike - price, 0);
    const cost = leg.price * leg.contracts * 100;
    const value = intrinsic * leg.contracts * 100;
    return total + (leg.action === "sell" ? cost - value : value - cost);
  }, 0);
}

// ─── Strategy Analysis ───────────────────────────────────────────────────────

export function analyzeStrategy(
  ticker: string,
  currentPrice: number,
  expiry: string,
  dte: number,
  legs: Leg[],
  capital: number,
  hv: number,
): AnalysisResult {
  const T = dte / 365;

  // Net premium
  const netPremium = legs.reduce((sum, leg) => {
    const sign = leg.action === "sell" ? 1 : -1;
    return sum + sign * leg.last * leg.contracts * 100;
  }, 0);

  // Max profit / loss via scenario sweep
  const prices: number[] = [];
  for (let p = currentPrice * 0.5; p <= currentPrice * 1.5; p += currentPrice * 0.01) {
    prices.push(p);
  }
  const pnls = prices.map((p) => strategyPnLAtExpiry(legs, p));
  const maxProfit = Math.max(...pnls);
  const maxLoss = Math.min(...pnls);

  // Breakevens
  const breakevens: number[] = [];
  for (let i = 1; i < pnls.length; i++) {
    if ((pnls[i - 1] < 0) !== (pnls[i] < 0)) {
      breakevens.push((prices[i - 1] + prices[i]) / 2);
    }
  }

  // Average IV from legs
  const ivValues = legs
    .filter((leg) => leg.last > 0 && T > 0)
    .map((leg) => impliedVol(currentPrice, leg.strike, T, RISK_FREE_RATE, leg.last, leg.type === "call"));
  const avgIV = ivValues.length > 0 ? ivValues.reduce((a, b) => a + b, 0) / ivValues.length : hv;

  const iv = avgIV > 0 ? avgIV : hv;
  const edge = volEdge(iv, hv);
  const drift = RISK_FREE_RATE - edge * 0.1;

  const { probability: mcProb, ev: mcEV } = monteCarloFull(
    currentPrice, T, hv, drift, legs, 0, 0,
  );

  const evPct = Math.abs(maxLoss) > 0 ? mcEV / Math.abs(maxLoss) : 0;
  const kelly = kellyFraction(mcProb, maxProfit, Math.abs(maxLoss));

  // Price scenarios
  const scenarioPrices: number[] = [];
  for (let p = currentPrice * 0.7; p <= currentPrice * 1.3; p += currentPrice * 0.03) {
    scenarioPrices.push(p);
  }
  const scenarios: PriceScenario[] = scenarioPrices.map((p) => ({
    price: p,
    pnl: strategyPnLAtExpiry(legs, p),
  }));

  // Time scenarios
  const timeScenarios = buildTimeScenarios(legs, currentPrice, T, hv, RISK_FREE_RATE);

  const riskPct = capital > 0 ? (Math.abs(maxLoss) / capital) * 100 : 0;

  return {
    ticker,
    currentPrice,
    expiry,
    dte,
    netPremium,
    maxProfit,
    maxLoss,
    winProbability: mcProb * 100,
    mcProbability: mcProb * 100,
    ev: mcEV,
    evPct: evPct * 100,
    volEdge: edge * 100,
    kellyFraction: kelly * 100,
    breakevens,
    scenarios,
    timeScenarios,
    capital,
    riskPct,
  };
}

function buildTimeScenarios(
  legs: Leg[],
  S: number,
  T: number,
  hv: number,
  r: number,
): TimeScenario[] {
  const checkpoints = [
    { day: 1, label: "1G" },
    { day: 7, label: "1H" },
    { day: 14, label: "2H" },
    { day: Math.floor((T * 365) / 2), label: "½" },
  ];
  const priceMoves = [-0.1, -0.05, 0, 0.05, 0.1];

  return checkpoints.map((cp) => {
    const tRemain = Math.max(T - cp.day / 365, 0.001);
    const scenarios: PriceScenario[] = priceMoves.map((move) => {
      const futureS = S * (1 + move);
      const pnl = legs.reduce((sum, leg) => {
        const theorPrice = bsPrice(futureS, leg.strike, tRemain, r, hv, leg.type === "call");
        const cost = leg.last * leg.contracts * 100;
        const value = theorPrice * leg.contracts * 100;
        return sum + (leg.action === "sell" ? cost - value : value - cost);
      }, 0);
      return { price: futureS, pnl };
    });
    return { day: cp.day, label: cp.label, scenarios };
  });
}

// ─── Max Pain ────────────────────────────────────────────────────────────────

export function maxPain(calls: OptionRow[], puts: OptionRow[]): number {
  const allStrikes = Array.from(new Set([...calls.map((c) => c.strike), ...puts.map((p) => p.strike)])).sort(
    (a, b) => a - b,
  );

  let minPainValue = Infinity;
  let maxPainStrike = allStrikes[0] ?? 0;

  for (const s of allStrikes) {
    const pain =
      calls.reduce((acc, c) => acc + Math.max(s - c.strike, 0) * c.oi, 0) +
      puts.reduce((acc, p) => acc + Math.max(p.strike - s, 0) * p.oi, 0);
    if (pain < minPainValue) {
      minPainValue = pain;
      maxPainStrike = s;
    }
  }

  return maxPainStrike;
}

// ─── AI Pick Builder ─────────────────────────────────────────────────────────

export function buildAIPick(
  ticker: string,
  price: number,
  expiry: string,
  dte: number,
  chain: OptionChain,
  hv: number,
  ivRank: number,
  currentIV: number,
): AIPickResult {
  const T = dte / 365;
  const iv = currentIV / 100;
  const edge = volEdge(iv, hv);

  // Trend from chain delta skew
  const avgCallDelta =
    chain.calls.length > 0
      ? chain.calls.reduce((s, c) => s + c.delta, 0) / chain.calls.length
      : 0.5;
  const trend = avgCallDelta > 0.52 ? "bullish" : avgCallDelta < 0.48 ? "bearish" : "neutral";

  const rsi = 50;

  // Put/Call ratio from OI
  const totalCallOI = chain.calls.reduce((s, c) => s + c.oi, 0);
  const totalPutOI = chain.puts.reduce((s, p) => s + p.oi, 0);
  const pcRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : 1;

  // Max pain
  const mp = chain.calls.length > 0 ? maxPain(chain.calls, chain.puts) : price;
  const maxPainDistPct = price > 0 ? ((mp - price) / price) * 100 : 0;

  const signals: MarketSignals = {
    ivRank,
    currentIv: currentIV,
    hv: hv * 100,
    ivVsHv: edge > 0.1 ? "IV pahalı → sat" : edge < -0.1 ? "IV ucuz → al" : "Dengeli",
    trend,
    rsi,
    momentum5d: 0,
    pcRatio,
    maxPain: mp,
    maxPainDistPct,
    vix: 20,
    fearGreed: { value: 50, classification: "Neutral" },
    earnings: { hasEarnings: false, earningsDate: null, daysAway: null },
  };

  const strategies = buildStrategies(ticker, price, expiry, dte, chain, hv, iv, ivRank, trend, edge, T);

  // Debug info
  const liquidCalls = chain.calls.filter((c) => c.last > 0).length;
  const liquidPuts = chain.puts.filter((p) => p.last > 0).length;
  let debugReason = "";
  if (chain.calls.length < 3 || chain.puts.length < 3) {
    debugReason = `Zincirde yeterli opsiyon yok (call: ${chain.calls.length}, put: ${chain.puts.length}).`;
  } else if (liquidCalls < 2 || liquidPuts < 2) {
    debugReason = "Bu vadede likit opsiyon bulunamadı.";
  } else if (dte > 365) {
    debugReason = `Vade çok uzak (${dte} gün). 30-90 günlük bir vade deneyin.`;
  } else if (strategies.length === 0) {
    debugReason = `Mevcut koşullar hiçbir strateji kriterini karşılamıyor. IV rank: ${Math.round(ivRank)}%, trend: ${trend}.`;
  }

  return {
    ticker,
    price,
    expiry,
    dte,
    signals,
    strategies: strategies.sort((a, b) => b.compositeScore - a.compositeScore),
    debugInfo: { callCount: chain.calls.length, putCount: chain.puts.length, liquidCalls, liquidPuts, dte, ivRank, reason: debugReason },
  };
}

// ─── Strategy Builder ────────────────────────────────────────────────────────

function buildStrategies(
  ticker: string,
  price: number,
  expiry: string,
  dte: number,
  chain: OptionChain,
  hv: number,
  iv: number,
  ivRank: number,
  trend: string,
  edge: number,
  T: number,
): StrategyRecommendation[] {
  const results: StrategyRecommendation[] = [];

  const callsSorted = [...chain.calls].sort((a, b) => Math.abs(a.strike - price) - Math.abs(b.strike - price));
  const putsSorted = [...chain.puts].sort((a, b) => Math.abs(a.strike - price) - Math.abs(b.strike - price));
  if (callsSorted.length < 2 || putsSorted.length < 2) return [];

  const atmCall = callsSorted[0];
  const atmPut = putsSorted[0];

  const otmCall = chain.calls.filter((c) => c.strike > price && c.last > 0).sort((a, b) => a.strike - b.strike)[0] ?? callsSorted[Math.min(1, callsSorted.length - 1)];
  const otmPut = chain.puts.filter((p) => p.strike < price && p.last > 0).sort((a, b) => b.strike - a.strike)[0] ?? putsSorted[Math.min(1, putsSorted.length - 1)];
  const deepOtmPut = chain.puts.filter((p) => p.strike < price * 0.95 && p.last > 0).sort((a, b) => b.strike - a.strike)[0] ?? otmPut;

  const dteOk = dte >= 7 && dte <= 180;
  const earningsRisk = false;
  const highIV = ivRank > 40;
  const lowIV = ivRank < 35;

  // Helper to score a strategy
  function score(
    name: string,
    type: string,
    description: string,
    legs: StrategyLeg[],
    stockLegs: StrategyLeg[],
    trendTarget: string,
    why: string,
  ): StrategyRecommendation | null {
    const allLegs = [...legs, ...stockLegs];
    const scanPrices: number[] = [];
    for (let p = price * 0.5; p <= price * 1.5; p += price * 0.005) scanPrices.push(p);
    const scanPnls = scanPrices.map((p) => strategyPnLFromLegs(allLegs, p));
    const mxProfit = Math.max(...scanPnls);
    const mxLoss = Math.min(...scanPnls);

    const mcLegs: Leg[] = legs.filter((l) => l.type !== "stock").map((sl) => ({
      action: sl.action as "buy" | "sell",
      type: sl.type as "call" | "put",
      strike: sl.strike,
      last: sl.price,
      contracts: sl.contracts,
    }));
    const stockShareCount = stockLegs.filter((l) => l.type === "stock" && l.action === "buy").reduce((s, l) => s + l.contracts, 0);
    const { probability: mcProb, ev: mcEV } = monteCarloFull(price, T, hv, RISK_FREE_RATE, mcLegs, stockShareCount, price);

    const netCredit = legs.reduce((sum, leg) => {
      const sign = leg.action === "sell" ? 1 : -1;
      return sum + sign * leg.price;
    }, 0);

    const evPctVal = Math.abs(mxLoss) > 0 ? mcEV / Math.abs(mxLoss) : 0;
    const veScore = volEdgeScore(iv, hv);
    const trendAligned = trendTarget === "neutral" || trendTarget === trend;
    const ivRankOk = ivRank > 30;

    const scoreVal = compositeScore(mcProb, evPctVal, veScore, trendAligned, earningsRisk, ivRank);
    const signals: StrategySignals = { ivRankOk, trendOk: trendAligned, dteOk, earningsRisk };

    return {
      name, type, description,
      probability: mcProb * 100,
      netCredit,
      maxProfit: mxProfit,
      maxLoss: mxLoss,
      ev: mcEV,
      evPct: evPctVal * 100,
      volEdge: edge * 100,
      compositeScore: scoreVal,
      legs: allLegs,
      signals,
      why,
      directives: [],
      scenarios: [],
    };
  }

  // 1. Long Call
  const lcOption = lowIV ? otmCall : atmCall;
  const lc = score("Long Call", "bullish", "Yükseliş bekliyorsun — call al, sınırlı risk sınırsız kâr",
    [{ action: "buy", type: "call", strike: lcOption.strike, price: lcOption.last, contracts: 1 }], [],
    "bullish", `$${lcOption.strike.toFixed(0)} call al. Maliyet $${(lcOption.last * 100).toFixed(0)}.`);
  if (lc) results.push(lc);

  // 2. Long Put
  const lpOption = lowIV ? otmPut : atmPut;
  const lp = score("Long Put", "bearish", "Düşüş bekliyorsun — put al, sınırlı risk büyük kâr",
    [{ action: "buy", type: "put", strike: lpOption.strike, price: lpOption.last, contracts: 1 }], [],
    "bearish", `$${lpOption.strike.toFixed(0)} put al. Maliyet $${(lpOption.last * 100).toFixed(0)}.`);
  if (lp) results.push(lp);

  // 3. Covered Call
  const cc = score("Covered Call", "neutral", "100 hisse al + OTM call sat — theta harvest",
    [{ action: "sell", type: "call", strike: otmCall.strike, price: otmCall.last, contracts: 1 }],
    [{ action: "buy", type: "stock", strike: 0, price: price, contracts: 100 }],
    "neutral", `100 hisse + $${otmCall.strike.toFixed(0)} call sat. $${(otmCall.last * 100).toFixed(0)} prim.`);
  if (cc) results.push(cc);

  // 4. Cash-Secured Put
  const csp = score("Cash-Secured Put", "neutral", "OTM put sat — prim topla, atanırsa hisseyi ucuza al",
    [{ action: "sell", type: "put", strike: otmPut.strike, price: otmPut.last, contracts: 1 }], [],
    "neutral", `$${otmPut.strike.toFixed(0)} put sat. $${(otmPut.last * 100).toFixed(0)} prim al.`);
  if (csp) results.push(csp);

  // 5. Wheel Strategy
  const wh = score("Wheel Strategy", "neutral", "CSP sat → atanırsa CC sat → tekrarla. Sürekli theta geliri.",
    [
      { action: "sell", type: "put", strike: otmPut.strike, price: otmPut.last, contracts: 1 },
      { action: "sell", type: "call", strike: otmCall.strike, price: otmCall.last, contracts: 1 },
    ],
    [{ action: "buy", type: "stock", strike: 0, price: price, contracts: 100 }],
    "neutral", `Faz 1: $${otmPut.strike.toFixed(0)} CSP. Faz 2: $${otmCall.strike.toFixed(0)} CC.`);
  if (wh) results.push(wh);

  // 6. Collar
  const col = score("Collar", "neutral", "Hisse al + call sat + put al. Risk sınırlı theta.",
    [
      { action: "sell", type: "call", strike: otmCall.strike, price: otmCall.last, contracts: 1 },
      { action: "buy", type: "put", strike: deepOtmPut.strike, price: deepOtmPut.last, contracts: 1 },
    ],
    [{ action: "buy", type: "stock", strike: 0, price: price, contracts: 100 }],
    "neutral", `100 hisse + $${otmCall.strike.toFixed(0)} call sat + $${deepOtmPut.strike.toFixed(0)} put al.`);
  if (col) results.push(col);

  // 7. Covered Strangle (only if high IV)
  if (highIV) {
    const cs = score("Covered Strangle", "neutral", "Hisse al + call sat + put sat. Maksimum theta.",
      [
        { action: "sell", type: "call", strike: otmCall.strike, price: otmCall.last, contracts: 1 },
        { action: "sell", type: "put", strike: otmPut.strike, price: otmPut.last, contracts: 1 },
      ],
      [{ action: "buy", type: "stock", strike: 0, price: price, contracts: 100 }],
      "neutral", `IV rank ${Math.round(ivRank)}% — prim satmak için ideal. Toplam prim: $${((otmCall.last + otmPut.last) * 100).toFixed(0)}.`);
    if (cs) results.push(cs);
  }

  return results;
}
