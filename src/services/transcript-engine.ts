import { db } from "@/lib/db";

export async function processVideoTranscript(videoId: string): Promise<boolean> {
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video || video.processed) return false;
  // In production: fetch YouTube captions or use Whisper
  return false;
}
