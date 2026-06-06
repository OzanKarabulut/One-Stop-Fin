import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { db } from "@/lib/db";

export const signalRouter = router({
  latest: publicProcedure.query(() =>
    db.tickerSignal.findMany({ orderBy: { date: "desc" }, take: 20 })
  ),

  leaders: publicProcedure
    .input(z.object({ period: z.enum(["24h", "7d", "30d"]).default("7d") }).optional())
    .query(async () => {
      const signals = await db.tickerSignal.findMany({
        orderBy: { score: "desc" },
        take: 40,
      });
      const bullish = signals.filter((s) => s.score > 0).slice(0, 10);
      const bearish = signals.filter((s) => s.score <= 0).slice(0, 10);
      return { bullish, bearish };
    }),

  heatmap: publicProcedure.query(async () => {
    const signals = await db.tickerSignal.findMany({
      orderBy: { date: "desc" },
      take: 50,
    });
    const grouped: Record<string, { ticker: string; score: number; count: number }> = {};
    for (const s of signals) {
      if (!grouped[s.ticker]) grouped[s.ticker] = { ticker: s.ticker, score: 0, count: 0 };
      grouped[s.ticker].score += s.score;
      grouped[s.ticker].count++;
    }
    return Object.values(grouped).map((g) => ({ ...g, avgScore: g.count > 0 ? g.score / g.count : 0 }));
  }),
});
