import { getCSPCompanyQuality, type CSPCompanyGrade } from "./csp-company-quality";

export type IVBucket = "70-100" | "100-140" | "140+" | "below-70" | "unknown";

export interface CSPScoringInput {
  ticker: string; spot: number; strike: number; expiry: string; dte: number;
  bid: number; ask: number; mid: number; iv: number | null;
  collateral: number; premium: number; yieldPct: number; annYield: number;
  breakeven: number; discount: number; volume: number; oi: number;
}

export interface CSPScoringResult {
  executablePremium: number; executablePremiumAmount: number; ivBucket: IVBucket;
  delta: number | null; probabilityITM: number | null; expectedMove: number | null; expectedMoveBuffer: number | null;
  distanceToStrikePct: number; breakevenDiscountPct: number; spreadPct: number | null;
  premiumYield: number; premiumPerDay: number; premiumEfficiency: number | null;
  annualizedYield: number;
  companyQuality: CSPCompanyGrade; companyComfortScore: number; companyNote: string;
  premiumScore: number; safetyScore: number; liquidityScore: number; qualityScore: number; cspScore: number;
  actionLabel: string; riskNotes: string[]; rejected: boolean; rejectReason: string | null;
}

function clamp(v: number, min = 0, max = 100) { return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : min; }
function scaleUp(v: number, lo: number, hi: number) { return hi <= lo ? 0 : clamp(((v - lo) / (hi - lo)) * 100); }

function normalCDF(x: number) {
  const sign = x < 0 ? -1 : 1; const z = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z));
  return 0.5 * (1 + sign * erf);
}

function getIVBucket(iv: number | null): IVBucket {
  if (!iv || iv <= 0) return "unknown";
  if (iv >= 140) return "140+"; if (iv >= 100) return "100-140"; if (iv >= 70) return "70-100"; return "below-70";
}

export function scoreCSPContract(input: CSPScoringInput): CSPScoringResult {
  const riskNotes: string[] = [];
  const company = getCSPCompanyQuality(input.ticker);
  const ivBucket = getIVBucket(input.iv);

  // Executable premium (use mid which is last-price based)
  const executablePremium = input.mid;
  const executablePremiumAmount = executablePremium * 100;
  const spreadPct = input.bid > 0 && input.ask > 0 && input.mid > 0 ? ((input.ask - input.bid) / input.mid) * 100 : null;

  // Yield calculations on executable premium
  const premiumYield = input.collateral > 0 ? (executablePremiumAmount / input.collateral) * 100 : 0;
  const premiumPerDay = input.dte > 0 ? premiumYield / input.dte : 0;
  const annualizedYield = input.dte > 0 ? premiumYield * (365 / input.dte) : 0;
  const distanceToStrikePct = input.spot > 0 ? ((input.spot - input.strike) / input.spot) * 100 : 0;
  const breakevenDiscountPct = input.spot > 0 ? ((input.spot - (input.strike - executablePremium)) / input.spot) * 100 : 0;

  // Risk metrics via Black-Scholes
  let delta: number | null = null, probabilityITM: number | null = null, expectedMove: number | null = null, expectedMoveBuffer: number | null = null;
  if (input.iv && input.iv > 0 && input.dte > 0 && input.spot > 0 && input.strike > 0) {
    const sigma = input.iv / 100, T = input.dte / 365, sqrtT = Math.sqrt(T), r = 0.045;
    const d1 = (Math.log(input.spot / input.strike) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;
    delta = normalCDF(d1) - 1;
    probabilityITM = normalCDF(-d2) * 100;
    expectedMove = input.spot * sigma * sqrtT;
    expectedMoveBuffer = expectedMove > 0 ? (input.spot - input.strike) / expectedMove : null;
  }

  const absDelta = delta !== null ? Math.abs(delta) : null;
  const premiumEfficiency = absDelta && absDelta > 0.01 ? premiumYield / absDelta : null;

  // ─── Rejections ────────────────────────────────────────────────────────────
  let rejected = false, rejectReason: string | null = null;

  if (company.grade === "X") {
    rejected = true; rejectReason = `Company grade X — avoid assignment`;
    riskNotes.push("Delisted / avoid assignment");
  }
  if (spreadPct !== null && spreadPct > 25) {
    // Low-priced options ($0.05 tick) naturally have wide % spreads — use absolute spread for mid < $2
    const absSpread = input.ask - input.bid;
    const spreadReject = input.mid < 2 ? absSpread > 0.50 : spreadPct > 25;
    if (spreadReject) {
      rejected = true; rejectReason = "Spread too wide — illiquid";
      riskNotes.push("Spread too wide");
    }
  }
  if (input.oi >= 0 && input.oi < 20) {
    rejected = true; rejectReason = "OI < 20 — illiquid";
    riskNotes.push("Very low OI");
  }

  // ─── Risk notes ────────────────────────────────────────────────────────────
  if (ivBucket === "140+") riskNotes.push("Extreme IV — possible event");
  if (expectedMoveBuffer !== null && expectedMoveBuffer < 1.0) riskNotes.push("Inside 1σ move");
  if (absDelta !== null && absDelta > 0.35 && company.grade !== "A") riskNotes.push("High delta (>0.35)");
  if (probabilityITM !== null && probabilityITM > 25) riskNotes.push(`P(ITM) ${probabilityITM.toFixed(0)}%`);

  // ─── DTE penalty ───────────────────────────────────────────────────────────
  let dtePenalty = 0;
  if (input.dte < 4) { dtePenalty = 30; riskNotes.push("DTE too short (<4)"); }
  else if (input.dte > 21) { dtePenalty = 20; riskNotes.push("DTE > 21 days"); }
  else if (input.dte < 5) dtePenalty = 10;
  else if (input.dte > 14) dtePenalty = 5;
  // Sweet spot: 5-14 days = no penalty

  // ─── PREMIUM SCORE (40%) ───────────────────────────────────────────────────
  const premiumScore = clamp(
    0.5 * scaleUp(annualizedYield, 20, 200) +
    0.3 * scaleUp(premiumPerDay, 0.03, 0.25) +
    0.2 * scaleUp(executablePremiumAmount, 30, 400)
  );

  // ─── SAFETY SCORE (35%) ────────────────────────────────────────────────────
  // Target band: |delta| 0.15-0.30, buffer >= 1.3σ
  let deltaScore = 50;
  if (absDelta !== null) {
    if (absDelta >= 0.15 && absDelta <= 0.30) deltaScore = 90; // sweet spot
    else if (absDelta < 0.10) deltaScore = 60; // too far OTM = low premium
    else if (absDelta <= 0.35) deltaScore = company.grade === "A" ? 75 : 55; // A-grade gets slack
    else if (absDelta <= 0.45) deltaScore = 25;
    else deltaScore = 0;
  }

  let bufferScore = 50;
  if (expectedMoveBuffer !== null) {
    if (expectedMoveBuffer >= 1.8) bufferScore = 100;
    else if (expectedMoveBuffer >= 1.3) bufferScore = 85;
    else if (expectedMoveBuffer >= 1.0) bufferScore = 55;
    else if (expectedMoveBuffer >= 0.7) bufferScore = 25;
    else bufferScore = 0;
  }

  const safetyScore = clamp(0.5 * deltaScore + 0.3 * bufferScore + 0.2 * scaleUp(distanceToStrikePct, 3, 20));

  // ─── QUALITY SCORE (15%) ───────────────────────────────────────────────────
  let qualityScore = 50;
  if (company.grade === "A") qualityScore = 100;
  else if (company.grade === "B") qualityScore = 80;
  else if (company.grade === "C") qualityScore = 50;
  else if (company.grade === "D") { qualityScore = 20; riskNotes.push("D-grade — assignment risky"); }

  // ─── LIQUIDITY SCORE (10%) ─────────────────────────────────────────────────
  const liquidityScore = clamp(
    0.5 * (spreadPct === null ? 30 : clamp(100 - (spreadPct / 25) * 100)) +
    0.3 * (input.oi < 0 ? 40 : scaleUp(input.oi, 20, 500)) +
    0.2 * (input.volume < 0 ? 30 : scaleUp(input.volume, 5, 100))
  );

  // ─── FINAL SCORE ───────────────────────────────────────────────────────────
  const rawScore = 0.40 * premiumScore + 0.35 * safetyScore + 0.15 * qualityScore + 0.10 * liquidityScore - dtePenalty;
  const cspScore = rejected ? 0 : Math.round(clamp(rawScore));

  // Action label
  let actionLabel = "Avoid";
  if (rejected) actionLabel = `Reject: ${rejectReason}`;
  else if (cspScore >= 80) actionLabel = "Strong Sell Put";
  else if (cspScore >= 70) actionLabel = "Good Opportunity";
  else if (cspScore >= 60) actionLabel = "Watchlist";
  else if (cspScore >= 45) actionLabel = "Size Small";

  return {
    executablePremium, executablePremiumAmount, ivBucket,
    delta, probabilityITM, expectedMove, expectedMoveBuffer,
    distanceToStrikePct, breakevenDiscountPct, spreadPct,
    premiumYield, premiumPerDay, premiumEfficiency, annualizedYield,
    companyQuality: company.grade, companyComfortScore: company.score, companyNote: company.note,
    premiumScore: Math.round(clamp(premiumScore)), safetyScore: Math.round(clamp(safetyScore)),
    liquidityScore: Math.round(clamp(liquidityScore)), qualityScore: Math.round(clamp(qualityScore)),
    cspScore, actionLabel, riskNotes, rejected, rejectReason,
  };
}
