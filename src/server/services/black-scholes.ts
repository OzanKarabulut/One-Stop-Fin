/**
 * Black-Scholes Engine — TypeScript port of SignalLab's BlackScholes.swift
 *
 * Provides option pricing, Greeks, implied volatility (Newton-Raphson),
 * and real-world probability calculations.
 */

// ─── Normal Distribution ─────────────────────────────────────────────────────

/** Standard normal CDF using rational approximation (Abramowitz & Stegun) */
export function normCDF(x: number): number {
  // Use the complementary error function approach
  return 0.5 * erfc(-x / Math.SQRT2);
}

/** Standard normal PDF */
export function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Complementary error function (rational approximation) */
function erfc(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 1 - sign * y;
}

// ─── Option Price ────────────────────────────────────────────────────────────

/**
 * Black-Scholes option price.
 * @param S - Spot price
 * @param K - Strike price
 * @param T - Time to expiry (years)
 * @param r - Risk-free rate
 * @param sigma - Volatility (annualized)
 * @param isCall - true for call, false for put
 */
export function bsPrice(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  isCall: boolean,
): number {
  if (T <= 0 || sigma <= 0) {
    return isCall ? Math.max(S - K, 0) : Math.max(K - S, 0);
  }

  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  if (isCall) {
    return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
  } else {
    return K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
  }
}

// ─── Greeks ──────────────────────────────────────────────────────────────────

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

/**
 * Black-Scholes Greeks.
 */
export function greeks(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  isCall: boolean,
): Greeks {
  if (T <= 0 || sigma <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0 };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  let delta: number;
  let theta: number;

  if (isCall) {
    delta = normCDF(d1);
    theta =
      (-(S * normPDF(d1) * sigma) / (2 * sqrtT) -
        r * K * Math.exp(-r * T) * normCDF(d2)) /
      365;
  } else {
    delta = normCDF(d1) - 1;
    theta =
      (-(S * normPDF(d1) * sigma) / (2 * sqrtT) +
        r * K * Math.exp(-r * T) * normCDF(-d2)) /
      365;
  }

  const gamma = normPDF(d1) / (S * sigma * sqrtT);
  const vega = (S * normPDF(d1) * sqrtT) / 100;

  return { delta, gamma, theta, vega };
}

// ─── Implied Volatility (Newton-Raphson) ─────────────────────────────────────

/**
 * Implied volatility via Newton-Raphson.
 * Returns annualized IV, or 0 if it fails to converge.
 */
export function impliedVol(
  S: number,
  K: number,
  T: number,
  r: number,
  marketPrice: number,
  isCall: boolean,
  maxIter = 100,
  tol = 1e-6,
): number {
  if (T <= 0 || marketPrice <= 0) return 0;

  let sigma = 0.25; // initial guess
  for (let i = 0; i < maxIter; i++) {
    const p = bsPrice(S, K, T, r, sigma, isCall);
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const v = S * normPDF(d1) * Math.sqrt(T); // vega (not divided by 100)
    if (v < 1e-10) break;
    const diff = p - marketPrice;
    if (Math.abs(diff) < tol) return sigma;
    sigma -= diff / v;
    if (sigma <= 0) sigma = 0.001;
  }

  return sigma > 0 ? sigma : 0;
}

// ─── Implied Volatility (Bisection — for CSP Screener) ───────────────────────

/**
 * IV via bisection method — more robust for puts.
 * Range: [0.005, 5.0], 60 iterations, tolerance 1e-4
 */
export function impliedVolBisection(
  price: number,
  S: number,
  K: number,
  T: number,
  r: number,
  isCall = false,
): number | null {
  if (T <= 0 || price <= 0 || S <= 0 || K <= 0) return null;

  const intrinsic = isCall
    ? Math.max(S - K * Math.exp(-r * T), 0)
    : Math.max(K * Math.exp(-r * T) - S, 0);

  if (price < intrinsic - 0.01) return null;
  if (price - intrinsic < 0.005) return 0.01;

  let low = 0.005;
  let high = 5.0;

  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    const bsP = bsPrice(S, K, T, r, mid, isCall);
    if (Math.abs(bsP - price) < 1e-4) return mid;
    if (bsP < price) low = mid;
    else high = mid;
    if (high - low < 1e-6) break;
  }

  return (low + high) / 2;
}

// ─── Real-World Probability ──────────────────────────────────────────────────

/**
 * Real-world probability using HV (not IV) and optional drift.
 * Uses closed-form log-normal CDF.
 */
export function realWorldProbability(
  S: number,
  K: number,
  T: number,
  hv: number,
  drift: number,
  isCall: boolean,
  isShort: boolean,
): number {
  if (T <= 0 || hv <= 0) return 0;
  const d2 = (Math.log(S / K) + (drift - 0.5 * hv * hv) * T) / (hv * Math.sqrt(T));
  const prob = isCall ? 1 - normCDF(d2) : normCDF(d2);
  return isShort ? 1 - prob : prob;
}

// ─── Risk-Neutral Win Probability ────────────────────────────────────────────

export function winProbability(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  isCall: boolean,
  isShort: boolean,
): number {
  if (T <= 0 || sigma <= 0) return 0;
  const d2 = (Math.log(S / K) + (r - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const prob = isCall ? 1 - normCDF(d2) : normCDF(d2);
  return isShort ? 1 - prob : prob;
}
