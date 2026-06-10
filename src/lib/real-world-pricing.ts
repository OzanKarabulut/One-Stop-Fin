import { normCdf } from "./vol-math";

export interface RWParams { S0: number; sigma: number; T: number; mu?: number; }

const m_ = (p: RWParams) => Math.log(p.S0) + ((p.mu ?? 0) - (p.sigma * p.sigma) / 2) * p.T;
const s_ = (p: RWParams) => p.sigma * Math.sqrt(p.T);

export function probBelow(K: number, p: RWParams): number {
  if (K <= 0) return 0;
  return normCdf((Math.log(K) - m_(p)) / s_(p));
}
export function probAbove(K: number, p: RWParams): number { return 1 - probBelow(K, p); }
export function expST(p: RWParams): number { return p.S0 * Math.exp((p.mu ?? 0) * p.T); }

export function partialExpAbove(K: number, p: RWParams): number {
  if (K <= 0) return expST(p);
  return expST(p) * normCdf((m_(p) - Math.log(K)) / s_(p) + s_(p));
}

export function eCallPayoff(K: number, p: RWParams): number {
  return partialExpAbove(K, p) - K * probAbove(K, p);
}
export function ePutPayoff(K: number, p: RWParams): number {
  return K * probBelow(K, p) - (expST(p) - partialExpAbove(K, p));
}

export interface Leg { kind: "stock" | "call" | "put"; qty: number; strike?: number; price: number; }

export function expectedPnl(legs: Leg[], p: RWParams): number {
  let ev = 0;
  for (const l of legs) {
    const terminal = l.kind === "stock" ? expST(p)
      : l.kind === "call" ? eCallPayoff(l.strike!, p)
      : ePutPayoff(l.strike!, p);
    ev += l.qty * (terminal - l.price);
  }
  return ev;
}

export function pnlAt(S: number, legs: Leg[]): number {
  let v = 0;
  for (const l of legs) {
    const terminal = l.kind === "stock" ? S
      : l.kind === "call" ? Math.max(S - l.strike!, 0)
      : Math.max(l.strike! - S, 0);
    v += l.qty * (terminal - l.price);
  }
  return v;
}

export function probProfit(legs: Leg[], p: RWParams): number {
  const ks = [...new Set(legs.filter(l => l.strike).map(l => l.strike!))].sort((a, b) => a - b);
  const bounds = [0, ...ks, Infinity];
  let prob = 0;
  for (let i = 0; i < bounds.length - 1; i++) {
    const lo = bounds[i], hi = bounds[i + 1];
    const ref = hi === Infinity ? lo + Math.max(lo, p.S0) : (lo + hi) / 2;
    const f0 = pnlAt(ref, legs);
    const slope = (pnlAt(ref + 0.01, legs) - f0) / 0.01;
    const pLo = probBelow(Math.max(lo, 1e-9), p), pHi = hi === Infinity ? 1 : probBelow(hi, p);
    const massHere = Math.max(pHi - pLo, 0);
    if (Math.abs(slope) < 1e-9) { if (f0 > 0) prob += massHere; continue; }
    const cross = ref - f0 / slope;
    if (cross <= lo) { if (f0 > 0) prob += massHere; continue; }
    if (hi !== Infinity && cross >= hi) { if (f0 > 0) prob += massHere; continue; }
    const pCross = probBelow(cross, p);
    prob += slope > 0 ? Math.max(pHi - pCross, 0) : Math.max(pCross - pLo, 0);
  }
  return Math.min(Math.max(prob, 0), 1);
}

export function pnlExtremes(legs: Leg[]): { maxLoss: number; maxGain: number } {
  const ks = [...new Set(legs.filter(l => l.strike).map(l => l.strike!))].sort((a, b) => a - b);
  const pts = [0, ...ks];
  let lo = Infinity, hiV = -Infinity;
  for (const s of pts) { const v = pnlAt(s, legs); lo = Math.min(lo, v); hiV = Math.max(hiV, v); }
  const far = (ks[ks.length - 1] ?? 100) * 10 + 1000;
  const slopeInf = (pnlAt(far + 1, legs) - pnlAt(far, legs));
  if (slopeInf > 1e-9) hiV = Infinity; else if (slopeInf < -1e-9) lo = -Infinity;
  else { const v = pnlAt(far, legs); lo = Math.min(lo, v); hiV = Math.max(hiV, v); }
  return { maxLoss: lo, maxGain: hiV };
}
