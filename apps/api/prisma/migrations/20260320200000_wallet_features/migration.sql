-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "WalletRequestType" AS ENUM ('DEPOSIT', 'WITHDRAW');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "WalletRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferredCurrency" TEXT NOT NULL DEFAULT 'USD';

CREATE TABLE IF NOT EXISTS "currencies" (
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "rateToVc" DECIMAL(18,6) NOT NULL,
  "decimals" INTEGER NOT NULL DEFAULT 2,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

CREATE TABLE IF NOT EXISTS "wallet_requests" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "WalletRequestType" NOT NULL,
  "status" "WalletRequestStatus" NOT NULL DEFAULT 'PENDING',
  "currencyCode" TEXT NOT NULL,
  "amountCurrency" DECIMAL(18,6) NOT NULL,
  "amountVc" DECIMAL(18,2) NOT NULL,
  "note" TEXT,
  "adminNote" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wallet_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "promo_codes" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "bonusVc" DECIMAL(18,2) NOT NULL,
  "maxUses" INTEGER NOT NULL DEFAULT 100,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "promo_redemptions" (
  "id" TEXT NOT NULL,
  "promoId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "bonusVc" DECIMAL(18,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promo_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "promo_codes_code_key" ON "promo_codes"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "promo_redemptions_promoId_userId_key" ON "promo_redemptions"("promoId", "userId");
CREATE INDEX IF NOT EXISTS "wallet_requests_userId_status_idx" ON "wallet_requests"("userId", "status");
CREATE INDEX IF NOT EXISTS "wallet_requests_status_createdAt_idx" ON "wallet_requests"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "promo_redemptions_userId_idx" ON "promo_redemptions"("userId");
CREATE INDEX IF NOT EXISTS "notifications_userId_read_createdAt_idx" ON "notifications"("userId", "read", "createdAt");

DO $$ BEGIN
  ALTER TABLE "wallet_requests" ADD CONSTRAINT "wallet_requests_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_promoId_fkey"
    FOREIGN KEY ("promoId") REFERENCES "promo_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Seed virtual currencies (simulation rates only)
INSERT INTO "currencies" ("code", "name", "symbol", "rateToVc", "decimals", "enabled", "sortOrder", "updatedAt")
VALUES
  ('VC', 'Virtual Credits', 'VC', 1, 2, true, 0, NOW()),
  ('USD', 'US Dollar (sim)', '$', 100, 2, true, 1, NOW()),
  ('EUR', 'Euro (sim)', '€', 110, 2, true, 2, NOW()),
  ('GBP', 'Pound (sim)', '£', 125, 2, true, 3, NOW()),
  ('BTC', 'Bitcoin (sim)', '₿', 5000000, 8, true, 4, NOW()),
  ('ETH', 'Ethereum (sim)', 'Ξ', 300000, 6, true, 5, NOW())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "promo_codes" ("id", "code", "bonusVc", "maxUses", "usedCount", "active", "createdAt")
VALUES ('promo-welcome', 'WELCOME500', 500, 10000, 0, true, NOW())
ON CONFLICT ("code") DO NOTHING;
