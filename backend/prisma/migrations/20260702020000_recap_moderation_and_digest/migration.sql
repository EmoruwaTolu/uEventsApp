-- Recap photo moderation: photos start PENDING and only publish once APPROVED
CREATE TYPE "EventPhotoStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "EventPhoto" ADD COLUMN "status" "EventPhotoStatus" NOT NULL DEFAULT 'PENDING';

-- Backfill: existing photos were already public, so keep them visible.
UPDATE "EventPhoto" SET "status" = 'APPROVED';

CREATE INDEX "EventPhoto_postId_status_idx" ON "EventPhoto"("postId", "status");

-- Weekly digest notifications
ALTER TYPE "NotifType" ADD VALUE 'DIGEST';
