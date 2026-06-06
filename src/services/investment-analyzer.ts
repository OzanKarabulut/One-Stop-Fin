import { db } from "@/lib/db";

export async function analyzeInvestments(videoId: string, transcript: string) {
  const tickers = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"];
  const mentioned = tickers.filter((t) => transcript.includes(t));
  for (const ticker of mentioned) {
    await db.stockMention.create({
      data: { videoId, ticker, sentiment: "neutral", score: 0, reasoning: "Videoda bahsedildi" },
    });
  }
  return mentioned;
}
