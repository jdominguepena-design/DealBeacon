# DealBeacon — Omaha MVP

Off-market real estate intelligence platform designed for the **Omaha, Nebraska** market (Douglas County).

DealBeacon aggregates disparate public distress indicators (City of Omaha code violations, Douglas County delinquent property taxes, absentee ownership, long-term tenure, estimated equity) into a unified property record, scoring each property with an explainable 0–100 Opportunity Score and presenting an interactive chronological narrative timeline.

---

## Features (Milestone 1)

1. **Daily Opportunity Prioritization Feed** (`/`): Answers *"What should I look at today?"* with top-ranked off-market leads, KPI stat cards, and live distress activity streams.
2. **Property Intelligence Table** (`/properties`): Multi-signal filtering across Douglas County neighborhoods, score sliders, absentee toggles, delinquent taxes, and code citations.
3. **Central Property Intelligence Record** (`/properties/[id]`):
   - **Score Explainability Card**: Itemized rule-by-rule point contributors.
   - **Property Characteristics**: Assessed value vs inferred market value.
   - **Ownership & Absentee Intelligence**: Inferred absentee determination with mailing address comparison.
   - **Tax & Code Distress**: Douglas County Treasurer multi-year delinquent balances and City of Omaha code violations with inspector notes.
   - **Interactive Chronological Timeline**: Synthesized narrative of property acquisition, address changes, citations, and liens.
   - **Investor Action Bar**: Save property, pipeline stage tracking (`New`, `Researching`, `Contacting`, `Follow Up`, `Closed`), and timestamped notes log.
4. **Saved Lead Pipeline** (`/saved`): Visual pipeline grouped by outreach and acquisition stages.
5. **Admin Operations & Provenance Inspector** (`/admin`):
   - Ingestion run monitor.
   - Raw Source Record JSON inspector (verifying immutable provenance).
   - One-click Opportunity Score recalculator.
   - Configurable Scoring Rules matrix viewer.

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Database (PostgreSQL)
Edit `.env` with your PostgreSQL connection URL (supports local PostgreSQL, Neon, or Supabase):
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dealbeacon?schema=public"
```

To push the schema and seed the synthetic dataset into PostgreSQL:
```bash
npm run db:push
npm run db:seed
```

> **Note**: DealBeacon includes a resilient in-memory repository fallback, allowing full evaluation and interaction immediately even before connecting an external database.

### 3. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Architecture

- **Framework**: Next.js 16.3.3 (Active LTS, App Router, React 19, TypeScript)
- **Database & ORM**: Prisma ORM with PostgreSQL (`prisma/schema.prisma`)
- **Scoring Engine**: Pure deterministic rule engine (`src/lib/scoring/engine.ts`) driven by centralized configuration (`src/lib/scoring/scoring.config.ts`)
- **Provenance Pipeline**: Abstract adapter architecture (`src/lib/ingestion/`) preserving immutable `SourceRecord` raw JSON payloads
