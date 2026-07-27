<div align="center">

# Geiger Property

**Property management, end to end.**

Properties, tenants, leasing, maintenance, and accounting — one system from listing to renewal.

Part of the [Geiger](#the-geiger-suite) suite.

</div>

---

## Overview

Geiger Property is the property-management application of the Geiger suite. It covers the full residential management lifecycle: modelling a portfolio down to the unit, marketing vacancies, screening applicants, building and signing leases, collecting rent, dispatching maintenance, and reporting back to owners.

It is built for property managers and small-to-mid portfolios who need the depth of an enterprise PM system without its cost or setup burden.

## Highlights

| Area | What it does |
| --- | --- |
| **Property** | Properties, units, portfolios, buildings and blocks, floor plans, unit types, media, amenities, ownership splits, unit turns, and keys and access. |
| **Tenants** | Tenant directory and profiles, households and occupants, a resident portal, documents, communication log, announcements, notices, renters insurance, and the move-out pipeline. |
| **Leasing** | Lease builder and templates, state-specific leases, e-signature, addenda, security deposits, move-in and move-out with inspections, renewals, rent increases, expirations, and violations. |
| **Applications & screening** | Online applications and forms, tenant screening, credit and background checks, eviction history, income verification, application fees, and decisioning. |
| **Listings & marketing** | Vacancy listings, syndication and ILS distribution, showings and tours, virtual tours, rent comparables, waitlists, promotions, and self-guided showings. |
| **Maintenance** | Work orders and requests, vendors and assignments, photos and attachments, preventive and recurring work, inspections, make-ready boards, a vendor portal, estimates and bids, parts inventory, and meter readings. |
| **Accounting** | Rent collection, online payments, autopay, recurring charges, late fees, payment plans, transaction history, chart of accounts, payables and receivables, deposits, budgeting, and banking. |
| **Owners** | Owner directory and portal, management fees, 1099 and tax, and owner documents. |
| **Documents & eSign** | Document library, templates, e-signature, shared files, compliance documents, and document requests. |
| **Reports** | Rent roll, delinquency, occupancy, owner statements, income statement, balance sheet, cash flow, maintenance and leasing reports, and a custom report builder. |
| **Leads & CRM** | Prospects, pipeline, follow-ups, lead sources, and lead-to-lease tracking. |

## Tech stack

- **Framework** — Next.js 16 (App Router, SSR/SSG) and React 19
- **Styling** — Tailwind CSS v4 and shadcn/ui, with the shared [`@geiger/ui`](https://github.com/bhargavjoshi1237/geiger-ui) component library
- **Icons** — Lucide
- **Backend** — Supabase (Postgres, Auth, Storage)
- **Payments** — Stripe
- **Other** — Leaflet (maps), React Flow (floor plans), Recharts (reporting), date-fns

## Getting started

### Prerequisites

- Node.js 20 or later
- A Supabase project and a Stripe account

### Installation

```bash
npm install
```

### Environment

Create a `.env` file in the project root:

```bash
# Runtime (browser)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Server-only
STRING_URI=your-direct-postgres-connection-string    # migrations only
GEIGER_EMAIL_API_URL=your-suite-email-endpoint
GEIGER_EMAIL_API_KEY=your-suite-email-key
```

### Database

Idempotent SQL lives in `supabase/sqls/` and runs in filename order:

```bash
npm run db:push
```

### Develop

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project structure

```
app/
  project/[projectId]/   Project-scoped management workspace
  api/                   Route handlers
components/
  internal/screens/      Workspace screens by area (properties, units, tenants,
                         leasing, maintenance, accounting, portfolios, floor plans…)
  internal/shared/       Shared screen kit (headers, tables, stats, dialogs)
  ui/                    shadcn primitives
lib/supabase/            Data-access layer — one module per entity
supabase/sqls/           Idempotent SQL schema and policies
scripts/run-sqls.js      Migration runner (npm run db:push)
docs/                    Feature planning and competitive research
```

## Conventions

This codebase follows a consistent set of patterns. Read these before contributing:

- [`AGENTS.md`](AGENTS.md) — working notes for this Next.js version
- [`MODULE_CONVENTIONS.md`](MODULE_CONVENTIONS.md) — how to build a workspace screen
- [`SUPABASE_CONVENTIONS.md`](SUPABASE_CONVENTIONS.md) — the data-layer playbook
- [`crafting.md`](crafting.md) — UI craft and quality bar

## Documentation

- [`docs/feature-list.md`](docs/feature-list.md) — the full feature inventory
- [`docs/FEATURE_MATRIX_2026.md`](docs/FEATURE_MATRIX_2026.md) — feature matrix
- [`docs/competitive-feature-matrix.md`](docs/competitive-feature-matrix.md) — competitive research
- [`docs/SIDEBAR_PLAN_2026.md`](docs/SIDEBAR_PLAN_2026.md) — navigation plan

## The Geiger suite

Geiger Property is one application in the broader Geiger suite, alongside Geiger Flow, Geiger Events, and Geiger Notes. Every product shares one Supabase project, a common design language, and the [`@geiger/ui`](https://github.com/bhargavjoshi1237/geiger-ui) component library, so each app feels native to the whole.

## License

Private and unpublished. All rights reserved.
