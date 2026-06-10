-- CreateTable
CREATE TABLE "PredictionLog" (
    "id" SERIAL NOT NULL,
    "ticker" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "madeOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "madeOnDay" TIMESTAMP(3) NOT NULL,
    "spot" DOUBLE PRECISION NOT NULL,
    "sigmaUp" DOUBLE PRECISION NOT NULL,
    "sigmaDown" DOUBLE PRECISION NOT NULL,
    "tYears" DOUBLE PRECISION NOT NULL,
    "median" DOUBLE PRECISION NOT NULL,
    "skewComponent" DOUBLE PRECISION NOT NULL,
    "pinComponent" DOUBLE PRECISION NOT NULL,
    "pointPrice" DOUBLE PRECISION NOT NULL,
    "realized" DOUBLE PRECISION,
    "zScore" DOUBLE PRECISION,

    CONSTRAINT "PredictionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PredictionLog_ticker_idx" ON "PredictionLog"("ticker");

-- CreateIndex
CREATE UNIQUE INDEX "PredictionLog_ticker_targetDate_madeOnDay_key" ON "PredictionLog"("ticker", "targetDate", "madeOnDay");
