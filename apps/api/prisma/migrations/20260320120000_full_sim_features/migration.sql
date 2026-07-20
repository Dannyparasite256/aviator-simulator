-- CreateEnum PracticeBetStatus
DO $$ BEGIN
  CREATE TYPE "PracticeBetStatus" AS ENUM ('QUEUED', 'ACTIVE', 'CASHED_OUT', 'BUSTED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Extend RoundEventType
DO $$ BEGIN
  ALTER TYPE "RoundEventType" ADD VALUE 'PRACTICE_PARTIAL_CASH_OUT';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TYPE "RoundEventType" ADD VALUE 'PRACTICE_CANCEL';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TYPE "RoundEventType" ADD VALUE 'LIVE_BET';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- users columns
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "clientSeed" TEXT NOT NULL DEFAULT 'aviator-default-client';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "minBet" DECIMAL(18,2) NOT NULL DEFAULT 1;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "maxBet" DECIMAL(18,2) NOT NULL DEFAULT 100000;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "maxProfitPerBet" DECIMAL(18,2) NOT NULL DEFAULT 1000000;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sessionLossLimit" DECIMAL(18,2);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sessionTimeLimitMin" INTEGER;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sessionStartedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sessionProfit" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- practice_bets columns
ALTER TABLE "practice_bets" ADD COLUMN IF NOT EXISTS "slot" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "practice_bets" ADD COLUMN IF NOT EXISTS "remainingAmount" DECIMAL(18,2);
ALTER TABLE "practice_bets" ADD COLUMN IF NOT EXISTS "status" "PracticeBetStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "practice_bets" ADD COLUMN IF NOT EXISTS "partialProfit" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "practice_bets" ADD COLUMN IF NOT EXISTS "queued" BOOLEAN NOT NULL DEFAULT false;

UPDATE "practice_bets" SET "remainingAmount" = "amount" WHERE "remainingAmount" IS NULL;
ALTER TABLE "practice_bets" ALTER COLUMN "remainingAmount" SET NOT NULL;

ALTER TABLE "practice_bets" ALTER COLUMN "roundId" DROP NOT NULL;

-- simulated_players
ALTER TABLE "simulated_players" ADD COLUMN IF NOT EXISTS "personality" TEXT NOT NULL DEFAULT 'mixed';

-- bankroll_snapshots
CREATE TABLE IF NOT EXISTS "bankroll_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankroll" DECIMAL(18,2) NOT NULL,
    "profit" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bankroll_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "practice_bets_userId_status_idx" ON "practice_bets"("userId", "status");
CREATE INDEX IF NOT EXISTS "practice_bets_userId_slot_status_idx" ON "practice_bets"("userId", "slot", "status");
CREATE INDEX IF NOT EXISTS "bankroll_snapshots_userId_createdAt_idx" ON "bankroll_snapshots"("userId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "bankroll_snapshots" ADD CONSTRAINT "bankroll_snapshots_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
