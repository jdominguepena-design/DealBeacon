-- Stage 14B: Add Douglas County Tax-Lien Records (Additive Migration)
-- Date: 2026-10-10
-- Target: Neon DEV PostgreSQL
-- Description: Creates dedicated tax_lien_records table and supporting enums.
-- Relational integrity: Nullable propertyId (ON DELETE SET NULL), nullable latestSourceRecordId (ON DELETE SET NULL).
-- Existing tables and data: 100% UNMODIFIED.

-- CreateEnum: TaxLienObservationState
CREATE TYPE "TaxLienObservationState" AS ENUM (
  'PRESENT_IN_CURRENT_SNAPSHOT',
  'ABSENT_FROM_LATEST_SNAPSHOT',
  'OFFICIALLY_CONFIRMED_RELEASED_OR_REDEEMED'
);

-- CreateEnum: TaxLienMatchState
CREATE TYPE "TaxLienMatchState" AS ENUM (
  'MATCHED_TO_CANONICAL_PROPERTY',
  'UNMATCHED_COUNTY_PIN',
  'QUARANTINED_MALFORMED'
);

-- CreateTable: tax_lien_records
CREATE TABLE "tax_lien_records" (
  "id" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL DEFAULT 'DOUGLAS_COUNTY_TAX_LIEN',
  "sourceObjectId" INTEGER NOT NULL,
  "sourcePin" TEXT NOT NULL,
  "taxYear" TEXT,
  "amountCents" INTEGER NOT NULL,
  "amountFormatted" TEXT NOT NULL,
  "situsAddress" TEXT,
  "countyClass" TEXT,
  "addition" TEXT,
  "propertyId" TEXT,
  "matchStatus" "TaxLienMatchState" NOT NULL DEFAULT 'UNMATCHED_COUNTY_PIN',
  "observationStatus" "TaxLienObservationState" NOT NULL DEFAULT 'PRESENT_IN_CURRENT_SNAPSHOT',
  "firstObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "latestSourceRecordId" TEXT,
  "contentSha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tax_lien_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX "tax_lien_records_sourceName_sourceObjectId_key" ON "tax_lien_records"("sourceName", "sourceObjectId");
CREATE INDEX "tax_lien_records_sourcePin_idx" ON "tax_lien_records"("sourcePin");
CREATE INDEX "tax_lien_records_propertyId_idx" ON "tax_lien_records"("propertyId");
CREATE INDEX "tax_lien_records_matchStatus_idx" ON "tax_lien_records"("matchStatus");
CREATE INDEX "tax_lien_records_observationStatus_idx" ON "tax_lien_records"("observationStatus");

-- AddForeignKey constraints
ALTER TABLE "tax_lien_records" ADD CONSTRAINT "tax_lien_records_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tax_lien_records" ADD CONSTRAINT "tax_lien_records_latestSourceRecordId_fkey" FOREIGN KEY ("latestSourceRecordId") REFERENCES "source_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
