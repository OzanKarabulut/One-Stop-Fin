// Curated CSP universes — liquid, optionable names. Edit freely.
export interface TickerCategory { id: string; label: string; tickers: string[]; }
export const TICKER_CATEGORIES: TickerCategory[] = [
  { id: "megatech", label: "Mega Tech", tickers: ["AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","AVGO","NFLX","ORCL"] },
  { id: "semi", label: "Yarı İletken", tickers: ["AMD","MU","MRVL","TSM","QCOM","ON","ARM","AMAT","LRCX","INTC"] },
  { id: "health", label: "Sağlık", tickers: ["UNH","LLY","PFE","MRK","ABBV","BMY","MRNA","HIMS","CVS","GILD"] },
  { id: "consumer", label: "Tüketici", tickers: ["KO","PEP","PG","WMT","COST","MCD","SBUX","TGT","NKE","DG"] },
  { id: "financials", label: "Finans", tickers: ["JPM","BAC","GS","MS","C","SCHW","HOOD","COIN","PYPL","AXP"] },
  { id: "energy", label: "Enerji", tickers: ["XOM","CVX","OXY","SLB","DVN","HAL","FANG"] },
  { id: "highiv", label: "Yüksek IV", tickers: ["PLTR","SOFI","MARA","RIOT","AFRM","UPST","IONQ","RKLB","CLSK","RIVN"] },
  { id: "etf", label: "ETF", tickers: ["SPY","QQQ","IWM","XLE","XLF","GDX","TLT","SLV","SMH"] },
];
