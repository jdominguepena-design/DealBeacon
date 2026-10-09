import {
  PropertyEventDTO,
  OwnershipRecordDTO,
  TaxRecordDTO,
  CodeViolationDTO,
  SignalDTO,
} from '@/types';

export interface TimelineSynthesisContext {
  propertyId: string;
  ownership?: OwnershipRecordDTO | null;
  taxRecords?: TaxRecordDTO[];
  codeViolations?: CodeViolationDTO[];
  signals?: SignalDTO[];
}

/**
 * Synthesizes chronological PropertyEvent objects from underlying records and signals.
 * Guardrail compliance: Timeline remains a derived presentation layer; SourceRecord/Signals are ground truth.
 */
export function synthesizePropertyTimeline(
  context: TimelineSynthesisContext
): PropertyEventDTO[] {
  const events: PropertyEventDTO[] = [];

  // 1. Ownership Events (Purchase / Transfer)
  if (context.ownership?.purchaseDate) {
    events.push({
      id: `evt-purchase-${context.propertyId}`,
      propertyId: context.propertyId,
      eventDate: new Date(context.ownership.purchaseDate).toISOString(),
      eventType: 'PURCHASE',
      title: 'Property Acquired',
      description: `Acquired by ${context.ownership.ownerName} for ${
        context.ownership.purchasePrice
          ? '$' + context.ownership.purchasePrice.toLocaleString()
          : 'an undisclosed consideration'
      }${context.ownership.deedType ? ` via ${context.ownership.deedType}` : ''}.`,
      severity: 'INFO',
      sourceRecordId: null,
      createdAt: new Date().toISOString(),
    });
  }

  // 2. Ownership Mailing Change / Absentee Detection Event
  if (context.ownership?.isAbsentee) {
    events.push({
      id: `evt-absentee-${context.propertyId}`,
      propertyId: context.propertyId,
      eventDate: context.ownership.createdAt || new Date().toISOString(),
      eventType: 'MAILING_CHANGE',
      title: 'Absentee Owner Designation (Inferred)',
      description: `Owner tax billing address recorded at ${context.ownership.mailingAddress}, ${context.ownership.mailingCity}, ${context.ownership.mailingState} ${context.ownership.mailingZip}.`,
      severity: 'WARNING',
      sourceRecordId: null,
      createdAt: new Date().toISOString(),
    });
  }

  // 3. Tax Records & Delinquencies
  if (context.taxRecords) {
    for (const tax of context.taxRecords) {
      if (tax.isDelinquent) {
        events.push({
          id: `evt-tax-${tax.id}`,
          propertyId: context.propertyId,
          eventDate: new Date(tax.createdAt).toISOString(),
          eventType: 'TAX_DELINQUENCY',
          title: `Douglas County Tax Delinquency (Tax Year ${tax.taxYear})`,
          description: `Unpaid tax balance of $${tax.amountDelinquent.toLocaleString()} reported by Douglas County Treasurer. Delinquent for ${
            tax.delinquentYears
          } tax year(s).`,
          severity: 'DANGER',
          sourceRecordId: null,
          createdAt: tax.createdAt,
        });
      }
    }
  }

  // 4. Code Enforcement Violations
  if (context.codeViolations) {
    for (const code of context.codeViolations) {
      events.push({
        id: `evt-code-${code.id}`,
        propertyId: context.propertyId,
        eventDate: new Date(code.violationDate).toISOString(),
        eventType: 'CODE_VIOLATION',
        title: `City Code Case Filed (#${code.caseNumber})`,
        description: `Violation type: ${code.violationType.replace(/_/g, ' ')}. Status: ${
          code.status
        }. Description: ${code.description}${
          code.inspectorNotes ? ` — Notes: ${code.inspectorNotes}` : ''
        }`,
        severity:
          code.severity === 'CRITICAL'
            ? 'DANGER'
            : code.severity === 'HIGH'
            ? 'WARNING'
            : 'INFO',
        sourceRecordId: null,
        createdAt: code.createdAt,
      });
    }
  }

  // 5. Standalone Signals (e.g. Vacancy, Repeat Violator)
  if (context.signals) {
    for (const sig of context.signals) {
      if (
        sig.signalType === 'VACANCY_INDICATOR' ||
        sig.signalType === 'REPEAT_VIOLATOR'
      ) {
        events.push({
          id: `evt-sig-${sig.id}`,
          propertyId: context.propertyId,
          eventDate: new Date(sig.eventDate).toISOString(),
          eventType: sig.signalType,
          title:
            sig.signalType === 'VACANCY_INDICATOR'
              ? 'Property Vacancy Indicator Flagged'
              : 'Repeat Distress Pattern Flagged',
          description: `Signal score weight: +${sig.scoreContribution} pts. Source: ${sig.sourceType}.`,
          severity: sig.severity === 'HIGH' || sig.severity === 'CRITICAL' ? 'DANGER' : 'WARNING',
          sourceRecordId: sig.sourceRecordId,
          createdAt: sig.discoveredAt,
        });
      }
    }
  }

  // Sort descending by eventDate (most recent first)
  return events.sort(
    (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
  );
}
