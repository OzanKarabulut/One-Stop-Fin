/**
 * Watchlist Service — add/remove/get watchlist items (Prisma)
 */
import { db } from "@/lib/db";

const MAX_ITEMS = 50;

export async function getWatchlist() {
  return db.watchlistItem.findMany({ orderBy: { addedAt: "desc" } });
}

export async function addToWatchlist(ticker: string, name?: string) {
  const count = await db.watchlistItem.count();
  if (count >= MAX_ITEMS) throw new Error(`Watchlist limit reached (${MAX_ITEMS})`);
  return db.watchlistItem.upsert({
    where: { ticker: ticker.toUpperCase() },
    update: {},
    create: { ticker: ticker.toUpperCase(), name },
  });
}

export async function removeFromWatchlist(ticker: string) {
  return db.watchlistItem.delete({ where: { ticker: ticker.toUpperCase() } });
}

export async function isInWatchlist(ticker: string): Promise<boolean> {
  const item = await db.watchlistItem.findUnique({ where: { ticker: ticker.toUpperCase() } });
  return !!item;
}

export async function getWatchlistSymbols(): Promise<string[]> {
  const items = await db.watchlistItem.findMany({ select: { ticker: true } });
  return items.map((i) => i.ticker);
}
