-- "Show less like this" signals for the For You feed (ranker tuning + tester feedback)
CREATE TABLE "FeedSignal" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "postId"     TEXT,
    "clubId"     TEXT,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reason"     TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedSignal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedSignal_userId_idx" ON "FeedSignal"("userId");

ALTER TABLE "FeedSignal" ADD CONSTRAINT "FeedSignal_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
