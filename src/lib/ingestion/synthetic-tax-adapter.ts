import { BaseSourceAdapter, NormalizedParcelMatch } from './base-adapter';
import { SignalDTO } from '@/types';
import { SCORING_CONFIG } from '../scoring/scoring.config';

export interface SyntheticDouglasTaxRecord {
  id: string;
  pin: string;
  situsAddress: string;
  taxYear: number;
  assessedValue: number;
  totalTax: number;
  delinquentAmount: number;
  yearsDelinquent: number;
  taxSaleStatus: string | null;
  recordedDate: string;
}

export class SyntheticDouglasTaxAdapter extends BaseSourceAdapter<SyntheticDouglasTaxRecord> {
  readonly sourceName = 'DOUGLAS_COUNTY_TREASURER';

  matchParcel(raw: SyntheticDouglasTaxRecord): NormalizedParcelMatch | null {
    if (!raw.pin) return null;
    return {
      parcelId: raw.pin.trim().replace(/[^0-9]/g, ''),
      normalizedAddress: raw.situsAddress.trim().toUpperCase(),
    };
  }

  extractSignals(
    raw: SyntheticDouglasTaxRecord,
    sourceRecordId: string,
    propertyId: string
  ): SignalDTO[] {
    const signals: SignalDTO[] = [];
    if (raw.delinquentAmount <= 0) return signals;

    const cfgFin = SCORING_CONFIG.categories.FINANCIAL_DISTRESS;

    // 1. Tax Delinquent Signal
    const isMultiYear = raw.yearsDelinquent >= 2;
    const rule = isMultiYear
      ? cfgFin.rules.TAX_DELINQUENT_MULTI_YEAR
      : cfgFin.rules.TAX_DELINQUENT_SINGLE_YEAR;

    signals.push({
      id: `sig-tax-${raw.id}`,
      propertyId,
      signalType: 'TAX_DELINQUENT',
      category: 'FINANCIAL_DISTRESS',
      scoreContribution: rule.points,
      severity: isMultiYear ? 'CRITICAL' : 'HIGH',
      eventDate: raw.recordedDate,
      discoveredAt: new Date().toISOString(),
      status: 'ACTIVE',
      sourceType: this.sourceName,
      sourceRecordId,
      metadataJson: {
        taxYear: raw.taxYear,
        delinquentAmount: raw.delinquentAmount,
        yearsDelinquent: raw.yearsDelinquent,
        taxSaleStatus: raw.taxSaleStatus,
      },
    });

    // 2. High Balance Signal if exceeds threshold
    if (raw.delinquentAmount >= (cfgFin.rules.HIGH_DELINQUENT_BALANCE.threshold || 3000)) {
      signals.push({
        id: `sig-tax-bal-${raw.id}`,
        propertyId,
        signalType: 'HIGH_DELINQUENT_BALANCE',
        category: 'FINANCIAL_DISTRESS',
        scoreContribution: cfgFin.rules.HIGH_DELINQUENT_BALANCE.points,
        severity: 'HIGH',
        eventDate: raw.recordedDate,
        discoveredAt: new Date().toISOString(),
        status: 'ACTIVE',
        sourceType: this.sourceName,
        sourceRecordId,
        metadataJson: {
          delinquentAmount: raw.delinquentAmount,
          threshold: cfgFin.rules.HIGH_DELINQUENT_BALANCE.threshold,
        },
      });
    }

    return signals;
  }
}
