-- AlterTable
ALTER TABLE "ingestion_runs" ADD COLUMN     "statsJson" JSONB;

-- CreateTable
CREATE TABLE "hotline_reports" (
    "id" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL DEFAULT 'OMAHA_HOTLINE',
    "sourceGlobalId" TEXT NOT NULL,
    "sourceObjectId" INTEGER NOT NULL,
    "requestId" TEXT,
    "reportCategory" TEXT,
    "problemType" TEXT,
    "locationText" TEXT,
    "status" TEXT,
    "recordKind" TEXT NOT NULL DEFAULT 'UNVERIFIED_COMPLAINT',
    "reportedAt" TIMESTAMP(3),
    "reportedAtSource" TEXT,
    "completedAt" TIMESTAMP(3),
    "sourceCreatedAt" TIMESTAMP(3),
    "sourceEditedAt" TIMESTAMP(3),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "publicView" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "propertyId" TEXT,
    "matchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "latestSourceRecordId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotline_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hotline_reports_sourceGlobalId_key" ON "hotline_reports"("sourceGlobalId");

-- CreateIndex
CREATE INDEX "hotline_reports_requestId_idx" ON "hotline_reports"("requestId");

-- CreateIndex
CREATE INDEX "hotline_reports_reportCategory_idx" ON "hotline_reports"("reportCategory");

-- CreateIndex
CREATE INDEX "hotline_reports_status_idx" ON "hotline_reports"("status");

-- CreateIndex
CREATE INDEX "hotline_reports_reportedAt_idx" ON "hotline_reports"("reportedAt");

-- CreateIndex
CREATE INDEX "hotline_reports_propertyId_idx" ON "hotline_reports"("propertyId");

-- CreateIndex
CREATE INDEX "hotline_reports_latitude_longitude_idx" ON "hotline_reports"("latitude", "longitude");

-- AddForeignKey
ALTER TABLE "hotline_reports" ADD CONSTRAINT "hotline_reports_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotline_reports" ADD CONSTRAINT "hotline_reports_latestSourceRecordId_fkey" FOREIGN KEY ("latestSourceRecordId") REFERENCES "source_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
