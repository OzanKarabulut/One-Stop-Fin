import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { db } from "@/lib/db";

export const volRouter = router({
  snapshotUpsert: publicProcedure
    .input(z.object({ ticker: z.string(), atmIv: z.number(), hv20: z.number().optional() }))
    .mutation(async ({ input }) => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      return db.volSnapshot.upsert({
        where: { ticker_date: { ticker: input.ticker.toUpperCase(), date: today } },
        update: { atmIv: input.atmIv, hv20: input.hv20 },
        create: { ticker: input.ticker.toUpperCase(), date: today, atmIv: input.atmIv, hv20: input.hv20 },
      });
    }),

  history: publicProcedure
    .input(z.object({ ticker: z.string() }))
    .query(async ({ input }) => {
      return db.volSnapshot.findMany({
        where: { ticker: input.ticker.toUpperCase() },
        orderBy: { date: "asc" },
        take: 252,
      });
    }),
});
