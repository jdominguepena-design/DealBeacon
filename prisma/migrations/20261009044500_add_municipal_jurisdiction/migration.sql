-- CreateEnum
CREATE TYPE "MunicipalJurisdiction" AS ENUM ('INSIDE_OMAHA', 'OUTSIDE_OMAHA', 'CROSSES_BOUNDARY', 'UNRESOLVED');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN "municipalJurisdiction" "MunicipalJurisdiction" NOT NULL DEFAULT 'UNRESOLVED';

-- CreateIndex
CREATE INDEX "properties_municipalJurisdiction_idx" ON "properties"("municipalJurisdiction");
