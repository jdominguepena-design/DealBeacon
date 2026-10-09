import { BaseSourceAdapter, NormalizedParcelMatch } from './base-adapter';
import { SignalDTO } from '@/types';
import { SCORING_CONFIG } from '../scoring/scoring.config';

export interface SyntheticOmahaCodeViolationRecord {
  id: string;
  parcelPin: string;
  address: string;
  caseNumber: string;
  openedDate: string;
  violationCategory: string; // EXTERIOR_MAINTENANCE, STRUCTURAL, TRASH_DEBRIS, TALL_WEEDS, VACANT_UNSECURED
  statusCode: string; // OPEN, NOTICE_ISSUED, PENDING_HEARING, CONDEMNED, RESOLVED
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  inspectorNotes: string | null;
}

export class SyntheticOmahaCodeAdapter extends BaseSourceAdapter<SyntheticOmahaCodeViolationRecord> {
  readonly sourceName = 'CITY_OMAHA_CODE_ENFORCEMENT';

  matchParcel(raw: SyntheticOmahaCodeViolationRecord): NormalizedParcelMatch | null {
    if (!raw.parcelPin) return null;
    return {
      parcelId: raw.parcelPin.trim().replace(/[^0-9]/g, ''),
      normalizedAddress: raw.address.trim().toUpperCase(),
    };
  }

  extractSignals(
    raw: SyntheticOmahaCodeViolationRecord,
    sourceRecordId: string,
    propertyId: string
  ): SignalDTO[] {
    const signals: SignalDTO[] = [];
    if (raw.statusCode === 'RESOLVED' || raw.statusCode === 'CLOSED') return signals;

    const cfgProp = SCORING_CONFIG.categories.PROPERTY_DISTRESS;

    const isStructural =
      raw.violationCategory === 'STRUCTURAL' ||
      raw.violationCategory === 'VACANT_UNSECURED' ||
      raw.statusCode === 'CONDEMNED' ||
      raw.severity === 'CRITICAL';

    const rule = isStructural
      ? cfgProp.rules.CODE_VIOLATION_STRUCTURAL
      : cfgProp.rules.CODE_VIOLATION_EXTERIOR;

    signals.push({
      id: `sig-code-${raw.id}`,
      propertyId,
      signalType: isStructural ? 'STRUCTURAL_CODE_VIOLATION' : 'EXTERIOR_CODE_VIOLATION',
      category: 'PROPERTY_DISTRESS',
      scoreContribution: rule.points,
      severity: isStructural ? 'CRITICAL' : 'HIGH',
      eventDate: raw.openedDate,
      discoveredAt: new Date().toISOString(),
      status: 'ACTIVE',
      sourceType: this.sourceName,
      sourceRecordId,
      metadataJson: {
        caseNumber: raw.caseNumber,
        category: raw.violationCategory,
        status: raw.statusCode,
        description: raw.description,
      },
    });

    if (raw.violationCategory === 'VACANT_UNSECURED') {
      signals.push({
        id: `sig-vacant-${raw.id}`,
        propertyId,
        signalType: 'VACANCY_INDICATOR',
        category: 'PROPERTY_DISTRESS',
        scoreContribution: cfgProp.rules.VACANCY_INDICATOR.points,
        severity: 'HIGH',
        eventDate: raw.openedDate,
        discoveredAt: new Date().toISOString(),
        status: 'ACTIVE',
        sourceType: this.sourceName,
        sourceRecordId,
        metadataJson: {
          caseNumber: raw.caseNumber,
          notes: raw.inspectorNotes,
        },
      });
    }

    return signals;
  }
}
