const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance";

interface QuoteResult {
  symbol: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  trailingPE?: number;
  forwardPE?: number;
  dividendYield?: number;
}

interface OptionChain {
  calls: OptionContract[];
  puts: OptionContract[];
  expirationDates: number[];
  underlyingPrice: number;
}

interface OptionContract {
  strike: number;
  lastPrice: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  expiration: string;
  contractSymbol: string;
}

export async function getQuotes(symbols: string[]): Promise<QuoteResult[]> {
  try {
    const url = `${YAHOO_BASE}/quote?symbols=${symbols.join(",")}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 30 },
    });
    if (!res.ok) return symbols.map((s) => ({ symbol: s }));
    const data = await res.json();
    return (data.quoteResponse?.result || []) as QuoteResult[];
  } catch {
    return symbols.map((s) => ({ symbol: s }));
  }
}

export async function getOptionChain(symbol: string, expDate?: string): Promise<OptionChain | null> {
  try {
    let url = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}`;
    if (expDate) url += `?date=${expDate}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const chain = data.optionChain?.result?.[0];
    if (!chain) return null;

    const mapContract = (c: { strike: number; lastPrice: number; bid: number; ask: number; volume?: number; openInterest?: number; impliedVolatility: number; expiration: number; contractSymbol: string }): OptionContract => ({
      strike: c.strike,
      lastPrice: c.lastPrice,
      bid: c.bid,
      ask: c.ask,
      volume: c.volume || 0,
      openInterest: c.openInterest || 0,
      impliedVolatility: c.impliedVolatility,
      expiration: new Date(c.expiration * 1000).toISOString().split("T")[0],
      contractSymbol: c.contractSymbol,
    });

    return {
      calls: (chain.options?.[0]?.calls || []).map(mapContract),
      puts: (chain.options?.[0]?.puts || []).map(mapContract),
      expirationDates: chain.expirationDates || [],
      underlyingPrice: chain.quote?.regularMarketPrice || 0,
    };
  } catch {
    return null;
  }
}

export async function getHistoricalPrices(symbol: string, range = "1mo", interval = "1d") {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) return [];
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    return timestamps.map((t: number, i: number) => ({
      date: new Date(t * 1000).toISOString().split("T")[0],
      close: closes[i],
    }));
  } catch {
    return [];
  }
}
