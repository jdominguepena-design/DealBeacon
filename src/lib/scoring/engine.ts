import { SCORING_CONFIG } from './scoring.config';
import {
  ConfidenceLevel,
  ScoreFactor,
  TaxRecordDTO,
  CodeViolationDTO,
  OwnershipRecordDTO,
  SignalDTO,
} from '@/types';

export interface PropertyScoreContext {
  ownership?: OwnershipRecordDTO | null;
  taxRecords?: TaxRecordDTO[];
  codeViolations?: CodeViolationDTO[];
  signals?: SignalDTO[];
  referenceDate?: Date;
}

export interface ScoreCalculationResult {
  totalScore: number;
  dataConfidence: ConfidenceLevel;
  breakdown: ScoreFactor[];
  categoryTotals: {
    financial: number;
    property: number;
    ownership: number;
    recency: number;
    compound: number;
  };
}

export function calculateOpportunityScore(
  context: PropertyScoreContext
): ScoreCalculationResult {
  const refDate = context.referenceDate || new Date();
  const breakdown: ScoreFactor[] = [];

  let financialPoints = 0;
  let propertyPoints = 0;
  let ownershipPoints = 0;
  let recencyPoints = 0;
  let compoundPoints = 0;

  // 1. FINANCIAL DISTRESS RULES (Max 35 pts)
  const taxRecords = context.taxRecords || [];
  const delinquentRecords = taxRecords.filter((t) => t.isDelinquent);
  const totalDelinquentAmount = delinquentRecords.reduce(
    (sum, t) => sum + (t.amountDelinquent || 0),
    0
  );
  const maxDelinquentYears = delinquentRecords.reduce(
    (max, t) => Math.max(max, t.delinquentYears || (t.isDelinquent ? 1 : 0)),
    0
  );

  const cfgFin = SCORING_CONFIG.categories.FINANCIAL_DISTRESS;
  if (maxDelinquentYears >= 2) {
    const r = cfgFin.rules.TAX_DELINQUENT_MULTI_YEAR;
    financialPoints += r.points;
    breakdown.push({
      ruleId: r.id,
      category: r.category,
      label: r.label,
      points: r.points,
      description: r.description,
    });
  } else if (maxDelinquentYears === 1 || delinquentRecords.length > 0) {
    const r = cfgFin.rules.TAX_DELINQUENT_SINGLE_YEAR;
    financialPoints += r.points;
    breakdown.push({
      ruleId: r.id,
      category: r.category,
      label: r.label,
      points: r.points,
      description: r.description,
    });
  }

  if (totalDelinquentAmount >= (cfgFin.rules.HIGH_DELINQUENT_BALANCE.threshold || 3000)) {
    const r = cfgFin.rules.HIGH_DELINQUENT_BALANCE;
    financialPoints += r.points;
    breakdown.push({
      ruleId: r.id,
      category: r.category,
      label: `${r.label} ($${totalDelinquentAmount.toLocaleString()})`,
      points: r.points,
      description: r.description,
    });
  }
  financialPoints = Math.min(financialPoints, cfgFin.maxPoints);

  // 2. PROPERTY DISTRESS RULES (Max 35 pts)
  const violations = context.codeViolations || [];
  const openViolations = violations.filter(
    (v) => v.status !== 'RESOLVED' && v.status !== 'CLOSED'
  );
  const cfgProp = SCORING_CONFIG.categories.PROPERTY_DISTRESS;

  const hasStructural = openViolations.some(
    (v) =>
      v.violationType === 'STRUCTURAL' ||
      v.violationType === 'VACANT_UNSECURED' ||
      v.status === 'CONDEMNED' ||
      v.severity === 'CRITICAL'
  );

  const hasExterior = openViolations.some(
    (v) =>
      v.violationType === 'EXTERIOR_MAINTENANCE' ||
      v.violationType === 'TRASH_DEBRIS' ||
      v.violationType === 'TALL_WEEDS'
  );

  if (hasStructural) {
    const r = cfgProp.rules.CODE_VIOLATION_STRUCTURAL;
    propertyPoints += r.points;
    breakdown.push({
      ruleId: r.id,
      category: r.category,
      label: r.label,
      points: r.points,
      description: r.description,
    });
  } else if (hasExterior) {
    const r = cfgProp.rules.CODE_VIOLATION_EXTERIOR;
    propertyPoints += r.points;
    breakdown.push({
      ruleId: r.id,
      category: r.category,
      label: r.label,
      points: r.points,
      description: r.description,
    });
  }

  if (violations.length >= 2) {
    const r = cfgProp.rules.CODE_VIOLATION_REPEAT;
    propertyPoints += r.points;
    breakdown.push({
      ruleId: r.id,
      category: r.category,
      label: `${r.label} (${violations.length} total cases)`,
      points: r.points,
      description: r.description,
    });
  }

  const signals = context.signals || [];
  const hasVacancySignal = signals.some((s) => s.signalType === 'VACANCY_INDICATOR');
  if (hasVacancySignal) {
    const r = cfgProp.rules.VACANCY_INDICATOR;
    propertyPoints += r.points;
    breakdown.push({
      ruleId: r.id,
      category: r.category,
      label: r.label,
      points: r.points,
      description: r.description,
    });
  }
  propertyPoints = Math.min(propertyPoints, cfgProp.maxPoints);

  // 3. OWNERSHIP SIGNALS (Max 25 pts)
  const ownership = context.ownership;
  const cfgOwn = SCORING_CONFIG.categories.OWNERSHIP_SIGNALS;

  if (ownership?.isOutOfState) {
    const r = cfgOwn.rules.ABSENTEE_OUT_OF_STATE;
    ownershipPoints += r.points;
    breakdown.push({
      ruleId: r.id,
      category: r.category,
      label: `${r.label} [${ownership.mailingState || 'Out-of-State'}]`,
      points: r.points,
      description: r.description,
    });
  } else if (ownership?.isAbsentee) {
    const r = cfgOwn.rules.ABSENTEE_IN_STATE;
    ownershipPoints += r.points;
    breakdown.push({
      ruleId: r.id,
      category: r.category,
      label: `${r.label} [${ownership.mailingCity || 'In-State'}]`,
      points: r.points,
      description: r.description,
    });
  }

  const tenureYears = ownership?.ownershipYears || 0;
  if (tenureYears >= (cfgOwn.rules.LONG_TERM_OWNERSHIP.thresholdYears || 15)) {
    const r = cfgOwn.rules.LONG_TERM_OWNERSHIP;
    ownershipPoints += r.points;
    breakdown.push({
      ruleId: r.id,
      category: r.category,
      label: `${r.label} (${Math.round(tenureYears)} yrs)`,
      points: r.points,
      description: r.description,
    });
  } else if (tenureYears >= (cfgOwn.rules.MEDIUM_TERM_OWNERSHIP.thresholdYears || 8)) {
    const r = cfgOwn.rules.MEDIUM_TERM_OWNERSHIP;
    ownershipPoints += r.points;
    breakdown.push({
      ruleId: r.id,
      category: r.category,
      label: `${r.label} (${Math.round(tenureYears)} yrs)`,
      points: r.points,
      description: r.description,
    });
  }
  ownershipPoints = Math.min(ownershipPoints, cfgOwn.maxPoints);

  // 4. RECENCY BONUS (Max 10 pts)
  const cfgRec = SCORING_CONFIG.categories.RECENCY_BONUS;
  let newestEventDays: number | null = null;

  for (const s of signals) {
    const eventTime = new Date(s.eventDate).getTime();
    if (!isNaN(eventTime)) {
      const daysAgo = Math.max(0, Math.floor((refDate.getTime() - eventTime) / (1000 * 60 * 60 * 24)));
      if (newestEventDays === null || daysAgo < newestEventDays) {
        newestEventDays = daysAgo;
      }
    }
  }

  if (newestEventDays !== null) {
    if (newestEventDays <= 30) {
      const r = cfgRec.rules.SIGNAL_UNDER_30_DAYS;
      recencyPoints += r.points;
      breakdown.push({
        ruleId: r.id,
        category: r.category,
        label: `${r.label} (${newestEventDays} days ago)`,
        points: r.points,
        description: r.description,
      });
    } else if (newestEventDays <= 90) {
      const r = cfgRec.rules.SIGNAL_UNDER_90_DAYS;
      recencyPoints += r.points;
      breakdown.push({
        ruleId: r.id,
        category: r.category,
        label: `${r.label} (${newestEventDays} days ago)`,
        points: r.points,
        description: r.description,
      });
    }
  }
  recencyPoints = Math.min(recencyPoints, cfgRec.maxPoints);

  // 5. COMPOUND BONUS (10 pts)
  const activeCategoriesCount = [
    financialPoints > 0,
    propertyPoints > 0,
    ownershipPoints > 0,
  ].filter(Boolean).length;

  const cfgCompound = SCORING_CONFIG.categories.COMPOUND_BONUS;
  if (activeCategoriesCount >= cfgCompound.minDistinctCategories) {
    compoundPoints = cfgCompound.points;
    breakdown.push({
      ruleId: cfgCompound.rule.id,
      category: cfgCompound.rule.category,
      label: cfgCompound.rule.label,
      points: cfgCompound.rule.points,
      description: cfgCompound.rule.description,
    });
  }

  // Calculate Raw Total and clamp
  const rawTotal =
    financialPoints + propertyPoints + ownershipPoints + recencyPoints + compoundPoints;
  const totalScore = Math.min(Math.max(rawTotal, 0), SCORING_CONFIG.maxScore);

  // Calculate Data Confidence
  const dataConfidence = calculateConfidenceLevel(context);

  return {
    totalScore,
    dataConfidence,
    breakdown,
    categoryTotals: {
      financial: financialPoints,
      property: propertyPoints,
      ownership: ownershipPoints,
      recency: recencyPoints,
      compound: compoundPoints,
    },
  };
}

export function calculateConfidenceLevel(context: PropertyScoreContext): ConfidenceLevel {
  let score = 0;

  // Has verified ownership record
  if (context.ownership?.ownerName) score += 2;
  // Has official tax record
  if (context.taxRecords && context.taxRecords.length > 0) score += 2;
  // Has multiple signals or recent verification
  if (context.signals && context.signals.length >= 2) score += 2;
  // Has code violation records or clear absence of violation
  if (context.codeViolations && context.codeViolations.length > 0) score += 1;

  if (score >= 6) return 'HIGH';
  if (score >= 3) return 'MEDIUM';
  return 'LOW';
}
