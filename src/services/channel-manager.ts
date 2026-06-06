import { PrismaClient } from "@prisma/client";

export async function addChannel(db: PrismaClient, youtubeId: string, name: string) {
  return db.channel.upsert({
    where: { youtubeId },
    update: { name, active: true },
    create: { youtubeId, name },
  });
}

export async function getChannels(db: PrismaClient) {
  return db.channel.findMany({ where: { active: true }, orderBy: { name: "asc" } });
}

export async function removeChannel(db: PrismaClient, id: string) {
  return db.channel.update({ where: { id }, data: { active: false } });
}

export async function getChannelVideos(db: PrismaClient, channelId: string) {
  return db.video.findMany({
    where: { channelId },
    orderBy: { publishedAt: "desc" },
    include: { keyPoints: true, stockMentions: true },
  });
}
