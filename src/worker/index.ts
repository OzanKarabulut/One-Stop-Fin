import { Queue, Worker } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { processVideoTranscript } from "@/services/transcript-engine";
import { analyzeSentiment } from "@/services/sentiment-analyzer";
import { analyzeInvestments } from "@/services/investment-analyzer";
import { generateSignals } from "@/services/signal-engine";
import { generateDailyReport } from "@/services/report-generator";

const redisOpts = { host: "localhost", port: 6379 };
const db = new PrismaClient();

// Queues
export const videoQueue = new Queue("video-processing", { connection: redisOpts });
export const reportQueue = new Queue("daily-report", { connection: redisOpts });

// Video processing worker
new Worker(
  "video-processing",
  async (job) => {
    const { videoId } = job.data;
    console.log(`[worker] Processing video: ${videoId}`);

    const processed = await processVideoTranscript(db, videoId);
    if (!processed) return;

    const video = await db.video.findUnique({ where: { id: videoId } });
    if (!video?.transcript) return;

    await analyzeSentiment(db, videoId, video.transcript);
    await analyzeInvestments(db, videoId, video.transcript);
    await generateSignals(db);
  },
  { connection: redisOpts }
);

// Daily report worker
new Worker(
  "daily-report",
  async () => {
    console.log("[worker] Generating daily report...");
    await generateDailyReport(db);
  },
  { connection: redisOpts }
);

// Schedule daily report cron
async function scheduleCron() {
  await reportQueue.add("daily", {}, { repeat: { pattern: "0 8 * * *" } });
  console.log("[worker] Cron scheduled: daily report at 08:00");
}

scheduleCron().catch(console.error);
console.log("[worker] Workers started.");
