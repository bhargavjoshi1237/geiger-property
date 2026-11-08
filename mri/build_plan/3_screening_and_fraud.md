# 3. Screening and fraud

### Scope
- MRI products covered: Engage Protect: Resident Screening (formerly ResidentCheck), ID Verification (formerly CheckpointID) and Income Verification. Insurent (lease guarantees). Deposit-alternative partners are included as a related partner option.
- Geiger areas touched:
  - Applications: `components/internal/screens/marketing/{applications.jsx, sections/application_sections.jsx, flows.js, shared.js}` and `lib/supabase/applications.js`.
  - Tenant screening fields: `components/internal/screens/tenants/shared.js`.
  - Showing access codes: `marketing/sections/showing_sections.jsx`.
  - Lease deposit alternatives: `leasing/sections/lease_money.jsx`.
  - Shared plumbing: the policy cascade (`lib/policies.js`), RBAC (`lib/rbac.js`), the Stripe webhook, the email catalog and jobs.
  - Settings → Integrations, and the landing copy.
- Code findings the gap report doesn't mention (all checked at `fecb165`):
  - **Application documents are public.** The Documents tab is labelled "IDs, pay stubs, reports and notices" (`applications.jsx:618`). It uploads through `uploadPropertyImage` (`entity/shared_sections/documents_section.jsx:15,56`) into the public `products` bucket (`lib/supabase/property_storage.js:7-13`).
  - **The applicant form asks about convictions and evictions up front** (`applications.jsx:126-127`). Fair-chance laws (NYC, Cook County, NJ, DC, Oakland and others) ban asking before a conditional offer.
  - **Conditional approvals record no adverse action** (`applications.jsx:431-446, 474-477`). FTC landlord guidance treats worse terms based on a consumer report (extra deposit, cosigner) as adverse action.
  - **The tenant record copies screening data**: SSN/ITIN last 4, credit score, background result, eviction history and decision (`tenants/shared.js:157, 160-168`).
  - **Schema drift.** The code and demo seed use these `applications` columns: `property_id`, `property_label`, `listing_id`, `source`, `occupants`, `decision`, `score`, `applied_on`. The sources are `lib/supabase/applications.js:15-28` and `supabase/seeds/demo_project/02_leasing.sql:64`. No migration adds them. `20261015212419_marketing_leads_record_links.sql:26` indexes `applications.listing_id` without ever creating the column, so the migration set can't build an empty database. RISK-06 fixes this.

### Summary
| ID | Feature | MRI product | Geiger today | Priority | Effort |
|---|---|---|---|---|---|
| RISK-01 | Hold the screening claims until screening is real | Engage Protect | **Done** (2026-11-08) | P1 | S |
| RISK-02 | Screening data protection (private files, no SSN at rest, fingerprints, view audit) | Engage Protect (platform security) | Done | P1 | M |
| RISK-03 | Screening permissions | Engage Protect / PMX Security Console | Done | P1 | S |
| RISK-04 | Screening criteria per property | Engage Protect (per-property packages) | Done | P1 | M |
| RISK-05 | Location-specific screening rules catalog | Engage Protect (location rules) | Done | P1 | L |
| RISK-06 | Criteria engine and immutable decision record | Engage Protect (consistent criteria, audit record) | Partial | P1 | M |
| RISK-07 | FCRA adverse-action notices generated from the decision | Not in PMX (decision stays with client) | Tracking-only | P1 | M |
| RISK-08 | Screening provider adapter, orders and manual provider | Engage Protect Resident Screening | Tracking-only | P1 | L |
| RISK-09 | Applicant authorization, consent and invites | Engage Apply + Protect | Tracking-only | P1 | M |
| RISK-10 | Who pays, and screening-fee rules | Engage Apply + Pay | Tracking-only | P1 | S |
| RISK-11 | Report retention and secure disposal (FACTA Disposal Rule) | PMX anonymisation / Engage Protect | Missing | P1 | S |
| RISK-12 | First screening vendor integration | Engage Protect / partner screeners | Missing | P1 | L |
| RISK-13 | Fair-chance two-step workflow | Engage Protect (location rules) | Missing | P1 | M |
| RISK-14 | Application fraud flags (non-AI rules) | Engage Protect (fraud) | Missing | P2 | M |
| RISK-15 | ID verification with Stripe Identity | Engage Protect ID Verification (CheckpointID) | Missing | P2 | M |
| RISK-16 | ID checks at tours, move-in and for vendors | Engage Protect ID Verification | Tracking-only | P3 | S |
| RISK-17 | Income verification adapter and first provider | Engage Protect Income Verification | Tracking-only | P2 | L |
| RISK-18 | Document income review with non-AI pay-stub checks | Engage Protect (pay-stub fraud) | Tracking-only | P2 | M |
| RISK-19 | Screening audit and consistency report | Engage Protect (audit record) | Partial | P2 | S |
| RISK-20 | Lease guarantee partner | Insurent | Missing | P3 | M |
| RISK-21 | Deposit-alternative partner | Partner (none MRI-native) | Tracking-only | P3 | M |

### Build order
1. **RISK-01** — today's claims are untrue. It needs no code; it runs inside the PLAT marketing-claims audit.
2. **RISK-02, RISK-03** — protection and permissions must exist before any real consumer-report data flows. Both depend on **PLAT-01**.
3. **RISK-04 → RISK-05 → RISK-06** — criteria, location rules, then the engine. These work on manually recorded results, so consistency and recorded reasons arrive before any vendor.
4. **RISK-07** — adverse-action notices built from the decision. These are needed even with manual screening.
5. **RISK-08 → RISK-09 → RISK-10 → RISK-11** — the vendor-neutral order pipeline: the manual provider first, then consent, payer and fee rules, then disposal. RISK-10 relies on LEAS-07, LEAS-13 (gap 2.10) (fee collection) and the CORE ledger rules (fee posting).
6. **RISK-12** — the first vendor, once the vendor decision is made. RISK-01's copy can then be restored.
7. **RISK-13** — the fair-chance two-step. It needs split ordering (RISK-08/12), rules (RISK-05) and notices (RISK-07).
8. **P2, in order:**
   - RISK-14: uses fingerprints from RISK-02.
   - RISK-15: Stripe is already live.
   - RISK-17, then RISK-18.
   - RISK-19.
9. **P3:** RISK-16 (after RISK-15), RISK-20, then RISK-21. RISK-21 also depends on the CORE deposit item for gap 0.4.

Cross-file:
- The Geiger-hosted applicant pages in RISK-09, 15 and 17 depend on the LEAS online application (gap 2.1). Until then, every flow uses provider-hosted links sent by email.
- PDF notices in RISK-07 reuse the LEAS lease-PDF work (gap 2.6).
- Voucher income rules are shared with HOUS (source of income).

### Items

#### RISK-01 · Hold the screening claims until screening is real
- **MRI equivalent:** Engage Protect (Resident Screening) — sold as a real, integrated screening product.
- **Status · priority · effort:** Broken · P1 · S
- **Refs:** Gap 2.4 · Inventory 2a.42, 2a.43 · PMX-2.45

**Geiger today** — the marketing copy says checks run, but the code only records results by hand:
- `components/landing/landing_page.jsx:23`: the FAQ says "screening … included".
- `components/landing/product_explorer.jsx:17`: "Screening starts on submit" and "Online applications and fees".
- `components/landing/product_explorer.jsx:36`: "Credit, background and income checks run on each applicant".
- `components/landing/connected_journey.jsx:9`: "screening results … screening passed".
- `README.md:17, 28`: "tenant screening, credit and background checks, eviction history, income verification, application fees".
- The code is tracking-only: "Screening provider not connected" (`marketing/sections/application_sections.jsx:230-233`, `applications.jsx:385`).

**What's missing**
- Copy that says screening results are recorded, not run.
- A recorded trigger to restore the claims.

**How to build**
- *Data model:* none.
- *Server logic:* none.
- *API routes / jobs:* none.
- *UI:* change the copy only, in the files above. Use wording like "Record screening results, criteria and decisions on every application". The online-application part of this copy belongs to LEAS.
- *Permissions:* none.
- *Integrations:* none.

**Steps**
1. Add these six lines to the PLAT marketing-claims audit list. That audit owns the edit.
2. Replace the copy as above.
3. Restore the claims after RISK-12 passes its acceptance criteria.

**Research before building** — none beyond the PLAT audit.

**Acceptance criteria**
- `grep -rin "screening" components/landing README.md` finds no claim that checks run, and no "screening included".

**Depends on / unblocks** — Depends on the PLAT marketing-claims audit. Restored by RISK-12.

#### RISK-02 · Screening data protection
- **MRI equivalent:** Engage Protect and PMX platform security (role permissions, AES-256 at rest, an audit trail).
- **Status · priority · effort:** Broken · P1 · M
- **Refs:** Gap 0.11, 2.4, 2.8 · Inventory 9.4, 9.45, 9.48, 9.9, 2a.44 · PMX-9.26

**Geiger today**
- **Documents are public.** Application IDs, pay stubs and reports upload to the public `products` bucket (`applications.jsx:618` → `documents_section.jsx:15,56` → `property_storage.js:7-13`).
- **Results sit in open tables.** Screening results live in `applications.metadata.screening` (`application_sections.jsx:72-77, 219-226`) and `applications.score` (`lib/supabase/applications.js:27`). RLS on that table is demo-open (`supabase/migrations/20261010165221_full_build_tables.sql:99-103`).
- **Applicant identifiers are kept in metadata.** Date of birth, ID type and ID last 4 are stored there (`applications.jsx:119-121`). The hint at `:121` already forbids storing the full SSN.
- **The tenant record repeats screening data** (`tenants/shared.js:157, 160-168`, wired at `tenants/config.jsx:365`).
- **No view audit.** The activity log is written from the browser and is editable (inventory 9.9). Nothing records who viewed a report.

**What's missing**
- A private store for screening files.
- A design that keeps no SSN at rest.
- Keyed fingerprints for duplicate checks.
- Field-level access: summary vs full report.
- An audit of views and downloads.
- A deny-list for exports, merge fields and webhooks.
- Less screening data on the tenant record.

**Extra protection screening data needs, on top of PLAT-01**
- **No SSN, full ID number or bank account number at rest.**
  - Use provider-hosted collection.
  - If a vendor requires a platform-submitted SSN, pass it through in memory only: no DB, no logs.
  - Keep only a keyed HMAC and the last 4.
- **Reports stay with the vendor.** Geiger stores a normalised summary and the vendor report id. Any copy Geiger keeps goes in a private bucket, served through signed URLs that expire in 5 minutes or less.
- **Encryption at rest.** The Supabase disk (AES-256) is the baseline. Any sensitive value that must be stored gets app-level AES-256-GCM, with the key in env (`SCREENING_DATA_KEY`). The design aims to need none.
- **Field-level access.** Summaries are visible with `screening.order`. The full report, identity detail and income detail need `screening.view_reports` (RISK-03).
- **Every view, download, export and print is logged server-side, append-only.**
- **Never in:** public buckets, client bundles, console logs, email bodies (emails link into the app), activity-log text, report exports or outbound webhooks.

**How to build**
- *Data model:* migration `screening_data_protection` (scaffold `npm run db:new -- screening_data_protection --template table`).
  - **Private bucket `property-screening`** (`public = false`). Follow the bucket-creation precedent in `20261019205301_chat_workspace.sql:327-349`, but private. Storage policies allow no anon/authenticated reads; the server creates signed URLs.
  - **`property.applicant_fingerprints`:**
    - Columns: `project_id`, `application_id uuid`, `party_ref text` (`'primary'` or a `record_items` id), `kind text`, `digest text` (HMAC-SHA256 hex), `last4 text null`, plus the standard columns.
    - `kind` check: `('ssn','email','phone','dob_name','id_document','bank_account','document_sha256','ip')`.
    - Index on `(project_id, kind, digest) where deleted_at is null`.
  - **`property.screening_access_log`:**
    - Columns: `project_id`, `actor_id`, `actor_name`, `application_id`, `object_type`, `object_id`, `action`, `ip`, `user_agent`, `created_at`.
    - `object_type` is one of: report, order, identity, income, document, notice.
    - `action` is one of: view, download, export, print, dispose.
    - It is insert-only: revoke update and delete.
    - If PLAT-01 delivers a server-side audit table first, write there instead and skip this table.
  - **RLS on these new screening tables is deliberately not demo-open.** Enable RLS with no anon or authenticated policies, so only service-role API routes can reach them. Document this as an intended exception to `conventions/MIGRATION_CONVENTIONS.md:306-317`.
  - **Check the names first.** The live DB has about 80 orphan tables, so confirm each name is free (Supabase MCP `list_tables`, or `npm run db:status`) before `db:push`.
- *Server logic:*
  - `lib/screening/protect.js` (server-only):
    - `fingerprint(projectId, kind, value)` computes `HMAC(SCREENING_FINGERPRINT_KEY, projectId:kind:normalized)`. The project id in the input means digests can't be compared across companies.
    - Normalisers for SSN, email and phone.
    - `storeFingerprints(admin, {applicationId, partyRef, values})`.
    - `logScreeningAccess(admin, entry)`.
    - `SENSITIVE_KEYS` and `redactSensitive(row)`.
  - `lib/screening/storage.js`:
    - `uploadScreeningFile(admin, {projectId, applicationId, file})` writes to `screening/<projectId>/<applicationId>/<uuid>.<ext>`.
    - `signedScreeningUrl(admin, path, ttl=300)`.
  - **Application documents.** In `documents_section.jsx`, when `config.key === "application"` (`OWNER.application`, `flows.js:30`), post to the new route instead of `uploadPropertyImage`. Store the path, not a public URL.
  - **Tenant record.** Make `creditScore`, `backgroundStatus`, `evictionHistory` and `screeningDecision` read-only, and hide them behind `screening.view_reports`. Add a link to the application's decision (RISK-06). Leave the metadata in place: no destructive migration.
  - **Deny-list.** Apply `redactSensitive` in report sources (`lib/reports/sources_server.js`, `sources_client.js`), the automation merge fields (`lib/automations/catalog.js`) and CSV export.
- *API routes / jobs:*
  - `app/api/screening/files/route.js`:
    - POST: upload.
    - GET `?path=`: returns a signed URL and writes an access-log row.
  - Authenticate with `requireStaff` (`lib/messaging/auth.js:22`), plus the PLAT-01 server permission check.
- *UI:* the Documents section on applications shows a "Private" badge and opens files through the route. No thumbnails.
- *Permissions:* `screening.view_reports` (RISK-03).
- *Integrations:* none.

**Steps**
1. Confirm PLAT-01 is in place: server auth helper, RLS approach, audit table.
2. Write and push the migration, checking table names first.
3. Build `protect.js` and `storage.js`, and add `SCREENING_FINGERPRINT_KEY` and `SCREENING_DATA_KEY` to `.env.example`.
4. Add the upload/sign route and the private branch in `documents_section.jsx`.
5. Make the tenant screening fields read-only, add the decision link, and gate them.
6. Wire the deny-list into reports, automations and exports.

**Research before building**
- **Supabase private buckets:**
  - `createSignedUrl` expiry behaviour.
  - Storage RLS.
  - Whether objects deleted from storage stay in backups, and for how long. Disclose this residual copy.
- **Field encryption.** Supabase's current advice on field encryption (pgsodium status vs Vault vs app-level).
- **Vendor end-user agreement security clauses:** MFA, access logging, named users. These often go beyond PLAT-01.
- **State breach-notification triggers for SSN plus name.** These argue for storing none.

**Acceptance criteria**
- **Files are private.** A file uploaded on an application lands in `property-screening`, and its public URL returns 400/403. A signed URL stops working after 5 minutes.
- **Access is logged.** Every signed-URL request writes one access-log row with the actor.
- **Fingerprints are scoped.** The same SSN in two projects produces different digests.
- **No direct access.** The anon key can't select from `applicant_fingerprints` or `screening_access_log`.
- **No full identifiers stored.** `grep -rn "ssn"` over `lib/` and `supabase/` finds no column or field that stores more than the last 4.
- **Tenant record locked.** The tenant Screening tab no longer edits credit score or background.

**Depends on / unblocks** — Depends on PLAT-01. Unblocks RISK-08, 11, 14, 15, 17 and 18.

**Open decisions**
- Should Geiger keep copies of vendor report PDFs at all? The recommendation is no: keep the vendor reference plus the normalised summary, and open the report in the vendor portal.

#### RISK-03 · Screening permissions
- **MRI equivalent:** PMX Security Console — read/write/deny permissions by function. Engage Protect limits who sees reports.
- **Status · priority · effort:** Missing · P1 · S
- **Refs:** Gap 0.11, 9.3 · Inventory 9.4, 9.5 · PMX-9.03

**Geiger today**
- `WORKSPACE_PERMISSIONS` has no screening keys (`lib/rbac.js:4-15`).
- `roleAllows` allows an undecided key that has no parent (`lib/rbac.js:61-65`), so a new sensitive key would default to allowed.
- RBAC only hides UI (`conventions/MODULE_CONVENTIONS.md:172-186`). The Applications tab key is `view.applications`.

**What's missing**
- Screening keys.
- Deny-by-default for sensitive keys.
- Server-side enforcement on the screening routes.

**How to build**
- *Data model:* none.
- *Server logic:*
  - Add a "Screening controls" group to `WORKSPACE_PERMISSIONS`:

    | Key | What it allows | Inherits / flag |
    |---|---|---|
    | `screening.order` | Order screening, ID and income checks | inherits `view.applications` |
    | `screening.view_reports` | Open full reports and verification detail | `sensitive: true` |
    | `screening.decide` | Record or change decisions | inherits `view.applications` |
    | `screening.adverse_action` | Send adverse-action and fair-chance notices | inherits `screening.decide` |
    | `screening.fraud_review` | Clear or confirm fraud flags | inherits `screening.decide` |
    | `screening.criteria` | Edit criteria and custom location rules | inherits `settings.manage` |
  - In `roleAllows`, a key marked `sensitive` with no explicit grant returns false, unless the role has `"*"`.
- *API routes / jobs:* every `app/api/screening/*`, `app/api/identity/*` and `app/api/income/*` route calls the PLAT-01 server permission check with these keys.
- *UI:* gate `config.actions` in `applications.jsx` (`startScreening` at `:374-389` and its replacement, and `decide` at `:390-485`) the same way `accounting/ledger_dialogs.jsx:49-50` gates posting. The roles screen (`settings/roles_permissions.jsx`) shows the new group automatically from the catalog.
- *Permissions:* as above.
- *Integrations:* none.

**Steps**
1. Add the catalog entries and the `sensitive` handling in `lib/rbac.js`.
2. Add the UI gating.
3. Add the server checks as each route is created (RISK-02 and later).

**Research before building**
- Which roles vendors require to hold report access (named-user rules, MFA).
- How PLAT-01 exposes `requirePermission`.

**Acceptance criteria**
- A role without `screening.view_reports` sees the order status and summary. "View report" is hidden for it, and the API returns 403.
- Legacy roles saved before this change don't gain `view_reports`.
- `"*"` still grants everything.

**Depends on / unblocks** — Depends on PLAT-01. Unblocks RISK-02 routes and RISK-06, 07, 08 and 14.

#### RISK-04 · Screening criteria per property
- **MRI equivalent:** Engage Protect — packages configured per property, criteria applied consistently.
- **Status · priority · effort:** Partial · P1 · M
- **Refs:** Gap 2.4 · Inventory 2a.12, 2a.40, 2a.41, 8.4 · PMX-2.46, PMX-2.47

**Geiger today**
- **Criteria are company-wide only.** They are a single `screening_criteria` setting (`marketing/flows.js:68-72`), edited in a header dialog (`application_sections.jsx:478-528`, saved at `:512`). Defaults are at `marketing/shared.js:328-334`.
- **Only two criteria are read.** Only `incomeMultiple` (`ratioOf`, `application_sections.jsx:64-69`) and `minCreditScore` (a hint only, `:183, 216`) are used. `evictionLookbackYears` and `allowCosigner` are never read, which confirms inventory 2a.41.
- **The published criteria text is saved but unused** (`:507`; inventory 2a.12).
- **Vouchers are ignored.** The voucher fields (`application_sections.jsx:125-126`) are never read, and `householdIncome` ignores them (`flows.js:87-96`).
- **The cascade already exists.** The policy cascade (`lib/policies.js:12-19, 176-191`) renders in Settings → Fees & policies (`settings/fees_policies.jsx`) and in the property policy section (`entity/sections/policy_section.jsx`).

**What's missing**
- Criteria and packages per property.
- A complete criteria set.
- Published criteria shown to applicants before they pay a fee.
- A record of which criteria version each decision used.

**How to build**
- *Data model:* no new table. Extend the existing policy cascade instead of building a separate criteria store. Add a `screening` group to `POLICY_GROUPS`, with these keys in `POLICIES` (scopes `NO_LEASE`):
  - **Ordering:** `screeningPackage` (default `manual`), `screeningPayer` (applicant or company).
  - **Income:**
    - `incomeMultiple` (3).
    - `countCoApplicantIncome`.
    - `allowGuarantorToQualify` and `guarantorIncomeMultiple`.
    - `voucherIncomeBasis` (tenant portion or full rent; cross-ref HOUS).
  - **Credit:** `minCreditScore` (blank means no minimum), `noScorePolicy` (review, conditional or deny).
  - **Eviction:** `evictionLookbackYears` (7), `evictionJudgmentsOnly` (true).
  - **Criminal:** `criminalPolicy` (none, or lookback with individual assessment), `criminalLookbackYears`.
  - **Verification:** `requireIdVerification`, `requireIncomeVerification`.
  - **Conditional approvals:** `conditionalOptions` (extra deposit, guarantor, lease guarantee).
  - **Published criteria:** `publishedCriteriaText`.
- *Server logic:*
  - `lib/screening/criteria_policy.js`:
    - `resolveScreeningCriteria({ company, property, legacy })` uses `resolvePolicies`, so each value carries its source. The `legacy` input is the old `screening_criteria` setting, read as a company-level fallback.
    - `criteriaHash(resolved)` produces a stable SHA-256 of the sorted JSON.
  - `loadScreeningCriteria()` in `flows.js:69` takes the application's property and delegates to the new resolver.
- *API routes / jobs:* none. RISK-06 reads the criteria server-side.
- *UI:*
  - Remove `ScreeningCriteriaButton` from `applications.jsx:248`. Replace it with a link to Settings → Fees & policies → Screening.
  - The property Policies section shows overrides automatically.
  - The application Overview shows the effective criteria, with a source badge on each (company or property).
  - The published criteria text appears on the listing (`marketing/listings.jsx`), in the invite email (RISK-09), and later in the LEAS online application before the fee.
- *Permissions:* `screening.criteria` to edit.
- *Integrations:* `screeningPackage` options come from the provider registry (RISK-08). Until then the only option is `manual`.

**Steps**
1. Add the policy group and keys.
2. Add the resolver with the legacy fallback.
3. Update `loadScreeningCriteria` and its callers (`application_sections.jsx:57, 215`; `applications.jsx:87`).
4. Replace the header dialog with the settings link.
5. Add the Overview criteria card.

**Research before building**
- Criteria limits set by law, which feed RISK-05:
  - Portland's income-ratio caps.
  - WA RCW 59.18.257: criteria must be disclosed before the fee.
  - TX Prop. Code §92.3515: selection criteria must be disclosed.
- Common industry defaults for credit and eviction look-backs.

**Acceptance criteria**
- A property override of `incomeMultiple` to 2.5 changes the ratio badge for that property's applications only.
- Values in the old `screening_criteria` setting appear as company values.
- `criteriaHash` is the same for the same resolved criteria and different when any value changes.

**Depends on / unblocks** — Unblocks RISK-05, 06, 10 and 12. Cross-ref HOUS (voucher income basis).

#### RISK-05 · Location-specific screening rules catalog
- **MRI equivalent:** Engage Protect — "Screening rules differ by state, county and city. The workflow accounts for location-specific requirements."
- **Status · priority · effort:** Missing · P1 · L
- **Refs:** Gap 2.4 · Inventory 2b.101 · PMX-2.48

**Geiger today**
- **No rules exist.**
- **Properties have no county.** They store `city`, `state` and `zip` (`lib/supabase/properties.js:43-45`).
- **Legal Resources can help, but only at state level.** It has reference tables with shared rows (`project_id null`). `legal_jurisdictions` covers states, DC and US only; its `kind` check allows only state and federal (`20261019184635_legal_resources.sql:22-44`). `legal_resources` has county and city scope (`:46-75`), and its seeds are in `supabase/seeds/legal_resources/`.
- **The applicant form ignores location.** It asks about convictions and evictions everywhere (`applications.jsx:126-127`).

**What's missing**
- A versioned, sourced rules catalog.
- A resolver from a property to the rules that apply to it.
- Enforcement points in the forms, criteria, orders, fees and notices.

**How to build**
- *Data model:* migration `screening_rules`.
  - **`property.screening_rules` columns:**
    - `project_id` (null means shared reference).
    - `jurisdiction_code`: `US`, `US-NY`, `US-IL-COOK`, `US-NY-NYC`, and so on.
    - `scope`: federal, state, county or city.
    - `locality`, `rule_key`, `title`.
    - `topic`: criminal, eviction, credit, income, source of income, fees, process, notices or portable report.
    - `effects jsonb`, `effective_from`, `effective_to`.
    - `status`: active, pending, enjoined, repealed or withdrawn.
    - `citation`, `source_url`.
    - `legal_resource_id uuid null` (a soft link to `legal_resources`).
    - `verification` (the same vocabulary as `legal_resources`), `verified_on`, `notes`.
    - The standard columns.
  - **Unique** on `(jurisdiction_code, rule_key) where project_id is null`.
  - **RLS:** authenticated users can read reference rows. Writes go through the service role.
  - **Property county.** Add `county` to property metadata. Promote it to a column only if it needs an index. Also add `metadata.screeningJurisdictionOverride`.
  - **Seeds** go in `supabase/seeds/screening_rules/`. They are reference data, so they are a seed, not a migration (`MIGRATION_CONVENTIONS.md` rule 8).
- *Server logic:*
  - `lib/screening/rules_schema.js` documents the `effects` shape:
    - `criminal`: `{ allowed, timing: 'any'|'after_conditional_offer', lookbackYears:{misdemeanor,felony}, excluded:[], individualizedAssessment, responseDays, mustAttachDocs }`
    - `preOfferInquiryBanned`
    - `eviction`: `{ lookbackYearsMax, excludeDismissed, excludeSealed }`
    - `income`: `{ maxMultiple, tenantPortionForVoucher }`
    - `sourceOfIncome`: `{ protected, includesVouchers }`
    - `credit`: `{ voucherHolderLimits }`
    - `fees`: `{ capType: 'fixed'|'actual_cost'|'cpi'|'banned', cap, receiptRequired, refundIfNotScreened, refundDays, noFeeIfNoUnit, portableReport: 'must'|'may' }`
    - `process`: `{ firstInTime, criteriaDisclosureBeforeFee, writtenDenialRequired }`
    - `notices`: `{ extraContent:[] }`
  - `lib/screening/jurisdictions.js`:
    - `jurisdictionCodesFor(property)` returns codes for federal → state → county → city. It needs a normaliser for city names, for example NYC boroughs → `US-NY-NYC`.
    - `loadScreeningRules(db, codes, asOf)` returns active rules plus the project's custom rules.
    - `mergeEffects(rules)`: the most protective value wins for each field (a ban beats an allowance, the shortest look-back, the lowest fee cap, the longest response window), and each field keeps its `sources[]`.
- *API routes / jobs:* `GET app/api/screening/rules?propertyId=` returns the merged effects with sources, for the UI.
- *UI:*
  - Property → Policies gets a "Screening rules in effect" card listing the merged effects, citations and verification badges, with a "not legal advice" caveat like Legal Resources has.
  - Settings gets a "Screening rules" list that reuses the Legal Resources list layout, plus project-level custom rules (for counsel).
  - Enforcement points:
    - (a) Hide `evictedBefore`/`felonyDisclosed` (`applications.jsx:126-127`), and the LEAS form equivalents, where `preOfferInquiryBanned` applies.
    - (b) RISK-06 engine inputs.
    - (c) RISK-08/13 order packaging.
    - (d) RISK-10 fees.
    - (e) RISK-07 notice content.
    - (f) RISK-04 criteria warnings, for example `incomeMultiple` above `maxMultiple`.
- *Permissions:* `screening.criteria` for custom rules.
- *Integrations:* none.

**Rule sources to seed (v1 — verify each against primary text before marking it verified)**

| Topic | Source | Status / note |
|---|---|---|
| Federal | FCRA 15 U.S.C. §1681b(a)(3)(F) (permissible purpose), §1681e(b), §1681g(f) (score disclosure), §1681m(a)/(b) (adverse action), §1681w + 16 CFR Part 682 (Disposal Rule) | Active |
| Federal | Fair Housing Act 42 U.S.C. §3604; 24 CFR 100.500 (discriminatory effects) | Active; check HUD's current position on disparate-impact enforcement |
| Federal | HUD OGC criminal-records guidance (4 Apr 2016) and the 2022 implementation memo | **Withdrawn** (effective 17 Sep 2025; Federal Register notice 2026-06624, Apr 2026). HUD letter of 25 Nov 2025 rescinded it, with PIH 2015-19, for assisted housing. Seed as informational. The FHA itself and state/local laws still apply |
| Federal | CFPB advisory opinion on name-only matching (86 FR 62468, 2021) | **Withdrawn** May 2025 (90 FR 20084). FCRA accuracy duty on the CRA remains |
| Federal | VAWA, 24 CFR 5.2005 (HUD-covered housing) | Cross-ref HOUS |
| Fair chance | NYC Fair Chance for Housing Act (Local Law 24 of 2024; Admin. Code §8-107) | Effective 1 Jan 2025. Two-step process, limited look-back, individual assessment, copies of documents with the notice |
| Fair chance | Cook County Just Housing Amendment (Human Rights Ordinance) | Effective 31 Dec 2019. Two-step process, 3-year look-back |
| Fair chance | Seattle SMC 14.09 | Yim v. City of Seattle (9th Cir. 2023) struck the inquiry ban. Confirm which parts are still enforceable |
| Fair chance | Oakland Fair Chance Access to Housing (OMC 8.25); Berkeley (BMC 13.106) | Near-total ban on criminal checks |
| Fair chance | New Jersey Fair Chance in Housing Act (N.J.S.A. 46:8-52 et seq.) | Statewide two-step process |
| Fair chance | DC Fair Criminal Record Screening for Housing Act (D.C. Code §42-3541.01 et seq.) and its 2022 amendments | Verify the current scope |
| Fair chance | California FEHA criminal-history regulations (2 CCR §12264–12271) | Statewide |
| Fair chance | Portland, OR FAIR ordinance (City Code 30.01.086) and ORS 90.303 | Also caps income ratios |
| Fair chance | Minneapolis tenant-screening ordinance (2019); Los Angeles City fair-chance housing motion (2024) | LA status unverified. Detroit to check |
| Source of income | CA Gov. Code §12955 (SB 329, SB 222); NY Exec. Law §296(5); NJ LAD; WA RCW 59.18.255; OR ORS 659A.421; IL Human Rights Act (2023); MA c.151B §4(10); DC Human Rights Act; CO HB20-1332; VA (2020); MN ch. 363A (2023) | Use PRRAC's source-of-income law appendix as the index. Voucher handling belongs to HOUS |
| Fees | CA Civ. Code §1950.6 (CPI-adjusted cap, itemised receipt, refund; AB 2493 effective 1 Jan 2025); NY RPL §238-a ($20 or actual cost); WA RCW 59.18.257 (actual cost, criteria disclosure, reusable reports); CO HB19-1106 and HB23-1099 (portable reports); MA c.186 §15B (no application fees); VT 9 V.S.A. §4456a (no application fees); VA §55.1-1203 (cap); MN §504B.173; DC Fairness in Renting Act (2022); TX Prop. Code §92.3515 (criteria disclosure) | Verify each cap and amount |
| Eviction | CA CCP §1161.2 (masked unlawful-detainer records); state COVID-era eviction screening limits; DC and NY eviction-record sealing | Verify per state |

**Steps**
1. Write the migration and add property `county` to the property form.
2. Build `rules_schema.js`, `jurisdictions.js` and `mergeEffects`. There's no test runner, so verify these pure functions with a `node --test` script in scratchpad. Keep alias imports out of pure modules.
3. Seed about 25 rows, each with a source URL, `verified_on` and a verification status.
4. Hide the pre-offer questions where the rules require it.
5. Build the property card and the settings list.
6. Expose `mergeEffects` for RISK-06, 07, 10 and 13.

**Research before building**
- Verify each row in the table against its primary text, using the `us-landlord-tenant-resources` skill workflow from Legal Resources.
- How to resolve a city when `property.city` holds a neighbourhood name.
- Whether Cook County's ordinance covers Chicago.
- A re-verification schedule (quarterly) and who owns it.
- Whether HUD has proposed removing 24 CFR 100.500.

**Acceptance criteria**
- **Oakland:** a property there has criminal checks excluded from every package, and the applicant form hides the conviction question.
- **NYC:** the merged effects return `timing: after_conditional_offer`.
- **CA:** an application fee above the current cap is flagged (RISK-10).
- **Merge:** a unit test proves "most protective wins" and that sources are kept.
- **Sourcing:** every active rule has a `source_url` and a `verified_on`.
- **Withdrawn rules:** HUD's withdrawn guidance shows as withdrawn and changes no outcome.

**Depends on / unblocks** — Depends on RISK-04. Unblocks RISK-06, 07, 10 and 13. Cross-ref HOUS (vouchers), PLAT (legal caveat wording) and INTL (US only).

**Open decisions**
- Should the rules block actions (hide or deny) or only warn? The recommendation: block where the law is an outright ban (for example Oakland criminal checks, or MA/VT application fees), and warn everywhere else.
- Should counsel review the v1 seed before launch?

#### RISK-06 · Criteria engine and immutable decision record
- **MRI equivalent:** Engage Protect — "applies them consistently to every applicant and records what was checked, what was found, and what was decided". The approval decision stays with the client (PMX-2.53).
- **Status · priority · effort:** Partial · P1 · M
- **Refs:** Gap 2.4 · Inventory 2a.40, 2a.41, 2a.47, 8.4 · PMX-2.47, PMX-2.53

**Geiger today**
- **Income-to-rent is computed in the browser** (`application_sections.jsx:54-69`; `applications.jsx:94-100`), with an override per application (`application_sections.jsx:133`).
- **The decision wizard writes straight from the browser.** It sets the status and metadata (`applications.jsx:390-485`; commit at `:465-478`).
- **Reasons aren't tied to criteria.** They come from a free multiselect (`shared.js:308-318`).
- **Nothing is recorded about the criteria used.**
- **Decisions are overwritten in place** ("Change decision", `applications.jsx:392`).
- **Schema drift** (see Scope).

**What's missing**
- Evaluation on the server.
- Results per criterion, each with its rule reference.
- Reasons that carry their source.
- An immutable decision history.
- Override justifications.

**How to build**
- *Data model:* migration `screening_decisions`.
  - **Drift fix first.** Add the columns with `add column if not exists` on `property.applications`: `property_id uuid`, `property_label text`, `listing_id uuid`, `source text`, `occupants int default 1`, `decision text`, `score numeric`, `applied_on date`. Also add any other seed columns (`applicant_name`, `requested_lease_start`) after checking the live DB.
  - **`property.screening_decisions` columns:**
    - `project_id`, `application_id`, `sequence int`.
    - `stage`: pre_offer, final, or fair_chance_final.
    - `recommendation`.
    - `outcome`: approved, conditional, denied, or offer_withdrawn.
    - `override bool`, `override_reason`.
    - `reasons jsonb`: `[{ code, text, source: consumer_report|third_party|applicant|criteria|fraud, orderId, provider }]`.
    - `checks jsonb`: `[{ key, result: pass|fail|review|n/a|blocked, value, threshold, ruleRef }]`.
    - `conditions jsonb`.
    - `criteria_snapshot jsonb`, `criteria_hash`.
    - `rules_snapshot jsonb`: rule ids and `verified_on` dates.
    - `facts_digest`.
    - `decided_by`, `decided_by_name`, `decided_at`.
    - `superseded_by uuid`.
    - The standard columns.
  - **Append-only:** revoke update and delete, so only `superseded_by` is ever set. The table is server-only (as in RISK-02).
- *Server logic:*
  - `lib/screening/criteria.js` (pure, isomorphic): `evaluateApplication({ criteria, effects, facts })` returns `{ recommendation, checks, reasons, conditions, blocked }`. Checks:
    - **Income:**
      - Household or applicant-only income, per `countCoApplicantIncome`.
      - For voucher holders, the tenant portion where `effects.income.tenantPortionForVoucher` or `voucherIncomeBasis` requires it. This fixes inventory 8.4.
      - The guarantor rule.
    - **Credit:** per party. No score goes to `noScorePolicy`.
    - **Eviction:** look-back, judgments only, and sealed or dismissed cases excluded.
    - **Criminal:** only where allowed at this stage. It returns `review` with an individual assessment required, never `deny` directly.
    - **Required ID and income verification.**
    - **Open high-severity fraud flags** return `review`.
  - `lib/screening/facts.js` (server): `loadApplicationFacts(admin, applicationId)` gathers everything the engine needs:
    - Rent, using `applicationRent` moved server-side.
    - Parties: the primary applicant plus `record_items` of kind `co_applicant`.
    - Order summaries (RISK-08). Before RISK-08 ships, the legacy `metadata.screening`.
    - Identity and income results.
    - Flags.
  - `lib/screening/decisions.js`:
    - `previewDecision(admin, applicationId)`.
    - `recordDecision(admin, { applicationId, outcome, reasons, conditions, overrideReason, actor })`. It requires `overrideReason` when the outcome differs from the recommendation. It writes the row, supersedes the previous one, updates `applications.status`/`decision`, and logs activity from the server. It returns `{ decision, adverseActionRequired }`, which is true for a denial, or a conditional approval, with any reason sourced from a report or third party.
- *API routes / jobs:* `app/api/screening/decisions/route.js`:
  - GET `?applicationId=`: preview plus history.
  - POST: record.
  - Requires `screening.decide`.
- *UI:*
  - **Decision wizard** (`applications.jsx:390-485`):
    - Step 1 shows the engine checks (pass, fail or review, with rule citations).
    - The outcome defaults to the recommendation, and reasons are pre-filled from failed checks.
    - Map `ADVERSE_ACTION_REASONS` (`shared.js:308-318`) to codes, and add "Fraudulent or unverifiable information" and "Criminal history (after individual assessment)".
    - Overriding requires a reason.
    - `finish` posts to the API instead of `ctx.commit`/`commitMeta`.
  - **The Decision section** (`application_sections.jsx:346-431`) lists the decision history.
- *Permissions:* `screening.decide`.
- *Integrations:* none.

**Steps**
1. Write the migration (drift fix plus the decisions table), checking names first.
2. Build `criteria.js` and its fixture tests.
3. Build `facts.js`.
4. Build `decisions.js` and the route.
5. Rewire the wizard.
6. Build the history UI.

**Research before building**
- **First-in-time rules:** Seattle SMC 14.08.050, Portland FAIR, and CA AB 2493's ordering option. Should the evaluation order follow completion time?
- **FTC "Using Consumer Reports: What Landlords Need to Know"** (bus49): conditional terms count as adverse action.
- **Counsel's view on wording.** Does presenting a "recommendation" make Geiger look like a reporting agency? See Open decisions.

**Acceptance criteria**
- **Consistency:**
  - The same facts and criteria always give the same checks and recommendation.
  - Two applicants with identical facts get identical results.
- **Integrity:**
  - Decision rows can't be updated through the anon key.
  - Changing a decision adds a row and sets `superseded_by`.
  - An override without a reason returns 400.
- **Voucher:** a voucher holder whose tenant portion is $600 of $2,000 rent, with $1,900 income, passes 3× on the tenant portion where the rule applies.
- **Look-back:** an 8-year-old eviction is ignored under a 7-year look-back.
- **Snapshot:** the stored `criteria_hash` equals `criteriaHash` of the resolved criteria.
- **Clean build:** the drift-fix migration runs on an empty database, together with the earlier listing-index migration.

**Depends on / unblocks** — Depends on RISK-03, 04 and 05 (with no rules, it treats effects as empty). Unblocks RISK-07, 13, 14 and 19. Cross-ref HOUS (voucher income).

**Open decisions**
- Should the engine show a suggested outcome, or only pass/fail per criterion? The recommendation: show pass/fail plus "meets your criteria / doesn't". The human always picks the outcome, as MRI does (PMX-2.53).

#### RISK-07 · FCRA adverse-action notices generated from the decision
- **MRI equivalent:** none. PMX leaves adverse action to the client, and no letter generation was found (PMX-2.53). This is a chance for Geiger to lead.
- **Status · priority · effort:** Tracking-only · P1 · M
- **Refs:** Gap 2.4 · Inventory 2a.47, 2a.48

**Geiger today**
- **Only the fields are recorded.** The wizard stores reasons, a "notice sent on" date and a "consumer report used" switch (`applications.jsx:447-458, 474-477`, shown at `application_sections.jsx:387-397`).
- **No letter is generated or sent** (inventory 2a.48, confirmed).
- **Conditional approvals never trigger a notice** (`applications.jsx:431-446`).
- **The email catalog has no applicant notices** (`lib/email/catalog.js:19+`).

**What's missing**
- Notice content built from the decision.
- Delivery with proof.
- §615(b) notices for information that didn't come from a reporting agency.
- Fair-chance and state additions.

**How to build**
- *Data model:* migration `adverse_action_notices`.
  - **`property.adverse_action_notices` columns:**
    - `project_id`, `application_id`, `decision_id`, `party_ref`.
    - `kind`: fcra_615a, fcra_615b, conditional_terms, fair_chance_intent, or fair_chance_final.
    - `recipient_name`, `recipient_email`, `mailing_address`.
    - `content jsonb` (the sections), `body_text`.
    - `document_path` (in the private bucket).
    - `delivery`: email, mail, in person, or portal.
    - `status`: draft, sent, or failed.
    - `sent_at`, `sent_by`, `email_send_id`.
    - The standard columns.
  - A notice can't be changed once sent. The table is server-only.
- *Server logic:* `lib/screening/adverse_action.js`.
  - `buildNotice({ decision, orders, effects, company, applicant })` returns sections. §615(a) requires:
    - The action taken: denial, or approval on worse terms, with the terms listed.
    - The reporting agency's name, address and toll-free phone. These come from the order's `cra` field, or from the manual vendor fields at `application_sections.jsx:253-254`.
    - A statement that the agency didn't make the decision and can't explain it.
    - The right to a free copy within 60 days.
    - The right to dispute accuracy or completeness with the agency.
    - If a credit score was used (§609(f), §615(a)(2)): the score, its range, up to 4 key factors (5 if inquiries is a factor), the date, and who created it.
  - §615(b): when information came from a third party other than an agency (references, employer), add the right to ask in writing within 60 days what that information was.
  - The principal reasons and the `effects.notices.extraContent` additions, for example NYC's copies of the documents relied on and the response window.
  - `renderNotice(sections)` produces HTML or text. Produce a PDF through the LEAS lease-PDF renderer (gap 2.6) once it exists.
  - Delivery: add `adverse_action_notice` to `EMAIL_NOTIFICATIONS` (group `leasing`, audience Applicant, template `property.adverse_action_notice`). Send through `sendNotificationEmail` (`lib/email/notifications.js:52`). Add the template in geiger-dash `mails/`.
- *API routes / jobs:*
  - `app/api/screening/notices/route.js`: POST `{decisionId}` creates a draft.
  - `app/api/screening/notices/[id]/send/route.js`: sends it.
  - `app/api/screening/notices/[id]/route.js`: GET downloads it, with an access-log row.
- *UI:*
  - When `adverseActionRequired`, the decision wizard adds a "Notice" step. It previews the sections; the agency and score fields are pre-filled from the order summary, and only the narrative fields can be edited.
  - The Decision section shows the notice status, "Download" and "Resend".
  - The list view shows a "Notice due" badge when a notice is required but unsent.
- *Permissions:* `screening.adverse_action`.
- *Integrations:* geiger-dash email. The suite's PDF renderer comes later.

**Steps**
1. Write the migration.
2. Build `buildNotice` and test it with fixtures for each kind.
3. Add the email catalog entry and the geiger-dash template.
4. Build the routes.
5. Add the wizard step and Decision section UI.
6. Add the "Notice due" badge and tile.

**Research before building**
- **The law itself.** 15 U.S.C. §1681m text, and the FTC's landlord guidance (bus49) with its sample notice.
- **Model wording.** Credit-score disclosure model forms in Regulation V/B.
- **Timing.** "Promptly": set a target of 3 business days.
- **State additions:**
  - CA Civ. Code §1785.20.
  - NY RPL §238-a (copy of the report).
  - WA RCW 59.18.257 (written adverse-action content).
- **Fair-chance forms.** NYC Commission on Human Rights notice forms.
- **Language.** A Spanish template.

**Acceptance criteria**
- **§615(a) content.** A denial for a credit reason produces every §615(a) element, including the score and key factors.
- **Conditional approvals.** An approval with an extra deposit produces a `conditional_terms` notice.
- **§615(b).** A denial based only on a landlord reference produces §615(b) wording and no agency block.
- **Fair chance.** An NYC fair-chance denial lists the attached documents.
- **Records.** A sent notice can't be changed. The email send id is stored. Downloads are logged.

**Depends on / unblocks** — Depends on RISK-06, RISK-02 and PLAT-01. PDF output depends on the LEAS lease-PDF work (gap 2.6). Unblocks RISK-13.

#### RISK-08 · Screening provider adapter, orders and manual provider
- **MRI equivalent:** Engage Protect Resident Screening. It provides a single combined report, per-property packages, extra products (identity traces, SSN search, employer and rental references), and status on the guest card.
- **Status · priority · effort:** Tracking-only · P1 · L
- **Refs:** Gap 2.4 · Inventory 2a.42, 2a.43, 9.28, 9.30 · PMX-2.45, PMX-2.46, PMX-2.51, PMX-2.52, PMX-2.54

**Geiger today**
- **Four hard-coded checks** (`shared.js:289-294`), with status, result and score typed into `applications.metadata.screening` (`application_sections.jsx:72-77, 146-263`).
- **"Start screening" only flips statuses** to Requested (`applications.jsx:374-389`).
- **Co-applicants get a single text status** (`applications.jsx:158`).
- **The Integrations card is disabled** (`settings/integrations.jsx:32`, cards at `:105-135`).
- **The prospect record shows no screening status.**

**What's missing**
- Provider-neutral orders per party.
- Packages, webhooks and a normalised summary.
- A link to the report.
- Status on the prospect record.

**How to build**
- *Data model:* migration `screening_orders`.
  - **`property.screening_orders` columns:**
    - `project_id`, `application_id`, `party_ref`, `party_name`.
    - `provider`: `manual`, `portable`, or a vendor key.
    - `package_key`, `components text[]` (credit, criminal, eviction, identity, income).
    - `stage`: pre_offer or post_offer.
    - `payer`: applicant or company. `price_cents`.
    - `status`: draft, invited, consented, in_progress, complete, partial, error, cancelled, or expired.
    - `provider_order_id`.
    - `invite_sent_at`, `consented_at`, `completed_at`.
    - `summary jsonb`, normalised:
      - `credit{score, model, range, factors[], thinFile}`
      - `eviction[{filedOn, outcome, amount}]`
      - `criminal[{date, level, category, disposition}]`
      - `identity{match}`
      - `vendorRecommendation`
    - `report_ref`, `report_path` (nullable).
    - `cra jsonb {name, address, phone}`.
    - `purge_after date`, `purged_at`, `last_error`.
    - The standard columns.
  - **Indexes:** on `application_id`; unique on `(provider, provider_order_id)`.
  - **`property.screening_events`** mirrors `stripe_events` (`20261015215336_online_payments_stripe.sql:139`): `event_id` (unique), `provider`, `type`, `order_id`, `status`, `processed_at`, `error`, and a payload digest only, never the raw payload.
  - Both tables are server-only.
- *Server logic:*
  - **The adapter contract,** `lib/screening/providers/contract.js` (JSDoc):
    ```js
    // { key, label,
    //   capabilities: { components, payerModes, hostedApplicantFlow, fairChanceSplit, portableReports },
    //   packages(config) → [{ key, label, components, priceCents, payer }],
    //   createOrder(ctx, { order, party, pkg, returnUrl }) → { providerOrderId, inviteUrl?, status },
    //   getOrder(ctx, id) → { status, summary? },
    //   getReport(ctx, id) → { summary, cra, pdf?, reportUrl? },
    //   cancelOrder(ctx, id), purgeReport?(ctx, id),
    //   verifyWebhook(request, secret) → event | null, parseEvent(event) → { eventId, providerOrderId, status } }
    ```
  - **Built-in providers:**
    - `providers/manual.js`: staff type results in, which keeps today's UI.
    - `providers/portable.js`: an applicant-supplied reusable report. The applicant uploads it to the private bucket, confirms it is dated within 30 days, and attests to it (WA and CO).
    - `providers/registry.js`: `getProvider(key)` and `configuredProviders()`. Credentials come from `SCREENING_<VENDOR>_*` env vars and the settings key `integrations.screening`.
  - **`lib/screening/orders.js`:**
    - `createOrders(admin, { applicationId, packageKey, parties, payer })`.
    - `syncOrder(admin, id)`.
    - `applyProviderEvent(admin, provider, event)`.
    - `attachReport(admin, id)`.
    - `migrateLegacyScreening(admin, application)`: on first load, maps `metadata.screening` into a manual order.
- *API routes / jobs:*
  - `app/api/screening/orders/route.js`: GET by application, POST create.
  - `app/api/screening/orders/[id]/route.js`: GET syncs, DELETE cancels.
  - `app/api/screening/orders/[id]/report/route.js`: GET returns a signed or vendor URL, writes an access-log row, and requires `view_reports`.
  - `app/api/screening/webhooks/[provider]/route.js`: verifies the event, dedupes it in `screening_events`, then applies it.
  - **New job `screening_order_sync`** in `lib/jobs/screening.js`, registered in `lib/jobs/registry.js:7`. It polls orders stuck `in_progress` for more than 2 hours. It runs from "Run now" until crons return (gap 0.10).
- *UI:*
  - **Screening section** (`application_sections.jsx:213-263`). It shows one card per party: the applicant plus co-applicants from `record_items` `co_applicant`. Each card has:
    - A status timeline and component chips.
    - A summary (score, eviction and criminal counts) for `screening.order`.
    - "View report" for `view_reports`.
    - The manual provider keeps the current `ScreeningCheck` inputs.
  - **"Order screening" wizard action.** It replaces `startScreening`. Steps: parties → package (the property's default, RISK-04) → payer → confirm.
  - **Overview card** (`application_sections.jsx:463-472`) reads the orders.
  - **List column.** The `Screening x/4` column (`applications.jsx:277-282`) counts completed orders.
  - **Prospect detail** (`marketing/prospects.jsx`) shows the latest application's screening chip (PMX-2.52).
  - **Integrations card** (`integrations.jsx:32`) shows the provider, mode, webhook health and packages.
- *Permissions:* `screening.order`; `screening.view_reports` for reports.
- *Integrations:* vendor adapters come in RISK-12, and the e-sign adapter pattern from LEAS should match this one.

**Steps**
1. Write the migration, checking names first.
2. Write the contract, registry, and the manual and portable providers.
3. Build `orders.js` with the legacy migration.
4. Build the routes and the webhook dedupe.
5. Add the sync job.
6. Build the per-party UI and the order wizard.
7. Add the prospect chip and the Integrations card.

**Research before building**
- How the shortlisted vendors split orders into components, especially a post-offer criminal-only order.
- Their webhook signing, sandboxes and idempotency keys.
- The FCRA §604(f) end-user certification each vendor needs.

**Acceptance criteria**
- **The manual provider behaves as today.** Legacy `metadata.screening` values appear as a manual order, and the list column stays correct.
- **Webhooks.** A duplicate webhook is ignored. A webhook for an unknown order is logged as failed.
- **Report access.** The report route returns 403 without `view_reports` and logs access with it.
- **Clean summary.** `summary` never contains an SSN, DOB or full address.
- **Per party.** Each co-applicant gets its own order.
- **Prospect.** The prospect record shows the status.

**Depends on / unblocks** — Depends on RISK-02, 03 and 04. Unblocks RISK-09, 10, 11, 12 and 13.

#### RISK-09 · Applicant authorization, consent and invites
- **MRI equivalent:** Engage Apply and Engage Protect. The applicant authorises and pays in the same flow that triggers the report (PMX-2.39).
- **Status · priority · effort:** Tracking-only · P1 · M
- **Refs:** Gap 2.4, 2.1, 8.4 · Inventory 2a.35, 2a.42 · PMX-2.39

**Geiger today**
- Staff record consent with an "Applicant consent on file" switch and a date (`application_sections.jsx:251-252`).
- There is no applicant-facing page. Portal roles are only resident, owner and vendor (`lib/portal/constants.js:7-32`).

**What's missing**
- Versioned disclosure text.
- Captured evidence of authorisation.
- Invite delivery.
- Consent scoped to each component, plus biometric consent for selfie checks (RISK-15).

**How to build**
- *Data model:* `property.applicant_consents`, added in migration `applicant_consents`.
  - **Columns:**
    - `project_id`, `application_id`, `party_ref`.
    - `scope text[]`.
    - `disclosure_key`, `disclosure_version`, `disclosure_sha256`.
    - `method`: vendor_hosted, geiger_hosted, or paper_upload.
    - `signed_name`, `signed_at`, `ip`, `user_agent`.
    - `provider_order_id`, `document_path`, `withdrawn_at`.
    - The standard columns.
  - Insert-only and server-only.
- *Server logic:*
  - `lib/screening/disclosures.js` holds the versioned disclosure texts: FCRA authorisation, state notices, and the biometric notice. Each is keyed with a version and a SHA-256.
  - `lib/screening/invites.js`:
    - `sendScreeningInvite(admin, orderId)` uses the vendor's `inviteUrl`. For Geiger-hosted flows, it signs a token link the same way payment links work (`lib/payments/checkout.js:211-217`).
    - The email goes through a new catalog entry, `screening_invite` (template `property.screening_invite`). It carries the published criteria and fee disclosure from RISK-04/10, and expires after 7 days.
    - `resendInvite` voids the old token.
  - Consent arrives in two ways: a vendor `consented` event, or a POST from the Geiger page.
- *API routes / jobs:*
  - `app/api/apply/consent/[token]/route.js`: public, rate-limited, behind PLAT-01. It is only used once the LEAS online application provides the page.
  - Until then, use vendor-hosted flows or a paper upload.
- *UI:*
  - The order card shows the consent evidence: method, version and time.
  - It also offers "Upload signed authorization" (paper) and "Resend invite".
  - The manual provider can't move an order past `invited` without an uploaded or attested consent.
- *Permissions:* `screening.order`.
- *Integrations:*
  - Vendor-hosted consent (RISK-12).
  - If a signature is needed, use the suite e-sign adapter (LEAS; geiger-docs).
  - Reuse the PLAT privacy/consent model (gap 8.4) for storage conventions.

**Steps**
1. Write the migration.
2. Write the disclosure texts and their versions.
3. Build the invite sender and the email catalog entry.
4. Build the consent intake (vendor event and paper upload).
5. Build the Geiger-hosted page once LEAS is ready.

**Research before building**
- **Vendor evidence.** Whether each shortlisted vendor captures FCRA authorisation itself and exposes evidence through its API.
- **State disclosures.** For example CA ICRAA if an investigative report is used, and the WA criteria notice.
- **Electronic records.** ESIGN Act consent for electronic records.
- **Biometric consent.** The required wording under IL BIPA, TX CUBI and WA RCW 19.375.

**Acceptance criteria**
- No order reaches `in_progress` without a consent row.
- Consent rows can't be changed, and the stored hash matches the stored version text.
- Expired or resent tokens are rejected.

**Depends on / unblocks** — Depends on RISK-08, and on the LEAS online application (gap 2.1) for Geiger-hosted pages. Also depends on PLAT-01 and PLAT privacy/consent (gap 8.4). Unblocks RISK-12, 15 and 17.

#### RISK-10 · Who pays, and screening-fee rules
- **MRI equivalent:** Engage Apply and Engage Pay. Fees are shown in full and collected in the flow that triggers screening (PMX-2.39).
- **Status · priority · effort:** Tracking-only · P1 · S
- **Refs:** Gap 2.4, 2.10 · Inventory 2a.46 · PMX-2.39

**Geiger today**
- **Fees are recorded only.** Fee rows live in `record_items` (kind `fee`) with statuses Due, Paid, Waived and Refunded, and the screen says "recorded only — no payment is processed" (`application_sections.jsx:265-344`).
- **A screening fee type already exists** (`shared.js:305`).
- **There is a default application fee:** the `applicationFee` policy, default $45 (`lib/policies.js:85`).

**What's missing**
- A payer model per package.
- Location fee rules: cap, refund, receipt, ban, and acceptance of portable reports.
- A link to fee collection and posting.

**How to build**
- *Data model:* no new table. Orders carry `payer` and `price_cents` (RISK-08). Fee rows get `metadata.orderId`.
- *Server logic:*
  - **Payer modes** (policy `screeningPayer`):
    - (a) **The applicant pays the vendor directly** in the vendor-hosted flow. No money moves through Geiger and no ledger posting is made.
    - (b) **The applicant pays Geiger an application fee.** LEAS collects it (gap 2.10, Stripe Checkout) and a CORE ledger rule posts it as application-fee income. The vendor bills the company, which records the cost as an expense through CORE bills/AP.
    - (c) **The company absorbs the cost.** It can optionally pass it through to the owner under the management agreement (CORE).
  - **`lib/screening/fees.js`:**
    - `feeRules(effects, criteria)` returns `{ maxFee, capType, receiptRequired, refundIfNotScreened, refundDays, noFeeIfNoUnit, portableReport }`.
    - `validateApplicationFee(amount, rules)` returns `{ ok, error, citation }`.
  - The `screening_order_sync` job also lists "refund due" cases: applications closed without screening inside the refund window. Refunds go through the LEAS/CORE path (`lib/payments/refunds.js:50`), after staff approval.
- *API routes / jobs:* the extended `screening_order_sync` job, as above.
- *UI:*
  - The order wizard shows the payer and price.
  - The Fees section (`application_sections.jsx:315-333`) and the policy editor show the cap and its source, and block amounts above a hard cap.
  - Add a "Refund due" view to Applications.
  - An itemised receipt template, `property.application_fee_receipt`, is used when the rules require it (CA §1950.6).
- *Permissions:* `screening.order`. Refunds use `accounting.post`.
- *Integrations:* Stripe, through LEAS.

**Steps**
1. Build `fees.js` and its tests.
2. Add validation to the Fees section and the policy editor.
3. Show the payer on orders.
4. Add refund-due detection.
5. Add the receipt template.
6. Hand the hooks to the LEAS fee item.

**Research before building**
- Vendor pricing and payer options.
- Whether applicant-pays vendor charges count toward state fee caps.
- Current dollar caps (the CA cap is CPI-adjusted; NY's is $20).
- How CORE posts application-fee income when no tenant or lease exists yet: a prospect/applicant ledger dimension.

**Acceptance criteria**
- **CA cap.** A CA property with a fee above the cap is blocked, with the citation shown.
- **Bans.** MA and VT properties can't add an application fee.
- **Applicant pays.** An applicant-pays order creates no fee row.
- **Refunds due.** The list is correct for applications closed unscreened.

**Depends on / unblocks** — Depends on RISK-04, 05 and 08, on LEAS-07, LEAS-13 (gap 2.10) (collection), and on CORE ledger rules (posting). Unblocks RISK-12.

#### RISK-11 · Report retention and secure disposal
- **MRI equivalent:** PMX consent flags and anonymisation on request (PMX-8.13). Retention controls in Engage Protect.
- **Status · priority · effort:** Missing · P1 · S
- **Refs:** Gap 2.4, 8.4 · PMX-8.13

**Geiger today**
- Nothing deletes screening data. Product tables are soft-delete only (`conventions/MIGRATION_CONVENTIONS.md:296-298`).
- Documents are public (RISK-02).

**What's missing**
- A retention policy.
- Disposal of raw reports, files, identity detail and income detail, while keeping a minimal decision record.
- A disposal log.

**How to build**
- *Data model:*
  - Company settings `screening_retention`: `{ reportMonths, decisionYears, deniedApplicantMonths }`. Defaults are an open decision.
  - `applications.metadata.legalHold` (boolean).
- *Server logic:* `lib/jobs/screening.js` adds a `screening_retention` job. It is idempotent and writes to `job_runs`. For each order past `purge_after`:
  - Hard-delete its storage objects. This is a deliberate exception to soft-delete, because the Disposal Rule requires destruction.
  - Call the provider's `purgeReport` where supported.
  - Strip `summary` down to the fields the decision record cites.
  - Set `purged_at`.
  - Hard-delete expired fingerprints.
  - Redact identity and income detail (Stripe Identity `redact`, RISK-15).
  - Write one `dispose` row per object to the access log.
- *API routes / jobs:* register the job in `lib/jobs/registry.js`. It is manual until crons return (gap 0.10).
- *UI:*
  - Settings gets retention fields.
  - The application shows "Report disposed on …".
  - Add a legal-hold switch, which needs `screening.criteria`.
- *Permissions:* `screening.criteria` for settings and legal hold.
- *Integrations:* the provider purge APIs.

**Steps**
1. Add the setting and the legal-hold flag.
2. Build the job.
3. Add the disposal logging.
4. Build the UI.

**Research before building**
- **The rules:**
  - 16 CFR Part 682.
  - The FCRA statute of limitations (§1681p: 2 years from discovery, 5 from the violation).
  - FHA filing windows (1 year for a HUD complaint, 2 years to sue).
- **External requirements:**
  - State or local record-keeping duties, such as NYC fair-chance documentation.
  - Vendor contracts that require purging after N days.
- **Backups:** the Supabase backup window as a residual copy.

**Acceptance criteria**
- The job deletes objects past their purge date, sets `purged_at` and logs each disposal.
- Decision rows and reasons remain afterwards.
- Legal hold skips the application.
- Running the job twice changes nothing more.

**Depends on / unblocks** — Depends on RISK-02 and RISK-08, and on the scheduling item (gap 0.10) for automatic runs.

**Open decisions**
- How long to keep raw reports and decision records. A proposed starting point, pending counsel review: reports 25 months, decisions 5 years.

#### RISK-12 · First screening vendor integration
- **MRI equivalent:** Engage Protect, which is MRI-owned (TransUnion ResidentScore, human-verified criminal research). Partner screeners include SafeRent, Findigs, TransUnion and Experian (PMX-2.54).
- **Status · priority · effort:** Missing · P1 · L
- **Refs:** Gap 2.4 · Inventory 2a.43, 9.30 · PMX-2.45–2.51, PMX-2.54

**Geiger today** — no vendor code. A grep finds only option labels (inventory 2a.43, confirmed).

**What's missing** — a live adapter, end-user credentialing, and webhooks.

**How to build**
- *Data model:* none beyond RISK-08.
- *Server logic:*
  - Build `lib/screening/providers/<vendor>.js` against the RISK-08 contract, register it, and map its packages.
  - Map the vendor's output to the normalised `summary` and `cra`.
  - Implement a post-offer, criminal-only order if the vendor supports it (RISK-13).
- *API routes / jobs:* the webhook route key `<vendor>`. Env vars `SCREENING_<VENDOR>_API_KEY` and `_WEBHOOK_SECRET`.
- *UI:* the Integrations card gets a connect flow showing the company's end-user credentialing status, and the order wizard lists the vendor's packages.
- *Permissions:* as in RISK-03.
- *Integrations:* the vendor shortlist below (research it; the choice is open).

| Vendor | Model | Why consider | Watch |
|---|---|---|---|
| TransUnion ShareAble for Rentals (successor to the SmartMove API) | Applicant-initiated; applicant or landlord pays | Credit, criminal, eviction, ResidentScore and ID check through one partner API. Used by small-landlord PMS products | Partner terms; platform fee |
| RentPrep (API) | Reseller | TransUnion full credit plus human-verified criminal and eviction checks by FCRA-certified screeners (like PMX-2.49) | API depth and webhooks |
| Checkr (tenant screening; owns Truework since 2025) | API-first | Could bundle screening with income and employment verification (RISK-17) | Depth of the rental product |
| Certn | API-first, US and Canada | Modern API with ID, credit and criminal | US eviction coverage |
| Experian (RentBureau / Connect) | Bureau | Second bureau | Whether a platform API exists for small landlords |
| SafeRent Solutions | Enterprise | Housing score; also an MRI partner | 2024 Massachusetts settlement over scoring of voucher holders (verify); source-of-income risk |
| RentSpree, SingleKey | Applicant-pays | Simple embedded flows | API and coverage |
| Zillow, Apartments.com, Zumper screening | Consumer marketplaces | — | Likely no embeddable partner API (verify). Excluded for now |
| CheckpointID / Engage Protect | MRI-owned | — | Excluded: competitor |

**Steps**
1. Decide the vendor and the default payer.
2. Sign the partner agreement and complete end-user credentialing (site inspection, if the vendor requires it).
3. Build the adapter and its sandbox tests.
4. Wire up the webhooks.
5. Map the packages to the RISK-04 policy options.
6. Add fair-chance split support.
7. Run sandbox end to end.
8. Restore the RISK-01 copy.

**Research before building** — for each shortlisted vendor:
- API documentation and a sandbox.
- End-user credentialing burden.
- Per-report pricing and revenue share.
- Webhook signing.
- The adverse-action content and agency details the vendor supplies.
- Data retention and purge APIs.
- SOC 2 report.
- Support for portable reports, human-verified criminal checks, post-offer criminal-only orders, and per-property packages.

**Acceptance criteria**
- A sandbox application completes the whole path: invite → consent → complete webhook → normalised summary → report link (logged) → engine checks → decision → adverse-action notice with the vendor's agency details.

**Depends on / unblocks** — Depends on RISK-02, 03, 08, 09 and 10, and PLAT-01. Unblocks the RISK-01 restore and live RISK-13.

**Open decisions**
- Which vendor.
- The default model: applicant pays the vendor directly, or Geiger collects and the landlord pays.
- Whether Geiger takes a revenue share.

#### RISK-13 · Fair-chance two-step workflow
- **MRI equivalent:** Engage Protect location-specific rules and human-verified criminal research (PMX-2.48, PMX-2.49).
- **Status · priority · effort:** Missing · P1 · M
- **Refs:** Gap 2.4 · PMX-2.48, PMX-2.49

**Geiger today**
- The criminal check is ordered together with the others (`shared.js:290`).
- The conviction question is on the applicant form (`applications.jsx:127`).
- There is no conditional-offer stage in `APPLICATION_STATUS_MAP` (`shared.js:115-126`).

**What's missing**
- Stage 1, the non-criminal evaluation.
- The conditional offer.
- Stage 2, the criminal check.
- The individual assessment, the notice of intent, the applicant's response window, and the final notice.

**How to build**
- *Data model:*
  - Add the statuses "Conditional offer" and "Assessment" to `APPLICATION_STATUS_MAP`, and to `APP_IN_REVIEW` (`shared.js:128`).
  - Add `applications.metadata.conditionalOffer {at, by, noticeId}`.
  - Reuse the decision `stage` (RISK-06), the order `stage = post_offer` (RISK-08), and the notice kinds `fair_chance_intent`/`fair_chance_final` (RISK-07).
- *Server logic:* `lib/screening/fair_chance.js`.
  - `stagePlan(effects)`.
  - `canOrderCriminal(application, effects)`.
  - `assessmentFactors(effects)`: the nature and severity of the offence, time elapsed, age at the time, evidence of rehabilitation, and relevance to the tenancy.
  - `responseDeadline(effects, sentAt)`, counted in business days.
  - The order API refuses to order a criminal component before a conditional offer where the rules require one (409).
- *API routes / jobs:*
  - `app/api/screening/conditional-offer/route.js`: POST sends a written offer email (`property.conditional_offer`).
  - The `screening_order_sync` job reminds staff when a response window closes.
- *UI:* new `applications.jsx` actions:
  - "Make conditional offer".
  - "Order criminal check" (post-offer).
  - An "Individual assessment" wizard that requires every factor and lets staff attach the applicant's documents.
  - "Send notice of intent".
  - "Final decision".
  - The Decision section shows a timeline. Properties outside fair-chance areas keep the one-step flow.
- *Permissions:* `screening.decide`; `screening.adverse_action` for notices.
- *Integrations:* the vendor's post-offer, criminal-only order (RISK-12).

**Steps**
1. Add the statuses and `stagePlan`.
2. Add the guard in the order API.
3. Build the conditional offer.
4. Build the assessment wizard.
5. Add the intent and final notices.
6. Add the reminder.

**Research before building**
- The steps and forms for each jurisdiction: NYC Commission on Human Rights, Cook County Commission on Human Rights, NJ Division on Civil Rights, DC Office of Human Rights and the Seattle Office for Civil Rights.
- Each jurisdiction's lists of convictions that may be reviewed, and its response windows.
- Whether vendors charge again for a separate post-offer criminal order.

**Acceptance criteria**
- **NYC:** a criminal component can't be ordered before the conditional offer (409).
- **Offer:** the offer email is recorded.
- **Assessment:** it can't be saved with a factor missing.
- **Final denial:** it is blocked until the response window ends or the applicant responds, and the final notice lists the documents relied on.
- **Elsewhere:** a property outside fair-chance areas keeps the one-step flow.

**Depends on / unblocks** — Depends on RISK-05, 06, 07 and 08 (and RISK-12 for live orders).

#### RISK-14 · Application fraud flags (non-AI rules)
- **MRI equivalent:** Engage Protect fraud prevention. MRI's AI fraud features (PMX-10.18) are deferred here under the no-AI decision.
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Gap 2.8, 10.6 · Inventory 2a.44, 10.10 · PMX-10.18

**Geiger today**
- There is no fraud logic.
- No SSN is stored (`applications.jsx:121`). This is correct, so duplicate detection needs the RISK-02 fingerprints.

**What's missing** — rule-based flags with a review workflow.

**How to build**
- *Data model:* `property.application_flags`, added in migration `application_flags`.
  - **Columns:**
    - `project_id`, `application_id`, `party_ref`.
    - `rule_key`.
    - `severity`: info, review, or high.
    - `details jsonb`: matched application ids and fields, never raw values.
    - `status`: open, cleared, or confirmed.
    - `reviewed_by`, `reviewed_at`, `review_note`.
    - The standard columns.
  - Unique on `(application_id, rule_key, party_ref) where status = 'open'`.
  - Server-only.
- *Server logic:* `lib/screening/fraud_rules.js` (pure). Every rule is limited to the same project:

  | # | Rule | Severity |
  |---|---|---|
  | 1 | The same SSN digest appears with a different name or DOB | high |
  | 2 | The same email or phone digest appears on applications with different applicant names | review |
  | 3 | The applicant's phone equals a landlord, reference or employer phone (`applications.jsx:194, 203`; `application_sections.jsx:120`) | review |
  | 4 | The same landlord-reference phone appears on unrelated applications | review |
  | 5 | Name or DOB doesn't match the ID check (RISK-15) or the vendor's identity match | high |
  | 6 | The supplied SSN has an invalid format (area 000, 666 or 9xx; group 00; serial 0000). No issuance-date logic, because SSNs have been randomised since June 2011 | high |
  | 7 | Stated income differs from verified income by more than 25% (RISK-17) | review |
  | 8 | The same document SHA-256 appears on another application | high |
  | 9 | Velocity: more than N applications from one email, phone or IP in 24 hours, or more than M co-applicant changes after submission | review |
  | 10 | Disposable email domain | info |
  | 11 | A digest matches an earlier flag that was confirmed as fraud | high |

  - `lib/screening/fraud.js` (server): `scanApplication(admin, applicationId)`. It runs:
    - On `application.submitted`. The event is emitted at `20261015212609_messaging_scheduler_automations.sql:257-258`; run it through the automation runner or a route hook.
    - On order, identity and income updates.
  - It takes a `scorers` hook (an empty array), so the future suite AI package can plug in later. There is no AI now.
- *API routes / jobs:*
  - `app/api/screening/flags/route.js`: GET by application, POST review.
- *UI:*
  - A "Flags" card on the application Overview.
  - A list badge, and a "Needs review" view.
  - A review dialog to clear or confirm, with a required note.
  - Flags never change the status on their own. A confirmed flag can feed the reason "Fraudulent or unverifiable information" (RISK-06/07).
- *Permissions:* `screening.fraud_review`.
- *Integrations:* none.

**Steps**
1. Write the migration.
2. Build the rules with fixture tests.
3. Build the scanner and its triggers.
4. Build the UI and the review dialog.

**Research before building**
- FCRA exposure from keeping internal fraud lists.
- Making sure no rule uses protected characteristics or proxies for them (for example IP country) — a fair-housing risk.
- A licence for the disposable-domain list.

**Acceptance criteria**
- A duplicate SSN digest with different names produces a high flag.
- The same person applying to two units produces no SSN flag.
- Flags never change the application status.
- Clearing a flag requires a note.
- Digests from another project never match.

**Depends on / unblocks** — Depends on RISK-02, 03 and 06. Rules 5 and 7 need RISK-15 and RISK-17. Unblocks RISK-19.

**Open decisions**
- Allow matching across projects within one organisation? It is not recommended without legal review, because sharing applicant data across landlords could make Geiger a reporting agency.

#### RISK-15 · ID verification with Stripe Identity
- **MRI equivalent:** Engage Protect ID Verification (formerly CheckpointID). It does DMV checks, selfie matching, and scanning of barcodes and the passport MRZ.
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Gap 2.8 · Inventory 2a.44 · PMX-2.55, PMX-2.56, PMX-2.57

**Geiger today**
- ID type and ID last 4 are typed in and never read (`applications.jsx:120-121`).
- The tenant record has its own ID fields (`tenants/shared.js:145-155`).
- Showings have an "ID verified" switch (`showing_sections.jsx:52`).
- Stripe is already live:
  - The server client: `lib/stripe/server.js:30-34`.
  - The verified webhook with dedupe through `stripe_events`: `app/api/stripe/webhook/route.js:22-37, 39-70, 94-111`.

**What's missing** — real document checks, selfie matching, and name/DOB matching.

**How to build**
- *Data model:* `property.identity_checks`, added in migration `identity_checks`.
  - **Columns:**
    - `project_id`.
    - `context`: application, tour, move-in, vendor, or other.
    - `application_id`, `showing_id`, `move_id`, `party_ref`.
    - `provider`, `provider_session_id` (unique).
    - `checks text[]`: document, selfie, id_number.
    - `status`: created, requires_input, processing, verified, canceled, or expired.
    - `result jsonb`: document type, issuer, expiry, `nameMatch`, `dobMatch`, and error codes. No images or full numbers.
    - `verified_at`, `redacted_at`.
    - The standard columns.
  - Server-only.
- *Server logic:*
  - `lib/identity/contract.js`: the adapter, shaped like RISK-08.
  - `lib/identity/stripe_identity.js`:
    - `createSession(check)` calls `stripe.identity.verificationSessions.create({ type: 'document', options: { document: { require_matching_selfie: true } }, metadata: { app: 'geiger-property', projectId, checkId } })` and returns the hosted `url` to email to the applicant.
    - `evaluateSession(id)` retrieves the session with `verified_outputs` server-side, computes `nameMatch`/`dobMatch` against the application, and stores only the booleans.
    - `redactSession(id)`, used by RISK-11.
  - `lib/identity/fulfill.js`: `handleIdentityEvent(admin, session)`.
- *API routes / jobs:*
  - Add the events `identity.verification_session.verified`, `requires_input`, `canceled`, `processing` and `redacted` to `HANDLED` and `dispatch` in `app/api/stripe/webhook/route.js`. Filter on `metadata.app`.
  - `app/api/identity/checks/route.js`: POST creates a check and emails the link (`identity_verification_invite`); GET lists checks by application.
- *UI:*
  - The Applicant section gets a "Verify identity" action and a result card per party, replacing the ID last-4 inputs.
  - Settings → Integrations gets an "Identity verification" card showing Stripe and its mode.
- *Permissions:* `screening.order` to send; `screening.view_reports` for detail.
- *Integrations:* compare the options.
  - **Stripe Identity first:**
    - It runs on the existing Stripe account and webhook, and its hosted flow needs no applicant portal.
    - Price: about $1.50 per document-plus-selfie check, $0.50 per US SSN lookup, first 50 free. Verify on stripe.com/identity.
    - It checks no DMV/AAMVA records (verify), unlike PMX-2.55.
  - **Alternatives:**
    - **Persona:** configurable, with an AAMVA database add-on.
    - **Socure:** enterprise; ML risk scores.
    - **Plaid Identity Verification:** worth it if Plaid is chosen for income.
    - **Veriff / Onfido / Incode.**
    - **CheckpointID:** MRI-owned, so excluded.

**Steps**
1. Write the migration.
2. Build the adapter and the Stripe implementation.
3. Wire the webhook events.
4. Build the route and the email.
5. Build the UI.
6. Connect redaction to the retention job.

**Research before building**
- **Stripe Identity documentation:**
  - Verification sessions and `verified_outputs` access.
  - Redaction.
  - Supported documents.
  - The biometric consent Stripe shows.
  - Its terms on use for rental applicants, and whether a failed check may be the basis for denial. Stripe says it is not a reporting agency.
- **State biometric laws:** IL BIPA, TX CUBI, WA RCW 19.375.
- **Persona's AAMVA pricing.**

**Acceptance criteria**
- A test-mode session goes link → `verified` webhook → check verified with `nameMatch` and `dobMatch`.
- A duplicate event is ignored through `stripe_events`.
- No images or full ID numbers are stored (inspect `result`).
- A failed check raises RISK-14 rule 5 and offers the reason "Unable to verify identity".

**Depends on / unblocks** — Depends on RISK-02, 03 and 09 (biometric consent). Unblocks RISK-14 (rule 5) and RISK-16.

**Open decisions**
- Is vendor-side ML, such as Stripe's selfie matching, acceptable under the no-AI decision? Geiger itself would add no AI.

#### RISK-16 · ID checks at tours, move-in and for vendors
- **MRI equivalent:** Engage Protect ID Verification workflows for move-ins, lockouts, vendors and guests (PMX-2.58).
- **Status · priority · effort:** Tracking-only · P3 · S
- **Refs:** Gap 2.8 · Inventory 2a.31 · PMX-2.58

**Geiger today**
- Self-guided tour codes are issued with no verified ID (`newAccessPatch`, `showing_sections.jsx:41-46`).
- The "ID verified" switch is typed in by staff (`:52`).

**What's missing** — verified ID before a self-guided tour code is released, and at move-in.

**How to build**
- *Data model:* reuse `identity_checks` with context `tour` / `move_in` / `vendor`.
- *Server logic:*
  - Add the policy `requireIdForSelfTour`, which defaults to on for self-guided tours.
  - `newAccessPatch` callers check for a verified check on the showing first.
- *API routes / jobs:* reuse `app/api/identity/checks`.
- *UI:*
  - A "Verify ID" action on Showings (`marketing/showings.jsx`) and Moves (`leasing/moves.jsx`).
  - The `idVerified` switch is set by the check, not typed.
- *Permissions:* `screening.order`.
- *Integrations:* Stripe Identity.

**Steps**
1. Add the policy key.
2. Add the guard on access-code issue.
3. Add the actions.

**Research before building** — whether smart-lock providers (a separate item) expose an ID-gating hook.

**Acceptance criteria**
- With the policy on, a self-guided showing can't issue a code until the ID check is verified.

**Depends on / unblocks** — Depends on RISK-15.

#### RISK-17 · Income verification adapter and first provider
- **MRI equivalent:** Engage Protect Income Verification. It connects to payroll or bank, reviews self-employed applicants by hand, and checks employers (PMX-2.59, PMX-2.61).
- **Status · priority · effort:** Tracking-only · P2 · L
- **Refs:** Gap 2.9 · Inventory 2a.45 · PMX-2.59, PMX-2.61

**Geiger today**
- Employment and income are typed in (`application_sections.jsx:113-134`).
- "Income verification" is one of the manual checks (`shared.js:293`).
- Income documents are a multiselect (`application_sections.jsx:127`).

**What's missing** — payroll or bank connections that return verified income for the criteria engine.

**How to build**
- *Data model:* `property.income_checks`, added in migration `income_checks`.
  - **Columns:**
    - `project_id`, `application_id`, `party_ref`.
    - `method`: payroll, bank, document, employer, or manual.
    - `provider`, `provider_ref`, `status`.
    - `stated_monthly`, `verified_monthly`.
    - `sources jsonb`: `[{ employer, payFrequency, grossMonthly, asOf }]`.
    - `doc_checks jsonb` (RISK-18).
    - `consent_id`, `verified_at`, `purged_at`.
    - The standard columns.
  - Server-only.
- *Server logic:*
  - `lib/income/contract.js`: shaped like RISK-08, with `createLink` → hosted URL, `getResult`, `verifyWebhook` and `parseEvent`.
  - `lib/income/<provider>.js`.
  - `loadApplicationFacts` (RISK-06) reads the verified income, which fills in `incomeVerified` and the amounts.
- *API routes / jobs:*
  - `app/api/income/checks/route.js`.
  - `app/api/income/webhooks/[provider]/route.js`.
  - The invite email `income_verification_invite` carries the provider's hosted link (for example Plaid Hosted Link). No Geiger portal is needed.
- *UI:*
  - The Employment & income section gets a "Verify income" action and a card per party showing stated vs verified.
  - Add an Integrations card.
- *Permissions:* `screening.order`; `view_reports` for detail.
- *Integrations (provider decision open):*
  - **Plaid:** Bank, Payroll and Document Income. For decisions covered by FCRA, Plaid Check Consumer Report (plaid.com/residential-leasing).
  - **Argyle:** payroll.
  - **Truework:** Checkr since 2025; employer network plus manual checks.
  - **Truv; Mastercard Open Finance (Finicity):** the latter publishes a tenant-screening tutorial.
  - **Equifax The Work Number:** costly.
  - **Nova Credit:** MRI's engine; ML document checks.
  - **Stripe Financial Connections: not for income decisions.** Stripe says it is not a reporting agency, and its data terms forbid using the data as a consumer report without written approval. Keep it for ACH only.

**Steps**
1. Choose the provider.
2. Write the migration.
3. Build the contract and the provider.
4. Build the webhook and hosted links.
5. Feed the engine and fraud rule 7.
6. Build the UI.

**Research before building**
- **FCRA role.** Each provider's role under FCRA: reporting agency or conduit. This decides who handles disputes and what the adverse-action notice says.
- **Commercials and coverage.** Pricing, payroll coverage and applicant experience.
- **Benefit and voucher income** (HOUS).

**Acceptance criteria**
- A sandbox flow verifies income, and the engine uses `verified_monthly` when present.
- A consent row exists before the link is sent.
- A discrepancy of more than 25% raises a flag.
- The retention job purges `sources`.

**Depends on / unblocks** — Depends on RISK-02, 03, 06 and 09. Unblocks RISK-14 (rule 7) and RISK-18.

**Open decisions**
- Which income provider.

#### RISK-18 · Document income review with non-AI pay-stub checks
- **MRI equivalent:** Engage Protect pay-stub fraud detection. It checks against "700+ fraud indicators" using Nova Credit's engine (PMX-2.60), plus manual review (PMX-2.61).
- **Status · priority · effort:** Tracking-only · P2 · M
- **Refs:** Gap 2.9 · Inventory 2a.45, 10.10 · PMX-2.60, PMX-2.61

**Geiger today**
- Pay stubs are uploaded to the public bucket (RISK-02).
- They go through no checks.

**What's missing** — a structured review with deterministic checks and a review queue.

**How to build**
- *Data model:* `income_checks.doc_checks` (RISK-17), with `method = 'document'`.
- *Server logic:* `lib/income/doc_checks.js` (pure). It runs on stub figures staff key in through a structured "Pay stub figures" form: pay date, period, gross, net, YTD gross, Social Security and Medicare amounts, employer name and EIN. There is no OCR and no AI. Checks:
  - **Net pay:** gross minus deductions equals net, within $0.05.
  - **YTD:** YTD is roughly gross × periods elapsed, within 10%.
  - **Social Security:** 6.2% of gross, up to the wage base.
  - **Medicare:** 1.45% of gross, plus 0.9% above the threshold.
  - **Pay dates:**
    - They match the frequency (for example biweekly means 14 days apart, on the same weekday).
    - The period end is on or before the pay date.
    - Not in the future. A weekend pay date is a warning.
  - **State tax:** state tax withheld in a state with no income tax (TX, FL, WA, NV, SD, WY, AK, TN, NH).
  - **EIN:** format NN-NNNNNNN with a valid IRS prefix.
  - **Number patterns:** round-number patterns; identical net pay across stubs while hours vary.
  - **Server-side PDF metadata:** Producer/Creator strings from known stub generators; ModDate differs from CreationDate.
  - **Duplicates:** the same file SHA-256 on another application (shared with RISK-14 rule 8).
  - **Bank statements:** running-balance arithmetic.
  - **Employer:** a manual checklist (state business registration lookup plus a call), as in PMX-2.61.
  - Hook `docCheckers` (empty) for the future suite AI (OCR and a fraud model).
- *API routes / jobs:* `app/api/income/checks/[id]/document/route.js` (POST figures and file) runs the checks.
- *UI:*
  - A "Pay stub figures" dialog that shows rule results as each figure is entered.
  - A "Needs income review" view on Applications.
- *Permissions:* `screening.order` to enter; `screening.fraud_review` to clear.
- *Integrations:* none.

**Steps**
1. Build `doc_checks.js` with fixtures.
2. Build the figures dialog.
3. Build the PDF metadata reader. No PDF library is in `package.json`; choose a small parser.
4. Add the review view.

**Research before building**
- The 2026 Social Security wage base and the Additional Medicare threshold.
- The IRS EIN prefix list.
- A licence-friendly PDF metadata parser that runs server-side.

**Acceptance criteria**
- Fixture stubs trigger exactly the expected rules.
- No external calls are made.
- Results are stored in `doc_checks`, and high-severity results raise RISK-14 flags.

**Depends on / unblocks** — Depends on RISK-02, 14 and 17.

#### RISK-19 · Screening audit and consistency report
- **MRI equivalent:** Engage Protect's audit record ("what was checked, what was found, and what was decided").
- **Status · priority · effort:** Partial · P2 · S
- **Refs:** Gap 2.4 · Inventory 2a.59 · PMX-2.47

**Geiger today**
- The Applications stats show approval rate and average days to a decision (`applications.jsx:311-324`).
- The Leasing Report counts applications (`lib/reports/defs_operations.js:489-590`).

**What's missing** — a decision-consistency view: overrides, reasons, late notices and open flags.

**How to build**
- *Data model:* none.
- *Server logic:* a new report def `screening_decisions` in `lib/reports/defs_operations.js`, registered through `lib/reports/catalog.js:10`.
  - It reads server sources only (`lib/reports/sources_server.js`), because the tables are server-only.
  - It covers outcomes by property, override rate, top reasons, criteria-hash changes over time, notices sent more than 3 business days late, open flags, and turnaround.
  - Scores and findings are redacted.
- *API routes / jobs:* existing report routes. Scheduling uses `reports.schedule`.
- *UI:* the standard report view.
- *Permissions:* `view.reports`; `reports.export`.
- *Integrations:* none.

**Steps**
1. Build the def.
2. Build the server source.
3. Add redaction.

**Research before building** — none.

**Acceptance criteria**
- Totals reconcile with `screening_decisions`.
- Overrides are listed with their reasons.
- The late-notice count matches the fixtures.

**Depends on / unblocks** — Depends on RISK-06, 07 and 14.

#### RISK-20 · Lease guarantee partner
- **MRI equivalent:** Insurent (MRI-owned since June 2024). It acts as a lease guarantor accepted at more than 9,000 buildings.
- **Status · priority · effort:** Missing · P3 · M
- **Refs:** Gap 2.16 · Inventory 2b.108, 2a.37

**Geiger today**
- Guarantors exist only as people:
  - Party roles: `shared.js:320-325`; `lib/supabase/lease_parties.js:4`.
  - Conversion into lease parties: `flows.js:230-256`.
- A conditional approval can require a cosigner or guarantor (`applications.jsx:438`).
- There is no partner integration (inventory 2b.108, confirmed).

**What's missing** — a partner invite, status updates through webhooks, and coverage attached to the lease.

**How to build**
- *Data model:* `property.lease_coverages`, added in migration `lease_coverages`. RISK-21 shares it.
  - **Columns:**
    - `project_id`.
    - `kind`: lease_guarantee or deposit_alternative.
    - `provider`, `provider_ref` (unique).
    - `application_id`, `lease_id`, `tenant_id`.
    - `status`: invited, applied, approved, declined, active, claim_filed, cancelled, or expired.
    - `coverage_amount`, `coverage_months`, `premium_cents`.
    - `payer`.
    - `starts_on`, `ends_on`, `certificate_path`.
    - The standard columns.
- *Server logic:*
  - `lib/coverage/contract.js`: shaped like RISK-08, with `invite`, `getStatus`, `fileClaim?` and webhook functions.
  - `lib/coverage/<partner>.js`.
  - `convertApplicationToLease` (`flows.js:183-292`) copies an approved coverage onto the new lease.
- *API routes / jobs:* `app/api/coverage/route.js`; `app/api/coverage/webhooks/[provider]/route.js`.
- *UI:*
  - Add a "Lease guarantee" condition option in the decision wizard (RISK-04 `conditionalOptions`).
  - Add an "Offer lease guarantee" action and a coverage card on the application, and later on the lease People tab.
- *Permissions:* `screening.decide`.
- *Integrations (partner decision open):*
  - TheGuarantors: a partner API with invitations and webhooks (theguarantors.com/api; docs.theguarantors.com).
  - Leap, Rhino (guarantor product), Jetty.
  - Insurent: MRI-owned, so avoid.

**Steps**
1. Choose the partner.
2. Write the migration.
3. Build the adapter and webhook.
4. Add the decision option and actions.
5. Add the copy onto the lease at conversion.

**Research before building**
- Partner API documentation and sandboxes.
- Referral and revenue terms.
- Whether a referral fee needs an insurance producer licence.
- State rules on third-party guarantors.

**Acceptance criteria**
- A sandbox invite reaches `approved` through a webhook.
- Converting the application puts the coverage on the lease.
- A duplicate webhook is ignored.

**Depends on / unblocks** — Depends on RISK-06 and PLAT-01. Unblocks RISK-21, which shares the table.

**Open decisions**
- Which partner, and whether to take a revenue share.

#### RISK-21 · Deposit-alternative partner
- **MRI equivalent:** a partner category. There is no MRI-native product; Insurent is the nearest.
- **Status · priority · effort:** Tracking-only · P3 · M
- **Refs:** Gap 2.16, 0.4 · Inventory 3.64, 2b.108

**Geiger today**
- The lease metadata holds a deposit-alternative type, provider, policy number, coverage, monthly fee and status (`leasing/sections/lease_money.jsx:600-621`).
- `DepositAlternativeSection` bills the monthly fee as a recurring charge (`lease_money.jsx:661-705`).
- No provider is connected (`:691`).

**What's missing**
- Partner enrolment and status sync.
- Claims at move-out, tied to the deposit disposition.

**How to build**
- *Data model:* reuse `lease_coverages` (kind `deposit_alternative`). A one-time server action copies the existing `depositAlt*` metadata into rows; the metadata stays.
- *Server logic:*
  - Adapters for LeaseLock (lease insurance), Rhino (surety bond), Jetty Deposit and Obligo (billing authorisation).
  - Enrolment at conversion or move-in.
  - Claims filed at move-out from the deposit disposition (the CORE deposit item for gap 0.4).
  - Where the law requires a choice, the cash-deposit option stays.
- *API routes / jobs:* shared with RISK-20.
- *UI:* the deposit-alternative card reads and writes `lease_coverages` and shows the partner status and claims.
- *Permissions:* `accounting.post` for fee charges.
- *Integrations:* the partner APIs.

**Steps**
1. Choose the partner.
2. Build the adapter.
3. Write the backfill action.
4. Rework the card.
5. Add the claims hook into CORE deposit disposition.

**Research before building**
- State deposit-alternative statutes: opt-in, required disclosures, and whether the fee is refundable. Several states enacted these in 2023–2025; verify the list.
- Partner APIs and claim flows.

**Acceptance criteria**
- An enrolled lease shows the partner status.
- The monthly fee still posts through the recurring charge.
- A move-out claim is recorded against the coverage.
- The cash-deposit choice is preserved where the law requires it.

**Depends on / unblocks** — Depends on RISK-20 (the table) and the CORE deposit item (gap 0.4).

**Open decisions**
- Which partner, if any.

### Not building here
| MRI product | Why not | Revisit trigger |
|---|---|---|
| CheckpointID / Engage Protect ID Verification as a vendor | MRI-owned competitor. RISK-15 uses Stripe Identity or an independent vendor | Never as a vendor |
| ResidentCheck's in-house criminal research team (PMX-2.49) | A vendor capability, not software. Pick a vendor with human-verified criminal checks in RISK-12 | — |
| Housing-specific risk scores (ResidentScore, AccuScore; PMX-2.50) | Scores come from the vendor. Geiger applies the landlord's criteria and builds no score | If the chosen vendor exposes a score |
| AI fraud detection: face-match model, AI pay-stub screening (PMX-10.18, gap 10.6) | Standing no-AI decision. RISK-14 and RISK-18 leave `scorers` / `docCheckers` hooks | When the suite AI package ships |
| Insurent (lease guaranty) | MRI-owned. RISK-20 uses an independent partner | — |
