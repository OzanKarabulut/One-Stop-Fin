import type { MarketDataProvider } from "./types";
import { yahooProvider } from "./yahoo";

export type { MarketDataProvider, ExpiryInfo, OptionChain, OptionRow } from "./types";

export function getProvider(): MarketDataProvider {
  const name = process.env.MARKET_DATA_PROVIDER || "yahoo";
  switch (name) {
    // Future: case "tradier": return tradierProvider;
    // Future: case "polygon": return polygonProvider;
    default: return yahooProvider;
  }
}

export const marketData: MarketDataProvider = getProvider();
