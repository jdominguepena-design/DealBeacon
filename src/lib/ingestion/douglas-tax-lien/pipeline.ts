import { normalizeTaxLienFeature } from './normalize';
import {
  DouglasTaxLienEnvelope,
  DouglasTaxLienFeature,
  DryRunTaxLienIngestionReport,
  TaxLienMatchStatus,
  TaxLienObservationStatus,
  TaxLienStagingRecord,
} from './types';

export interface PropertyMatchTarget {
  id: string;
  parcelId: string;
  address: string;
  propertyType: string;
  city: string;
  municipalJurisdiction?: 'INSIDE_OMAHA' | 'OUTSIDE_OMAHA' | 'CROSSES_BOUNDARY' | 'UNRESOLVED';
}

export interface StagingPipelineOptions {
  existingProperties?: PropertyMatchTarget[];
  /**
   * Optional authoritative geometric classifier (e.g. classifyParcelMunicipalJurisdiction)
   * that executes full polygon-in-boundary tests rather than bounding box heuristics.
   */
  authoritativeBoundaryClassifier?: (rings: number[][][]) => 'INSIDE_OMAHA' | 'OUTSIDE_OMAHA' | 'CROSSES_BOUNDARY' | 'UNRESOLVED';
}

/**
 * Pure, in-memory pipeline for Douglas County tax-lien ingestion.
 * Performs normalization, exact PIN matching, authoritative municipal classification,
 * observation state transitions, and dry-run report generation.
 * Zero database writes.
 */
export class DouglasTaxLienPipeline {
  private propertyByPin: Map<string, PropertyMatchTarget>;
  private boundaryClassifier?: (rings: number[][][]) => 'INSIDE_OMAHA' | 'OUTSIDE_OMAHA' | 'CROSSES_BOUNDARY' | 'UNRESOLVED';

  constructor(options: StagingPipelineOptions = {}) {
    this.propertyByPin = new Map();
    if (options.existingProperties) {
      for (const prop of options.existingProperties) {
        if (prop.parcelId) {
          this.propertyByPin.set(prop.parcelId.trim(), prop);
        }
      }
    }
    this.boundaryClassifier = options.authoritativeBoundaryClassifier;
  }

  /**
   * Processes a collection of raw ArcGIS features into validated staging records.
   */
  public processFeatures(features: DouglasTaxLienFeature[]): TaxLienStagingRecord[] {
    const staged: TaxLienStagingRecord[] = [];

    for (const feat of features) {
      const normalized = normalizeTaxLienFeature(feat);

      if (!normalized) {
        // Quarantine malformed or missing OID/PIN
        const rawPin = feat?.attributes?.pin ? String(feat.attributes.pin) : 'UNKNOWN';
        staged.push({
          normalized: {
            sourceObjectId: feat?.attributes?.objectid ?? -1,
            pin: rawPin,
            year: null,
            amountString: '0.00',
            amountCents: 0,
            situsAddress: null,
            countyClass: null,
            addition: null,
            sourceCreatedAt: null,
            sourceEditedAt: null,
            rawPayload: feat?.attributes ?? ({} as any),
            contentSha256: '',
            geometryGeoJson: null,
          },
          observationStatus: 'PRESENT_IN_CURRENT_SNAPSHOT',
          matchStatus: 'QUARANTINED_MALFORMED',
          matchedPropertyId: null,
          matchedParcelId: null,
          municipalJurisdiction: 'UNRESOLVED',
          quarantineReason: 'Failed structural validation: missing objectid or invalid county PIN',
        });
        continue;
      }

      // Check exact PIN match against DealBeacon canonical properties
      const matchedProperty = this.propertyByPin.get(normalized.pin);

      let matchStatus: TaxLienMatchStatus;
      let matchedPropertyId: string | null = null;
      let matchedParcelId: string | null = null;

      if (matchedProperty) {
        matchStatus = 'MATCHED_TO_CANONICAL_PROPERTY';
        matchedPropertyId = matchedProperty.id;
        matchedParcelId = matchedProperty.parcelId;
      } else {
        matchStatus = 'UNMATCHED_COUNTY_PIN';
      }

      // Municipal Jurisdiction Evaluation:
      // 1. For exact matches: Inherit verified Property.municipalJurisdiction directly.
      // 2. For unmatched records: If full geometric rings + authoritative boundary classifier exist, use it.
      // 3. Otherwise: Strictly UNRESOLVED (never force binary Omaha classification with bounding boxes).
      let municipalJurisdiction: TaxLienStagingRecord['municipalJurisdiction'] = 'UNRESOLVED';

      if (matchedProperty) {
        if (matchedProperty.municipalJurisdiction) {
          municipalJurisdiction = matchedProperty.municipalJurisdiction;
        } else {
          // Fallback based on verified city name
          municipalJurisdiction =
            matchedProperty.city.toUpperCase() === 'OMAHA' ? 'INSIDE_OMAHA' : 'OUTSIDE_OMAHA';
        }
      } else if (normalized.geometryGeoJson && this.boundaryClassifier) {
        const rings = normalized.geometryGeoJson.coordinates as number[][][];
        if (Array.isArray(rings) && rings.length > 0) {
          municipalJurisdiction = this.boundaryClassifier(rings);
        }
      } else {
        // Unmatched records remain UNRESOLVED without heuristic guessing
        municipalJurisdiction = 'UNRESOLVED';
      }

      staged.push({
        normalized,
        observationStatus: 'PRESENT_IN_CURRENT_SNAPSHOT',
        matchStatus,
        matchedPropertyId,
        matchedParcelId,
        municipalJurisdiction,
      });
    }

    return staged;
  }

  /**
   * Reconciles two snapshots (previous vs current) to detect records that disappeared
   * without equating disappearance with legal redemption.
   */
  public reconcileSnapshots(
    previousStaged: TaxLienStagingRecord[],
    currentStaged: TaxLienStagingRecord[]
  ): {
    currentPresent: TaxLienStagingRecord[];
    absentFromLatest: TaxLienStagingRecord[];
  } {
    const currentPins = new Set(
      currentStaged
        .filter((s) => s.matchStatus !== 'QUARANTINED_MALFORMED')
        .map((s) => s.normalized.pin)
    );

    const absentFromLatest: TaxLienStagingRecord[] = [];

    for (const prev of previousStaged) {
      if (!currentPins.has(prev.normalized.pin)) {
        // Disappeared from current snapshot
        absentFromLatest.push({
          ...prev,
          observationStatus: 'ABSENT_FROM_LATEST_SNAPSHOT',
        });
      }
    }

    return {
      currentPresent: currentStaged,
      absentFromLatest,
    };
  }

  /**
   * Compiles a comprehensive dry-run report for auditing and verification.
   */
  public generateDryRunReport(
    envelope: DouglasTaxLienEnvelope,
    staged: TaxLienStagingRecord[]
  ): DryRunTaxLienIngestionReport {
    const uniquePins = new Set(
      staged
        .filter((s) => s.matchStatus !== 'QUARANTINED_MALFORMED')
        .map((s) => s.normalized.pin)
    );

    let totalLienAmountCents = 0;
    let matchedCount = 0;
    let unmatchedCount = 0;
    let quarantinedCount = 0;
    let insideOmahaCount = 0;
    let outsideOmahaCount = 0;
    let crossesBoundaryCount = 0;
    let unresolvedCount = 0;

    const matchedSample: DryRunTaxLienIngestionReport['matchedSample'] = [];
    const unmatchedSample: DryRunTaxLienIngestionReport['unmatchedSample'] = [];
    const quarantinedSample: DryRunTaxLienIngestionReport['quarantinedSample'] = [];

    for (const record of staged) {
      if (record.matchStatus === 'QUARANTINED_MALFORMED') {
        quarantinedCount++;
        quarantinedSample.push({
          sourceObjectId: record.normalized.sourceObjectId,
          pin: record.normalized.pin,
          reason: record.quarantineReason ?? 'Unknown validation failure',
        });
        continue;
      }

      totalLienAmountCents += record.normalized.amountCents;

      if (record.municipalJurisdiction === 'INSIDE_OMAHA') {
        insideOmahaCount++;
      } else if (record.municipalJurisdiction === 'OUTSIDE_OMAHA') {
        outsideOmahaCount++;
      } else if (record.municipalJurisdiction === 'CROSSES_BOUNDARY') {
        crossesBoundaryCount++;
      } else {
        unresolvedCount++;
      }

      if (record.matchStatus === 'MATCHED_TO_CANONICAL_PROPERTY') {
        matchedCount++;
        const target = this.propertyByPin.get(record.normalized.pin);
        matchedSample.push({
          pin: record.normalized.pin,
          propertyId: record.matchedPropertyId!,
          address: target?.address ?? record.normalized.situsAddress ?? '[NO ADDRESS]',
          year: record.normalized.year,
          amount: `$${record.normalized.amountString}`,
          propertyType: target?.propertyType ?? 'UNKNOWN',
          jurisdiction: record.municipalJurisdiction,
        });
      } else {
        unmatchedCount++;
        if (unmatchedSample.length < 10) {
          unmatchedSample.push({
            pin: record.normalized.pin,
            situsAddress: record.normalized.situsAddress,
            year: record.normalized.year,
            amount: `$${record.normalized.amountString}`,
            class: record.normalized.countyClass,
          });
        }
      }
    }

    const dollars = Math.floor(totalLienAmountCents / 100);
    const cents = totalLienAmountCents % 100;
    const totalLienAmountFormatted = `$${dollars.toLocaleString()}.${String(cents).padStart(2, '0')}`;

    return {
      timestamp: new Date().toISOString(),
      sourceEnvelope: envelope,
      recordsRetrieved: staged.length,
      uniquePins: uniquePins.size,
      totalLienAmountCents,
      totalLienAmountFormatted,
      matchedRecordsCount: matchedCount,
      unmatchedRecordsCount: unmatchedCount,
      quarantinedRecordsCount: quarantinedCount,
      insideOmahaCount,
      outsideOmahaCount,
      crossesBoundaryCount,
      unresolvedCount,
      matchedSample,
      unmatchedSample,
      quarantinedSample,
    };
  }
}
