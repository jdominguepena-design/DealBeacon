export type UserRole = 'INVESTOR' | 'ADMIN';

export type LeadStatus =
  | 'NEW'
  | 'RESEARCHING'
  | 'CONTACTING'
  | 'FOLLOW_UP'
  | 'INTERESTED'
  | 'NOT_INTERESTED'
  | 'CLOSED_DEAL';

export type PriorityLevel = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type SignalSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type IngestionStatus = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'PARTIAL';

export type PropertyType = 'SINGLE_FAMILY' | 'MULTI_FAMILY' | 'COMMERCIAL' | 'VACANT_LOT';

export interface ScoreFactor {
  ruleId: string;
  category: 'FINANCIAL' | 'PROPERTY' | 'OWNERSHIP' | 'RECENCY' | 'COMPOUND';
  label: string;
  points: number;
  description: string;
  signalId?: string;
  sourceRecordId?: string;
  eventDate?: string;
}

export interface UserDTO {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}

export interface OwnershipRecordDTO {
  id: string;
  propertyId: string;
  ownerName: string;
  mailingAddress: string;
  mailingCity: string;
  mailingState: string;
  mailingZip: string;
  isAbsentee: boolean;
  isOutOfState: boolean;
  isCorporate: boolean;
  purchaseDate: string | null;
  purchasePrice: number | null;
  deedType: string | null;
  ownershipYears: number | null;
  isCurrent: boolean;
  createdAt: string;
}

export interface TaxRecordDTO {
  id: string;
  propertyId: string;
  taxYear: number;
  totalAssessed: number;
  annualTaxDue: number;
  amountDelinquent: number;
  isDelinquent: boolean;
  delinquentYears: number;
  taxSaleStatus: string | null;
  createdAt: string;
}

export interface CodeViolationDTO {
  id: string;
  propertyId: string;
  caseNumber: string;
  violationDate: string;
  violationType: string;
  severity: SignalSeverity;
  status: string;
  description: string;
  inspectorNotes: string | null;
  complianceDate: string | null;
  createdAt: string;
}

export interface SignalDTO {
  id: string;
  propertyId: string;
  signalType: string;
  category: string;
  scoreContribution: number;
  severity: SignalSeverity;
  eventDate: string;
  discoveredAt: string;
  status: string;
  sourceType: string;
  sourceRecordId: string | null;
  metadataJson: Record<string, any> | null;
}

export interface PropertyEventDTO {
  id: string;
  propertyId: string;
  eventDate: string;
  eventType: string;
  title: string;
  description: string;
  severity: 'INFO' | 'WARNING' | 'DANGER' | 'SUCCESS' | null;
  sourceRecordId: string | null;
  createdAt: string;
}

export interface SourceRecordDTO {
  id: string;
  propertyId: string | null;
  sourceName: string;
  sourceRecordId: string;
  rawPayloadJson: Record<string, any>;
  ingestionRunId: string | null;
  matchedStatus: string;
  ingestedAt: string;
}

export interface SavedPropertyDTO {
  id: string;
  userId: string;
  propertyId: string;
  status: LeadStatus;
  priority: PriorityLevel;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyNoteDTO {
  id: string;
  userId: string;
  propertyId: string;
  content: string;
  authorName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IngestionRunDTO {
  id: string;
  sourceName: string;
  startedAt: string;
  completedAt: string | null;
  status: IngestionStatus;
  recordsIngested: number;
  signalsCreated: number;
  errorsJson: any | null;
}

export interface PropertyDTO {
  id: string;
  parcelId: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  neighborhood: string | null;
  propertyType: PropertyType;
  yearBuilt: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  lotSizeSqFt: number | null;
  assessedValue: number | null;
  estimatedValue: number | null;
  estimatedEquityPct: number | null;
  opportunityScore: number;
  dataConfidence: ConfidenceLevel;
  scoreBreakdownJson: ScoreFactor[] | null;
  lastScoredAt: string | null;
  createdAt: string;
  updatedAt: string;
  ownershipRecords?: OwnershipRecordDTO[];
  taxRecords?: TaxRecordDTO[];
  codeViolations?: CodeViolationDTO[];
  signals?: SignalDTO[];
  events?: PropertyEventDTO[];
  savedProperties?: SavedPropertyDTO[];
  notes?: PropertyNoteDTO[];
}
