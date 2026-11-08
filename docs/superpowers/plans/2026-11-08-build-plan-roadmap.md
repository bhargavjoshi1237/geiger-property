# Build plan roadmap: every item in mri/build_plan, in order

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to run this roadmap wave by wave. Each item's full spec (files, data model, steps, acceptance criteria) lives in `mri/build_plan/<file>.md` under its `#### <ID>` heading; this roadmap decides order, parallel streams, decisions and the per-item protocol. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every in-scope item of `mri/build_plan` (files 1–7, plus three new enabling items) cleanly, in launch order, with parallel subagents.

**Architecture:** One product (Geiger Property) with a Settings → Modules switch for optional verticals. Work runs in phases (one git branch each); a phase runs in waves of parallel items, each built by one subagent in its own git worktree and merged into the phase branch after review.

**Tech Stack:** Next.js 16 App Router (JS), Supabase (`property` schema) via `@geiger/orm` migrations, `@geiger/ui`, `@geiger/rbac`, `@geiger/notify`, `@geiger/pay` (Stripe Connect), geiger-dash email/billing.

## Global Constraints

- Read `AGENTS.md`, `CLAUDE.md`, `MODULE_CONVENTIONS.md`, `SUPABASE_CONVENTIONS.md`, `MIGRATION_CONVENTIONS.md`, `crafting.md` before writing code. Next.js 16 differs from training data: read the relevant guide in `node_modules/next/dist/docs/` before using a Next API.
- UI: `@geiger/ui` components only (no local `components/ui`), Lucide icons, match existing screens and Geiger Flow / Notes. `LogoLoading` (no `name` prop; 32–40px panel, 40–56px section, 72–96px page) for section and page loaders; `Loader2` on buttons and inline indicators.
- Comments: concise single-line comments only.
- Migrations: `npm run db:new <name>`, then `npm run db:status` → `npm run db:push` → `npm run db:status`. Never edit an applied migration. Self-contained, idempotent (`if not exists`, `create or replace`, guarded `do $$` blocks), with an `-- @down`. Before creating a table, confirm the name is unused in the live DB (`select to_regclass('property.<name>')`): about 80 orphan tables exist, including `ai_runs`, `ai_insights`, `portal_accounts`, `portal_branding`.
- Soft delete only (`deleted_at`); every read filters `deleted_at is null`.
- Ledger items: post only through server routes (`requireStaff` + permission check + service-role client + `postBuilt`), use the idempotency-key registry in file 1, prove the Trial Balance balances, `select * from property.ledger_unbalanced_entries` is empty, and a re-run posts nothing new.
- Tests: `npm test` (node:test, `lib/**/*.test.js`) for pure logic; an end-to-end script against the demo project `ebcc7910-1a0e-4e91-8c3b-752f3c4292d3` for acceptance criteria, which soft-deletes everything it creates. Never send real email or SMS during tests (demo notifications are disabled; keep it that way). Don't flip shared demo settings such as `billing_settings.jobsPaused` during tests (parallel agents race on them); pass overrides to the function under test, or use a throwaway project row.
- `npm run lint` clean on touched files. Run `next build` only for significant UI changes, and only from the main checkout.
- No AI features (standing decision): ORCH-20–26, PLAT-18 and INTL-14 are not built.
- Nothing is pushed to GitHub or deployed. Other suite repos (geiger-dash, geiger-pay, geiger-notify) are changed on their own local branches and committed locally only.
- Crons stay off in `vercel.json` until the user says launch.

---

## Decisions (2026-11-08)

| Topic | Decision |
|---|---|
| Packaging | One product + **MOD-01** Settings → Modules switch. No separate apps. |
| HOA / associations | Build last (Phase 14) as the Associations module. Ask the data-model question (model A reuse leases vs model B ownership accounts) when Phase 14 starts. |
| Vendor-dependent items | Skipped for now and left open (Track V). Mixed items build their non-vendor part now and stay "Partial". |
| Money flow | Stripe Connect through `@geiger/pay` (**PAY-01**), before any item that takes live money. Needs Stripe test keys from the user for the test-mode run. |
| Other suite repos | Change and commit locally on a branch; never push or deploy. |
| Branches | `main` holds the merged orchestrator. One branch per phase (`phase-N/<slug>`), each item on `item/<ID>` in a worktree, merged into the phase branch; the phase branch merges into `main` locally when its checks pass. |
| CORE-10 crons | Vercel Pro schedule written (hourly automations, 15-minute announcements), with locks, alerts and runbook; crons stay off until launch. |
| Small open decisions | Writers' recommendation where one exists, otherwise the conservative option; record it in the item's commit message and the progress log. Legal content ships as empty, editable rule tables with links, enforcement `warn`. |
| Ask the user when the phase starts | INTL-01 pricing (6 questions), HOUS-15 data model, anything legal-sensitive without a writer recommendation, Stripe test keys (PAY-01), and the inbound-email provider config (already needed by ORCH-10). |

Specific defaults taken from the writers (the full list is in each item's "Open decisions"): CORE-01 post on the due date; CORE-04 bill deposits through AR, warn (not block) when no deposit bank account; CORE-12 portal link (PDF attachment once the dash route forwards attachments); CORE-40 company-wide lock, virtual close; CORE-44 add the cash-basis toggle; CORE-47 database-level enforcement for bills and payment runs; CORE-53 pre-printed stock only; CORE-54 hold back prepaid rent; CORE-57 headless Chromium only if it runs on Vercel, otherwise pdf-lib; CORE-63 extend `owners`; LEAS-01 `/property/l/<handle>`, vacancy pages only; LEAS-05 warning for custom questions; LEAS-16 per-op "requires signature" default; LEAS-19 customer-supplied templates (no partner, no library); LEAS-40 email opt-out does not suppress transactional reminders; LEAS-41 "Messaging" group with Conversations and Announcements; LEAS-45 click-accept "Accepted — awaiting signature"; LEAS-47 one plan per lease for now; LEAS-48 push in Property behind `lib/messaging/push.js`; RISK-02 keep no vendor PDFs; RISK-05 block outright bans, warn elsewhere; RISK-06 pass/fail plus "meets your criteria", human decides; RISK-11 reports 25 months, decisions 5 years (configurable, flagged for counsel); RISK-14 no cross-project matching; HOUS-01 accrue HAP monthly; HOUS-07 empty table plus links, `warn`; HOUS-14 not built until a NYC customer; COMM-01 Other Income 4100; COMM-06 PWA only; COMM-10 hidden by default; COMM-12 multiple logins for all portal roles; COMM-14 owner approval over threshold; COMM-19 liability only when the manager pays; COMM-20 report-only; PLAT-01 accounting hard gate, default role Manager (today's behaviour); PLAT-03 files first, balances forward plus optional history; PLAT-06 MFA opt-in, TOTP and passkeys only; PLAT-08 vendors and owners project-wide; PLAT-09 financial history 7 years, the rest 2 years; PLAT-15 manual anonymization only; INTL-04 month-start cutover plus optional YTD import; INTL-06 no sample portfolio; INTL-08 configurable checklist with links; INTL-10 printed/QR tags.

## Scope

| | Count |
|---|---|
| Items in files 1–7 | 183 |
| Track V — vendor-dependent, skipped for now | 18: LEAS-09, 10, 20, 21, 44, 52, 56, 57, 58, 59; RISK-12, 15, 16, 17, 20, 21; INTL-09, 13 |
| Not building (standing decisions) | 3: PLAT-18 and INTL-14 (no AI), HOUS-14 (writers: only on a NYC customer) |
| **To build now** | **162**, of which 16 stay Partial until their vendor part lands: CORE-50 (no bank feeds), CORE-51/52/54 (check and manual rails only), CORE-55 (forms and IRIS CSV, no partner e-file), LEAS-11 (MITS feed, no channel programs), LEAS-19 and LEAS-45 (no e-sign), LEAS-46 (email and saved cards, no SMS), LEAS-49/50/51 (no SMS/voice, insurance partner, RDC), RISK-13 (manual orders), RISK-14 (rules 5 and 7), RISK-18 (no income provider), PLAT-06 (no SMS factor, SAML/SCIM) |
| New enabling items | 3: MOD-01, DRIFT-01, PAY-01 |

## New enabling items

### MOD-01 · Settings → Modules switch
- `lib/modules.js`: `MODULES` catalogue `{ key, label, description, defaultOn }` for the optional verticals — `leasing` (Marketing & Leads, screening; default on), `commercial` (CAM Reconciliation and later COMM items; default on), `affordable` (voucher/HAP items; off), `regulation` (rent rule table and caps; off), `associations` (HOA; off). Core features are never switchable. `isModuleOn(settings, key)` and a server helper `moduleEnabled(admin, projectId, key)` reading the `modules` project setting.
- Sidebar: nav items in `components/internal/sidebar/sidebar_nav.jsx` take `module: "<key>"`; the sidebar hides items whose module is off. A screen reached directly while its module is off shows a `@geiger/ui` empty state with "Turn it on in Settings → Modules".
- Settings → Modules card (permission `settings.manage`) with one switch per module and its description.
- Jobs, automation triggers and signals belonging to an off module skip that project.
- Every later item names its module in its commit message; items in an optional vertical register their nav entries with `module`.
- Acceptance: turning Leasing off hides Marketing & Leads and its screens show the empty state; turning it on restores them; the demo project's current navigation is unchanged by default; unit tests for `isModuleOn` defaults.

### DRIFT-01 · Reconcile migrations with the live database
- Compare every `property` table's live columns (information_schema) with the columns created by files in `supabase/migrations/`; list columns, indexes and constraints the code uses but no migration creates (known: several `applications` columns, `recurring_charges.property_id`, `esign_requests.provider` / `provider_envelope_id` / `sent_at` / `signed_at` / `project_id`, `listings.virtual_tour_url`, `headline`, `deposit`, `sqft`, `description`, `contact_*`, `syndicated`, `lease_id`, `property_label`, `available_on`).
- One migration that adds them with the live types and defaults (`add column if not exists`), a no-op on the live DB and correct on a fresh one. Report anything that is in migrations but not live.
- Acceptance: `db:status` clean; the migration applied on live changes nothing (verified by comparing information_schema before and after); a column-by-column report in the commit message.

### PAY-01 · Stripe Connect through @geiger/pay
- **PAY-01a (geiger-pay repo, local branch):** review `C:\Pro\geiger-pay` against current Stripe docs (Accounts v2, direct charges), add unit tests with a mocked Stripe client, fix defects, document what Property needs (schema `sql/pay_schema.sql`, env, webhook). Commit locally on `feat/property-integration`; do not push or apply its schema.
- **PAY-01b (Property, Phase 1):** install `@geiger/pay` (local path until the user pushes it), add Settings → Payments "Connect Stripe" onboarding, route resident payments, application fees and deposits through the connected account (direct charges), keep the platform account only for Geiger's own billing. Needs Stripe test keys from the user and approval to apply the pay schema.
- Acceptance: test-mode onboarding completes; a test rent payment settles in the connected account and posts to the ledger exactly once; webhooks are idempotent.

---

## Per-item protocol (every subagent follows this)

1. **Workspace.** Work only in the item's worktree `C:\Pro\gp-wt\<ID>` (branch `item/<ID>`, created by the orchestrator with `node_modules` junctioned and `.env` copied). Never touch `C:\Pro\geiger-property` itself. Don't run `next build`.
2. **Read.** The item's full spec in `mri/build_plan/<file>.md` (read from `C:\Pro\geiger-property\mri\build_plan\`, which is untracked), the README's standing decisions, this roadmap's Global Constraints and Decisions, and the convention files. Re-verify every cited `path:line`; the code may have moved.
3. **Decide.** Use the Decisions above. If a choice is consequential, not covered, and can't be made conservatively, stop and report the question instead of guessing.
4. **Build** to the spec and conventions. Reuse existing helpers (`lib/billing/*` once CORE-01 lands, `lib/ledger/*`, `lib/messaging/*`, `lib/orchestration/*`, `lib/supabase/*`). Register nav entries (`components/internal/sidebar/sidebar_nav.jsx`, with `module: "<key>"` for an optional vertical), jobs (`lib/jobs/registry.js`), policies (`lib/policies.js`) and automation triggers (`lib/automations/catalog.js`) with small, additive edits. Permissions (after PLAT-01a): add the key to `ACTION_PERMISSIONS` in `geiger-rbac.config.js` as `property.<resource>.<action>`; list it in each system role that needs it (Manager gets every key not in `OWNER_ONLY`); optionally map it in `ACTION_PARENT` so earlier-saved roles inherit it; gate UI with `usePermission(key)` and routes with `staffCan(auth, key)` after `requireStaff`. A new nav page gets its view key automatically; add `PAGE_PARENT` only if every role that sees Overview should see it. Any change to permission keys, system roles or top-level nav titles also needs the SQL copy regenerated: run `npm run rbac:sql` and ship its output as a new migration, or `npm test`'s drift test fails. When two items in a wave both change keys, the second to merge regenerates after merging.
5. **Migrations.** Create, push and verify from the worktree only (it holds only your own new migrations). Out-of-order and "missing" warnings caused by other worktrees are expected.
6. **Verify.** Unit tests for pure logic; an e2e script (kept in the item's scratchpad, not committed) proving every acceptance criterion against the demo project, cleaning up after itself; ledger checks for ledger items; `npm test`; `npm run lint`.
7. **Restore held claims.** PLAT-02 tagged every marketing claim that waits on an item with a `// claim:` comment naming the item IDs (`grep -rn "claim:" components/landing README.md app/page.js`). If your item ships one, restore that copy and drop the tag.
8. **Commit** on `item/<ID>` in the worktree: `feat(<area>): <what> (<ID>)`, body listing decisions taken and anything left Partial, ending with the attribution line. Don't push.
9. **Report:** files changed, migrations pushed, acceptance evidence (commands and output), decisions taken, anything left open, and any data the e2e touched.

## Orchestrator loop (per wave)

- [ ] Create a worktree per item with PowerShell (Git Bash mangles the junction path): `git worktree add C:\Pro\gp-wt\<ID> -b item/<ID> <phase-branch>`, `New-Item -ItemType Junction -Path C:\Pro\gp-wt\<ID>\node_modules -Target C:\Pro\geiger-property\node_modules`, copy `.env`. Remove a junction only with `[System.IO.Directory]::Delete(<junction>)` (never a recursive delete, which empties the target), then `git worktree remove`.
- [ ] Dispatch one subagent per item with the protocol, the item ID, its spec location, and the files other agents in the wave own.
- [ ] As each finishes: merge `item/<ID>` into the phase branch (`--no-ff`), resolve shared-registry conflicts, run `npm test` and `npm run lint`, remove the worktree. **No per-item review** (user decision 2026-11-08): one review sweep runs over everything after the build, when the user asks. Record known gaps in the progress log so the sweep can find them.
- [ ] After the wave: run the e2e scripts again on the merged branch where items interact; update the item's status in its `mri/build_plan` summary table to `**Done** (date)` or `**Partial** — <what is left> (date)`; add a progress-log line below.
- [ ] After the phase: `next build` if UI changed significantly, then merge the phase branch into `main` locally. (Code review happens in the later sweep.)

---

## Phases and waves

Items in one wave run in parallel; a wave starts when its dependencies are merged. Free agents may pull a later item forward when all of its dependencies are merged.

### Phase 0 — Truth and safety (`phase-0/truth-and-safety`)
- [x] **W0.1:** PLAT-01a (adopt `@geiger/rbac`, role grants; fold `lib/orchestration/permissions.js` into it) · PLAT-02 + RISK-01 (marketing claims) · DRIFT-01 · MOD-01 · PAY-01a (geiger-pay repo)
- [x] **W0.2:** PLAT-01b (project scope, null-project fallbacks) · CORE-08 (owner statements for co-owners) · CORE-09 (work-order bills through approval and AP)
- [x] **W0.3:** PLAT-01c (lock down security-definer functions, immutability triggers)
- [x] **W0.4:** PLAT-01d (RLS project isolation, tests first)
- [x] **W0.5:** PLAT-01e (soft-delete guard, settings gates) · PLAT-01f (`lib/auth/staff.js`, route permission map, headers)
- [ ] **W0.6:** PLAT-01g (private buckets, signed URLs, storage migration) · PLAT-01h (secrets, CI audits, docs)

### Phase 1 — Money is right (`phase-1/money`)
- [ ] **W1.1:** CORE-01 (billing source of truth, `lib/billing/*`) · PAY-01b (needs Stripe test keys)
- [x] **W1.2:** CORE-03 · CORE-04 · HOUS-01
- [x] **W1.3:** CORE-02 · CORE-05 · CORE-06
- [x] **W1.4:** CORE-07 · CORE-11
- [x] **W1.5:** CORE-12 · CORE-16 · CORE-10 (final job set)
- [ ] **W1.6:** CORE-13 · CORE-14 · CORE-17

### Phase 2 — Customers can move in (`phase-2/onboarding`)
- [x] **W2.1:** PLAT-05 (search) · PLAT-03 step 1 (field catalogue) · INTL-03 (setup checklist) · INTL-07 (accountant export files)
- [ ] **W2.2:** PLAT-03 (rest) · PLAT-04 (export) · INTL-04 (opening balances)
- [x] **W2.3:** INTL-05 (three-way trust reconciliation)

### Phase 3 — Leasing front office (`phase-3/leasing`, module `leasing`)
- [ ] **W3.1:** LEAS-01 · RISK-02 · RISK-03 · RISK-04 · LEAS-08
- [ ] **W3.2:** LEAS-02 · RISK-05
- [ ] **W3.3:** LEAS-03 · LEAS-04 · RISK-06 · RISK-08 (orders and manual provider only)
- [ ] **W3.4:** RISK-07 · RISK-09 · LEAS-11 (MITS feed; Partial)
- [ ] **W3.5:** LEAS-05 · RISK-11
- [ ] **W3.6:** LEAS-06 · RISK-10 (fee rules) · RISK-13 (manual; Partial)
- [ ] **W3.7:** LEAS-07 (enforces RISK-10's rules; collects through PAY-01)

### Phase 4 — Resident communication (`phase-4/residents`)
- [ ] **W4.1:** LEAS-40 (consent ledger, dispatcher)
- [ ] **W4.2:** LEAS-41 (staff inbox)
- [ ] **W4.3:** LEAS-42 · LEAS-43
- [ ] **W4.4:** LEAS-45 (click-accept; Partial)

### Phase 5 — Charge for it (`phase-5/pricing`; ask the INTL-01 questions first)
- [ ] **W5.1:** INTL-01 (geiger-dash branch) · PLAT-06 (MFA in geiger-dash; Partial)
- [ ] **W5.2:** INTL-02
- [ ] **W5.3:** INTL-06 (go-live readiness)

### Phase 6 — Ledger, reporting and receivables depth (`phase-6/ledger-reporting`)
- [ ] **W6.1:** CORE-40 · CORE-41 · CORE-42 · CORE-15
- [ ] **W6.2:** CORE-43 · CORE-46 · CORE-18 · CORE-19
- [ ] **W6.3:** CORE-44 · CORE-21 · PLAT-09 (rest: viewer, sign-ins, financial tables)
- [ ] **W6.4:** CORE-45 · PLAT-07 (bulk actions, trash) · PLAT-14 (custom fields)

### Phase 7 — Rules, regulation and affordable housing (`phase-7/regulation`, modules `regulation`, `affordable`)
- [ ] **W7.1:** HOUS-07 · HOUS-09 · HOUS-02
- [ ] **W7.2:** HOUS-12 · HOUS-08 · HOUS-03
- [ ] **W7.3:** HOUS-10 · CORE-20 · HOUS-04
- [ ] **W7.4:** HOUS-11

### Phase 8 — Approvals, payables and money out (`phase-8/payables`)
- [ ] **W8.1:** CORE-47 (full approval engine)
- [ ] **W8.2:** CORE-48 · CORE-49 · COMM-14
- [ ] **W8.3:** CORE-50 (Partial) · CORE-51 (Partial) · COMM-15 · CORE-66 · HOUS-13 (dues bill on recurring bills)
- [ ] **W8.4:** CORE-52 (Partial)
- [ ] **W8.5:** CORE-53 (introduces the PDF renderer CORE-57 reuses)
- [ ] **W8.6:** CORE-54 (Partial)
- [ ] **W8.7:** INTL-11

### Phase 9 — Leasing and resident depth (`phase-9/leasing-depth`)
- [ ] **W9.1:** LEAS-12 · LEAS-13 · LEAS-14 · CORE-60
- [ ] **W9.2:** LEAS-15 · LEAS-16 · LEAS-46 (Partial)
- [ ] **W9.3:** LEAS-17 · LEAS-18 · LEAS-47 · LEAS-48
- [ ] **W9.4:** LEAS-19 (customer templates; signing waits for LEAS-09, Partial) · LEAS-50 (Partial) · LEAS-51 (Partial)
- [ ] **W9.5:** LEAS-53 · LEAS-54 · LEAS-55

### Phase 10 — Operations, field work and owner reporting (`phase-10/operations`)
- [ ] **W10.1:** COMM-01 · COMM-02 · COMM-05 · COMM-08 · COMM-17
- [ ] **W10.2:** COMM-03 · COMM-09 · COMM-18 · INTL-10
- [ ] **W10.3:** COMM-04 · COMM-06 · INTL-12
- [ ] **W10.4:** COMM-07 · LEAS-49 (on-call routing to the tech app; Partial)
- [ ] **W10.5:** HOUS-05
- [ ] **W10.6:** HOUS-06

### Phase 11 — Budgets, packets, builder, dashboards, entities (`phase-11/insight`)
- [ ] **W11.1:** CORE-56 · CORE-57 · CORE-63
- [ ] **W11.2:** CORE-58 · CORE-59 · CORE-65 · INTL-08 · CORE-55 (Partial)
- [ ] **W11.3:** CORE-64 · COMM-10 (year-end packet with the owner 1099)

### Phase 12 — Commercial (`phase-12/commercial`, module `commercial`)
- [ ] **W12.1:** COMM-11 · COMM-13 · CORE-62 · COMM-19
- [ ] **W12.2:** COMM-12 · CORE-61 · COMM-20
- [ ] **W12.3:** COMM-16 · CORE-68 · CORE-67

### Phase 13 — Platform, integrations and screening depth (`phase-13/platform`)
- [ ] **W13.1:** PLAT-08 · PLAT-12 · PLAT-10
- [ ] **W13.2:** PLAT-13 (rest: branch node, `call_webhook`, `update_field`, custom-field conditions) · PLAT-11 · RISK-14 (Partial)
- [ ] **W13.3:** PLAT-15 · PLAT-16 · RISK-18 (Partial) · RISK-19
- [ ] **W13.4:** PLAT-17

### Phase 14 — Associations (`phase-14/associations`, module `associations`; ask the model question first)
- [ ] **W14.1:** HOUS-15
- [ ] **W14.2:** HOUS-16
- [ ] **W14.3:** HOUS-17 · HOUS-18
- [ ] **W14.4:** HOUS-19

### Track V — vendor-dependent (open until a vendor is chosen)
LEAS-09/10 (e-signature), LEAS-20 (call tracking), LEAS-21 (market rent feed), LEAS-44 (SMS; unblocks the SMS parts of LEAS-03/43/46/49/53/55 and LEAS-57), LEAS-52 (cash at retail), LEAS-56 (credit reporting), LEAS-57 (pay by phone), LEAS-58 (bank balance check), LEAS-59 (flexible rent), RISK-12 (screening vendor; restores RISK-01 copy), RISK-15/16 (ID verification), RISK-17 (income verification), RISK-20 (lease guarantee), RISK-21 (deposit alternative), INTL-09 (QuickBooks sync), INTL-13 (Xero), plus the vendor parts of the 15 Partial items.

---

## Progress log

| Date | Phase / wave | Items | Result |
|---|---|---|---|
| 2026-11-08 | Setup | — | `feat/agora-orchestrator` merged into `main` (ORCH-01–10 Done). Roadmap written. |
| 2026-11-08 | Phase 0 W0.1 | DRIFT-01, PLAT-02 + RISK-01, MOD-01, PAY-01a | Merged into `phase-0/truth-and-safety` after review (PAY-01a lives on geiger-pay `feat/property-integration`, local). PAY-01b needs Stripe test keys and a geiger-dash migration adding `pay.accounts.capabilities`. |
| 2026-11-08 | Pulled forward | CORE-08, CORE-09, PLAT-05 step 1, INTL-03, CORE-01 | Merged after review (no dependencies outstanding). PLAT-05 record search waits for PLAT-01d; INTL-03's geiger-dash help pages are still to write. |
| 2026-11-08 | Phase 0 W0.1 | PLAT-01a | Merged after three fix rounds (lockout paths, admin role, server-seeded defaults). Live checks 49/49 scenarios, 37/37 DB acceptance. 01d must lock `team_members` writes (anon can write today). |
| 2026-11-08 | Phase 0 W0.2–W0.5 | PLAT-01b, PLAT-01c, PLAT-01d, PLAT-01e, PLAT-01f | Merged. RLS is project-member only with active grants; soft-delete guard; definer lockdown; every staff route declares its permission (route map test). 01g/01h running. |
| 2026-11-08 | Phase 1 W1.2–W1.6 | CORE-02–07, CORE-10–12, CORE-14, CORE-16, CORE-17, HOUS-01 | Merged (no per-item review from PLAT-01c on, user decision). CORE-16 Stripe payouts wait for keys and a fee-bearer decision; CORE-14 e-sign/renewal carry/state rules later. CORE-13 running. |
| 2026-11-08 | Phase 2 | PLAT-03 step 1, PLAT-05 (both steps), INTL-03, INTL-04 (+3950 fix), INTL-05, INTL-07 | Merged. PLAT-03 importer and PLAT-04 wait for PLAT-01g. |
| 2026-11-08 | Pulled forward (Phase 6) | CORE-40, CORE-41, CORE-42, CORE-43 | Merged. CORE-44, CORE-46, CORE-19 running. |
| 2026-11-08 | Phase 3 W3.1 started | RISK-03, RISK-04, LEAS-01 | Running. |
