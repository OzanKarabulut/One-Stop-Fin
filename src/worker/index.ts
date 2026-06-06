import { Queue, Worker } from "bullmq";
import { processVideoTranscript } from "@/services/transcript-engine";
import { analyzeSentiment } from "@/services/sentiment-analyzer";
import { analyzeInvestments } from "@/services/investment-analyzer";
import { generateSignals } from "@/services/signal-engine";
import { generateDailyReport } from "@/services/report-generator";
import { db } from "@/lib/db";

const redisOpts = { host: process.env.REDIS_HOST || "localhost", port: 6379 };

export const videoQueue = new Queue("video-processing", { connection: redisOpts });
export const reportQueue = new Queue("daily-report", { connection: redisOpts });

new Worker("video-processing", async (job) => {
  const { videoId } = job.data;
  const processed = await processVideoTranscript(videoId);
  if (!processed) return;
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video?.transcript) return;
  await analyzeSentiment(videoId, video.transcript);
  await analyzeInvestments(videoId, video.transcript);
  await generateSignals();
}, { connection: redisOpts });

new Worker("daily-report", async () => {
  await generateDailyReport();
}, { connection: redisOpts });

console.log("[worker] Started.");
