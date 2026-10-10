import { PropertyDTO, SignalDTO, SourceRecordDTO } from '@/types';
import { calculateOpportunityScore } from '../scoring/engine';
import { synthesizePropertyTimeline } from '../timeline/builder';

export interface RawSyntheticPropertyFixture {
  parcelId: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  neighborhood: string;
  propertyType: 'SINGLE_FAMILY' | 'MULTI_FAMILY' | 'COMMERCIAL' | 'VACANT_LOT';
  yearBuilt: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  lotSizeSqFt: number;
  assessedValue: number;
  estimatedValue: number;
  estimatedEquityPct: number;
  owner: {
    ownerName: string;
    mailingAddress: string;
    mailingCity: string;
    mailingState: string;
    mailingZip: string;
    isAbsentee: boolean;
    isOutOfState: boolean;
    isCorporate: boolean;
    purchaseDate: string;
    purchasePrice: number;
    deedType: string;
    ownershipYears: number;
  };
  taxes: Array<{
    taxYear: number;
    totalAssessed: number;
    annualTaxDue: number;
    amountDelinquent: number;
    isDelinquent: boolean;
    delinquentYears: number;
    taxSaleStatus: string | null;
  }>;
  codeViolations: Array<{
    caseNumber: string;
    violationDate: string;
    violationType: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    status: string;
    description: string;
    inspectorNotes: string | null;
    complianceDate: string | null;
  }>;
  isVacantIndicator?: boolean;
}

export const SYNTHETIC_OMAHA_FIXTURES: RawSyntheticPropertyFixture[] = [
  // 1. High Distress Convergence: North Omaha (Tax Delinquent 2 yrs + Structural Code Violation + Absentee AZ + 19yr Ownership)
  {
    parcelId: '0421000101',
    address: '2418 N 24th St',
    city: 'Omaha',
    state: 'NE',
    zip: '68110',
    neighborhood: 'North Omaha',
    propertyType: 'SINGLE_FAMILY',
    yearBuilt: 1918,
    bedrooms: 3,
    bathrooms: 1.5,
    squareFeet: 1420,
    lotSizeSqFt: 5400,
    assessedValue: 88500,
    estimatedValue: 145000,
    estimatedEquityPct: 0.92,
    owner: {
      ownerName: 'Synthetic Estate Holdings LLC (Demo)',
      mailingAddress: '8820 E Camelback Rd #204',
      mailingCity: 'Scottsdale',
      mailingState: 'AZ',
      mailingZip: '85251',
      isAbsentee: true,
      isOutOfState: true,
      isCorporate: true,
      purchaseDate: '2005-04-12T00:00:00.000Z',
      purchasePrice: 42000,
      deedType: 'Personal Representative Deed',
      ownershipYears: 19.5,
    },
    taxes: [
      {
        taxYear: 2024,
        totalAssessed: 88500,
        annualTaxDue: 2150,
        amountDelinquent: 2150,
        isDelinquent: true,
        delinquentYears: 2,
        taxSaleStatus: 'Tax Lien Issued',
      },
      {
        taxYear: 2023,
        totalAssessed: 82000,
        annualTaxDue: 1980,
        amountDelinquent: 1980,
        isDelinquent: true,
        delinquentYears: 2,
        taxSaleStatus: 'Tax Lien Issued',
      },
    ],
    codeViolations: [
      {
        caseNumber: 'CE-2025-0418',
        violationDate: '2025-07-15T00:00:00.000Z',
        violationType: 'STRUCTURAL',
        severity: 'CRITICAL',
        status: 'OPEN',
        description: 'Compromised foundation wall and missing exterior siding at north elevation.',
        inspectorNotes: 'Owner notified via certified mail to AZ address. No response received.',
        complianceDate: null,
      },
      {
        caseNumber: 'CE-2024-0992',
        violationDate: '2024-10-02T00:00:00.000Z',
        violationType: 'TRASH_DEBRIS',
        severity: 'MEDIUM',
        status: 'NOTICE_ISSUED',
        description: 'Accumulation of discarded building materials and excessive brush in rear yard.',
        inspectorNotes: 'Second notice sent.',
        complianceDate: null,
      },
    ],
    isVacantIndicator: true,
  },

  // 2. High Score: Benson Corridor (Exterior Code + Absentee CA + 16yr Ownership + Recent Violation)
  {
    parcelId: '0421000102',
    address: '5814 Maple St',
    city: 'Omaha',
    state: 'NE',
    zip: '68104',
    neighborhood: 'Benson',
    propertyType: 'SINGLE_FAMILY',
    yearBuilt: 1924,
    bedrooms: 2,
    bathrooms: 1,
    squareFeet: 1150,
    lotSizeSqFt: 6200,
    assessedValue: 135000,
    estimatedValue: 195000,
    estimatedEquityPct: 0.88,
    owner: {
      ownerName: 'Demo Pacific Trust Alpha (Demo)',
      mailingAddress: '1420 Ocean Ave #5B',
      mailingCity: 'Santa Monica',
      mailingState: 'CA',
      mailingZip: '90401',
      isAbsentee: true,
      isOutOfState: true,
      isCorporate: true,
      purchaseDate: '2008-09-18T00:00:00.000Z',
      purchasePrice: 78000,
      deedType: 'Warranty Deed',
      ownershipYears: 16.0,
    },
    taxes: [
      {
        taxYear: 2024,
        totalAssessed: 135000,
        annualTaxDue: 3100,
        amountDelinquent: 3100,
        isDelinquent: true,
        delinquentYears: 1,
        taxSaleStatus: null,
      },
    ],
    codeViolations: [
      {
        caseNumber: 'CE-2025-0819',
        violationDate: '2025-08-01T00:00:00.000Z',
        violationType: 'EXTERIOR_MAINTENANCE',
        severity: 'HIGH',
        status: 'OPEN',
        description: 'Damaged roof shingles, deteriorated soffits, and peeling lead-based paint.',
        inspectorNotes: 'Direct complaint from adjacent homeowner regarding roof leakage into overhang.',
        complianceDate: null,
      },
    ],
  },

  // 3. High Distress: South Omaha (Tax Delinquent 3 yrs + Repeat Code Violations + Absentee TX)
  {
    parcelId: '0421000103',
    address: '4712 S 24th St',
    city: 'Omaha',
    state: 'NE',
    zip: '68107',
    neighborhood: 'South Omaha',
    propertyType: 'MULTI_FAMILY',
    yearBuilt: 1910,
    bedrooms: 5,
    bathrooms: 2.5,
    squareFeet: 2350,
    lotSizeSqFt: 7100,
    assessedValue: 145000,
    estimatedValue: 240000,
    estimatedEquityPct: 0.85,
    owner: {
      ownerName: 'Synthetic LoneStar Holdings LLC (Demo)',
      mailingAddress: '4200 Westheimer Rd',
      mailingCity: 'Houston',
      mailingState: 'TX',
      mailingZip: '77027',
      isAbsentee: true,
      isOutOfState: true,
      isCorporate: true,
      purchaseDate: '2012-03-22T00:00:00.000Z',
      purchasePrice: 85000,
      deedType: 'Quitclaim Deed',
      ownershipYears: 12.5,
    },
    taxes: [
      {
        taxYear: 2024,
        totalAssessed: 145000,
        annualTaxDue: 3600,
        amountDelinquent: 3600,
        isDelinquent: true,
        delinquentYears: 3,
        taxSaleStatus: 'Tax Lien Issued',
      },
      {
        taxYear: 2023,
        totalAssessed: 138000,
        annualTaxDue: 3450,
        amountDelinquent: 3450,
        isDelinquent: true,
        delinquentYears: 3,
        taxSaleStatus: 'Tax Lien Issued',
      },
    ],
    codeViolations: [
      {
        caseNumber: 'CE-2025-0610',
        violationDate: '2025-06-12T00:00:00.000Z',
        violationType: 'VACANT_UNSECURED',
        severity: 'CRITICAL',
        status: 'OPEN',
        description: 'Rear entrance door broken and unlatched. Windows broken on lower level.',
        inspectorNotes: 'Emergency board-up scheduled by city contractor.',
        complianceDate: null,
      },
      {
        caseNumber: 'CE-2024-0311',
        violationDate: '2024-04-18T00:00:00.000Z',
        violationType: 'TALL_WEEDS',
        severity: 'LOW',
        status: 'RESOLVED',
        description: 'Weeds exceeding 12 inches across entire parcel perimeter.',
        inspectorNotes: 'Mowed by city crew.',
        complianceDate: '2024-05-01T00:00:00.000Z',
      },
    ],
    isVacantIndicator: true,
  },

  // 4. Moderate Distress: Dundee / Midtown (Long Ownership 22 yrs + In-State Absentee + Delinquent Tax)
  {
    parcelId: '0421000104',
    address: '4920 California St',
    city: 'Omaha',
    state: 'NE',
    zip: '68132',
    neighborhood: 'Dundee',
    propertyType: 'SINGLE_FAMILY',
    yearBuilt: 1928,
    bedrooms: 4,
    bathrooms: 2,
    squareFeet: 2100,
    lotSizeSqFt: 6500,
    assessedValue: 275000,
    estimatedValue: 360000,
    estimatedEquityPct: 0.95,
    owner: {
      ownerName: 'Synthetic Owner Miller (Demo)',
      mailingAddress: '16804 Frances St',
      mailingCity: 'Omaha',
      mailingState: 'NE',
      mailingZip: '68130',
      isAbsentee: true,
      isOutOfState: false,
      isCorporate: false,
      purchaseDate: '2002-11-10T00:00:00.000Z',
      purchasePrice: 110000,
      deedType: 'Warranty Deed',
      ownershipYears: 22.0,
    },
    taxes: [
      {
        taxYear: 2024,
        totalAssessed: 275000,
        annualTaxDue: 6200,
        amountDelinquent: 6200,
        isDelinquent: true,
        delinquentYears: 1,
        taxSaleStatus: null,
      },
    ],
    codeViolations: [],
  },

  // 5. Florence / Miller Park (Exterior Violation + Out-of-State FL + 18yr Ownership)
  {
    parcelId: '0421000105',
    address: '8114 N 30th St',
    city: 'Omaha',
    state: 'NE',
    zip: '68112',
    neighborhood: 'Florence',
    propertyType: 'SINGLE_FAMILY',
    yearBuilt: 1935,
    bedrooms: 3,
    bathrooms: 1,
    squareFeet: 1280,
    lotSizeSqFt: 8200,
    assessedValue: 110000,
    estimatedValue: 165000,
    estimatedEquityPct: 0.90,
    owner: {
      ownerName: 'Demo Sunbelt Properties LLC (Demo)',
      mailingAddress: '900 Biscayne Blvd #1800',
      mailingCity: 'Miami',
      mailingState: 'FL',
      mailingZip: '33132',
      isAbsentee: true,
      isOutOfState: true,
      isCorporate: true,
      purchaseDate: '2006-07-08T00:00:00.000Z',
      purchasePrice: 55000,
      deedType: 'Warranty Deed',
      ownershipYears: 18.2,
    },
    taxes: [
      {
        taxYear: 2024,
        totalAssessed: 110000,
        annualTaxDue: 2600,
        amountDelinquent: 0,
        isDelinquent: false,
        delinquentYears: 0,
        taxSaleStatus: null,
      },
    ],
    codeViolations: [
      {
        caseNumber: 'CE-2025-0774',
        violationDate: '2025-07-28T00:00:00.000Z',
        violationType: 'EXTERIOR_MAINTENANCE',
        severity: 'MEDIUM',
        status: 'OPEN',
        description: 'Collapsed gutters on east facade and detached front porch railing.',
        inspectorNotes: 'Inspection triggered by neighborhood drive-by survey.',
        complianceDate: null,
      },
    ],
  },

  // 6. South Omaha (Tax Delinquent 2 yrs + Tall Weeds + Vacancy + Denver CO Absentee)
  {
    parcelId: '0421000106',
    address: '2810 Q St',
    city: 'Omaha',
    state: 'NE',
    zip: '68107',
    neighborhood: 'South Omaha',
    propertyType: 'SINGLE_FAMILY',
    yearBuilt: 1912,
    bedrooms: 3,
    bathrooms: 1,
    squareFeet: 1310,
    lotSizeSqFt: 5000,
    assessedValue: 95000,
    estimatedValue: 155000,
    estimatedEquityPct: 0.82,
    owner: {
      ownerName: 'Synthetic FrontRange Equity LLC (Demo)',
      mailingAddress: '1700 Lincoln St #3200',
      mailingCity: 'Denver',
      mailingState: 'CO',
      mailingZip: '80203',
      isAbsentee: true,
      isOutOfState: true,
      isCorporate: true,
      purchaseDate: '2014-05-19T00:00:00.000Z',
      purchasePrice: 62000,
      deedType: 'Warranty Deed',
      ownershipYears: 10.3,
    },
    taxes: [
      {
        taxYear: 2024,
        totalAssessed: 95000,
        annualTaxDue: 2300,
        amountDelinquent: 2300,
        isDelinquent: true,
        delinquentYears: 2,
        taxSaleStatus: 'Tax Lien Issued',
      },
      {
        taxYear: 2023,
        totalAssessed: 91000,
        annualTaxDue: 2200,
        amountDelinquent: 2200,
        isDelinquent: true,
        delinquentYears: 2,
        taxSaleStatus: 'Tax Lien Issued',
      },
    ],
    codeViolations: [
      {
        caseNumber: 'CE-2025-0551',
        violationDate: '2025-06-04T00:00:00.000Z',
        violationType: 'TALL_WEEDS',
        severity: 'MEDIUM',
        status: 'OPEN',
        description: 'Vegetation overgrowth exceeding 18 inches. Trash dumped near garage.',
        inspectorNotes: 'Property appears unoccupied. Water utility meter inactive.',
        complianceDate: null,
      },
    ],
    isVacantIndicator: true,
  },

  // 7. North Omaha (Critical Structural + Multiple Violations + Long Ownership 25 yrs)
  {
    parcelId: '0421000107',
    address: '3120 Pinkney St',
    city: 'Omaha',
    state: 'NE',
    zip: '68111',
    neighborhood: 'North Omaha',
    propertyType: 'SINGLE_FAMILY',
    yearBuilt: 1920,
    bedrooms: 3,
    bathrooms: 1,
    squareFeet: 1200,
    lotSizeSqFt: 5800,
    assessedValue: 74000,
    estimatedValue: 125000,
    estimatedEquityPct: 0.98,
    owner: {
      ownerName: 'Synthetic Legacy Trust Alpha (Demo)',
      mailingAddress: '3120 Pinkney St',
      mailingCity: 'Omaha',
      mailingState: 'NE',
      mailingZip: '68111',
      isAbsentee: false,
      isOutOfState: false,
      isCorporate: false,
      purchaseDate: '1999-02-14T00:00:00.000Z',
      purchasePrice: 31000,
      deedType: 'Warranty Deed',
      ownershipYears: 25.5,
    },
    taxes: [
      {
        taxYear: 2024,
        totalAssessed: 74000,
        annualTaxDue: 1800,
        amountDelinquent: 1800,
        isDelinquent: true,
        delinquentYears: 1,
        taxSaleStatus: null,
      },
    ],
    codeViolations: [
      {
        caseNumber: 'CE-2025-0320',
        violationDate: '2025-05-10T00:00:00.000Z',
        violationType: 'STRUCTURAL',
        severity: 'CRITICAL',
        status: 'CONDEMNED',
        description: 'Unsafe structural condition. Roof sag exceeding 8 inches with water penetration.',
        inspectorNotes: 'Placarded as Unfit for Human Habitation by Chief Building Official.',
        complianceDate: null,
      },
      {
        caseNumber: 'CE-2024-0812',
        violationDate: '2024-09-14T00:00:00.000Z',
        violationType: 'EXTERIOR_MAINTENANCE',
        severity: 'HIGH',
        status: 'NOTICE_ISSUED',
        description: 'Missing window panes and rotting porch framing.',
        inspectorNotes: 'No response to prior notice.',
        complianceDate: null,
      },
    ],
    isVacantIndicator: true,
  },

  // 8. Benson (High Equity 17 yrs + Tax Delinquent + In-State Absentee Bellevue)
  {
    parcelId: '0421000108',
    address: '6108 Military Ave',
    city: 'Omaha',
    state: 'NE',
    zip: '68104',
    neighborhood: 'Benson',
    propertyType: 'SINGLE_FAMILY',
    yearBuilt: 1940,
    bedrooms: 2,
    bathrooms: 1,
    squareFeet: 1040,
    lotSizeSqFt: 6000,
    assessedValue: 128000,
    estimatedValue: 180000,
    estimatedEquityPct: 0.90,
    owner: {
      ownerName: 'Demo Asset Portfolio 4 LLC (Demo)',
      mailingAddress: '1102 Galvin Rd S',
      mailingCity: 'Bellevue',
      mailingState: 'NE',
      mailingZip: '68005',
      isAbsentee: true,
      isOutOfState: false,
      isCorporate: true,
      purchaseDate: '2007-10-30T00:00:00.000Z',
      purchasePrice: 69000,
      deedType: 'Warranty Deed',
      ownershipYears: 17.0,
    },
    taxes: [
      {
        taxYear: 2024,
        totalAssessed: 128000,
        annualTaxDue: 2950,
        amountDelinquent: 2950,
        isDelinquent: true,
        delinquentYears: 1,
        taxSaleStatus: null,
      },
    ],
    codeViolations: [],
  },

  // 9. Millard / West Omaha (Clean control property / Moderate score baseline)
  {
    parcelId: '0421000109',
    address: '15204 Q St',
    city: 'Omaha',
    state: 'NE',
    zip: '68137',
    neighborhood: 'Millard',
    propertyType: 'SINGLE_FAMILY',
    yearBuilt: 1985,
    bedrooms: 4,
    bathrooms: 2.5,
    squareFeet: 2200,
    lotSizeSqFt: 9500,
    assessedValue: 310000,
    estimatedValue: 375000,
    estimatedEquityPct: 0.45,
    owner: {
      ownerName: 'Synthetic Homeowner Johnson (Demo)',
      mailingAddress: '15204 Q St',
      mailingCity: 'Omaha',
      mailingState: 'NE',
      mailingZip: '68137',
      isAbsentee: false,
      isOutOfState: false,
      isCorporate: false,
      purchaseDate: '2020-08-15T00:00:00.000Z',
      purchasePrice: 295000,
      deedType: 'Warranty Deed',
      ownershipYears: 4.0,
    },
    taxes: [
      {
        taxYear: 2024,
        totalAssessed: 310000,
        annualTaxDue: 7100,
        amountDelinquent: 0,
        isDelinquent: false,
        delinquentYears: 0,
        taxSaleStatus: null,
      },
    ],
    codeViolations: [],
  },

  // 10. North Omaha (Ames Ave Commercial / Multi-use with Tax + Vacancy + Chicago IL Absentee)
  {
    parcelId: '0421000110',
    address: '3814 Ames Ave',
    city: 'Omaha',
    state: 'NE',
    zip: '68111',
    neighborhood: 'North Omaha',
    propertyType: 'MULTI_FAMILY',
    yearBuilt: 1925,
    bedrooms: 6,
    bathrooms: 3,
    squareFeet: 3100,
    lotSizeSqFt: 8800,
    assessedValue: 115000,
    estimatedValue: 190000,
    estimatedEquityPct: 0.85,
    owner: {
      ownerName: 'Synthetic WindyCity Capital LLC (Demo)',
      mailingAddress: '233 S Wacker Dr #4800',
      mailingCity: 'Chicago',
      mailingState: 'IL',
      mailingZip: '60606',
      isAbsentee: true,
      isOutOfState: true,
      isCorporate: true,
      purchaseDate: '2010-06-11T00:00:00.000Z',
      purchasePrice: 65000,
      deedType: 'Sheriff Deed',
      ownershipYears: 14.2,
    },
    taxes: [
      {
        taxYear: 2024,
        totalAssessed: 115000,
        annualTaxDue: 2800,
        amountDelinquent: 2800,
        isDelinquent: true,
        delinquentYears: 2,
        taxSaleStatus: 'Tax Lien Issued',
      },
      {
        taxYear: 2023,
        totalAssessed: 110000,
        annualTaxDue: 2650,
        amountDelinquent: 2650,
        isDelinquent: true,
        delinquentYears: 2,
        taxSaleStatus: 'Tax Lien Issued',
      },
    ],
    codeViolations: [
      {
        caseNumber: 'CE-2025-0690',
        violationDate: '2025-07-02T00:00:00.000Z',
        violationType: 'EXTERIOR_MAINTENANCE',
        severity: 'HIGH',
        status: 'OPEN',
        description: 'Damaged storefront glass boarded with plywood; peeling paint on upper residential level.',
        inspectorNotes: 'Notice posted on entry.',
        complianceDate: null,
      },
    ],
    isVacantIndicator: true,
  },

  // 11. South Omaha (Hanscom Park Area — Tax Delinquent + 16yr Ownership + Absentee Kansas City MO)
  {
    parcelId: '0421000111',
    address: '1904 S 13th St',
    city: 'Omaha',
    state: 'NE',
    zip: '68108',
    neighborhood: 'South Omaha',
    propertyType: 'SINGLE_FAMILY',
    yearBuilt: 1908,
    bedrooms: 3,
    bathrooms: 1,
    squareFeet: 1350,
    lotSizeSqFt: 4800,
    assessedValue: 102000,
    estimatedValue: 160000,
    estimatedEquityPct: 0.91,
    owner: {
      ownerName: 'Synthetic Gateway Investors LLC (Demo)',
      mailingAddress: '1200 Main St #1500',
      mailingCity: 'Kansas City',
      mailingState: 'MO',
      mailingZip: '64105',
      isAbsentee: true,
      isOutOfState: true,
      isCorporate: true,
      purchaseDate: '2008-01-20T00:00:00.000Z',
      purchasePrice: 48000,
      deedType: 'Warranty Deed',
      ownershipYears: 16.6,
    },
    taxes: [
      {
        taxYear: 2024,
        totalAssessed: 102000,
        annualTaxDue: 2450,
        amountDelinquent: 2450,
        isDelinquent: true,
        delinquentYears: 1,
        taxSaleStatus: null,
      },
    ],
    codeViolations: [
      {
        caseNumber: 'CE-2025-0722',
        violationDate: '2025-07-20T00:00:00.000Z',
        violationType: 'TALL_WEEDS',
        severity: 'MEDIUM',
        status: 'OPEN',
        description: 'Grass and invasive vines enveloping side fence and gas meter.',
        inspectorNotes: 'Sent warning letter to MO registered agent.',
        complianceDate: null,
      },
    ],
  },

  // 12. Dundee (California St — Clean high equity hold / Low distress baseline)
  {
    parcelId: '0421000112',
    address: '5012 California St',
    city: 'Omaha',
    state: 'NE',
    zip: '68132',
    neighborhood: 'Dundee',
    propertyType: 'SINGLE_FAMILY',
    yearBuilt: 1932,
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1850,
    lotSizeSqFt: 7200,
    assessedValue: 290000,
    estimatedValue: 395000,
    estimatedEquityPct: 0.70,
    owner: {
      ownerName: 'Synthetic Resident Larson (Demo)',
      mailingAddress: '5012 California St',
      mailingCity: 'Omaha',
      mailingState: 'NE',
      mailingZip: '68132',
      isAbsentee: false,
      isOutOfState: false,
      isCorporate: false,
      purchaseDate: '2016-04-10T00:00:00.000Z',
      purchasePrice: 245000,
      deedType: 'Warranty Deed',
      ownershipYears: 8.4,
    },
    taxes: [
      {
        taxYear: 2024,
        totalAssessed: 290000,
        annualTaxDue: 6600,
        amountDelinquent: 0,
        isDelinquent: false,
        delinquentYears: 0,
        taxSaleStatus: null,
      },
    ],
    codeViolations: [],
  },
];

/**
 * Transforms synthetic fixtures through the provenance pipeline into fully populated PropertyDTO records
 */
export function buildSyntheticOmahaDataset(): {
  properties: PropertyDTO[];
  sourceRecords: SourceRecordDTO[];
  signals: SignalDTO[];
} {
  const allProperties: PropertyDTO[] = [];
  const allSourceRecords: SourceRecordDTO[] = [];
  const allSignals: SignalDTO[] = [];

  for (const raw of SYNTHETIC_OMAHA_FIXTURES) {
    const propertyId = `prop-${raw.parcelId}`;

    // 1. Create Source Records (Immutable raw provenance)
    const assessorSourceId = `src-assessor-${raw.parcelId}`;
    const rawAssessorRecord: SourceRecordDTO = {
      id: assessorSourceId,
      propertyId,
      sourceName: 'DOUGLAS_COUNTY_ASSESSOR',
      sourceRecordId: `PIN-${raw.parcelId}`,
      rawPayloadJson: {
        pin: raw.parcelId,
        situs: raw.address,
        neighborhood: raw.neighborhood,
        assessedValue: raw.assessedValue,
        yearBuilt: raw.yearBuilt,
        owner: raw.owner,
      },
      ingestionRunId: 'run-synthetic-initial-01',
      matchedStatus: 'MATCHED',
      ingestedAt: '2025-08-01T08:00:00.000Z',
    };
    allSourceRecords.push(rawAssessorRecord);

    // 2. Build Ownership Record DTO
    const ownershipDTO = {
      id: `own-${raw.parcelId}`,
      propertyId,
      ownerName: raw.owner.ownerName,
      mailingAddress: raw.owner.mailingAddress,
      mailingCity: raw.owner.mailingCity,
      mailingState: raw.owner.mailingState,
      mailingZip: raw.owner.mailingZip,
      isAbsentee: raw.owner.isAbsentee,
      isOutOfState: raw.owner.isOutOfState,
      isCorporate: raw.owner.isCorporate,
      purchaseDate: raw.owner.purchaseDate,
      purchasePrice: raw.owner.purchasePrice,
      deedType: raw.owner.deedType,
      ownershipYears: raw.owner.ownershipYears,
      isCurrent: true,
      createdAt: raw.owner.purchaseDate,
    };

    // 3. Build Tax Records DTO
    const taxDTOs = raw.taxes.map((t, idx) => ({
      id: `tax-${raw.parcelId}-${t.taxYear}`,
      propertyId,
      taxYear: t.taxYear,
      totalAssessed: t.totalAssessed,
      annualTaxDue: t.annualTaxDue,
      amountDelinquent: t.amountDelinquent,
      isDelinquent: t.isDelinquent,
      delinquentYears: t.delinquentYears,
      taxSaleStatus: t.taxSaleStatus,
      createdAt: `2025-01-15T00:00:00.000Z`,
    }));

    // 4. Build Code Violation DTOs
    const violationDTOs = raw.codeViolations.map((c, idx) => ({
      id: `code-${raw.parcelId}-${idx}`,
      propertyId,
      caseNumber: c.caseNumber,
      violationDate: c.violationDate,
      violationType: c.violationType,
      severity: c.severity,
      status: c.status,
      description: c.description,
      inspectorNotes: c.inspectorNotes,
      complianceDate: c.complianceDate,
      createdAt: c.violationDate,
    }));

    // 5. Extract Domain Signals
    const propertySignals: SignalDTO[] = [];

    // Absentee Signal
    if (raw.owner.isAbsentee) {
      propertySignals.push({
        id: `sig-absentee-${raw.parcelId}`,
        propertyId,
        signalType: 'ABSENTEE_OWNER',
        category: 'OWNERSHIP_SIGNAL',
        scoreContribution: raw.owner.isOutOfState ? 20 : 12,
        severity: raw.owner.isOutOfState ? 'HIGH' : 'MEDIUM',
        eventDate: raw.owner.purchaseDate,
        discoveredAt: '2025-08-01T08:00:00.000Z',
        status: 'ACTIVE',
        sourceType: 'DOUGLAS_COUNTY_ASSESSOR',
        sourceRecordId: assessorSourceId,
        metadataJson: {
          mailingState: raw.owner.mailingState,
          isOutOfState: raw.owner.isOutOfState,
        },
      });
    }

    // Tax Delinquency Signal
    const delinquentTax = raw.taxes.find((t) => t.isDelinquent);
    if (delinquentTax) {
      propertySignals.push({
        id: `sig-tax-${raw.parcelId}`,
        propertyId,
        signalType: 'TAX_DELINQUENT',
        category: 'FINANCIAL_DISTRESS',
        scoreContribution: delinquentTax.delinquentYears >= 2 ? 25 : 15,
        severity: delinquentTax.delinquentYears >= 2 ? 'CRITICAL' : 'HIGH',
        eventDate: '2025-01-15T00:00:00.000Z',
        discoveredAt: '2025-08-01T08:00:00.000Z',
        status: 'ACTIVE',
        sourceType: 'DOUGLAS_COUNTY_TREASURER',
        sourceRecordId: assessorSourceId,
        metadataJson: {
          delinquentYears: delinquentTax.delinquentYears,
          amountDelinquent: delinquentTax.amountDelinquent,
        },
      });
    }

    // Code Violations Signals
    for (const v of raw.codeViolations) {
      if (v.status !== 'RESOLVED') {
        const isStructural = v.violationType === 'STRUCTURAL' || v.violationType === 'VACANT_UNSECURED';
        propertySignals.push({
          id: `sig-code-${raw.parcelId}-${v.caseNumber}`,
          propertyId,
          signalType: isStructural ? 'STRUCTURAL_CODE_VIOLATION' : 'EXTERIOR_CODE_VIOLATION',
          category: 'PROPERTY_DISTRESS',
          scoreContribution: isStructural ? 25 : 15,
          severity: isStructural ? 'CRITICAL' : 'HIGH',
          eventDate: v.violationDate,
          discoveredAt: v.violationDate,
          status: 'ACTIVE',
          sourceType: 'CITY_OMAHA_CODE_ENFORCEMENT',
          sourceRecordId: assessorSourceId,
          metadataJson: {
            caseNumber: v.caseNumber,
            description: v.description,
          },
        });
      }
    }

    // Vacancy Signal
    if (raw.isVacantIndicator) {
      propertySignals.push({
        id: `sig-vacant-${raw.parcelId}`,
        propertyId,
        signalType: 'VACANCY_INDICATOR',
        category: 'PROPERTY_DISTRESS',
        scoreContribution: 15,
        severity: 'HIGH',
        eventDate: '2025-06-01T00:00:00.000Z',
        discoveredAt: '2025-08-01T08:00:00.000Z',
        status: 'ACTIVE',
        sourceType: 'CITY_OMAHA_INSPECTION',
        sourceRecordId: assessorSourceId,
        metadataJson: { vacancyStatus: 'BOARDED_OR_UNOCCUPIED' },
      });
    }

    allSignals.push(...propertySignals);

    // 6. Calculate Opportunity Score via Configurable Rule Engine
    const scoreResult = calculateOpportunityScore({
      ownership: ownershipDTO,
      taxRecords: taxDTOs,
      codeViolations: violationDTOs,
      signals: propertySignals,
      referenceDate: new Date('2025-08-28T00:00:00.000Z'),
      municipalJurisdiction: 'INSIDE_OMAHA',
    });

    // 7. Synthesize Derived Chronological Property Events
    const events = synthesizePropertyTimeline({
      propertyId,
      ownership: ownershipDTO,
      taxRecords: taxDTOs,
      codeViolations: violationDTOs,
      signals: propertySignals,
    });

    // 8. Construct Final Property DTO
    allProperties.push({
      id: propertyId,
      parcelId: raw.parcelId,
      address: raw.address,
      city: raw.city,
      state: raw.state,
      zip: raw.zip,
      neighborhood: raw.neighborhood,
      propertyType: raw.propertyType,
      yearBuilt: raw.yearBuilt,
      bedrooms: raw.bedrooms,
      bathrooms: raw.bathrooms,
      squareFeet: raw.squareFeet,
      lotSizeSqFt: raw.lotSizeSqFt,
      assessedValue: raw.assessedValue,
      estimatedValue: raw.estimatedValue,
      estimatedEquityPct: raw.estimatedEquityPct,
      opportunityScore: scoreResult.totalScore,
      dataConfidence: scoreResult.dataConfidence,
      scoreBreakdownJson: scoreResult.breakdown,
      lastScoredAt: new Date().toISOString(),
      createdAt: '2025-08-01T08:00:00.000Z',
      updatedAt: new Date().toISOString(),
      ownershipRecords: [ownershipDTO],
      taxRecords: taxDTOs,
      codeViolations: violationDTOs,
      signals: propertySignals,
      events,
      savedProperties: [],
      notes: [],
      municipalJurisdiction: 'INSIDE_OMAHA',
    });
  }

  return {
    properties: allProperties,
    sourceRecords: allSourceRecords,
    signals: allSignals,
  };
}
