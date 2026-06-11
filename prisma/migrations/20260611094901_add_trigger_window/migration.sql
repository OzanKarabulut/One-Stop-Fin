-- AlterTable
ALTER TABLE "AnomalyLog" ADD COLUMN     "triggerWindow" TEXT NOT NULL DEFAULT '1g';
