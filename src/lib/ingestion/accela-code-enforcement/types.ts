export interface AccelaRawFeature {
  objectid: number;
  globalid: string;
  permitnum: string;
  pin?: string;
  casetype?: string;
  caserecordclassmapped?: string;
  statuscurrent?: string;
  statuscurrentmapped?: string;
  first_process_date?: number | string;
  initial_inspection?: number | string;
  last_re_inspection?: number | string;
  first_compliance_deadline?: number | string;
  extended_compliance_deadline?: number | string;
  compliance_date?: number | string;
  demo_issued_date?: number | string;
  vacant?: string;
  vacate_reason?: string;
  demo_order?: string;
  originaladdress1?: string;
  originalcity?: string;
  originalstate?: string;
  originalzip?: string;
  link?: string;
  lastupdated?: number | string;
}

export type EnforcementStage =
  | 'ACTIVE_CONFIRMED_VIOLATION'
  | 'ACTIVE_LEGAL_CITATION'
  | 'INSPECTION_PENDING'
  | 'CLOSED_COMPLIED'
  | 'CLOSED_UNFOUNDED'
  | 'CLOSED_HISTORICAL'
  | 'UNKNOWN_STAGE';

export type CollectorMode = 'incremental' | 'full';

export interface AccelaCollectorOptions {
  mode?: CollectorMode;
  dryRun?: boolean;
  batchSize?: number;
  maxRecords?: number;
  maxIncrementalThreshold?: number;
  sinceDate?: Date;
  offset?: number;
}

export interface AccelaCollectorResult {
  runId: string;
  mode: CollectorMode;
  dryRun: boolean;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  totalFetched: number;
  totalInserted: number;
  totalUpdated: number;
  matchedCount: number;
  unmatchedCount: number;
  activeViolationsCount: number;
  activeCitationsCount: number;
  pendingInspectionsCount: number;
  historicalClosedCount: number;
  activeVacantCount: number;
  historicalVacantCount: number;
  activeDemoCount: number;
  historicalDemoCount: number;
  batchesCompleted: number;
  errors: string[];
}
