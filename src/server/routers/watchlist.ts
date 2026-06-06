import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { db } from "@/lib/db";

export const watchlistRouter = router({
  list: publicProcedure.query(async () => {
    return db.watchlistItem.findMany({ orderBy: { addedAt: "desc" } });
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
      return db.watchlistItem.delete({ where: { ticker: input.ticker.toUpperCase() } }).catch(() => null);
    }),
});
