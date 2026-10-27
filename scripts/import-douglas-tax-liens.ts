import { PrismaClient, Prisma } from '@prisma/client';
import { verifyNeonDevEndpoints, NeonPreflightError } from '../src/lib/neon-preflight';
import { fetchAllTaxLiens } from '../src/lib/ingestion/douglas-tax-lien/arcgis-client';
import { DouglasTaxLienPipeline } from '../src/lib/ingestion/douglas-tax-lien/pipeline';
import { DOUGLAS_TAX_LIEN_CONFIG } from '../src/lib/ingestion/douglas-tax-lien/config';

try {
  process.loadEnvFile('.env');
} catch {}

/**
 * Stage 14B Controlled Douglas County Tax-Lien Importer.
 * 
 * Safety Rules:
 * 1. Strict DEV check: refuses to execute if endpoints diverge or target production.
 * 2. Pre-flight complete source validation: verifies envelope retrieval before initiating writes.
 * 3. Idempotent: safe to run repeatedly; uses deterministic SHA-256 change detection.
 * 4. Preserves unmatched records: never attaches unmatched county PINs to arbitrary properties.
 * 5. Snapshot delta tracking: never treats absence from current snapshot as proof of redemption.
 */
export async function runControlledTaxLienImport(options: { dryRunOnly?: boolean } = {}) {
  console.log('================================================================');
  console.log('   DEALBEACON — CONTROLLED DOUGLAS COUNTY TAX-LIEN IMPORTER     ');
  console.log('================================================================\n');

  // 1. Mandatory Environment Preflight (Refuse production)
  console.log('Step 1: Enforcing strict Neon DEV environment preflight check...');
  try {
    const preflight = verifyNeonDevEndpoints();
    console.log(`   ✔ Neon DEV endpoint verified: ${preflight.expectedEndpointId}`);
    console.log(`   ✔ Target host: ${preflight.pooledHost}`);
    console.log(`   ✔ Database: ${preflight.database}`);
  } catch (err: any) {
    if (err instanceof NeonPreflightError) {
      console.error(`\n❌ PREFLIGHT SAFETY HALT: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  // 2. Query Full Upstream Envelope & Features Before Any Writes
  console.log('\nStep 2: Retrieving full upstream envelope and features from Douglas County GIS...');
  const { envelope, features } = await fetchAllTaxLiens({ pageSize: 200 });
  console.log(`   ✔ Envelope retrieved: minOID=${envelope.minObjectId}, maxOID=${envelope.maxObjectId}, reportedCount=${envelope.totalCount}`);
  console.log(`   ✔ Features retrieved: ${features.length}`);

  if (features.length !== envelope.totalCount) {
    throw new Error(
      `Safety halt: Retrieved feature count (${features.length}) does not reconcile with upstream envelope count (${envelope.totalCount}). Aborting before transaction.`
    );
  }

  if (features.length === 0) {
    throw new Error('Safety halt: Zero features retrieved from DCGIS endpoint. Aborting.');
  }

  const prisma = new PrismaClient();
  let ingestionRun: any = null;

  try {
    // 3. Query Existing Property Inventory
    console.log('\nStep 3: Querying canonical property inventory for exact PIN matching...');
    const devProperties = await prisma.property.findMany({
      select: {
        id: true,
        parcelId: true,
        address: true,
        propertyType: true,
        city: true,
        municipalJurisdiction: true,
      },
    });
    console.log(`   ✔ Canonical properties in inventory: ${devProperties.length}`);

    // 4. Staging & Pipeline Processing
    console.log('\nStep 4: Running Stage 14B staging pipeline...');
    const pipeline = new DouglasTaxLienPipeline({
      existingProperties: devProperties,
    });

    const staged = pipeline.processFeatures(features);
    const report = pipeline.generateDryRunReport(envelope, staged);

    console.log(`   ✔ Staged records: ${staged.length}`);
    console.log(`   ✔ Matched canonical properties: ${report.matchedRecordsCount}`);
    console.log(`   ✔ Unmatched county records: ${report.unmatchedRecordsCount}`);
    console.log(`   ✔ Quarantined records: ${report.quarantinedRecordsCount}`);
    console.log(`   ✔ Total financial sum: ${report.totalLienAmountFormatted}`);

    if (options.dryRunOnly) {
      console.log('\n[DRY RUN MODE] No database writes will be executed.');
      return report;
    }

    // 5. Controlled Execution Guard
    console.log('\nStep 5: Executing controlled atomic database transaction...');
    const runStartTime = new Date();

    // Check if table exists prior to execution
    const tableExistsResult: any = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'tax_lien_records'
      );
    `;
    const tableExists = tableExistsResult?.[0]?.exists;
    if (!tableExists) {
      throw new Error(
        'Database safety halt: Table "tax_lien_records" does not exist in Neon DEV. Apply the prepared additive migration before running this importer.'
      );
    }

    // Create IngestionRun record
    ingestionRun = await prisma.ingestionRun.create({
      data: {
        sourceName: DOUGLAS_TAX_LIEN_CONFIG.sourceName,
        status: 'RUNNING',
        startedAt: runStartTime,
        statsJson: {
          envelopeCount: envelope.totalCount,
          retrievedFeatures: features.length,
          matchedDevProperties: report.matchedRecordsCount,
          unmatchedCount: report.unmatchedRecordsCount,
          totalAmountCents: report.totalLienAmountCents,
        },
      },
    });

    let createdCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    // Execute in batches of 20 with explicit transaction timeout to maintain atomicity over pooled connections
    const batchSize = 20;
    const totalBatches = Math.ceil(staged.length / batchSize);
    for (let i = 0; i < staged.length; i += batchSize) {
      const batchIndex = Math.floor(i / batchSize) + 1;
      const batch = staged.slice(i, i + batchSize);

      await prisma.$transaction(
        async (tx) => {
          // Bulk lookup existing tax liens for this batch
          const batchObjectIds = batch.map((item) => item.normalized.sourceObjectId);
          const existingLiens = await tx.taxLienRecord.findMany({
            where: {
              sourceName: DOUGLAS_TAX_LIEN_CONFIG.sourceName,
              sourceObjectId: { in: batchObjectIds },
            },
          });
          const existingLienMap = new Map(existingLiens.map((l) => [l.sourceObjectId, l]));

          for (const item of batch) {
            if (item.matchStatus === 'QUARANTINED_MALFORMED') continue;

            const sourceRecordId = `TAX_LIEN-${item.normalized.pin}-${item.normalized.sourceObjectId}`;

            // Upsert raw source record
            const sourceRecord = await tx.sourceRecord.upsert({
              where: {
                sourceName_sourceRecordId: {
                  sourceName: DOUGLAS_TAX_LIEN_CONFIG.sourceName,
                  sourceRecordId,
                },
              },
              create: {
                sourceName: DOUGLAS_TAX_LIEN_CONFIG.sourceName,
                sourceRecordId,
                rawPayloadJson: item.normalized.rawPayload as any,
                propertyId: item.matchedPropertyId,
                matchedStatus: item.matchStatus === 'MATCHED_TO_CANONICAL_PROPERTY' ? 'MATCHED' : 'UNMATCHED',
                ingestionRunId: ingestionRun.id,
              },
              update: {
                rawPayloadJson: item.normalized.rawPayload as any,
                propertyId: item.matchedPropertyId,
                matchedStatus: item.matchStatus === 'MATCHED_TO_CANONICAL_PROPERTY' ? 'MATCHED' : 'UNMATCHED',
                ingestedAt: new Date(),
              },
            });

            // Upsert TaxLienRecord using typed Prisma Client
            const existingLien = existingLienMap.get(item.normalized.sourceObjectId);

            if (existingLien) {
              if (existingLien.contentSha256 === item.normalized.contentSha256) {
                // Unchanged content: bump observation timestamp and update latest source record reference
                await tx.taxLienRecord.update({
                  where: { id: existingLien.id },
                  data: {
                    lastObservedAt: new Date(),
                    latestSourceRecordId: sourceRecord.id,
                  },
                });
                unchangedCount++;
              } else {
                // Changed version: update attributes, observation status, and content hash
                await tx.taxLienRecord.update({
                  where: { id: existingLien.id },
                  data: {
                    sourcePin: item.normalized.pin,
                    taxYear: item.normalized.year,
                    amountCents: item.normalized.amountCents,
                    amountFormatted: item.normalized.amountString,
                    situsAddress: item.normalized.situsAddress,
                    countyClass: item.normalized.countyClass,
                    addition: item.normalized.addition,
                    propertyId: item.matchedPropertyId,
                    matchStatus: item.matchStatus,
                    observationStatus: 'PRESENT_IN_CURRENT_SNAPSHOT',
                    lastObservedAt: new Date(),
                    latestSourceRecordId: sourceRecord.id,
                    contentSha256: item.normalized.contentSha256,
                  },
                });
                updatedCount++;
              }
            } else {
              // New record insertion
              await tx.taxLienRecord.create({
                data: {
                  sourceName: DOUGLAS_TAX_LIEN_CONFIG.sourceName,
                  sourceObjectId: item.normalized.sourceObjectId,
                  sourcePin: item.normalized.pin,
                  taxYear: item.normalized.year,
                  amountCents: item.normalized.amountCents,
                  amountFormatted: item.normalized.amountString,
                  situsAddress: item.normalized.situsAddress,
                  countyClass: item.normalized.countyClass,
                  addition: item.normalized.addition,
                  propertyId: item.matchedPropertyId,
                  matchStatus: item.matchStatus,
                  observationStatus: 'PRESENT_IN_CURRENT_SNAPSHOT',
                  firstObservedAt: new Date(),
                  lastObservedAt: new Date(),
                  latestSourceRecordId: sourceRecord.id,
                  contentSha256: item.normalized.contentSha256,
                },
              });
              createdCount++;
            }
          }
        },
        {
          maxWait: 15000,
          timeout: 60000,
        }
      );
      console.log(`[TAX-LIEN IMPORT] Committed batch ${batchIndex} of ${totalBatches} (${Math.min(i + batchSize, staged.length)} / ${staged.length} records)`);
    }

    // Mark IngestionRun as SUCCESS
    await prisma.ingestionRun.update({
      where: { id: ingestionRun.id },
      data: {
        status: 'SUCCESS',
        completedAt: new Date(),
        recordsIngested: createdCount + updatedCount + unchangedCount,
        statsJson: {
          createdCount,
          updatedCount,
          unchangedCount,
          envelopeTotal: envelope.totalCount,
        },
      },
    });

    console.log('\n================================================================');
    console.log('             CONTROLLED IMPORT COMPLETED SUCCESSFULLY           ');
    console.log('================================================================');
    console.log(`Created Records:    ${createdCount}`);
    console.log(`Updated Records:    ${updatedCount}`);
    console.log(`Unchanged Records:  ${unchangedCount}`);
    console.log(`Run Status:         SUCCESS`);
    console.log('================================================================');

    } catch (runError: any) {
      // Record FAILED status on IngestionRun if created
      if (ingestionRun) {
        await prisma.ingestionRun.update({
          where: { id: ingestionRun.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errorsJson: {
              message: runError.message,
              stack: runError.stack,
            },
          },
        }).catch(() => {});
      }
      throw runError;
    } finally {
      await prisma.$disconnect();
    }
}

// CLI entry point
if (require.main === module) {
  runControlledTaxLienImport().catch((err) => {
    console.error('\n❌ IMPORT EXECUTION FAILED:', err);
    process.exit(1);
  });
}
