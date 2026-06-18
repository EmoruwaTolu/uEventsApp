-- CreateEnum
CREATE TYPE "RecurrenceFreq" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "Post" ADD COLUMN "seriesId" TEXT,
ADD COLUMN "occurrenceDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EventSeries" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "freq" "RecurrenceFreq" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "byWeekday" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "count" INTEGER,
    "template" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventSeries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Post_seriesId_idx" ON "Post"("seriesId");

-- CreateIndex
CREATE INDEX "EventSeries_clubId_idx" ON "EventSeries"("clubId");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
