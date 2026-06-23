-- CreateTable
CREATE TABLE "InterestFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterestFollow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterestFollow_category_idx" ON "InterestFollow"("category");

-- CreateIndex
CREATE UNIQUE INDEX "InterestFollow_userId_category_key" ON "InterestFollow"("userId", "category");

-- AddForeignKey
ALTER TABLE "InterestFollow" ADD CONSTRAINT "InterestFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
