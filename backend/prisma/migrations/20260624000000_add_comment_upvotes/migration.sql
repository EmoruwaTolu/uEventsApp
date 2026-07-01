-- Comment upvotes counter (for the "▲ N" indicator on top comments)
ALTER TABLE "Comment" ADD COLUMN "upvotes" INTEGER NOT NULL DEFAULT 0;
