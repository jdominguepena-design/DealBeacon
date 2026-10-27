-- ============================================================================
-- REVERSE MIGRATION (DOWN SQL) FOR 20261014013000_evolve_code_violations_for_accela
-- Completely restores code_violations table to original pre-Stage 15d state
-- ============================================================================

-- 1. Remove any pilot records if present
DELETE FROM "code_violations" WHERE "sourceName" = 'OMAHA_ACCELA_CODE_ENFORCEMENT';
DELETE FROM "source_records" WHERE "sourceName" = 'OMAHA_ACCELA_CODE_ENFORCEMENT';

-- 2. Drop foreign keys added in migration
ALTER TABLE "code_violations" DROP CONSTRAINT IF EXISTS "code_violations_latestSourceRecordId_fkey";
ALTER TABLE "code_violations" DROP CONSTRAINT IF EXISTS "code_violations_propertyId_fkey";

-- 3. Drop added indexes
DROP INDEX IF EXISTS "code_violations_hasDemoOrder_idx";
DROP INDEX IF EXISTS "code_violations_isVacant_idx";
DROP INDEX IF EXISTS "code_violations_matchStatus_idx";
DROP INDEX IF EXISTS "code_violations_enforcementStage_idx";
DROP INDEX IF EXISTS "code_violations_statusCurrentMapped_idx";
DROP INDEX IF EXISTS "code_violations_sourcePin_idx";
DROP INDEX IF EXISTS "code_violations_caseNumber_key";

-- 4. Drop added columns
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "vacateReason";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "updatedAt";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "statusCurrentMapped";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "statusCurrent";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "sourcePin";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "sourceObjectId";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "sourceName";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "sourceGlobalId";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "originalZip";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "originalState";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "originalCity";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "originalAddress";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "openedDate";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "matchStatus";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "latestSourceRecordId";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "lastUpdatedSource";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "lastReInspectionDate";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "isVacant";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "initialInspectionDate";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "hasDemoOrder";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "enforcementStage";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "demoIssuedDate";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "complianceDeadline";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "caseType";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "caseRecordClassMapped";
ALTER TABLE "code_violations" DROP COLUMN IF EXISTS "accelaUrl";

-- 5. Restore original column constraints
ALTER TABLE "code_violations" ALTER COLUMN "propertyId" SET NOT NULL;
ALTER TABLE "code_violations" ALTER COLUMN "violationDate" SET NOT NULL;
ALTER TABLE "code_violations" ALTER COLUMN "violationType" DROP DEFAULT;
ALTER TABLE "code_violations" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "code_violations" ALTER COLUMN "description" DROP DEFAULT;

-- 6. Restore original status index and cascade foreign key
CREATE INDEX "code_violations_status_idx" ON "code_violations"("status");
ALTER TABLE "code_violations" ADD CONSTRAINT "code_violations_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Deregister migration from Prisma migration history
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261014013000_evolve_code_violations_for_accela';
