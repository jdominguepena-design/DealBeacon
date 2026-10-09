import { SignalSeverity, SignalDTO, SourceRecordDTO } from '@/types';

export interface NormalizedParcelMatch {
  parcelId: string;
  normalizedAddress: string;
}

export interface IngestionResult {
  runId: string;
  sourceName: string;
  recordsIngested: number;
  signalsCreated: number;
  unmatchedRecords: number;
  errors: string[];
}

export abstract class BaseSourceAdapter<TRaw extends { id?: string | number }> {
  abstract readonly sourceName: string;

  /**
   * Parses raw record and returns standardized parcel match identifier
   */
  abstract matchParcel(raw: TRaw): NormalizedParcelMatch | null;

  /**
   * Converts raw source record into domain signals with score contributions
   */
  abstract extractSignals(raw: TRaw, sourceRecordId: string, propertyId: string): SignalDTO[];

  /**
   * Helper to construct immutable SourceRecord payload
   */
  createSourceRecord(
    raw: TRaw,
    externalId: string,
    propertyId: string | null,
    ingestionRunId: string | null
  ): SourceRecordDTO {
    return {
      id: `src-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      propertyId,
      sourceName: this.sourceName,
      sourceRecordId: externalId,
      rawPayloadJson: raw as Record<string, any>,
      ingestionRunId,
      matchedStatus: propertyId ? 'MATCHED' : 'UNMATCHED',
      ingestedAt: new Date().toISOString(),
    };
  }
}
