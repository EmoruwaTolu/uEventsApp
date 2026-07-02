-- Moderation / report-review surface (App Store Guideline 1.2)

-- New admin role
ALTER TYPE "UserType" ADD VALUE 'ADMIN';

-- Soft-hide flags: hidden content is excluded from all public feeds/detail views
ALTER TABLE "Post"    ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Comment" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;

-- Report review state (null resolvedAt = still open)
ALTER TABLE "Report" ADD COLUMN "resolvedAt"   TIMESTAMP(3);
ALTER TABLE "Report" ADD COLUMN "resolvedById" TEXT;
ALTER TABLE "Report" ADD COLUMN "resolution"   TEXT;

-- Indexes for grouping reports by target and filtering open vs. resolved
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");
CREATE INDEX "Report_resolvedAt_idx" ON "Report"("resolvedAt");
