export interface ScoringRuleDefinition {
  id: string;
  category: 'FINANCIAL' | 'PROPERTY' | 'OWNERSHIP' | 'RECENCY' | 'COMPOUND';
  label: string;
  points: number;
  description: string;
  threshold?: number;
  thresholdYears?: number;
}

export interface ScoringConfiguration {
  maxScore: number;
  categories: {
    FINANCIAL_DISTRESS: {
      maxPoints: number;
      rules: {
        TAX_DELINQUENT_MULTI_YEAR: ScoringRuleDefinition;
        TAX_DELINQUENT_SINGLE_YEAR: ScoringRuleDefinition;
        HIGH_DELINQUENT_BALANCE: ScoringRuleDefinition;
      };
    };
    PROPERTY_DISTRESS: {
      maxPoints: number;
      rules: {
        CODE_VIOLATION_STRUCTURAL: ScoringRuleDefinition;
        CODE_VIOLATION_EXTERIOR: ScoringRuleDefinition;
        CODE_VIOLATION_REPEAT: ScoringRuleDefinition;
        VACANCY_INDICATOR: ScoringRuleDefinition;
      };
    };
    OWNERSHIP_SIGNALS: {
      maxPoints: number;
      rules: {
        ABSENTEE_OUT_OF_STATE: ScoringRuleDefinition;
        ABSENTEE_IN_STATE: ScoringRuleDefinition;
        LONG_TERM_OWNERSHIP: ScoringRuleDefinition;
        MEDIUM_TERM_OWNERSHIP: ScoringRuleDefinition;
      };
    };
    RECENCY_BONUS: {
      maxPoints: number;
      rules: {
        SIGNAL_UNDER_30_DAYS: ScoringRuleDefinition;
        SIGNAL_UNDER_90_DAYS: ScoringRuleDefinition;
      };
    };
    COMPOUND_BONUS: {
      points: number;
      minDistinctCategories: number;
      rule: ScoringRuleDefinition;
    };
  };
}

export const SCORING_CONFIG: ScoringConfiguration = {
  maxScore: 100,
  categories: {
    FINANCIAL_DISTRESS: {
      maxPoints: 35,
      rules: {
        TAX_DELINQUENT_MULTI_YEAR: {
          id: 'TAX_DELINQUENT_MULTI_YEAR',
          category: 'FINANCIAL',
          label: 'Douglas County Tax Delinquent (2+ Years)',
          points: 25,
          description: 'Property taxes are past due for multiple consecutive tax years.',
        },
        TAX_DELINQUENT_SINGLE_YEAR: {
          id: 'TAX_DELINQUENT_SINGLE_YEAR',
          category: 'FINANCIAL',
          label: 'Douglas County Tax Delinquent (1 Year)',
          points: 15,
          description: 'Property taxes are past due for the most recent tax year.',
        },
        HIGH_DELINQUENT_BALANCE: {
          id: 'HIGH_DELINQUENT_BALANCE',
          category: 'FINANCIAL',
          label: 'Delinquent Balance > $3,000',
          points: 10,
          threshold: 3000,
          description: 'Total unpaid county property taxes exceed $3,000 threshold.',
        },
      },
    },
    PROPERTY_DISTRESS: {
      maxPoints: 35,
      rules: {
        CODE_VIOLATION_STRUCTURAL: {
          id: 'CODE_VIOLATION_STRUCTURAL',
          category: 'PROPERTY',
          label: 'Structural / Condemnation / Unsecured Code Violation',
          points: 25,
          description: 'City of Omaha active code case for serious structural or safety hazards.',
        },
        CODE_VIOLATION_EXTERIOR: {
          id: 'CODE_VIOLATION_EXTERIOR',
          category: 'PROPERTY',
          label: 'Active Exterior Maintenance Violation',
          points: 15,
          description: 'City of Omaha active violation for exterior siding, roof, junk, or tall weeds.',
        },
        CODE_VIOLATION_REPEAT: {
          id: 'CODE_VIOLATION_REPEAT',
          category: 'PROPERTY',
          label: 'Repeat Code Violations (2+ cases in 24 months)',
          points: 10,
          description: 'Multiple code enforcement citations filed against the parcel.',
        },
        VACANCY_INDICATOR: {
          id: 'VACANCY_INDICATOR',
          category: 'PROPERTY',
          label: 'Documented Vacancy / Board-Up Indicator',
          points: 15,
          description: 'City or municipal inspection reports unoccupied or boarded structure.',
        },
      },
    },
    OWNERSHIP_SIGNALS: {
      maxPoints: 25,
      rules: {
        ABSENTEE_OUT_OF_STATE: {
          id: 'ABSENTEE_OUT_OF_STATE',
          category: 'OWNERSHIP',
          label: 'Absentee Owner (Out-of-State Mailing)',
          points: 20,
          description: 'Owner mailing address is located outside Nebraska (inferred motivation signal).',
        },
        ABSENTEE_IN_STATE: {
          id: 'ABSENTEE_IN_STATE',
          category: 'OWNERSHIP',
          label: 'Absentee Owner (Different In-State Address)',
          points: 12,
          description: 'Owner mailing address differs from the property situs address.',
        },
        LONG_TERM_OWNERSHIP: {
          id: 'LONG_TERM_OWNERSHIP',
          category: 'OWNERSHIP',
          label: 'Long-Term Ownership (>15 Years / High Estimated Equity)',
          points: 10,
          thresholdYears: 15,
          description: 'Owned for over 15 years, indicating substantial mortgage paydown/equity.',
        },
        MEDIUM_TERM_OWNERSHIP: {
          id: 'MEDIUM_TERM_OWNERSHIP',
          category: 'OWNERSHIP',
          label: 'Moderate Ownership (8-15 Years)',
          points: 5,
          thresholdYears: 8,
          description: 'Owned between 8 and 15 years.',
        },
      },
    },
    RECENCY_BONUS: {
      maxPoints: 10,
      rules: {
        SIGNAL_UNDER_30_DAYS: {
          id: 'SIGNAL_UNDER_30_DAYS',
          category: 'RECENCY',
          label: 'New Distress Signal Recorded (< 30 Days)',
          points: 10,
          description: 'A fresh code violation or tax delinquency event occurred within the past 30 days.',
        },
        SIGNAL_UNDER_90_DAYS: {
          id: 'SIGNAL_UNDER_90_DAYS',
          category: 'RECENCY',
          label: 'Recent Distress Signal (< 90 Days)',
          points: 5,
          description: 'A distress event was recorded within the past 90 days.',
        },
      },
    },
    COMPOUND_BONUS: {
      points: 10,
      minDistinctCategories: 3,
      rule: {
        id: 'COMPOUND_DISTRESS_BONUS',
        category: 'COMPOUND',
        label: 'Multi-Distress Convergence Bonus (3+ Categories)',
        points: 10,
        description: 'Property exhibits concurrent distress across financial, property, and absentee ownership dimensions.',
      },
    },
  },
};
