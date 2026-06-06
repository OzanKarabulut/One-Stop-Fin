import { db } from "@/lib/db";

export async function generateSignals() {
  const mentions = await db.stockMention.groupBy({
    by: ["ticker"],
    _count: { id: true },
    _avg: { score: true },
  });

  for (const m of mentions) {
    const score = m._avg.score || 0;
    const signal = score > 0.3 ? "BUY" : score < -0.3 ? "SELL" : "HOLD";
    await db.tickerSignal.create({
      data: { ticker: m.ticker, signal, score, sources: m._count.id },
    });
  }
}
