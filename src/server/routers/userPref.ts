import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { db } from "@/lib/db";

const favoriteItemSchema = z.object({
  href: z.string(),
  labelKey: z.string(),
  order: z.number(),
});

export const userPrefRouter = router({
  get: publicProcedure.query(async () => {
    const pref = await db.userPref.findUnique({ where: { id: "default" } });
    if (!pref) {
      return db.userPref.create({ data: { id: "default", favorites: [], theme: "light", sidebarState: {} } });
    }
    return pref;
  }),

  setFavorites: publicProcedure
    .input(z.object({ favorites: z.array(favoriteItemSchema) }))
    .mutation(async ({ input }) => {
      return db.userPref.upsert({
        where: { id: "default" },
        update: { favorites: input.favorites },
        create: { id: "default", favorites: input.favorites, theme: "light", sidebarState: {} },
      });
    }),

  setTheme: publicProcedure
    .input(z.object({ theme: z.string() }))
    .mutation(async ({ input }) => {
      return db.userPref.upsert({
        where: { id: "default" },
        update: { theme: input.theme },
        create: { id: "default", favorites: [], theme: input.theme, sidebarState: {} },
      });
    }),
});
