import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { db } from "@/lib/db";
import { getQuotes } from "../services/yahoo-finance";

export const watchlistRouter = router({
  list: publicProcedure.query(async () => {
    const items = await db.watchlistItem.findMany({ orderBy: { addedAt: "desc" } });
    if (!items.length) return [];
    const quotes = await getQuotes(items.map((i) => i.ticker));
    return items.map((item) => {
      const quote = quotes.find((q) => q.symbol === item.ticker);
      return { ...item, price: quote?.regularMarketPrice, change: quote?.regularMarketChangePercent };
    });
  }),

  add: publicProcedure
    .input(z.object({ ticker: z.string(), name: z.string().optional() }))
    .mutation(async ({ input }) => {
      return db.watchlistItem.upsert({
        where: { ticker: input.ticker.toUpperCase() },
        update: {},
        create: { ticker: input.ticker.toUpperCase(), name: input.name },
      });
    }),

  remove: publicProcedure
    .input(z.object({ ticker: z.string() }))
    .mutation(async ({ input }) => {
      return db.watchlistItem.delete({ where: { ticker: input.ticker.toUpperCase() } });
    }),
});
