import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { db } from "@/lib/db";
import { addChannel, getChannels, removeChannel } from "@/services/channel-manager";

export const channelRouter = router({
  list: publicProcedure.query(() => getChannels(db)),

  add: publicProcedure
    .input(z.object({ youtubeId: z.string(), name: z.string() }))
    .mutation(async ({ input }) => {
      const channel = await addChannel(db, input.youtubeId, input.name);
      // In production, would scan YouTube for videos and enqueue them
      return channel;
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => removeChannel(db, input.id)),
});
