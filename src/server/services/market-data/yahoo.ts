import type { MarketDataProvider, ExpiryInfo, OptionChain, OptionRow } from "./types";
import * as yahoo from "../yahoo-finance";

const DELAY_MS = 300;
const MAX_CONCURRENT = 2;
let inFlight = 0;
const queue: Array<() => void> = [];

async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  while (inFlight >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  inFlight++;
  try {
    await new Promise((r) => setTimeout(r, DELAY_MS));
    return await fn();
  } finally {
    inFlight--;
    const next = queue.shift();
    if (next) next();
  }
}

export const yahooProvider: MarketDataProvider = {
  name: "yahoo",

  async getQuote(ticker: string) {
    return throttled(() => yahoo.fetchQuote(ticker));
  },

  async getExpirations(ticker: string) {
    return throttled(() => yahoo.getExpirations(ticker));
  },

  async getChain(ticker: string, expiry: string, expiryTimestamp?: number) {
    const chain = await throttled(() => yahoo.getChain(ticker, expiry, expiryTimestamp));
    // Map to simplified OptionRow (strip greeks - those are computed in router)
    const mapRow = (r: yahoo.OptionRow): OptionRow => ({
      strike: r.strike, last: r.last, bid: r.bid, ask: r.ask,
      iv: r.iv, oi: r.oi, volume: 0,
    });
    return {
      ticker: chain.ticker, price: chain.price, expiry: chain.expiry, dte: chain.dte,
      calls: chain.calls.map(mapRow), puts: chain.puts.map(mapRow),
    };
  },
};
