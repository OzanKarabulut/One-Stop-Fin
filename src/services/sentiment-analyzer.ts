import { db } from "@/lib/db";

export async function analyzeSentiment(videoId: string, transcript: string) {
  const bullish = ["buy", "bullish", "growth", "opportunity", "upside"];
  const bearish = ["sell", "bearish", "decline", "risk", "crash"];
  const lower = transcript.toLowerCase();
  const bCount = bullish.filter((w) => lower.includes(w)).length;
  const sCount = bearish.filter((w) => lower.includes(w)).length;
  const total = bCount + sCount || 1;
  const score = (bCount - sCount) / total;
  const sentiment = score > 0.2 ? "bullish" : score < -0.2 ? "bearish" : "neutral";

  await db.video.update({ where: { id: videoId }, data: { sentiment, sentimentScore: score } });
  return { sentiment, score };
}
