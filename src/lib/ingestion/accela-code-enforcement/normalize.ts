import { AccelaRawFeature, EnforcementStage } from './types';

export function classifyEnforcementStage(
  statusCurrentMapped?: string,
  statusCurrent?: string
): EnforcementStage {
  const mapped = (statusCurrentMapped || '').trim().toLowerCase();
  const raw = (statusCurrent || '').trim().toLowerCase();

  // 1. Legal citation issued
  if (mapped === 'citation issued' || raw.includes('citation')) {
    return 'ACTIVE_LEGAL_CITATION';
  }

  // 2. Closed with no violation verified / unfounded (check before generic violation check)
  if (raw.includes('no violation') || raw.includes('unfounded')) {
    return 'CLOSED_UNFOUNDED';
  }

  // 3. Active confirmed violation
  if (
    mapped === 'active violation' ||
    raw === 'in violation' ||
    raw === 'in violation/notices to be sent' ||
    raw.includes('violation')
  ) {
    return 'ACTIVE_CONFIRMED_VIOLATION';
  }

  // 4. Inspection scheduled or pending review
  if (
    mapped === 'inspection scheduled' ||
    raw.includes('scheduled') ||
    raw.includes('awaiting') ||
    raw.includes('review')
  ) {
    return 'INSPECTION_PENDING';
  }

  // 5. Closed complied
  if (raw.includes('complied') || raw.includes('compliance')) {
    return 'CLOSED_COMPLIED';
  }

  // 6. Generic closed or historical dismissal
  if (
    mapped === 'closed' ||
    mapped === 'citation record closed' ||
    raw.includes('closed') ||
    raw.includes('dismissed') ||
    raw.includes('void')
  ) {
    return 'CLOSED_HISTORICAL';
  }

  return 'UNKNOWN_STAGE';
}

export function parseAccelaDate(val?: number | string | null): Date | null {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number') {
    if (val <= 0) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  const parsedInt = parseInt(val, 10);
  if (!isNaN(parsedInt) && String(parsedInt) === String(val).trim()) {
    if (parsedInt <= 0) return null;
    const d = new Date(parsedInt);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}
