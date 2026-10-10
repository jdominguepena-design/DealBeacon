import { MunicipalJurisdiction } from '@prisma/client';

export class IneligibleJurisdictionError extends Error {
  constructor(message: string = 'Property is not eligible for investor actions (outside Omaha municipal boundary)') {
    super(message);
    this.name = 'IneligibleJurisdictionError';
  }
}

/**
 * Authoritative predicate defining whether a property is eligible for investor workflows.
 * Strict fail-closed policy:
 * - 'INSIDE_OMAHA': Eligible (returns true)
 * - 'OUTSIDE_OMAHA': Ineligible (returns false)
 * - 'CROSSES_BOUNDARY': Ineligible (returns false)
 * - 'UNRESOLVED': Ineligible (returns false)
 * - null / undefined / missing: Ineligible (returns false)
 */
export function isInvestorEligible(
  property: { municipalJurisdiction?: MunicipalJurisdiction | string | null } | null | undefined
): boolean {
  if (!property || !property.municipalJurisdiction) {
    return false;
  }
  return property.municipalJurisdiction === 'INSIDE_OMAHA';
}

/**
 * Standard Prisma WHERE clause for investor-eligible property queries.
 * Excludes all non-Omaha and unresolved properties by construction.
 */
export const INVESTOR_ELIGIBLE_WHERE = {
  municipalJurisdiction: 'INSIDE_OMAHA' as const,
};

/**
 * Filters an in-memory or queried array of properties, keeping only investor-eligible records.
 */
export function filterInvestorEligible<
  T extends { municipalJurisdiction?: MunicipalJurisdiction | string | null }
>(items: T[]): T[] {
  return items.filter(isInvestorEligible);
}

/**
 * Guard predicate for opportunity scoring recalculation pipelines.
 * Scoring must strictly refuse or score zero for ineligible records.
 */
export function canScoreProperty(
  property: { municipalJurisdiction?: MunicipalJurisdiction | string | null } | null | undefined
): boolean {
  return isInvestorEligible(property);
}

/**
 * Asserts that a property is investor-eligible, throwing an IneligibleJurisdictionError if not.
 */
export function assertInvestorEligible(
  property: { municipalJurisdiction?: MunicipalJurisdiction | string | null } | null | undefined
): void {
  if (!isInvestorEligible(property)) {
    throw new IneligibleJurisdictionError(
      `Property jurisdiction "${property?.municipalJurisdiction ?? 'NULL'}" is not investor-eligible.`
    );
  }
}
