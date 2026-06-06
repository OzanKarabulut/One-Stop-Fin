import { router, publicProcedure } from "../trpc";
import { db } from "@/lib/db";
import { getLatestSignals } from "@/services/signal-engine";

export const signalRouter = router({
  latest: publicProcedure.query(() => getLatestSignals(db)),

  leaders: publicProcedure.query(async () => {
    const signals = await db.tickerSignal.findMany({
      orderBy: { score: "desc" },
      take: 10,
    });
    return signals;
  }),

  heatmap: publicProcedure.query(async () => {
    const signals = await db.tickerSignal.findMany({
      orderBy: { date: "desc" },
      take: 50,
    });
    // Group by ticker for heatmap
    const grouped: Record<string, { ticker: string; score: number; count: number }> = {};
    for (const s of signals) {
      if (!grouped[s.ticker]) grouped[s.ticker] = { ticker: s.ticker, score: 0, count: 0 };
      grouped[s.ticker].score += s.score;
      grouped[s.ticker].count++;
    }
    return Object.values(grouped).map((g) => ({ ...g, avgScore: g.score / g.count }));
  }),
});
