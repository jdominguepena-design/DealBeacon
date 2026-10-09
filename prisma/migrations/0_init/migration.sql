-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('INVESTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'RESEARCHING', 'CONTACTING', 'FOLLOW_UP', 'INTERESTED', 'NOT_INTERESTED', 'CLOSED_DEAL');

-- CreateEnum
CREATE TYPE "PriorityLevel" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SignalSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'INVESTOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Omaha',
    "state" TEXT NOT NULL DEFAULT 'NE',
    "zip" TEXT NOT NULL,
    "neighborhood" TEXT,
    "propertyType" TEXT NOT NULL,
    "yearBuilt" INTEGER,
    "bedrooms" INTEGER,
    "bathrooms" DOUBLE PRECISION,
    "squareFeet" INTEGER,
    "lotSizeSqFt" INTEGER,
    "assessedValue" DOUBLE PRECISION,
    "estimatedValue" DOUBLE PRECISION,
    "estimatedEquityPct" DOUBLE PRECISION,
    "opportunityScore" INTEGER NOT NULL DEFAULT 0,
    "dataConfidence" "ConfidenceLevel" NOT NULL DEFAULT 'MEDIUM',
    "scoreBreakdownJson" JSONB,
    "lastScoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ownership_records" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "mailingAddress" TEXT NOT NULL,
    "mailingCity" TEXT NOT NULL,
    "mailingState" TEXT NOT NULL,
    "mailingZip" TEXT NOT NULL,
    "isAbsentee" BOOLEAN NOT NULL DEFAULT false,
    "isOutOfState" BOOLEAN NOT NULL DEFAULT false,
    "isCorporate" BOOLEAN NOT NULL DEFAULT false,
    "purchaseDate" TIMESTAMP(3),
    "purchasePrice" DOUBLE PRECISION,
    "deedType" TEXT,
    "ownershipYears" DOUBLE PRECISION,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ownership_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_records" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "totalAssessed" DOUBLE PRECISION NOT NULL,
    "annualTaxDue" DOUBLE PRECISION NOT NULL,
    "amountDelinquent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isDelinquent" BOOLEAN NOT NULL DEFAULT false,
    "delinquentYears" INTEGER NOT NULL DEFAULT 0,
    "taxSaleStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_violations" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "violationDate" TIMESTAMP(3) NOT NULL,
    "violationType" TEXT NOT NULL,
    "severity" "SignalSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "inspectorNotes" TEXT,
    "complianceDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "code_violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signals" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "scoreContribution" INTEGER NOT NULL,
    "severity" "SignalSeverity" NOT NULL DEFAULT 'MEDIUM',
    "eventDate" TIMESTAMP(3) NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sourceType" TEXT NOT NULL,
    "sourceRecordId" TEXT,
    "metadataJson" JSONB,

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_events" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT,
    "sourceRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_records" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT,
    "sourceName" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "rawPayloadJson" JSONB NOT NULL,
    "ingestionRunId" TEXT,
    "matchedStatus" TEXT NOT NULL DEFAULT 'MATCHED',
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_runs" (
    "id" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" "IngestionStatus" NOT NULL DEFAULT 'RUNNING',
    "recordsIngested" INTEGER NOT NULL DEFAULT 0,
    "signalsCreated" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" JSONB,

    CONSTRAINT "ingestion_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_history" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "scoreBreakdown" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_properties" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "priority" "PriorityLevel" NOT NULL DEFAULT 'NORMAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "properties_parcelId_key" ON "properties"("parcelId");

-- CreateIndex
CREATE INDEX "properties_opportunityScore_idx" ON "properties"("opportunityScore");

-- CreateIndex
CREATE INDEX "properties_neighborhood_idx" ON "properties"("neighborhood");

-- CreateIndex
CREATE INDEX "properties_zip_idx" ON "properties"("zip");

-- CreateIndex
CREATE INDEX "ownership_records_propertyId_idx" ON "ownership_records"("propertyId");

-- CreateIndex
CREATE INDEX "tax_records_propertyId_idx" ON "tax_records"("propertyId");

-- CreateIndex
CREATE INDEX "tax_records_isDelinquent_idx" ON "tax_records"("isDelinquent");

-- CreateIndex
CREATE INDEX "code_violations_propertyId_idx" ON "code_violations"("propertyId");

-- CreateIndex
CREATE INDEX "code_violations_status_idx" ON "code_violations"("status");

-- CreateIndex
CREATE INDEX "signals_propertyId_idx" ON "signals"("propertyId");

-- CreateIndex
CREATE INDEX "signals_signalType_idx" ON "signals"("signalType");

-- CreateIndex
CREATE INDEX "property_events_propertyId_idx" ON "property_events"("propertyId");

-- CreateIndex
CREATE INDEX "property_events_eventDate_idx" ON "property_events"("eventDate");

-- CreateIndex
CREATE INDEX "source_records_propertyId_idx" ON "source_records"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "source_records_sourceName_sourceRecordId_key" ON "source_records"("sourceName", "sourceRecordId");

-- CreateIndex
CREATE INDEX "score_history_propertyId_idx" ON "score_history"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_properties_userId_propertyId_key" ON "saved_properties"("userId", "propertyId");

-- CreateIndex
CREATE INDEX "property_notes_propertyId_idx" ON "property_notes"("propertyId");

-- AddForeignKey
ALTER TABLE "ownership_records" ADD CONSTRAINT "ownership_records_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_records" ADD CONSTRAINT "tax_records_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_violations" ADD CONSTRAINT "code_violations_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "source_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_events" ADD CONSTRAINT "property_events_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_events" ADD CONSTRAINT "property_events_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "source_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_records" ADD CONSTRAINT "source_records_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_records" ADD CONSTRAINT "source_records_ingestionRunId_fkey" FOREIGN KEY ("ingestionRunId") REFERENCES "ingestion_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_history" ADD CONSTRAINT "score_history_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_properties" ADD CONSTRAINT "saved_properties_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_properties" ADD CONSTRAINT "saved_properties_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_notes" ADD CONSTRAINT "property_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_notes" ADD CONSTRAINT "property_notes_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
