import { PrismaClient } from "@prisma/client";

export async function fetchTranscript(youtubeVideoId: string): Promise<string | null> {
  // In production, this would call YouTube transcript API
  console.log(`[transcript-engine] Would fetch transcript for: ${youtubeVideoId}`);
  return null;
}

export async function processVideoTranscript(
  db: PrismaClient,
  videoId: string
): Promise<boolean> {
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video || video.processed) return false;

  const transcript = await fetchTranscript(video.youtubeId);
  if (!transcript) return false;

  await db.video.update({
    where: { id: videoId },
    data: { transcript, processed: true },
  });

  return true;
}
