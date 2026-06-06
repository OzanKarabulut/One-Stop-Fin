-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "youtubeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "youtubeId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "thumbnailUrl" TEXT,
    "transcript" TEXT,
    "summary" TEXT,
    "sentiment" TEXT,
    "sentimentScore" DOUBLE PRECISION,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoKeyPoint" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "point" TEXT NOT NULL,
    "sentiment" TEXT,
    "ticker" TEXT,
    CONSTRAINT "VideoKeyPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMention" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "sentiment" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT,
    CONSTRAINT "StockMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TickerSignal" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "sources" INTEGER NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    CONSTRAINT "TickerSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPref" (
    "id" TEXT NOT NULL,
    "favorites" JSONB NOT NULL DEFAULT '[]',
    "theme" TEXT NOT NULL DEFAULT 'light',
    "sidebarState" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "UserPref_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Channel_youtubeId_key" ON "Channel"("youtubeId");
CREATE UNIQUE INDEX "Video_youtubeId_key" ON "Video"("youtubeId");
CREATE INDEX "StockMention_ticker_idx" ON "StockMention"("ticker");
CREATE INDEX "TickerSignal_ticker_date_idx" ON "TickerSignal"("ticker", "date");
CREATE UNIQUE INDEX "WatchlistItem_ticker_key" ON "WatchlistItem"("ticker");
CREATE UNIQUE INDEX "DailyReport_date_key" ON "DailyReport"("date");

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VideoKeyPoint" ADD CONSTRAINT "VideoKeyPoint_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMention" ADD CONSTRAINT "StockMention_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
