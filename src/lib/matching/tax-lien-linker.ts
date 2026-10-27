import { PrismaClient, Prisma } from '@prisma/client';

export interface EvaluatedTaxLienDetail {
  id: string;
  sourcePin: string;
  beforePropertyId: string | null;
  beforeMatchStatus: string;
  afterPropertyId: string | null;
  afterMatchStatus: string;
  matchedParcelPin: string | null;
  status: 'LINKED' | 'ALREADY_MATCHED' | 'UNMATCHED' | 'AMBIGUOUS_QUARANTINED';
}

export interface TaxLienLinkResult {
  totalEvaluated: number;
  linkedCount: number;
  alreadyMatchedCount: number;
  unmatchedCount: number;
  ambiguousQuarantinedCount: number;
  evaluatedRecords: EvaluatedTaxLienDetail[];
  errors: string[];
}

export interface TaxLienLinkOptions {
  batchSize?: number;
  dryRun?: boolean;
  limit?: number;
  targetIds?: string[];
}

/**
 * Conservative, idempotent exact-PIN Tax-Lien Linker.
 *
 * Rules:
 * 1. Links strictly on 100% exact 10-digit PIN match against canonical Property.parcelId.
 * 2. Unambiguous 1:1 match only: If multiple properties match the same PIN, links are refused
 *    and the lien remains quarantined or unmatched.
 * 3. Never mutates Property attributes, Opportunity Scores, or Ownership records.
 * 4. A tax lien is strictly an in-rem encumbrance on real property, not personal owner debt.
 * 5. Uses exact Prisma enum values: TaxLienMatchState ('MATCHED_TO_CANONICAL_PROPERTY', 'UNMATCHED_COUNTY_PIN', 'QUARANTINED_MALFORMED').
 */
export async function linkUnmatchedTaxLiens(
  prisma: PrismaClient | Prisma.TransactionClient,
  options: TaxLienLinkOptions = {}
): Promise<TaxLienLinkResult> {
  const { batchSize = 100, dryRun = false, limit, targetIds } = options;

  const result: TaxLienLinkResult = {
    totalEvaluated: 0,
    linkedCount: 0,
    alreadyMatchedCount: 0,
    unmatchedCount: 0,
    ambiguousQuarantinedCount: 0,
    evaluatedRecords: [],
    errors: [],
  };

  // Find candidate tax liens. If targetIds specified, strictly filter by targetIds.
  const whereClause: Prisma.TaxLienRecordWhereInput = targetIds && targetIds.length > 0
    ? { id: { in: targetIds } }
    : {
        OR: [
          { matchStatus: 'UNMATCHED_COUNTY_PIN' },
          { propertyId: null },
        ],
      };

  const candidateLiens = await prisma.taxLienRecord.findMany({
    where: whereClause,
    orderBy: { id: 'asc' },
    take: limit,
    select: {
      id: true,
      sourcePin: true,
      propertyId: true,
      matchStatus: true,
    },
  });

  result.totalEvaluated = candidateLiens.length;
  if (candidateLiens.length === 0) {
    return result;
  }

  const uniquePins = [...new Set(candidateLiens.map((l) => l.sourcePin))];

  // Batch query properties matching these PINs
  const properties = await prisma.property.findMany({
    where: {
      parcelId: { in: uniquePins },
    },
    select: {
      id: true,
      parcelId: true,
      municipalJurisdiction: true,
    },
  });

  // Group properties by parcelId to detect duplicate / ambiguous properties
  const pinToProperties = new Map<string, typeof properties>();
  for (const p of properties) {
    const list = pinToProperties.get(p.parcelId) || [];
    list.push(p);
    pinToProperties.set(p.parcelId, list);
  }

  // Evaluate each lien
  for (const lien of candidateLiens) {
    const matchingProps = pinToProperties.get(lien.sourcePin) || [];

    if (matchingProps.length === 0) {
      // Still unmatched in canonical properties
      result.unmatchedCount++;
      result.evaluatedRecords.push({
        id: lien.id,
        sourcePin: lien.sourcePin,
        beforePropertyId: lien.propertyId,
        beforeMatchStatus: lien.matchStatus,
        afterPropertyId: lien.propertyId,
        afterMatchStatus: lien.matchStatus,
        matchedParcelPin: null,
        status: 'UNMATCHED',
      });
      continue;
    }

    if (matchingProps.length > 1) {
      // Ambiguous multiple properties with same PIN -> fail closed!
      result.ambiguousQuarantinedCount++;
      result.errors.push(
        `Ambiguity for PIN ${lien.sourcePin}: matched ${matchingProps.length} properties. Quarantined without linking.`
      );
      if (!dryRun) {
        await prisma.taxLienRecord.update({
          where: { id: lien.id },
          data: {
            matchStatus: 'QUARANTINED_MALFORMED',
            propertyId: null,
          },
        });
      }
      result.evaluatedRecords.push({
        id: lien.id,
        sourcePin: lien.sourcePin,
        beforePropertyId: lien.propertyId,
        beforeMatchStatus: lien.matchStatus,
        afterPropertyId: null,
        afterMatchStatus: 'QUARANTINED_MALFORMED',
        matchedParcelPin: null,
        status: 'AMBIGUOUS_QUARANTINED',
      });
      continue;
    }

    // Exactly 1 matching property
    const prop = matchingProps[0];
    if (lien.propertyId === prop.id && lien.matchStatus === 'MATCHED_TO_CANONICAL_PROPERTY') {
      result.alreadyMatchedCount++;
      result.evaluatedRecords.push({
        id: lien.id,
        sourcePin: lien.sourcePin,
        beforePropertyId: lien.propertyId,
        beforeMatchStatus: lien.matchStatus,
        afterPropertyId: prop.id,
        afterMatchStatus: 'MATCHED_TO_CANONICAL_PROPERTY',
        matchedParcelPin: prop.parcelId,
        status: 'ALREADY_MATCHED',
      });
      continue;
    }

    if (!dryRun) {
      await prisma.taxLienRecord.update({
        where: { id: lien.id },
        data: {
          propertyId: prop.id,
          matchStatus: 'MATCHED_TO_CANONICAL_PROPERTY',
          lastObservedAt: new Date(),
        },
      });
    }
    result.linkedCount++;
    result.evaluatedRecords.push({
      id: lien.id,
      sourcePin: lien.sourcePin,
      beforePropertyId: lien.propertyId,
      beforeMatchStatus: lien.matchStatus,
      afterPropertyId: prop.id,
      afterMatchStatus: 'MATCHED_TO_CANONICAL_PROPERTY',
      matchedParcelPin: prop.parcelId,
      status: 'LINKED',
    });
  }

  return result;
}
