import { PrismaClient } from '@prisma/client';
import {
  PropertyDTO,
  SourceRecordDTO,
  SignalDTO,
  SavedPropertyDTO,
  PropertyNoteDTO,
  IngestionRunDTO,
  LeadStatus,
  PriorityLevel,
} from '@/types';
import { buildSyntheticOmahaDataset } from './seeds/omaha-synthetic-dataset';
import { calculateOpportunityScore } from './scoring/engine';
import { synthesizePropertyTimeline } from './timeline/builder';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  inMemoryStore: InMemoryStore | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

interface InMemoryStore {
  properties: Map<string, PropertyDTO>;
  sourceRecords: Map<string, SourceRecordDTO>;
  signals: Map<string, SignalDTO>;
  savedProperties: Map<string, SavedPropertyDTO>;
  notes: PropertyNoteDTO[];
  ingestionRuns: IngestionRunDTO[];
}

function initializeInMemoryStore(): InMemoryStore {
  const { properties, sourceRecords, signals } = buildSyntheticOmahaDataset();

  const propertyMap = new Map<string, PropertyDTO>();
  for (const p of properties) {
    propertyMap.set(p.id, p);
  }

  const sourceRecordMap = new Map<string, SourceRecordDTO>();
  for (const s of sourceRecords) {
    sourceRecordMap.set(s.id, s);
  }

  const signalMap = new Map<string, SignalDTO>();
  for (const sig of signals) {
    signalMap.set(sig.id, sig);
  }

  const savedMap = new Map<string, SavedPropertyDTO>();
  // Pre-seed a saved property for demonstration
  savedMap.set('usr-investor-01:prop-0421000101', {
    id: 'save-01',
    userId: 'usr-investor-01',
    propertyId: 'prop-0421000101',
    status: 'RESEARCHING',
    priority: 'HIGH',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  });

  const notesList: PropertyNoteDTO[] = [
    {
      id: 'note-01',
      userId: 'usr-investor-01',
      propertyId: 'prop-0421000101',
      content: 'Checked Douglas County GIS. Title shows deed transferred in 2005. Verified tax lien on file for $4,130.',
      authorName: 'Omaha Wholesaler',
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
    {
      id: 'note-02',
      userId: 'usr-investor-01',
      propertyId: 'prop-0421000101',
      content: 'Called registered agent in Scottsdale, AZ. Left voicemail regarding off-market cash acquisition.',
      authorName: 'Omaha Wholesaler',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ];

  const runs: IngestionRunDTO[] = [
    {
      id: 'run-synthetic-initial-01',
      sourceName: 'DOUGLAS_COUNTY_ASSESSOR & CODE_ENFORCEMENT',
      startedAt: '2025-08-01T08:00:00.000Z',
      completedAt: '2025-08-01T08:00:15.000Z',
      status: 'SUCCESS',
      recordsIngested: properties.length,
      signalsCreated: signals.length,
      errorsJson: null,
    },
  ];

  return {
    properties: propertyMap,
    sourceRecords: sourceRecordMap,
    signals: signalMap,
    savedProperties: savedMap,
    notes: notesList,
    ingestionRuns: runs,
  };
}

const store: InMemoryStore =
  globalForPrisma.inMemoryStore ?? initializeInMemoryStore();
if (process.env.NODE_ENV !== 'production') globalForPrisma.inMemoryStore = store;

export interface PropertyFilterParams {
  query?: string;
  minScore?: number;
  maxScore?: number;
  neighborhood?: string;
  propertyType?: string;
  isAbsentee?: boolean | 'out_of_state' | 'in_state';
  hasTaxDelinquency?: boolean;
  hasCodeViolation?: boolean;
  hasVacancy?: boolean;
  minEquity?: number;
  sortBy?: 'score_desc' | 'score_asc' | 'recent_desc' | 'value_desc' | 'delinquent_desc';
}

/**
 * High-performance repository methods
 */
export async function getAllProperties(
  filters?: PropertyFilterParams,
  currentUserId?: string
): Promise<PropertyDTO[]> {
  let list = Array.from(store.properties.values());

  if (filters) {
    if (filters.query) {
      const q = filters.query.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.address.toLowerCase().includes(q) ||
          p.parcelId.includes(q) ||
          p.zip.includes(q) ||
          p.neighborhood?.toLowerCase().includes(q) ||
          p.ownershipRecords?.some((o) => o.ownerName.toLowerCase().includes(q))
      );
    }

    if (filters.minScore !== undefined) {
      list = list.filter((p) => p.opportunityScore >= (filters.minScore || 0));
    }
    if (filters.maxScore !== undefined) {
      list = list.filter((p) => p.opportunityScore <= (filters.maxScore || 100));
    }

    if (filters.neighborhood && filters.neighborhood !== 'ALL') {
      list = list.filter((p) => p.neighborhood === filters.neighborhood);
    }

    if (filters.propertyType && filters.propertyType !== 'ALL') {
      list = list.filter((p) => p.propertyType === filters.propertyType);
    }

    if (filters.isAbsentee) {
      if (filters.isAbsentee === 'out_of_state') {
        list = list.filter((p) => p.ownershipRecords?.some((o) => o.isOutOfState));
      } else if (filters.isAbsentee === 'in_state') {
        list = list.filter(
          (p) => p.ownershipRecords?.some((o) => o.isAbsentee && !o.isOutOfState)
        );
      } else {
        list = list.filter((p) => p.ownershipRecords?.some((o) => o.isAbsentee));
      }
    }

    if (filters.hasTaxDelinquency) {
      list = list.filter((p) => p.taxRecords?.some((t) => t.isDelinquent));
    }

    if (filters.hasCodeViolation) {
      list = list.filter((p) =>
        p.codeViolations?.some((c) => c.status !== 'RESOLVED' && c.status !== 'CLOSED')
      );
    }

    if (filters.hasVacancy) {
      list = list.filter((p) =>
        p.signals?.some((s) => s.signalType === 'VACANCY_INDICATOR')
      );
    }

    if (filters.minEquity !== undefined) {
      list = list.filter((p) => (p.estimatedEquityPct || 0) >= filters.minEquity!);
    }

    if (filters.sortBy) {
      switch (filters.sortBy) {
        case 'score_desc':
          list.sort((a, b) => b.opportunityScore - a.opportunityScore);
          break;
        case 'score_asc':
          list.sort((a, b) => a.opportunityScore - b.opportunityScore);
          break;
        case 'value_desc':
          list.sort((a, b) => (b.estimatedValue || 0) - (a.estimatedValue || 0));
          break;
        case 'delinquent_desc':
          list.sort((a, b) => {
            const delA = a.taxRecords?.reduce((s, t) => s + (t.amountDelinquent || 0), 0) || 0;
            const delB = b.taxRecords?.reduce((s, t) => s + (t.amountDelinquent || 0), 0) || 0;
            return delB - delA;
          });
          break;
        case 'recent_desc':
        default:
          list.sort((a, b) => b.opportunityScore - a.opportunityScore);
      }
    } else {
      list.sort((a, b) => b.opportunityScore - a.opportunityScore);
    }
  }

  // Attach user-specific saved state & notes
  if (currentUserId) {
    return list.map((p) => {
      const saveKey = `${currentUserId}:${p.id}`;
      const saved = store.savedProperties.get(saveKey);
      const propertyNotes = store.notes.filter((n) => n.propertyId === p.id);
      return {
        ...p,
        savedProperties: saved ? [saved] : [],
        notes: propertyNotes,
      };
    });
  }

  return list;
}

export async function getPropertyById(
  id: string,
  currentUserId?: string
): Promise<PropertyDTO | null> {
  const property = store.properties.get(id);
  if (!property) return null;

  const saveKey = currentUserId ? `${currentUserId}:${id}` : '';
  const saved = saveKey ? store.savedProperties.get(saveKey) : undefined;
  const propertyNotes = store.notes.filter((n) => n.propertyId === id);

  return {
    ...property,
    savedProperties: saved ? [saved] : [],
    notes: propertyNotes,
  };
}

export async function toggleSaveProperty(
  userId: string,
  propertyId: string,
  status: LeadStatus = 'NEW',
  priority: PriorityLevel = 'NORMAL'
): Promise<{ isSaved: boolean; record?: SavedPropertyDTO }> {
  const key = `${userId}:${propertyId}`;
  const existing = store.savedProperties.get(key);

  if (existing) {
    store.savedProperties.delete(key);
    return { isSaved: false };
  } else {
    const record: SavedPropertyDTO = {
      id: `save-${Date.now()}`,
      userId,
      propertyId,
      status,
      priority,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.savedProperties.set(key, record);
    return { isSaved: true, record };
  }
}

export async function updateSavedPropertyStatus(
  userId: string,
  propertyId: string,
  status: LeadStatus,
  priority?: PriorityLevel
): Promise<SavedPropertyDTO | null> {
  const key = `${userId}:${propertyId}`;
  const existing = store.savedProperties.get(key);

  if (existing) {
    existing.status = status;
    if (priority) existing.priority = priority;
    existing.updatedAt = new Date().toISOString();
    store.savedProperties.set(key, existing);
    return existing;
  } else {
    const record: SavedPropertyDTO = {
      id: `save-${Date.now()}`,
      userId,
      propertyId,
      status,
      priority: priority || 'NORMAL',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.savedProperties.set(key, record);
    return record;
  }
}

export async function addPropertyNote(
  userId: string,
  propertyId: string,
  content: string,
  authorName: string = 'Investor'
): Promise<PropertyNoteDTO> {
  const note: PropertyNoteDTO = {
    id: `note-${Date.now()}`,
    userId,
    propertyId,
    content: content.trim(),
    authorName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.notes.unshift(note);
  return note;
}

export async function recalculatePropertyScores(): Promise<{ updatedCount: number }> {
  let count = 0;
  for (const [id, prop] of store.properties.entries()) {
    const scoreResult = calculateOpportunityScore({
      ownership: prop.ownershipRecords?.[0] || null,
      taxRecords: prop.taxRecords,
      codeViolations: prop.codeViolations,
      signals: prop.signals,
      referenceDate: new Date(),
    });

    prop.opportunityScore = scoreResult.totalScore;
    prop.dataConfidence = scoreResult.dataConfidence;
    prop.scoreBreakdownJson = scoreResult.breakdown;
    prop.lastScoredAt = new Date().toISOString();
    store.properties.set(id, prop);
    count++;
  }
  return { updatedCount: count };
}

export async function getDashboardKPIs(userId?: string) {
  const all = Array.from(store.properties.values());
  const highPriority = all.filter((p) => p.opportunityScore >= 80);
  const taxDelinquent = all.filter((p) => p.taxRecords?.some((t) => t.isDelinquent));
  const openViolations = all.filter((p) =>
    p.codeViolations?.some((c) => c.status !== 'RESOLVED' && c.status !== 'CLOSED')
  );
  const savedCount = store.savedProperties.size;

  return {
    totalProperties: all.length,
    highPriorityCount: highPriority.length,
    taxDelinquentCount: taxDelinquent.length,
    openViolationsCount: openViolations.length,
    savedPipelineCount: savedCount,
    topOpportunities: all.sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 5),
    recentSignalsFeed: Array.from(store.signals.values())
      .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())
      .slice(0, 6),
  };
}

export async function getSavedPipeline(userId: string) {
  const savedRecords = Array.from(store.savedProperties.values()).filter(
    (s) => s.userId === userId
  );

  const populated = savedRecords
    .map((s) => {
      const property = store.properties.get(s.propertyId);
      const notes = store.notes.filter((n) => n.propertyId === s.propertyId);
      if (!property) return null;
      return {
        ...s,
        property,
        notes,
      };
    })
    .filter(Boolean);

  return populated;
}

export async function getAdminData() {
  return {
    runs: store.ingestionRuns,
    sourceRecords: Array.from(store.sourceRecords.values()),
    signals: Array.from(store.signals.values()),
    propertiesCount: store.properties.size,
  };
}
