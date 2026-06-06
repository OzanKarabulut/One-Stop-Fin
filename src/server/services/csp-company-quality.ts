export type CSPCompanyGrade = "A" | "B" | "C" | "D" | "X";

export interface CSPCompanyQuality {
  grade: CSPCompanyGrade;
  score: number;
  note: string;
}

const DEFAULT_QUALITY: CSPCompanyQuality = { grade: "C", score: 60, note: "Default quality. Needs manual review before assignment." };

export const CSP_COMPANY_QUALITY: Record<string, CSPCompanyQuality> = {
  MRVL: { grade: "A", score: 90, note: "Assignable semiconductor / AI infrastructure name." },
  MU: { grade: "A", score: 88, note: "High-quality cyclical memory name; assignable but sector is volatile." },
  GLW: { grade: "A", score: 85, note: "More defensive industrial/technology exposure; assignable." },
  CLS: { grade: "A", score: 84, note: "Strong AI infrastructure exposure; still cyclical." },
  NVDA: { grade: "A", score: 92, note: "High-quality mega-cap; assignment comfort high but valuation risk exists." },
  AMD: { grade: "A", score: 88, note: "High-quality semiconductor name; assignable." },
  AMZN: { grade: "A", score: 90, note: "High-quality mega-cap; assignable." },
  GOOGL: { grade: "A", score: 90, note: "High-quality mega-cap; assignable." },
  MSFT: { grade: "A", score: 92, note: "High-quality mega-cap; assignable." },
  META: { grade: "A", score: 88, note: "High-quality mega-cap; assignable but volatile." },
  AVGO: { grade: "A", score: 90, note: "High-quality semiconductor / infrastructure name." },
  ANET: { grade: "A", score: 86, note: "High-quality networking / AI infrastructure exposure." },
  CRDO: { grade: "B", score: 78, note: "Strong growth but volatile; assignment size should be controlled." },
  RKLB: { grade: "B", score: 72, note: "Strong story but high volatility; assignment is not risk-free." },
  AMBA: { grade: "B", score: 72, note: "AI/edge semiconductor story; volatile and smaller cap." },
  PLTR: { grade: "B", score: 76, note: "High-quality story but valuation/volatility risk." },
  CRWD: { grade: "B", score: 78, note: "Quality software/security name; volatile." },
  NET: { grade: "B", score: 74, note: "Quality software name but valuation-sensitive." },
  OSCR: { grade: "C", score: 62, note: "High-upside story but assignment should be sized carefully." },
  AAOI: { grade: "C", score: 60, note: "High beta trade; avoid oversized assignment." },
  IREN: { grade: "C", score: 58, note: "Crypto/AI infrastructure beta; highly volatile." },
  SNDK: { grade: "C", score: 62, note: "Cyclical / special situation; assignment needs review." },
  PENG: { grade: "C", score: 58, note: "Volatile/smaller cap; trade-only until reviewed." },
  SOFI: { grade: "C", score: 64, note: "High beta fintech; assignment should be sized." },
  HOOD: { grade: "C", score: 64, note: "High beta fintech/crypto-sensitive name." },
  RDDT: { grade: "C", score: 62, note: "High growth / high volatility." },
  COIN: { grade: "C", score: 60, note: "Crypto beta; high IV can be dangerous." },
  MSTR: { grade: "D", score: 45, note: "Extreme crypto beta; premium can hide large assignment risk." },
  MARA: { grade: "D", score: 45, note: "Crypto miner; avoid large CSP assignment." },
  RIOT: { grade: "D", score: 45, note: "Crypto miner; avoid large CSP assignment." },
  EOSE: { grade: "D", score: 42, note: "Speculative; premium can be attractive but assignment comfort is low." },
  BMNR: { grade: "D", score: 42, note: "Speculative/high beta; avoid large assignment." },
  NNE: { grade: "D", score: 45, note: "Speculative nuclear theme; high event/valuation risk." },
  CBRS: { grade: "D", score: 45, note: "Speculative/high beta; assignment should be avoided unless reviewed." },
  SPY: { grade: "A", score: 95, note: "Broad market ETF; high assignment comfort." },
  QQQ: { grade: "A", score: 93, note: "Nasdaq ETF; high assignment comfort." },
  IWM: { grade: "B", score: 80, note: "Small-cap ETF; assignable but more cyclical." },
  DRAM: { grade: "B", score: 74, note: "Theme ETF / sector exposure; check components and liquidity." },
  NASA: { grade: "B", score: 72, note: "Space/defense theme; volatile but growing sector." },
};

export function getCSPCompanyQuality(ticker: string): CSPCompanyQuality {
  return CSP_COMPANY_QUALITY[ticker.toUpperCase()] ?? DEFAULT_QUALITY;
}
