// Curated CSP universes — liquid, optionable names. Edit freely.
export interface TickerCategory { id: string; label: string; tickers: string[]; }
export const TICKER_CATEGORIES: TickerCategory[] = [
  { id: "megatech", label: "Mega Tech", tickers: ["AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","AVGO","NFLX","ORCL"] },
  { id: "semi", label: "Yarı İletken", tickers: ["AMD","MU","MRVL","TSM","QCOM","ON","ARM","AMAT","LRCX","INTC"] },
  { id: "health", label: "Sağlık", tickers: ["UNH","LLY","PFE","MRK","ABBV","BMY","MRNA","HIMS","CVS","GILD"] },
  { id: "consumer", label: "Tüketici", tickers: ["KO","PEP","PG","WMT","COST","MCD","SBUX","TGT","NKE","DG"] },
  { id: "financials", label: "Finans", tickers: ["JPM","BAC","GS","MS","C","SCHW","HOOD","COIN","PYPL","AXP"] },
  { id: "energy", label: "Enerji", tickers: ["XOM","CVX","OXY","SLB","DVN","HAL","FANG","BE"] },
  { id: "highiv", label: "Yüksek IV", tickers: ["PLTR","SOFI","MARA","RIOT","AFRM","UPST","IONQ","RKLB","CLSK","RIVN"] },
  { id: "etf", label: "ETF", tickers: ["SPY","QQQ","IWM","XLE","XLF","GDX","TLT","SLV","SMH"] },
];

export const BROAD_EXTRA: string[] = [
  "CRM","ADBE","NOW","SNOW","DDOG","NET","MDB","PANW","CRWD","ZS","SHOP","UBER","ABNB","DASH","XYZ","TWLO","SNAP","PINS","SPOT","RBLX","U","PATH","DOCU","OKTA","TEAM","WDAY","INTU","IBM","CSCO","DELL","SMCI",
  "KLAC","ADI","TXN","NXPI","MCHP","SWKS","ASML","MPWR","ALAB","COHR","LITE","ANET","VRT","CIEN","WDC","STX",
  "VST","CEG","NRG","GEV","ETN","PWR","SMR","OKLO","TLN","FSLR","ENPH","PLUG",
  "BABA","PDD","JD","BIDU","NIO","XPEV","LI",
  "MSTR","HUT","CIFR",
  "F","GM","LCID",
  "BA","LMT","RTX","NOC","GE","HWM","AXON","KTOS","AVAV","ACHR","JOBY","LUNR","ASTS","RGTI","QBTS",
  "ISRG","MDT","TMO","AMGN","REGN","VRTX","NVO","BSX","TDOC",
  "LULU","DECK","CMG","DPZ","CELH","KHC","MDLZ","CL","HSY",
  "WFC","BLK","KKR","APO","BX","V","MA","ALLY",
  "CAT","DE","UNP","FDX","UPS","HON","MMM","URI","EMR",
  "COP","EOG","MPC","VLO","PSX","KMI","LNG",
  "FCX","NEM","AA","CLF","MP","ALB","NUE",
  "DIS","CMCSA","T","VZ","TMUS","WBD","ROKU",
  "DAL","UAL","AAL","LUV","CCL","RCL","NCLH","MAR","HLT","EXPE","BKNG",
  "NASA","DRAM","NNE","CBRS","OSCR","EOSE","BMNR","IREN","CLS","CRDO","SNDK","AAOI","PENG","GLW","AMBA",
  "XLK","XLV","XLP","XLI","XLU","XBI","ARKK","KWEB","FXI","EEM","EWZ","GLD","USO","HYG","KRE","JETS","TAN","URA","XME",
];

export const BROAD_UNIVERSE: string[] = [...new Set([...TICKER_CATEGORIES.flatMap(c => c.tickers), ...BROAD_EXTRA])];

export const SECTOR_ETF: Record<string, string> = {
  megatech: "QQQ", semi: "SMH", health: "XLV", consumer: "XLP",
  financials: "XLF", energy: "XLE", highiv: "QQQ", etf: "SPY",
};

export function sectorEtfFor(ticker: string): string {
  for (const c of TICKER_CATEGORIES) if (c.tickers.includes(ticker)) return SECTOR_ETF[c.id] ?? "SPY";
  return "SPY";
}

// User's judgment beats the auto quality score. 0-100. Edit freely.
export const QUALITY_OVERRIDES: Record<string, number> = { MSTR: 25, LCID: 20 };

export const KNOWN_ETFS = new Set([
  "SPY","QQQ","IWM","XLE","XLF","XLK","XLV","XLP","XLI","XLU","XBI","GDX","TLT","SLV","SMH",
  "ARKK","KWEB","FXI","EEM","EWZ","GLD","USO","HYG","KRE","JETS","TAN","URA","XME",
  ...(TICKER_CATEGORIES.find(c => c.id === "etf")?.tickers ?? []),
]);
