import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { db } from "@/lib/db";

export const videoRouter = router({
  list: publicProcedure
    .input(z.object({ limit: z.number().default(20) }).optional())
    .query(({ input }) =>
      db.video.findMany({
        where: { processed: true },
        orderBy: { publishedAt: "desc" },
        take: input?.limit ?? 20,
        include: { channel: true, keyPoints: true, stockMentions: true },
      })
    ),

  recent: publicProcedure.query(() =>
    db.video.findMany({
      where: { processed: true },
      orderBy: { publishedAt: "desc" },
      take: 5,
      select: { id: true, title: true, publishedAt: true, sentiment: true, sentimentScore: true, channel: { select: { name: true } } },
    })
  ),

  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) =>
      db.video.findUnique({
        where: { id: input.id },
        include: { channel: true, keyPoints: true, stockMentions: true },
      })
    ),

  getTranscript: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const video = await db.video.findUnique({ where: { id: input.id }, select: { transcript: true } });
      return video?.transcript ?? null;
    }),
});
