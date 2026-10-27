import { Prisma } from '@prisma/client';

/**
 * 5 Known disputed Hotline request IDs where a citizen reported an off-site civic facility
 * (City Park or Community Center) using their private residential home address.
 * Strictly suppressed from investor condition summaries and distress indicators.
 */
export const DISPUTED_HOTLINE_REQUEST_IDS = new Set<string>([
  '629895',
  '633233',
  '633453',
  '649603',
  '649798',
]);

export type HotlineInvestorRelevance =
  | 'POTENTIAL_PROPERTY_CONDITION'
  | 'CONTEXT_ONLY'
  | 'PUBLIC_SERVICE_OR_INFRASTRUCTURE'
  | 'UNKNOWN';

export interface HotlineReportClassificationInput {
  requestId?: string | null;
  reportCategory?: string | null;
  problemType?: string | null;
  matchAuditJson?: any;
}

/**
 * Shared classification function implementing DealBeacon's durable, explainable
 * two-dimensional classification policy for Hotline reports.
 *
 * Rules:
 * 1. Disputed Associations: Excluded from condition signals; categorized as PUBLIC_SERVICE_OR_INFRASTRUCTURE.
 * 2. Explicit investorRelevance in matchAuditJson is authoritative:
 *    - CONTEXT_ONLY -> CONTEXT_ONLY
 *    - PUBLIC_SERVICE_OR_INFRASTRUCTURE -> PUBLIC_SERVICE_OR_INFRASTRUCTURE
 *    - POTENTIAL_PROPERTY_CONDITION -> POTENTIAL_PROPERTY_CONDITION
 *    - UNKNOWN -> UNKNOWN (never automatically treated as condition)
 * 3. Backward-compatible mapping for older records without stored investorRelevance:
 *    - Animal Control -> CONTEXT_ONLY
 *    - Parks_Trees_Weeds with problemType containing 'park' or 'community center' -> PUBLIC_SERVICE_OR_INFRASTRUCTURE
 *    - Physical condition categories (Litter_Waste_Recycling, Graffiti, Code/Housing Violati, non-civic Parks_Trees_Weeds) -> POTENTIAL_PROPERTY_CONDITION
 *    - All others (e.g. Public_Health, Traffic, etc.) -> UNKNOWN
 * 4. Location association never implies verified violation, owner responsibility, or current distress.
 */
export function classifyHotlineInvestorRelevance(
  report: HotlineReportClassificationInput
): HotlineInvestorRelevance {
  const isDisputed = Boolean(report.requestId && DISPUTED_HOTLINE_REQUEST_IDS.has(report.requestId));
  if (isDisputed) {
    return 'PUBLIC_SERVICE_OR_INFRASTRUCTURE';
  }

  const audit = (report.matchAuditJson as Record<string, any>) || {};
  const storedRelevance: HotlineInvestorRelevance | undefined = audit.investorRelevance;

  if (storedRelevance) {
    return storedRelevance;
  }

  // Conservative backward-compatibility for older linked reports without stored investorRelevance
  const category = report.reportCategory || '';
  const problem = (report.problemType || '').toLowerCase();

  if (category === 'Animal Control') {
    return 'CONTEXT_ONLY';
  }

  if (
    category === 'Parks_Trees_Weeds' &&
    (problem.includes('park') || problem.includes('community center'))
  ) {
    return 'PUBLIC_SERVICE_OR_INFRASTRUCTURE';
  }

  if (
    category === 'Litter_Waste_Recycling' ||
    category === 'Parks_Trees_Weeds' ||
    category === 'Graffiti' ||
    category === 'Code/Housing Violati'
  ) {
    return 'POTENTIAL_PROPERTY_CONDITION';
  }

  return 'UNKNOWN';
}

/**
 * Generates the Prisma WHERE condition for matching properties that have at least one
 * qualifying POTENTIAL_PROPERTY_CONDITION Hotline complaint.
 *
 * Strictly aligned with classifyHotlineInvestorRelevance.
 */
export function buildConditionComplaintPrismaWhere(): Prisma.HotlineReportWhereInput {
  const disputedArray = Array.from(DISPUTED_HOTLINE_REQUEST_IDS);

  return {
    AND: [
      // 1. Exclude all 5 disputed residential associations
      { requestId: { notIn: disputedArray } },
      // 2. Either explicitly classified as POTENTIAL_PROPERTY_CONDITION,
      //    or an older record matching recognized condition categories
      {
        OR: [
          {
            matchAuditJson: {
              path: ['investorRelevance'],
              equals: 'POTENTIAL_PROPERTY_CONDITION',
            },
          },
          {
            reportCategory: {
              in: [
                'Litter_Waste_Recycling',
                'Graffiti',
                'Code/Housing Violati',
              ],
            },
          },
          {
            AND: [
              { reportCategory: 'Parks_Trees_Weeds' },
              {
                NOT: {
                  OR: [
                    { problemType: { contains: 'park', mode: 'insensitive' } },
                    { problemType: { contains: 'community center', mode: 'insensitive' } },
                  ],
                },
              },
            ],
          },
        ],
      },
      // 3. Global safety: Exclude context-only, public health, and explicit non-condition
      {
        reportCategory: {
          notIn: ['Animal Control', 'Public_Health'],
        },
      },
    ],
  };
}
