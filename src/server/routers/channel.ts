import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { db } from "@/lib/db";

export const channelRouter = router({
  list: publicProcedure.query(() =>
    db.channel.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { _count: { select: { videos: true } } } })
  ),

  add: publicProcedure
    .input(z.object({ youtubeId: z.string(), name: z.string() }))
    .mutation(async ({ input }) => {
      return db.channel.upsert({
        where: { youtubeId: input.youtubeId },
        update: { name: input.name, active: true },
        create: { youtubeId: input.youtubeId, name: input.name },
      });
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      db.channel.update({ where: { id: input.id }, data: { active: false } })
    ),
});
