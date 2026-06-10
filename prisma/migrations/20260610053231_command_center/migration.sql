-- AlterTable
ALTER TABLE "UserPref" ALTER COLUMN "id" SET DEFAULT 'default';

-- CreateTable
CREATE TABLE "Position" (
    "id" SERIAL NOT NULL,
    "ticker" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "optionType" TEXT NOT NULL,
    "strike" DOUBLE PRECISION NOT NULL,
    "expiry" TIMESTAMP(3) NOT NULL,
    "contracts" INTEGER NOT NULL,
    "entryCredit" DOUBLE PRECISION NOT NULL,
    "predictedPwin" DOUBLE PRECISION,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'open',
    "closedAt" TIMESTAMP(3),
    "exitDebit" DOUBLE PRECISION,
    "realizedPnl" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolSnapshot" (
    "id" SERIAL NOT NULL,
    "ticker" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atmIv" DOUBLE PRECISION NOT NULL,
    "hv20" DOUBLE PRECISION,

    CONSTRAINT "VolSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Position_status_idx" ON "Position"("status");

-- CreateIndex
CREATE INDEX "VolSnapshot_ticker_idx" ON "VolSnapshot"("ticker");

-- CreateIndex
CREATE UNIQUE INDEX "VolSnapshot_ticker_date_key" ON "VolSnapshot"("ticker", "date");
