-- CreateTable
CREATE TABLE "AnomalyLog" (
    "id" SERIAL NOT NULL,
    "ticker" TEXT NOT NULL,
    "detectedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detectedOnDay" TIMESTAMP(3) NOT NULL,
    "expiry" TIMESTAMP(3) NOT NULL,
    "spot" DOUBLE PRECISION NOT NULL,
    "dropPct" DOUBLE PRECISION NOT NULL,
    "sigmaMove" DOUBLE PRECISION NOT NULL,
    "sectorRel" DOUBLE PRECISION NOT NULL,
    "ivHvRatio" DOUBLE PRECISION NOT NULL,
    "strikeConservative" DOUBLE PRECISION NOT NULL,
    "premiumConservative" DOUBLE PRECISION NOT NULL,
    "strikeAggressive" DOUBLE PRECISION NOT NULL,
    "premiumAggressive" DOUBLE PRECISION NOT NULL,
    "settledClose" DOUBLE PRECISION,
    "outcome" TEXT,

    CONSTRAINT "AnomalyLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnomalyLog_ticker_idx" ON "AnomalyLog"("ticker");

-- CreateIndex
CREATE UNIQUE INDEX "AnomalyLog_ticker_expiry_detectedOnDay_key" ON "AnomalyLog"("ticker", "expiry", "detectedOnDay");
