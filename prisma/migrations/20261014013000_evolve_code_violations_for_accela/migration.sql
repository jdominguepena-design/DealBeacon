-- DropForeignKey
ALTER TABLE "code_violations" DROP CONSTRAINT "code_violations_propertyId_fkey";

-- DropIndex
DROP INDEX "code_violations_status_idx";

-- AlterTable
ALTER TABLE "code_violations" ADD COLUMN     "accelaUrl" TEXT,
ADD COLUMN     "caseRecordClassMapped" TEXT,
ADD COLUMN     "caseType" TEXT NOT NULL DEFAULT 'Housing Inspection Case',
ADD COLUMN     "complianceDeadline" TIMESTAMP(3),
ADD COLUMN     "demoIssuedDate" TIMESTAMP(3),
ADD COLUMN     "enforcementStage" TEXT NOT NULL DEFAULT 'UNKNOWN_STAGE',
ADD COLUMN     "hasDemoOrder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "initialInspectionDate" TIMESTAMP(3),
ADD COLUMN     "isVacant" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastReInspectionDate" TIMESTAMP(3),
ADD COLUMN     "lastUpdatedSource" TIMESTAMP(3),
ADD COLUMN     "latestSourceRecordId" TEXT,
ADD COLUMN     "matchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
ADD COLUMN     "openedDate" TIMESTAMP(3),
ADD COLUMN     "originalAddress" TEXT,
ADD COLUMN     "originalCity" TEXT,
ADD COLUMN     "originalState" TEXT,
ADD COLUMN     "originalZip" TEXT,
ADD COLUMN     "sourceGlobalId" TEXT,
ADD COLUMN     "sourceName" TEXT NOT NULL DEFAULT 'OMAHA_ACCELA_CODE_ENFORCEMENT',
ADD COLUMN     "sourceObjectId" INTEGER,
ADD COLUMN     "sourcePin" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "statusCurrent" TEXT NOT NULL DEFAULT 'Unknown',
ADD COLUMN     "statusCurrentMapped" TEXT NOT NULL DEFAULT 'Unknown',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "vacateReason" TEXT,
ALTER COLUMN "propertyId" DROP NOT NULL,
ALTER COLUMN "violationDate" DROP NOT NULL,
ALTER COLUMN "violationType" SET DEFAULT 'HOUSING_CODE_INSPECTION',
ALTER COLUMN "status" SET DEFAULT 'OPEN',
ALTER COLUMN "description" SET DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "code_violations_caseNumber_key" ON "code_violations"("caseNumber");

-- CreateIndex
CREATE INDEX "code_violations_sourcePin_idx" ON "code_violations"("sourcePin");

-- CreateIndex
CREATE INDEX "code_violations_statusCurrentMapped_idx" ON "code_violations"("statusCurrentMapped");

-- CreateIndex
CREATE INDEX "code_violations_enforcementStage_idx" ON "code_violations"("enforcementStage");

-- CreateIndex
CREATE INDEX "code_violations_matchStatus_idx" ON "code_violations"("matchStatus");

-- CreateIndex
CREATE INDEX "code_violations_isVacant_idx" ON "code_violations"("isVacant");

-- CreateIndex
CREATE INDEX "code_violations_hasDemoOrder_idx" ON "code_violations"("hasDemoOrder");

-- AddForeignKey
ALTER TABLE "code_violations" ADD CONSTRAINT "code_violations_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_violations" ADD CONSTRAINT "code_violations_latestSourceRecordId_fkey" FOREIGN KEY ("latestSourceRecordId") REFERENCES "source_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
