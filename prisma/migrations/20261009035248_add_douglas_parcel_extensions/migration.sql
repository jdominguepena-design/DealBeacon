-- AlterTable
ALTER TABLE "hotline_reports" ADD COLUMN     "matchAuditJson" JSONB,
ADD COLUMN     "matchConfidence" TEXT,
ADD COLUMN     "matchMethod" TEXT,
ADD COLUMN     "matchedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ownership_records" ADD COLUMN     "absenteeStatus" TEXT,
ADD COLUMN     "corporateStatus" TEXT,
ADD COLUMN     "outOfStateStatus" TEXT;

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "assessorUrl" TEXT,
ADD COLUMN     "condition" TEXT,
ADD COLUMN     "countyClass" TEXT,
ADD COLUMN     "dcaAccountType" TEXT,
ADD COLUMN     "geometryGeoJson" JSONB,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "legalDescription" TEXT,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "quality" TEXT,
ADD COLUMN     "treasurerUrl" TEXT;

-- CreateIndex
CREATE INDEX "hotline_reports_matchStatus_idx" ON "hotline_reports"("matchStatus");

-- CreateIndex
CREATE INDEX "properties_latitude_longitude_idx" ON "properties"("latitude", "longitude");
