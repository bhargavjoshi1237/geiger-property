<div align="center">

# Geiger Property

**Property management, end to end.**

Properties, tenants, leasing, maintenance, and accounting — one system from listing to renewal.

Part of the [Geiger](#the-geiger-suite) suite.

</div>

---

## Overview

Geiger Property is the property-management application of the Geiger suite. It covers the full residential management lifecycle: modelling a portfolio down to the unit, tracking vacancies and applications, recording screening results, preparing leases and tracking signatures, collecting rent, dispatching maintenance, and reporting back to owners.

It is built for property managers and small-to-mid portfolios who need the depth of an enterprise PM system without its cost or setup burden.

## Highlights

| Area | What it does |
| --- | --- |
| **Property** | Properties, units, portfolios, buildings and blocks, floor plans, unit types, media, amenities, ownership splits, unit turns, and keys and access. |
| **Tenants** | Tenant directory and profiles, households and occupants, a resident portal, documents, communication log, notices, renters insurance, and the move-out pipeline. |
| **Leasing** | Lease builder and templates, state-specific leases, signature tracking, addenda, security deposits, move-in and move-out with inspections, renewals, rent increases, expirations, and violations. |
| **Applications & screening** | Application tracking, screening results recorded by hand (credit, background, eviction history and income; no screening provider is connected yet), application fee tracking, and decisioning. |
| **Listings & marketing** | Vacancy listings (tracked internally, with no public listing page yet), showings and tours, rent comparables, waitlists, and promotions. |
| **Maintenance** | Work orders and requests, vendors and assignments, photos and attachments, preventive and recurring work, inspections, make-ready boards, a vendor portal, estimates and bids, parts inventory, and meter readings. |
| **Accounting** | Rent collection, online payments, autopay, recurring charges, late fees, transaction history, chart of accounts, payables and receivables, deposits, budgeting, and banking. |
| **Owners** | Owner directory and portal, management fees, a vendor 1099 report, and owner documents. |
| **Documents & eSign** | Document library, templates, signature tracking (statuses are set by hand; no e-signature provider is connected yet), shared files, and compliance documents. |
| **Reports** | Rent roll, delinquency, occupancy, owner statements, income statement, balance sheet, cash flow, and maintenance and leasing reports. |
| **Leads & CRM** | Prospects, pipeline, follow-ups, lead sources, and lead-to-lease tracking. |

## Tech stack

- **Framework** — Next.js 16 (App Router, SSR/SSG) and React 19
- **Styling** — Tailwind CSS v4 and shadcn/ui, with the shared [`@geiger/ui`](https://github.com/bhargavjoshi1237/geiger-ui) component library
- **Icons** — Lucide
- **Backend** — Supabase (Postgres, Auth, Storage)
- **Payments** — Stripe
- **Other** — React Flow (automation builder), Recharts (reporting), date-fns

## Getting started

### Prerequisites

- Node.js 20 or later
- A Supabase project and a Stripe account

### Installation

```bash
npm install
```

### Environment

Create a `.env` file in the project root (on Vercel, the project's Environment Variables). Only `NEXT_PUBLIC_` variables reach the browser, so nothing secret ever gets that prefix; every other variable is read only by server code (`lib/supabase/admin.js`, `lib/stripe/server.js`, `lib/email/client.js` and `lib/auth/staff.js` import `server-only`).

```bash
# Browser (public by design)
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
NEXT_PUBLIC_APP_URL=https://geiger.studio                 # absolute links in emails, receipts, alerts
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…              # embedded payment forms
NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN=inbound.example.com      # intake addresses shown to staff (optional)
# NEXT_PUBLIC_BASE_PATH is set by next.config.mjs (/property in production); don't set it.

# Server only
SUPABASE_SERVICE_ROLE_KEY=<service role key>              # jobs, webhooks, portal, staff routes after requireStaff
STRING_URI=postgres://…                                   # migrations (db:*) and the test:rls / test:audit checks only
GEIGER_EMAIL_API_URL=https://geiger.studio                # geiger-dash's suite email API
GEIGER_EMAIL_API_KEY=gk_live_…
STRIPE_SECRET_KEY=sk_live_…                               # or GEIGER_STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=whsec_…                             # or GEIGER_STRIPE_WEBHOOK_SECRET
CRON_SECRET=<random>                                      # Vercel Cron bearer for /api/cron/*
INBOUND_EMAIL_SECRET=<random>                             # bearer for /api/messages/inbound
INBOUND_EMAIL_DOMAIN=inbound.example.com                  # intake mailbox domain (server side)
JOBS_ALERT_EMAILS=ops@example.com                         # scheduler failure alerts (comma-separated)
GEIGER_SECRETS_KEY=<32 bytes, base64 or hex>              # encrypts property.integration_secrets (AES-256-GCM)
GEIGER_SECRETS_KEY_PREVIOUS=                              # old key(s) during a rotation, comma-separated
TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:5349   # chat calls behind strict NATs (optional)
TURN_SECRET=<coturn static-auth-secret>                   # signs short-lived TURN credentials (/api/chat/turn)
PROPERTY_OPERATOR_EMAILS=ops@example.com                  # who may open /operator (comma-separated)

# Development and tests only
ORCH_BRIEFING_DRY_RUN=1                                   # write briefings without sending them
DATA_IO_LIVE=1                                            # opt-in live schema check in npm test
RLS_APPLY_UP=1                                            # test:rls dry-runs a migration's @up first
```

Generate random values with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. TURN is optional: without it calls use public STUN only. The old `NEXT_PUBLIC_TURN_*` variables are gone (a public TURN password); remove them where they are set.

### Database

Schema changes are timestamped SQL migrations in `supabase/migrations/`, applied
in version order by [`@geiger/orm`](https://github.com/bhargavjoshi1237/geiger-orm)
and recorded in `property.geiger_migrations`:

```bash
npm run db:status                     # applied vs pending
npm run db:new -- <name>              # scaffold a migration
npm run db:push                       # apply everything pending
npm run db:seed                       # re-runnable data
```

See [`MIGRATION_CONVENTIONS.md`](conventions/MIGRATION_CONVENTIONS.md) before writing any DDL.

### Develop

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Security

- **Staff API routes** call `requireStaff(request, projectId, { permission })` from `lib/auth/staff.js`: the caller must be a project member holding an active Property grant (`property.member_project_ids`, the rule every RLS policy uses) and hold the key (`property.rbac_allows`). Every handler under `app/api` is listed in `lib/auth/route_permissions.js`; `npm test` fails when one is missing or declares a different key.
- **Database**: every `property` table is project-member RLS, functions are closed to `anon`, the ledger is immutable outside its RPCs, and secrets sit in the closed `property.integration_secrets` (encrypted). `npm run test:audit` runs the Security Advisor equivalents and `npm run test:rls` the persona matrix; CI (`.github/workflows/ci.yml`) runs both against `TEST_STRING_URI` when that secret is set.
- **Operators**: `/operator` lists what belongs to no project (unattributed inbound mail, scheduler failures) for `PROPERTY_OPERATOR_EMAILS`; everyone else gets a 404.
- **Headers** (`next.config.mjs`): CSP limited to the app, the Supabase project and Stripe; `frame-ancestors 'self'`; `Referrer-Policy`; `nosniff`; `Permissions-Policy`; HSTS in production.
- **Vercel WAF rate limits** (not deployed yet; at launch, create them in the Firewall of the project that receives public `/property` traffic, today geiger-dash's rewrite):

  | Path | Limit (per IP) | Action |
  |---|---|---|
  | `/property/api/portal/auth/otp` | 5 / 10 min | 429 (deny) |
  | `/property/api/portal/auth/verify` | 10 / 10 min | 429 (deny) |
  | `/property/api/payments/link/*` | 30 / min | 429 (deny) |
  | `/property/api/payments/verify` | 30 / min | 429 (deny) |

  Supabase already limits sign-in emails per address; the OTP rule stops one IP cycling through addresses.

## Project structure

```
app/
  project/[projectId]/   Project-scoped management workspace
  api/                   Route handlers
components/
  internal/screens/      Workspace screens by area (properties, units, tenants,
                         leasing, maintenance, accounting, portfolios, floor plans…)
  internal/shared/       Shared screen kit (headers, tables, stats, dialogs)
  ui/                    legacy local primitives (unused; use @geiger/ui)
lib/supabase/            Data-access layer — one module per entity
supabase/migrations/     Timestamped @up/@down migrations (npm run db:push)
docs/                    Feature planning and competitive research
```

## Conventions

This codebase follows a consistent set of patterns. Read these before contributing:

- [`AGENTS.md`](AGENTS.md) — working notes for this Next.js version
- [`MODULE_CONVENTIONS.md`](conventions/MODULE_CONVENTIONS.md) — how to build a workspace screen
- [`SUPABASE_CONVENTIONS.md`](conventions/SUPABASE_CONVENTIONS.md) — the data-layer playbook
- [`MIGRATION_CONVENTIONS.md`](conventions/MIGRATION_CONVENTIONS.md) — schema changes and `@geiger/orm`
- [`crafting.md`](conventions/crafting.md) — UI craft and quality bar

## Documentation

- [`docs/feature-list.md`](docs/feature-list.md) — the full feature inventory
- [`docs/FEATURE_MATRIX_2026.md`](docs/FEATURE_MATRIX_2026.md) — feature matrix
- [`docs/competitive-feature-matrix.md`](docs/competitive-feature-matrix.md) — competitive research
- [`docs/SIDEBAR_PLAN_2026.md`](docs/SIDEBAR_PLAN_2026.md) — navigation plan

## The Geiger suite

Geiger Property is one application in the broader Geiger suite, alongside Geiger Flow, Geiger Events, and Geiger Notes. Every product shares one Supabase project, a common design language, and the [`@geiger/ui`](https://github.com/bhargavjoshi1237/geiger-ui) component library, so each app feels native to the whole.

## License

Private and unpublished. All rights reserved.
