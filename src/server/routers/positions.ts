import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { db } from "@/lib/db";

export const positionsRouter = router({
  list: publicProcedure
    .input(z.object({ status: z.enum(["open", "closed", "all"]) }))
    .query(async ({ input }) => {
      const where = input.status === "all" ? {} : { status: input.status };
      return db.position.findMany({ where, orderBy: { openedAt: "desc" } });
    }),

  create: publicProcedure
    .input(z.object({
      ticker: z.string(),
      strategy: z.string(),
      optionType: z.string(),
      strike: z.number(),
      expiry: z.coerce.date(),
      contracts: z.number().int(),
      entryCredit: z.number(),
      predictedPwin: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return db.position.create({ data: input });
    }),

  close: publicProcedure
    .input(z.object({ id: z.number(), exitDebit: z.number() }))
    .mutation(async ({ input }) => {
      const pos = await db.position.findUniqueOrThrow({ where: { id: input.id } });
      return db.position.update({
        where: { id: input.id },
        data: {
          status: "closed",
          closedAt: new Date(),
          exitDebit: input.exitDebit,
          realizedPnl: pos.entryCredit - input.exitDebit,
        },
      });
    }),

  remove: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return db.position.delete({ where: { id: input.id } });
    }),
});
