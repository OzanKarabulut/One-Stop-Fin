import { PrismaClient } from "@prisma/client";

export interface SentimentResult {
  sentiment: "bullish" | "bearish" | "neutral";
  score: number;
  keyPoints: { point: string; sentiment: string; ticker?: string }[];
}

export async function analyzeSentiment(
  db: PrismaClient,
  videoId: string,
  transcript: string
): Promise<SentimentResult> {
  // Simplified sentiment analysis - in production would use AI
  const bullishWords = ["buy", "bullish", "growth", "opportunity", "undervalued", "upside"];
  const bearishWords = ["sell", "bearish", "decline", "overvalued", "risk", "crash"];

  const lower = transcript.toLowerCase();
  const bullishCount = bullishWords.filter((w) => lower.includes(w)).length;
  const bearishCount = bearishWords.filter((w) => lower.includes(w)).length;

  const total = bullishCount + bearishCount || 1;
  const score = (bullishCount - bearishCount) / total;
  const sentiment = score > 0.2 ? "bullish" : score < -0.2 ? "bearish" : "neutral";

  const keyPoints = [
    { point: "Genel piyasa görünümü analiz edildi", sentiment },
  ];

  // Save to video record
  await db.video.update({
    where: { id: videoId },
    data: { sentiment, sentimentScore: score },
  });

  return { sentiment, score, keyPoints };
}
