import { db } from "@/lib/db";

export async function generateDailyReport() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const signals = await db.tickerSignal.findMany({
    where: { date: { gte: today } },
    orderBy: { score: "desc" },
  });

  const recentVideos = await db.video.findMany({
    where: { processed: true, createdAt: { gte: today } },
    take: 10,
    orderBy: { createdAt: "desc" },
  });

  const content = JSON.parse(JSON.stringify({
    date: today.toISOString(),
    topSignals: signals.slice(0, 5),
    videoCount: recentVideos.length,
    summary: `${signals.length} sinyal, ${recentVideos.length} video işlendi`,
  }));

  return db.dailyReport.upsert({
    where: { date: today },
    update: { content },
    create: { date: today, content },
  });
}
