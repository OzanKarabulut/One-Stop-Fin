// Standard normal CDF approximation
function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

interface BSInput {
  stockPrice: number;
  strikePrice: number;
  timeToExpiry: number; // years
  riskFreeRate: number;
  volatility: number;
}

interface BSResult {
  callPrice: number;
  putPrice: number;
  callDelta: number;
  putDelta: number;
  gamma: number;
  vega: number;
  callTheta: number;
  putTheta: number;
}

export function blackScholes(input: BSInput): BSResult {
  const { stockPrice: S, strikePrice: K, timeToExpiry: T, riskFreeRate: r, volatility: sigma } = input;
  if (T <= 0 || sigma <= 0) {
    return { callPrice: 0, putPrice: 0, callDelta: 0, putDelta: 0, gamma: 0, vega: 0, callTheta: 0, putTheta: 0 };
  }

  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const callPrice = S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
  const putPrice = K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);

  const callDelta = normalCDF(d1);
  const putDelta = callDelta - 1;

  const nd1 = Math.exp(-(d1 * d1) / 2) / Math.sqrt(2 * Math.PI);
  const gamma = nd1 / (S * sigma * Math.sqrt(T));
  const vega = S * nd1 * Math.sqrt(T) / 100;

  const callTheta = (-(S * nd1 * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * normalCDF(d2)) / 365;
  const putTheta = (-(S * nd1 * sigma) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * normalCDF(-d2)) / 365;

  return { callPrice, putPrice, callDelta, putDelta, gamma, vega, callTheta, putTheta };
}

export function calculateCSPReturn(input: { premium: number; strikePrice: number; daysToExpiry: number }) {
  const { premium, strikePrice, daysToExpiry } = input;
  const collateral = strikePrice * 100;
  const totalPremium = premium * 100;
  const returnPct = (totalPremium / collateral) * 100;
  const annualized = (returnPct / daysToExpiry) * 365;
  return { returnPct: +returnPct.toFixed(2), annualized: +annualized.toFixed(2), totalPremium, collateral };
}
