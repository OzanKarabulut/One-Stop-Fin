import type { MarketDataProvider } from "./types";
import { tradierProvider } from "./tradier";
import { yahooProvider } from "./yahoo";

export type { MarketDataProvider, ExpiryInfo, OptionChain, OptionRow } from "./types";

function getConfiguredProvider(): MarketDataProvider {
  const p = process.env.MARKET_DATA_PROVIDER || "tradier";
  return p === "yahoo" ? yahooProvider : tradierProvider;
}

/** Provider with automatic fallback: tradier → yahoo */
class FallbackProvider implements MarketDataProvider {
  name = "fallback";
  private primary = getConfiguredProvider();
  private fallback = this.primary.name === "tradier" ? yahooProvider : tradierProvider;

  async getQuote(ticker: string) {
    try { return await this.primary.getQuote(ticker); }
    catch { return this.fallback.getQuote(ticker); }
  }

  async getExpirations(ticker: string) {
    try { return await this.primary.getExpirations(ticker); }
    catch { return this.fallback.getExpirations(ticker); }
  }

  async getChain(ticker: string, expiry: string, expiryTimestamp?: number) {
    try { return await this.primary.getChain(ticker, expiry, expiryTimestamp); }
    catch { return this.fallback.getChain(ticker, expiry, expiryTimestamp); }
  }
}

export const marketData: MarketDataProvider = new FallbackProvider();
