import { normCdf } from "./vol-math";

// Acklam inverse normal CDF approximation
export function invNorm(p: number): number {
  if (p <= 0 || p >= 1) return p <= 0 ? -8 : 8;
  const a=[-3.969683028665376e1,2.209460984245205e2,-2.759285104469687e2,1.383577518672690e2,-3.066479806614716e1,2.506628277459239];
  const b=[-5.447609879822406e1,1.615858368580409e2,-1.556989798598866e2,6.680131188771972e1,-1.328068155288572e1];
  const c=[-7.784894002430293e-3,-3.223964580411365e-1,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783];
  const d=[7.784695709041462e-3,3.224671290700398e-1,2.445134137142996,3.754408661907416];
  const pl=0.02425;
  let q:number, r:number;
  if (p < pl) { q=Math.sqrt(-2*Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  if (p <= 1-pl) { q=p-0.5; r=q*q; return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1); }
  q=Math.sqrt(-2*Math.log(1-p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
}

// Two-sided (skewed) lognormal helpers. sigmaUp/sigmaDown are DECIMAL annualized.
export interface SkewedDist { S: number; sigmaUp: number; sigmaDown: number; T: number; }

export function quantile(p: number, d: SkewedDist): number {
  const z = invNorm(p);
  const sigma = z < 0 ? d.sigmaDown : d.sigmaUp;
  return d.S * Math.exp(z * sigma * Math.sqrt(d.T));
}
export function probBelow(K: number, d: SkewedDist): number {
  const sigma = K < d.S ? d.sigmaDown : d.sigmaUp;
  return normCdf(Math.log(K / d.S) / (sigma * Math.sqrt(d.T)));
}
export const probAbove = (K: number, d: SkewedDist) => 1 - probBelow(K, d);

// Single-price model forecast = median + skew shift + pin gravity
export const SKEW_COEF = 1.0;
export const PIN_COEF = 0.5;

export function skewShift(d: SkewedDist): number {
  return -0.4 * d.S * (d.sigmaDown - d.sigmaUp) * Math.sqrt(d.T) * SKEW_COEF;
}

export interface PinCandidate { strike: number; gammaShare: number; }
export function pinGravity(spot: number, dteToTarget: number, isExpiryDay: boolean, candidates: PinCandidate[]): number {
  if (!isExpiryDay || candidates.length === 0) return 0;
  const proximity = Math.max(0, 1 - dteToTarget / 10);
  const pull = candidates.reduce((s, c) => s + c.gammaShare * (c.strike - spot), 0);
  return pull * proximity * PIN_COEF;
}

export interface PointForecast { median: number; skewComponent: number; pinComponent: number; price: number; }
export function pointForecast(d: SkewedDist, pin: number): PointForecast {
  const median = quantile(0.5, d);
  const sk = skewShift(d);
  return { median, skewComponent: sk, pinComponent: pin, price: median + sk + pin };
}

export function ladderLevels(d: SkewedDist, putWall: number | null, callWall: number | null): number[] {
  const step = d.S < 50 ? 1 : 5;
  const lo = quantile(0.07, d), hi = quantile(0.93, d);
  const out = new Set<number>();
  if (putWall) out.add(putWall);
  if (callWall) out.add(callWall);
  for (let k = Math.ceil(lo / step) * step; k <= hi; k += step) out.add(k);
  return [...out].sort((a, b) => a - b);
}
