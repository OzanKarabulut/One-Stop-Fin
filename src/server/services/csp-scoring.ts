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
  companyQuality: CSPCompanyGrade; companyComfortScore: number; companyNote: string;
  premiumScore: number; safetyScore: number; liquidityScore: number; eventDataScore: number; cspScore: number;
  actionLabel: string; riskNotes: string[]; rejected: boolean; rejectReason: string | null;
}

function clamp(v: number, min = 0, max = 100) { return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : min; }
function scaleUp(v: number, lo: number, hi: number) { return hi <= lo ? 0 : clamp(((v - lo) / (hi - lo)) * 100); }
function scaleDown(v: number, good: number, bad: number) { return bad <= good ? 0 : clamp(100 - ((v - good) / (bad - good)) * 100); }

function normalCDF(x: number) {
  const sign = x < 0 ? -1 : 1; const z = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z));
  return 0.5 * (1 + sign * erf);
}

function getIVBucket(iv: number | null): IVBucket {
  if (!iv || iv <= 0 || !Number.isFinite(iv)) return "unknown";
  if (iv >= 140) return "140+"; if (iv >= 100) return "100-140"; if (iv >= 70) return "70-100"; return "below-70";
}

function scoreDelta(d: number | null) {
  if (d === null) return 35; const a = Math.abs(d);
  if (a <= 0.08) return 100; if (a <= 0.12) return 92; if (a <= 0.18) return 82;
  if (a <= 0.25) return 65; if (a <= 0.35) return 40; if (a <= 0.45) return 20; return 0;
}
function scoreEMBuffer(b: number | null) {
  if (b === null) return 35;
  if (b >= 2.0) return 100; if (b >= 1.7) return 90; if (b >= 1.4) return 78;
  if (b >= 1.2) return 65; if (b >= 1.0) return 45; if (b >= 0.8) return 25; return 0;
}

export function scoreCSPContract(input: CSPScoringInput): CSPScoringResult {
  const riskNotes: string[] = [];
  const company = getCSPCompanyQuality(input.ticker);
  const ivBucket = getIVBucket(input.iv);
  const spreadPct = input.bid > 0 && input.ask > 0 && input.mid > 0 ? ((input.ask - input.bid) / input.mid) * 100 : null;
  const executablePremium = input.bid > 0 ? input.bid : input.mid;
  const executablePremiumAmount = executablePremium * 100;
  const premiumYield = input.collateral > 0 ? (executablePremiumAmount / input.collateral) * 100 : 0;
  const premiumPerDay = input.dte > 0 ? premiumYield / input.dte : 0;
  const distanceToStrikePct = input.spot > 0 ? ((input.spot - input.strike) / input.spot) * 100 : 0;
  const breakevenDiscountPct = input.spot > 0 ? ((input.spot - (input.strike - executablePremium)) / input.spot) * 100 : 0;

  // Risk metrics
  let delta: number | null = null, probabilityITM: number | null = null, expectedMove: number | null = null, expectedMoveBuffer: number | null = null;
  if (input.iv && input.iv > 0 && input.dte > 0 && input.spot > 0 && input.strike > 0) {
    const sigma = input.iv / 100, T = input.dte / 365, sqrtT = Math.sqrt(T), r = 0.045;
    const d1 = (Math.log(input.spot / input.strike) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;
    delta = normalCDF(d1) - 1; probabilityITM = normalCDF(-d2) * 100;
    expectedMove = input.spot * sigma * sqrtT;
    expectedMoveBuffer = expectedMove > 0 ? (input.spot - input.strike) / expectedMove : null;
  }

  const absDelta = delta !== null ? Math.abs(delta) : null;
  const premiumEfficiency = absDelta && absDelta > 0.01 ? premiumYield / absDelta : null;

  let rejected = false, rejectReason: string | null = null;
  if (input.dte < 3 || input.dte > 14) { rejected = true; rejectReason = "DTE outside 3-14 day target"; riskNotes.push("DTE outside target"); }
  if (input.bid <= 0 || input.ask <= 0 || input.mid <= 0) { rejected = true; rejectReason = "Invalid quote"; riskNotes.push("Invalid quote"); }
  if (company.grade === "X") { rejected = true; rejectReason = "Company excluded"; riskNotes.push("Company excluded"); }

  if (ivBucket === "unknown") riskNotes.push("IV unavailable");
  if (ivBucket === "below-70") riskNotes.push("IV below target");
  if (ivBucket === "140+") riskNotes.push("Extreme IV: event risk");
  if (spreadPct !== null && spreadPct > 25) riskNotes.push("Very wide spread");
  else if (spreadPct !== null && spreadPct > 15) riskNotes.push("Wide spread");
  if (input.oi >= 0 && input.oi < 50) riskNotes.push("Low OI");
  if (absDelta !== null && absDelta > 0.35) riskNotes.push("High delta");
  if (probabilityITM !== null && probabilityITM > 30) riskNotes.push("High P(ITM)");
  if (expectedMoveBuffer !== null && expectedMoveBuffer < 1.0) riskNotes.push("Inside expected move");
  if (company.grade === "D") riskNotes.push("Low assignment comfort");
  if (company.grade === "C") riskNotes.push("Size carefully");

  const premiumScore = 0.4 * scaleUp(premiumYield, 0.25, 2.5) + 0.25 * scaleUp(premiumPerDay, 0.05, 0.35) + 0.25 * scaleUp(premiumEfficiency ?? 0, 3, 25) + 0.1 * scaleUp(executablePremiumAmount, 25, 500);
  const safetyScore = 0.3 * scoreDelta(delta) + 0.3 * scoreEMBuffer(expectedMoveBuffer) + 0.2 * scaleUp(distanceToStrikePct, 5, 25) + 0.2 * scaleDown(probabilityITM ?? 35, 5, 35);
  const liquidityScore = 0.4 * (spreadPct === null ? 30 : scaleDown(spreadPct, 5, 30)) + 0.3 * (input.oi < 0 ? 40 : scaleUp(input.oi, 50, 1000)) + 0.2 * (input.volume < 0 ? 35 : scaleUp(input.volume, 5, 200)) + 0.1 * (input.bid > 0 && input.ask > 0 ? 100 : 0);
  let eventDataScore = 90; if (!input.iv) eventDataScore -= 25; if (input.oi < 0) eventDataScore -= 10; if (ivBucket === "140+" && safetyScore < 60) eventDataScore -= 10; eventDataScore = clamp(eventDataScore);

  let penalty = 0;
  if (spreadPct !== null && spreadPct > 25) penalty += 20;
  if (input.oi >= 0 && input.oi < 50) penalty += 15;
  if (absDelta !== null && absDelta > 0.35) penalty += 20;
  if (expectedMoveBuffer !== null && expectedMoveBuffer < 1.0) penalty += 20;
  if (company.grade === "D") penalty += 12;
  if (ivBucket === "140+" && safetyScore < 60) penalty += 10;

  const rawScore = 0.35 * premiumScore + 0.35 * safetyScore + 0.15 * company.score + 0.1 * liquidityScore + 0.05 * eventDataScore - penalty;
  const cspScore = rejected ? 0 : Math.round(clamp(rawScore));

  let actionLabel = "Avoid";
  if (rejected) actionLabel = `Reject - ${rejectReason}`;
  else if (riskNotes.some(n => n.toLowerCase().includes("event"))) actionLabel = "High Premium / Event Risk";
  else if (cspScore >= 82) actionLabel = "Strong CSP Candidate";
  else if (cspScore >= 72) actionLabel = "Good Premium / Manageable Risk";
  else if (cspScore >= 62) actionLabel = "Watchlist Candidate";
  else if (cspScore >= 50) actionLabel = "High Risk / Size Small";

  return {
    executablePremium, executablePremiumAmount, ivBucket,
    delta, probabilityITM, expectedMove, expectedMoveBuffer,
    distanceToStrikePct, breakevenDiscountPct, spreadPct,
    premiumYield, premiumPerDay, premiumEfficiency,
    companyQuality: company.grade, companyComfortScore: company.score, companyNote: company.note,
    premiumScore: Math.round(clamp(premiumScore)), safetyScore: Math.round(clamp(safetyScore)),
    liquidityScore: Math.round(clamp(liquidityScore)), eventDataScore: Math.round(clamp(eventDataScore)), cspScore,
    actionLabel, riskNotes, rejected, rejectReason,
  };
}
