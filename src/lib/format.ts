export const usd = (n: number) => `${Math.round(n).toLocaleString("tr-TR")}$`;

export const otmPct = (spot: number, strike: number) =>
  spot > 0 ? ((spot - strike) / spot) * 100 : 0;
