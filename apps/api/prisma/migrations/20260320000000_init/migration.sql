-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "RoundPhase" AS ENUM ('WAITING', 'COUNTDOWN', 'FLYING', 'CRASHED');

-- CreateEnum
CREATE TYPE "RoundEventType" AS ENUM ('PHASE_CHANGE', 'MULTIPLIER_TICK', 'CRASH', 'SIM_PLAYER_CASH_OUT', 'PRACTICE_BET', 'PRACTICE_CASH_OUT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "virtualCredits" DECIMAL(18,2) NOT NULL DEFAULT 10000,
    "refreshTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rounds" (
    "id" TEXT NOT NULL,
    "roundNumber" SERIAL NOT NULL,
    "phase" "RoundPhase" NOT NULL DEFAULT 'WAITING',
    "crashPoint" DECIMAL(12,2),
    "serverSeed" TEXT NOT NULL,
    "serverSeedHash" TEXT NOT NULL,
    "clientSeed" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3),
    "crashedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "peakMultiplier" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_events" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "type" "RoundEventType" NOT NULL,
    "multiplier" DECIMAL(12,2),
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "round_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_bets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "autoCashOutAt" DECIMAL(12,2),
    "cashedOut" BOOLEAN NOT NULL DEFAULT false,
    "cashOutMultiplier" DECIMAL(12,2),
    "profit" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_bets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "settings" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "simulation_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulated_players" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarHue" INTEGER NOT NULL DEFAULT 200,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastBetAmount" DECIMAL(18,2),
    "lastCashOutAt" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "simulated_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "label" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "rounds_roundNumber_key" ON "rounds"("roundNumber");

-- CreateIndex
CREATE INDEX "rounds_createdAt_idx" ON "rounds"("createdAt");

-- CreateIndex
CREATE INDEX "rounds_phase_idx" ON "rounds"("phase");

-- CreateIndex
CREATE INDEX "round_events_roundId_createdAt_idx" ON "round_events"("roundId", "createdAt");

-- CreateIndex
CREATE INDEX "practice_bets_userId_idx" ON "practice_bets"("userId");

-- CreateIndex
CREATE INDEX "practice_bets_roundId_idx" ON "practice_bets"("roundId");

-- CreateIndex
CREATE INDEX "analytics_events_category_createdAt_idx" ON "analytics_events"("category", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_events_userId_idx" ON "analytics_events"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- AddForeignKey
ALTER TABLE "round_events" ADD CONSTRAINT "round_events_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_bets" ADD CONSTRAINT "practice_bets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_bets" ADD CONSTRAINT "practice_bets_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
