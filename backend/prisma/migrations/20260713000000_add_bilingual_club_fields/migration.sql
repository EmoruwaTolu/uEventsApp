-- Optional French club name + description (fall back to the English fields when null).
ALTER TABLE "User" ADD COLUMN "clubNameFr" TEXT;
ALTER TABLE "User" ADD COLUMN "descriptionFr" TEXT;
