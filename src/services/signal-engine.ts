import { PrismaClient } from "@prisma/client";

export interface TickerSignalResult {
  ticker: string;
  signal: string;
  score: number;
  sources: number;
}

export async function generateSignals(db: PrismaClient): Promise<TickerSignalResult[]> {
  // Aggregate stock mentions to generate signals
  const mentions = await db.stockMention.groupBy({
    by: ["ticker"],
    _count: { id: true },
    _avg: { score: true },
  });

  const signals: TickerSignalResult[] = [];

  for (const m of mentions) {
    const score = m._avg.score || 0;
    const signal = score > 0.3 ? "BUY" : score < -0.3 ? "SELL" : "HOLD";

    await db.tickerSignal.create({
      data: {
        ticker: m.ticker,
        signal,
        score,
        sources: m._count.id,
      },
    });

    signals.push({ ticker: m.ticker, signal, score, sources: m._count.id });
  }

  return signals;
}

export async function getLatestSignals(db: PrismaClient, limit = 20) {
  return db.tickerSignal.findMany({
    orderBy: { date: "desc" },
    take: limit,
  });
}
