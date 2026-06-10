const SQRT_2PI = Math.sqrt(2 * Math.PI);

export function normPdf(x: number): number {
  return Math.exp(-(x * x) / 2) / SQRT_2PI;
}

// Abramowitz-Stegun approximation, max error ~7.5e-8
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = normPdf(x);
  const p =
    d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

export function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) out.push(Math.log(closes[i] / closes[i - 1]));
  return out;
}

// Annualized historical volatility over `window` trading days. Returns null if insufficient data.
export function historicalVol(closes: number[], window: number): number | null {
  if (closes.length < window + 1) return null;
  const rets = logReturns(closes.slice(-(window + 1)));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance * 252);
}

export interface D1D2 { d1: number; d2: number; }

export function d1d2(S: number, K: number, T: number, sigma: number, r = 0.045): D1D2 {
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  return { d1, d2: d1 - sigma * Math.sqrt(T) };
}

export function bsGamma(S: number, K: number, T: number, sigma: number, r = 0.045): number {
  if (T <= 0 || sigma <= 0) return 0;
  const { d1 } = d1d2(S, K, T, sigma, r);
  return normPdf(d1) / (S * sigma * Math.sqrt(T));
}

// Risk-neutral probability a short PUT finishes ITM (assignment probability)
export function probITMPut(S: number, K: number, T: number, sigma: number, r = 0.045): number {
  if (T <= 0) return S < K ? 1 : 0;
  const { d2 } = d1d2(S, K, T, sigma, r);
  return normCdf(-d2);
}

export function probITMCall(S: number, K: number, T: number, sigma: number, r = 0.045): number {
  if (T <= 0) return S > K ? 1 : 0;
  const { d2 } = d1d2(S, K, T, sigma, r);
  return normCdf(d2);
}
