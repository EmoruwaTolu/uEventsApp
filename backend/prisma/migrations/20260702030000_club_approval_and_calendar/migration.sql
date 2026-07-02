-- Club self-signup + admin approval, and per-user ICS calendar tokens

CREATE TYPE "ClubStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "User" ADD COLUMN "clubStatus" "ClubStatus";
ALTER TABLE "User" ADD COLUMN "clubRejectionReason" TEXT;
ALTER TABLE "User" ADD COLUMN "calendarToken" TEXT;

-- Existing clubs were already trusted (invite-code gated) — keep them approved.
UPDATE "User" SET "clubStatus" = 'APPROVED' WHERE "type" = 'CLUB';

CREATE UNIQUE INDEX "User_calendarToken_key" ON "User"("calendarToken");
