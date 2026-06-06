export interface ExpiryInfo {
  ticker: string;
  price: number;
  expirations: string[];
  expirationTimestamps: Record<string, number>;
}

export interface OptionRow {
  strike: number;
  last: number;
  bid: number;
  ask: number;
  iv: number;
  oi: number;
  volume: number;
}

export interface OptionChain {
  ticker: string;
  price: number;
  expiry: string;
  dte: number;
  calls: OptionRow[];
  puts: OptionRow[];
}

export interface MarketDataProvider {
  name: string;
  getQuote(ticker: string): Promise<{ price: number; name: string }>;
  getExpirations(ticker: string): Promise<ExpiryInfo>;
  getChain(ticker: string, expiry: string, expiryTimestamp?: number): Promise<OptionChain>;
}
