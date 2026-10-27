/**
 * STAGE 14B PREPARED SCHEMA MIGRATION SPECIFICATION (Additive Only)
 * 
 * Target File: prisma/schema.prisma (when authorized for Stage 14B execution)
 * 
 * Rules:
 * - Purely additive: NO drops, NO renames, NO modifications of existing columns.
 * - Leaves Property, OwnershipRecord, HotlineReport, SourceRecord completely backward-compatible.
 * - Provides exact currency in cents (Int), nullable propertyId, and full observation lifecycle states.
 */

/*
-- SQL generated for Postgres / Neon:

CREATE TYPE "TaxLienObservationState" AS ENUM (
  'PRESENT_IN_CURRENT_SNAPSHOT',
  'ABSENT_FROM_LATEST_SNAPSHOT',
  'OFFICIALLY_CONFIRMED_RELEASED_OR_REDEEMED'
);

CREATE TYPE "TaxLienMatchState" AS ENUM (
  'MATCHED_TO_CANONICAL_PROPERTY',
  'UNMATCHED_COUNTY_PIN',
  'QUARANTINED_MALFORMED'
);

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

CREATE UNIQUE INDEX "tax_lien_records_sourceName_sourceObjectId_key" ON "tax_lien_records"("sourceName", "sourceObjectId");
CREATE INDEX "tax_lien_records_sourcePin_idx" ON "tax_lien_records"("sourcePin");
CREATE INDEX "tax_lien_records_propertyId_idx" ON "tax_lien_records"("propertyId");
CREATE INDEX "tax_lien_records_matchStatus_idx" ON "tax_lien_records"("matchStatus");
CREATE INDEX "tax_lien_records_observationStatus_idx" ON "tax_lien_records"("observationStatus");

ALTER TABLE "tax_lien_records" ADD CONSTRAINT "tax_lien_records_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tax_lien_records" ADD CONSTRAINT "tax_lien_records_latestSourceRecordId_fkey" FOREIGN KEY ("latestSourceRecordId") REFERENCES "source_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
*/

export const PROPOSED_PRISMA_MODEL_TAX_LIEN = `
enum TaxLienObservationState {
  PRESENT_IN_CURRENT_SNAPSHOT
  ABSENT_FROM_LATEST_SNAPSHOT
  OFFICIALLY_CONFIRMED_RELEASED_OR_REDEEMED
}

enum TaxLienMatchState {
  MATCHED_TO_CANONICAL_PROPERTY
  UNMATCHED_COUNTY_PIN
  QUARANTINED_MALFORMED
}

model TaxLienRecord {
  id                   String                  @id @default(cuid())
  sourceName           String                  @default("DOUGLAS_COUNTY_TAX_LIEN")
  sourceObjectId       Int
  sourcePin            String
  taxYear              String?
  amountCents          Int
  amountFormatted      String
  situsAddress         String?
  countyClass          String?
  addition             String?
  
  propertyId           String?
  property             Property?               @relation(fields: [propertyId], references: [id], onDelete: SetNull)
  matchStatus          TaxLienMatchState       @default(UNMATCHED_COUNTY_PIN)
  
  observationStatus    TaxLienObservationState @default(PRESENT_IN_CURRENT_SNAPSHOT)
  firstObservedAt      DateTime                @default(now())
  lastObservedAt       DateTime                @default(now())
  
  latestSourceRecordId String?
  latestSourceRecord   SourceRecord?           @relation(fields: [latestSourceRecordId], references: [id], onDelete: SetNull)
  contentSha256        String

  createdAt            DateTime                @default(now())
  updatedAt            DateTime                @updatedAt

  @@unique([sourceName, sourceObjectId])
  @@index([sourcePin])
  @@index([propertyId])
  @@index([matchStatus])
  @@index([observationStatus])
  @@map("tax_lien_records")
}
`;
