import { PrismaClient } from "@prisma/client";

export interface StockMentionData {
  ticker: string;
  sentiment: string;
  score: number;
  reasoning: string;
}

export async function analyzeInvestments(
  db: PrismaClient,
  videoId: string,
  transcript: string
): Promise<StockMentionData[]> {
  // Detect stock tickers in transcript (simplified pattern matching)
  const tickerPattern = /\b([A-Z]{2,5})\b/g;
  const knownTickers = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AMD", "INTC", "NFLX", "DIS", "BA", "JPM", "V", "MA"];
  const matches = transcript.match(tickerPattern) || [];
  const mentioned = Array.from(new Set(matches)).filter((t) => knownTickers.includes(t));

  const results: StockMentionData[] = mentioned.map((ticker) => ({
    ticker,
    sentiment: "neutral",
    score: 0,
    reasoning: "Videoda bahsedildi",
  }));

  // Save to DB
  for (const mention of results) {
    await db.stockMention.create({
      data: { videoId, ...mention },
    });
  }

  return results;
}
