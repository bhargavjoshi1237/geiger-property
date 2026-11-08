# 6. Platform, data, security and AI

### Scope
- **MRI products covered:** MRI Agora (Ask Agora, Agora Intelligence, Agora Orchestrator, Workflow Builder), MIX APIs, MRI Application eXchange (MAX), Application Studio (was PMX Studio Suite), Security Console, Advanced User Security, Audit Trail, MRI•GO search, the Import/Export tool and full data extracts, MRI Cloud security controls, Okta MFA/SSO, Partner Connect.
- **Gaps covered:** 0.11, 9.1–9.10, 8.4, 11.6, 7.7, 10.1–10.7, plus a marketing-claims audit.
- **Geiger areas touched:**
  - every `property.*` migration and RLS policy; the RPCs in `supabase/migrations/*_ledger_core.sql` and `*_engine_foundations.sql`
  - `lib/supabase/*` (project scoping, storage, entity factory), `lib/rbac.js`, `context/rbac-context.js`, `lib/messaging/auth.js` (the staff route guard), `lib/portal/*`, `lib/sandbox/*`
  - `lib/automations/*`; Settings screens (`components/internal/screens/settings/*`); the topbar; `EntityListScreen`
  - `components/landing/*` and `README.md`
  - new: `lib/data_io/*`, `lib/api/*`, `lib/webhooks/*`, `lib/privacy/*`, `app/api/v1/*`
- **Suite products reused:**
  - `@geiger/rbac`: already a dependency at `package.json:18` but never imported
  - geiger-dash: orgs, `public.is_project_member`, email, and the API-key pattern
  - geiger-notify: in-app notices
  - `@geiger/ui`: CommandPalette, DataTable, Checkbox
  - geiger-pods: evaluated as the API gateway

### What the code shows that the gap report doesn't say
- **0.11 is worse than "open to anyone with the public key".**
  - `property.emit_record_event` is `security definer` and granted to `anon` (`supabase/migrations/20261015212609_messaging_scheduler_automations.sql:214-231`). Anyone can insert automation events into any project, and the automations runner then acts on them, for example by sending emails.
  - `merge_meta` can patch the metadata of any `property.*` table, and anon can call it (`20261015210600_engine_foundations.sql:21-44`).
  - Portal residents, owners and vendors hold a real Supabase session in the shared suite cookie. Today they can read the whole `property` schema from the browser console.
- **Server code also leaks across projects.** About 20 call sites, most of them service-role server code, mix in rows with a null `project_id`, for example `lib/portal/common.js:9`, `lib/automations/runner.js:28`, `lib/reports/sources_server.js:23` and `lib/portal/session.js:28`. Service-role queries bypass RLS, so tightening RLS alone does not close this.
- **The suite already has what PLAT-01 needs:**
  - dash's `public.is_project_member(uuid)`, a `security definer` function for authenticated users only (`C:\Pro\geiger-dash\supabase\migrations\20261024195500_harden_org_and_roles_rls.sql:71-93`)
  - `@geiger/rbac`'s `role_grants` / `rbac_allows`, adopted by events, content, forms, campaign, pods and others
  - geiger-content's project-scoped RLS migration (`C:\Pro\geiger-content\supabase\migrations\20261001081041_project_scoped_rls.sql:1-80`), which keeps a backup table so the change can be rolled back
  - Property would be the first suite product to actually flip its data tables off demo-open. Events adopted RBAC storage but left its data policies as `using (true)` (`C:\Pro\geiger-events\supabase\migrations\20260804211527_adopt_rbac.sql:16-20`).
- **9.2 search:** the `@geiger/ui` Topbar already opens a ⌘K CommandPalette when given `searchNav` (`C:\Pro\geiger-ui\src\ui\topbar.jsx:29-44`). Events and Forms pass it; Property doesn't (`components/internal/topbar/projects/topbar.jsx:16-20`).
  - The palette has no async query hook: it is "purely presentational" (`geiger-ui/src/ui/command-palette.jsx:11-15`). Searching records needs either a preloaded index or a change to the shared component.
- **9.9 MFA/SSO:** geiger-dash has password, Google/GitHub OAuth, passkeys, and per-org OAuth2/OIDC SSO (`geiger-dash/lib/oauth/session.js`, `lib/auth/passkeys.js:42-80`). It has **no MFA, no SAML and no sign-in history**.
- **9.5 and geiger-pods:** pods is a full API Gateway clone (keys, usage plans, throttling, signed webhooks; `geiger-pods/docs/specs/gateway/00-index.md:5`), but it proxies a customer's own backends and routes nothing to product schemas. Its README ("Phase 0", `README.md:3,49`) is stale.
- **Convention docs to change once PLAT-01 lands:**
  - `conventions/MODULE_CONVENTIONS.md:165-187` says to persist public URLs and calls RBAC "advisory UI-gating only".
  - `conventions/MIGRATION_CONVENTIONS.md:306-318` makes demo-open RLS the default.
  - The `@geiger/orm` `table` template still emits demo-open RLS.
- **Stale code:** the comment at `context/project-context.js:16-19` cites `supabase/sqls/zz_project_access.sql`, which doesn't exist. `supabase/initial/sqls/000_common/000_core.sql:183-215` is legacy Flow SQL (`public.flow_is_project_member`), not Property's access model.

### Summary
| ID | Feature | MRI product | Geiger today | Priority | Effort |
|---|---|---|---|---|---|
| PLAT-01 | Data security: tenant isolation, enforced permissions, private files (8 sub-steps) | Security Console; MRI Cloud controls | Done | P1 | XL |
| PLAT-02 | Marketing-claims audit (landing page, README, metadata) | — | **Done** (2026-11-08) | P1 | S |
| PLAT-03 | Data import: templates, mapping presets, validation, rollback | Import/Export tool; Excel Data Templates | Partial (step 1 done; importer WIP on item/PLAT-03b) | P1 | XL |
| PLAT-04 | Full data export (account extract, per-entity CSV) | Full data extract | In progress (WIP on item/PLAT-04) | P1 | M |
| PLAT-05 | Global search (⌘K: pages + records) | MRI•GO | Done | P1 | M |
| PLAT-06 | MFA (suite-level) and enterprise SSO | Okta MFA/SSO, Agora Control Hub | Missing | P2 (MFA) / P3 (SAML, SCIM) | M |
| PLAT-07 | Bulk actions, trash and restore on list screens | — (not confirmed) | Missing | P2 | M |
| PLAT-08 | Property-scoped access and central user management | Advanced User Security | Missing | P2 | L |
| PLAT-09 | Immutable audit trail and sign-in reports | Audit Trail; login metrics | Partial | P2 | M |
| PLAT-10 | Outbound webhooks (signed, retried, logged) | MIX (flat-file/SOAP exchange) | Saved-unused | P2 | M |
| PLAT-11 | Public REST API: keys, scopes, rate limits, sandbox | MIX APIs | Missing | P2 | XL |
| PLAT-12 | Integrations directory that tells the truth | Partner Connect | Partial | P2 | S |
| PLAT-13 | Workflow builder depth: more steps, OR groups, retries, run history | Workflow Design; Agora Workflow Builder (non-AI part) | Partial | P2 | L |
| PLAT-14 | Custom fields in lists, filters, reports, templates, automations | Application Studio (lite) | Partial | P2 | L |
| PLAT-15 | Consent registry, privacy requests, anonymization | Data consent and anonymization (PMX-8.13) | Partial | P2 (consent) / P3 (anonymize) | L |
| PLAT-16 | BI access: OData/REST feed and scheduled warehouse export | Direct SQL / Power BI | Missing | P3 | M |
| PLAT-17 | Shareable configuration kits (MAX-style) | MRI Application eXchange | Missing | P3 | M |
| PLAT-18 | AI groundwork and hook points (no AI features) | MRI Agora suite | Missing | Deferred (Skip under no-AI) | M |

### Build order
1. **PLAT-01a–h, in order.** Security comes before anything public. LEAS (public listing pages, online applications), the portal hardening in LEAS, RISK (screening data), PLAT-10 and PLAT-11 all depend on it. 01a–01c barely change what users see and can ship together; 01d–01g are the visible tightening; 01h is the verification gate.
2. **PLAT-02 alongside PLAT-01.** It is copy only and needs no code dependencies. Restore each claim when the owning item ships.
3. **PLAT-05 step 1** (nav search). It takes about an hour.
4. **PLAT-03 import**, after PLAT-01g, which provides the private bucket for uploaded files.
   - The opening-balance part also needs CORE's deposit-on-ledger (gap 0.4) and billing-follows-lease (0.1) items, so imported leases bill correctly.
   - **PLAT-04 export** reuses PLAT-03's field catalogue and can run in parallel once that step lands.
5. **PLAT-05 step 2** (record search).
6. **PLAT-06 MFA**, built in geiger-dash. Ship it before money starts moving out (CORE owner payouts / vendor payments).
7. **P2 wave:**
   - PLAT-09 (audit triggers; after PLAT-01)
   - PLAT-07 (needs the PLAT-01e delete guard)
   - PLAT-08 (extends 01a grants with scope)
   - PLAT-12
   - PLAT-14 (feeds PLAT-03 templates and PLAT-13 conditions)
   - PLAT-10 (needs CORE cron scheduling, gap 0.10)
   - PLAT-13 (needs CORE 0.10 and PLAT-10 for the webhook step)
   - PLAT-11 (needs PLAT-01, PLAT-09 and PLAT-10's event catalogue)
   - PLAT-15 consent registry (COMM's SMS work depends on it)
8. **P3:** PLAT-15 anonymization, PLAT-16, PLAT-17.
9. **PLAT-18:** mostly delivered by PLAT-09, PLAT-10, PLAT-11 and PLAT-01's permissions model. The rest waits for the suite AI package.

### Items

#### PLAT-01 · Data security: tenant isolation, enforced permissions, private files
- **MRI equivalent:** PMX Security Console. It sets read, write, delete or deny by process and function, plus users, roles, security classes and login reports. MRI Cloud adds TLS 1.2/1.3, AES-256 at rest and per-customer environments.
- **Status · priority · effort:** Broken · P1 · XL (eight sub-steps, each S–L, each shippable on its own)
- **Refs:** Gap 0.11 · Inventory 9.4, 9.45–9.49, 9.51, 6.7, 9.37 · PMX-9.01, PMX-9.03, PMX-9.26

**Geiger today**
- **Demo-open RLS.** RLS is enabled on all 88 `property.*` tables (31 migrations), but every policy is `for all to anon, authenticated using (true) with check (true)`. Examples:
  - loops at `20261015210600_engine_foundations.sql:114-120`, `20261015212744_ledger_core.sql:254-260` and `20261019205301_chat_workspace.sql:296-307`
  - `20261015215336_online_payments_stripe.sql:84-86, 134-136, 164-168`
  - `20261015215447_portal_members_access.sql:79-85`
  - The only non-open policies are the chat storage ones (`chat_workspace.sql:331-349`).
- **Grants.** Table grants give `anon` select, insert, update and delete.
- **RPCs open to anon:**
  - `ledger_post`, `ledger_void`, `ledger_ensure_default_chart`, `ledger_subledger` (`ledger_core.sql:623-626`; re-granted at `20261015212915_ledger_post_line_dimensions.sql:106, 206`)
  - `merge_meta` (`engine_foundations.sql:44`)
  - `emit_record_event`, which is `security definer` (`20261015212609_messaging_scheduler_automations.sql:219, 231`)
  - `chat_toggle_reaction` and `chat_mark_reminded` (`chat_workspace.sql:291-292`)
  - The ledger functions are `security invoker`, so they are only as safe as the open RLS.
- **Ledger immutability is not enforced.** `ledger_lines` can be updated directly. Bank reconciliation updates `cleared`, `cleared_on` and `reconciliation_id` from the browser (`lib/supabase/ledger.js:399-418`).
- **Project scoping is browser-only.**
  - `scopeQuery` adds `project_id.is.null` rows to every project (`lib/supabase/project_scope.js:15-19`).
  - About 20 call sites repeat the same pattern (grep `project_id.is.null`).
  - Most `project_id` columns are nullable and have no FK (`20261010165220_project_scope_and_links.sql:9-62`).
  - `amenity_links`, `floor_plan_links`, `chat_members`, `chat_threads`, `chat_messages` and `chat_profiles` have no `project_id`.
- **Permissions are advisory only:**
  - `lib/rbac.js:68-71` returns `true` when no roles are saved.
  - `context/rbac-context.js:12-16, 40-50, 84` resolves roles from settings key `roles` plus `team_members` matched by email.
- **Staff API routes check visibility, not permission.** `lib/messaging/auth.js:22-62` checks only that the caller can see the project row (`:40-48`), then switches to the service role (`:56`). No route checks a permission.
- **Files are public:**
  - The suite-shared `products` bucket holds property files, and their public URLs are persisted (`lib/supabase/property_storage.js:7-29`).
  - Portal uploads land there too (`lib/portal/files.js:3-6, 36`; `lib/portal/constants.js:39-41`), and `isOwnUpload` checks URL strings (`files.js:45-48`).
  - The chat bucket is public (`chat_workspace.sql:327-335`).
- **What already works:**
  - Portal API routes go through `withPortal`/`requirePortal` and scope to the member (`lib/portal/session.js:6-9`).
  - Cron routes use a timing-safe bearer check (`lib/jobs/contract.js:9-15`).
  - The Stripe webhook verifies signatures.
- **Sandbox.** It is in-memory (`lib/supabase/client.js:29`) except for `legal_jurisdictions` and `legal_resources`, which it reads from the real DB, possibly signed out (`lib/sandbox/sandbox_client.js:543-562`).
- **Demo project.** `ebcc7910…` (Harbor & Pine) has no `roles` setting by design (memory: demo_project_seed).

**What's missing**
- Isolation enforced by the database, so a user can only touch projects whose org they belong to.
- Permission checks for high-risk writes in the database (post, void, settings, roles, delete).
- No anon or PUBLIC execute on any property function.
- An immutable ledger.
- Server routes that check permissions.
- Service-role code that never mixes projects.
- Private files served through short-lived signed URLs.
- Secrets kept out of the browser and out of client-readable tables.
- A repeatable test matrix that proves all of the above.

**How to build** (sub-steps; each is its own migration and PR)

*PLAT-01a · Membership and RBAC foundation (M; no behaviour change)*
- **Data model:**
  - Migration `adopt_rbac` creates the `property.role_grants`, `property.rbac_allows(text, uuid, text, uuid)` and `public.rbac_key_matches` storage, generated by `@geiger/rbac` `migrationSql("property")`. It reuses the shared `public.roles`.
  - Copy content's hardened `rbac_allows`, which also requires project access (`C:\Pro\geiger-content\supabase\migrations\20261001081041_project_scoped_rls.sql:35-46`). Use `search_path = ''`.
  - Add these helpers, each `security definer stable`, revoked from `public, anon`:
    - `property.can_access_project(uuid)`: delegates to dash's `public.is_project_member(uuid)`. Don't re-implement org logic.
    - `property.member_project_ids()`: returns a set of project ids, used as `project_id in (select property.member_project_ids())` so Postgres evaluates it once per statement.
    - `property.rbac_ensure_membership(p_project uuid)`: an RPC the workspace calls on load. It maps the org role (Owner→owner, Admin→admin, Manager→manager, else a default "Staff" role) the way `C:\Pro\geiger-events\supabase\migrations\20260809135817_rbac_org_role_mapping.sql:35-75` and content's `rbac_ensure_membership` do.
  - **Backfill:**
    - settings key `roles` → `public.roles` rows for the project, translating keys with a one-shot `property.rbac_migrate_key(text)` (as events did)
    - `team_members` with a matching `auth.users` email → `role_grants`
    - invited rows without an account stay as overlay rows until claimed, as in events' `rbac_claim_invitation`
- **Server logic:**
  - New `geiger-rbac.config.js` at the repo root, with keys in `property.<resource>.<action>` form:
    - nav: `property.<slug>.view`, mirroring events' `navPermissionKey`
    - existing action keys from `lib/rbac.js:4-15`: `property.team.invite`, `property.team.assign`, `property.role.manage`, `property.billing.manage`, `property.settings.manage`, `property.record.delete`, `property.accounting.post`, `property.accounting.void`, `property.report.export`, `property.report.schedule`
    - new keys: `property.data.import`, `property.data.export`, `property.audit.view`, `property.integration.manage`, `property.api_key.manage`, `property.portal.manage`, `property.payment.collect`, `property.payment.refund`, `property.message.send`, `property.automation.manage`, `property.privacy.manage`
    - five system roles: Owner `*`, Manager, Leasing agent, Maintenance tech, Accountant
  - New `lib/supabase/rbac.js`, ported from `C:\Pro\geiger-events\lib\supabase\rbac.js`.
  - Switch `context/rbac-context.js` to resolve from grants with `@geiger/rbac` `evaluate()`, which fails closed. Remove the "no roles = allow all" path at `lib/rbac.js:68-71`.
- **UI:** no new screens. Roles & Permissions and Team & Members read and write `public.roles` / `role_grants` instead of the settings JSON. The full Team screen port is PLAT-08.

*PLAT-01b · Project-scope hygiene (S–M)*
- **Data layer:**
  - `scopeQuery` becomes `q.eq("project_id", activeProjectId)` and returns no rows when there is no active project (`lib/supabase/project_scope.js:15-19`).
  - Replace every `project_id.is.null` fallback with a required-project helper `forProject(q, projectId)` in a new `lib/supabase/scope.js`, which throws on a missing id in server code. Call sites:
    - `lib/automations/runner.js:28, 113, 478`
    - `lib/jobs/execute.js:76`, `lib/jobs/preventive_work_orders.js:57`
    - `lib/ledger/store.js:28-29`
    - `lib/messaging/announcements.js:10`, `lib/messaging/reminder_jobs.js:22`
    - `lib/portal/common.js:9`, `lib/portal/session.js:28`
    - `lib/reports/sources_server.js:23`
    - plus the `is("project_id", null)` branches in `lib/jobs/financial.js:111, 279, 449`, `lib/payments/context.js:14`, `lib/messaging/context.js:72` and `lib/email/notifications.js:32`
- **Data model** (migration `project_scope_required`):
  - Add `project_id` to `amenity_links` and `floor_plan_links`, backfilled from the parent row.
  - Write a report query listing live rows with a null `project_id` per table, and resolve or soft-delete them by hand first. The demo seed already soft-deleted its unscoped rows.
  - Add `check (project_id is not null) not valid` on every project table except `legal_*` and `settings`; validate in a later migration.
  - Run `ledger_ensure_default_chart(project)` for each project so nothing reads the unscoped chart (`lib/ledger/store.js:24-35`).

*PLAT-01c · Function lockdown and ledger immutability (S–M)*
- Migration `lock_down_property_functions`:
  - `revoke execute on all functions in schema property from public, anon`, then grant back per function to `authenticated, service_role`.
  - `alter default privileges in schema property revoke execute on functions from public` so future functions start closed.
- **Ledger functions.** `ledger_post`, `ledger_void` and `ledger_ensure_default_chart` become `security definer set search_path = ''`, with explicit checks at the top:

  ```sql
  if coalesce(auth.role(), '') <> 'service_role'
     and not property.rbac_allows('property.accounting.post', v_project)
  then raise exception 'not allowed' using errcode = '42501'; end if;
  ```

  - `ledger_void` checks `property.accounting.void` against the entry's project.
  - `ledger_subledger` stays `security invoker`.
  - Re-own each function in this one migration (one owner per function).
- **`emit_record_event`:** revoke from `anon` and `authenticated`. Only the trigger (`record_event_trigger`, a definer) and the service role (`lib/payments/posting.js:250`) call it.
- **`merge_meta`:** stays `security invoker` so RLS applies. Grant to `authenticated` and `service_role` only, and refuse `ledger_*`, `role_grants`, `audit_log` and `integration_secrets`.
- **Chat RPCs:** grant to `authenticated` only, and check conversation membership inside.
- **Immutability triggers:**
  - `property.ledger_lines_guard()` (BEFORE UPDATE/DELETE) rejects any change except `cleared`, `cleared_on`, `reconciliation_id`, `updated_at` and `metadata`.
  - `property.ledger_entries_guard()` allows only `status 'posted'→'void'`, `voided_at` and `metadata`, and only when `current_setting('property.ledger_void', true) = 'on'`, which `ledger_void` sets locally (`ledger_core.sql:398-446`).
  - DELETE is rejected for every role except `service_role`.

*PLAT-01d · Tenant-isolation RLS on every table (M)*
- Migration `rls_project_isolation`. Copy content's backup pattern: a `property.rls_tightening_backup` row holding the previous `pg_policies` and grants, so `@down` restores them exactly.
- Add one helper owned by this migration, `property.apply_member_rls(p_table text, p_read text default null, p_write text default null)`. It drops `<t>_demo_all` and creates `<t>_member_select / _insert / _update` using `project_id in (select property.member_project_ids())`, optionally AND `property.rbac_allows(p_read|p_write, project_id)`. Every later migration that creates a table calls it.
- Revoke all privileges on the `property` schema's tables from `anon`, and revoke `delete` from `authenticated` (soft delete only). The exceptions are the link tables that hard-delete today: `amenity_links` (`lib/supabase/amenity_links.js:94`), `floor_plan_links` (`lib/supabase/floor_plan_links.js:95`) and `chat_conversations` (`lib/supabase/chat_conversations.js:286`); they get a member-scoped delete policy.

| Category | Tables | Select | Insert / update |
|---|---|---|---|
| Standard project data | properties, buildings, units, unit_types, floor_plans, portfolios, amenities, amenity_links, floor_plan_links, tenants, tenant_households, tenant_occupants, tenant_documents, tenant_communications, leases, lease_parties, lease_addenda, lease_templates, record_items, property_owners, owners, vendors, vendor_assignments, work_orders, maintenance_attachments, inspections, moves, notices, renewals, listings, prospects, showings, applications, waitlist_entries, rent_comps, documents, media, activity, message_templates, message_threads, thread_messages, announcements, resident_events, amenity_reservations, unit_turns, pm_schedules, inventory_items, esign_requests, security_deposits, recurring_charges, rent_accounts, automations, report_schedules | member | member |
| Financial (read gate) | ledger_entries, ledger_lines, gl_accounts, bank_accounts, bank_reconciliations, transactions, bills, budgets, budget_lines, cost_jobs, utility_allocations, cam_reconciliations | member and `property.accounting.view` | ledger_*: RPC only, except reconciliation-column updates on `ledger_lines`; all others need `property.accounting.post` |
| Server-written | online_payments, autopay_plans, stripe_events, job_runs, notification_sends, automation_events, automation_runs, report_runs, announcement_deliveries, portal_members | member (`stripe_events`, `online_payments`: `property.accounting.view`) | service role only; except `automation_runs` cancel (`lib/supabase/automation_runs.js:34`), which needs `property.automation.manage` |
| Settings and team | settings, team_members, role_grants | member | `settings` by key: `roles` → `property.role.manage`; `fees_policies`, `payment*`, `branding_portals`, `company_profile` → `property.settings.manage`; `integrations` → `property.integration.manage`. `team_members` → `property.team.invite`. `role_grants` → `property.team.assign`, plus restrictive guards copied from `C:\Pro\geiger-events\supabase\migrations\20261002091000_operations_role_write_guards.sql:22-50` |
| Reference | legal_jurisdictions, legal_resources | `anon, authenticated` where `project_id is null and deleted_at is null`, plus member rows | member, for project rows only; global rows via seed (service role) |
| Chat | chat_conversations (has project_id) | member | member |
| | chat_members, chat_threads, chat_messages | `exists` on the parent conversation with member access, plus conversation membership for private and DM conversations | same, with `author_id` = own profile |
| | chat_profiles (no project_id) | `project_ids && array(select property.member_project_ids())` | own row (`email = auth.jwt()->>'email'`) |

*PLAT-01e · Permission gates inside the database (M)*
- **Soft-delete guard.** `property.guard_soft_delete()` is a BEFORE UPDATE trigger on every project table, attached in a DO loop. When `deleted_at` changes (in either direction) and `auth.role() = 'authenticated'`, it requires `property.rbac_allows('property.record.delete', new.project_id)`.
- **Portal accounts get no direct table access.**
  - A portal account has no org membership and no grant, so `member_project_ids()` is empty for it.
  - Portal reads and writes stay server-mediated (service role behind `withPortal`). Every portal library query must filter by the member's `project_id` plus the party id.
  - A test in 01h fails if `lib/portal/*` contains an unscoped query.
- **If a portal screen later reads Supabase directly** (for example Realtime), add own-row select policies through a helper `property.portal_party_ids(p_role text)`: the active `portal_members` rows for `auth.uid()` in projects whose portal is on. Examples:
  - `tenants.id in (select property.portal_party_ids('resident'))`
  - `ledger_lines.tenant_id in (…)`
  - `work_orders.tenant_id in (…)`
  - `owners.id in (… 'owner')`
  - `vendor_assignments.vendor_id in (… 'vendor')`

  Don't ship these until a direct-read portal surface exists.
- **Settings secrets.** No secret may live in `settings.value`, which every member can read. Secrets go to `property.integration_secrets` (01h).

*PLAT-01f · Server routes check permissions (S–M)*
- Move `requireStaff` from `lib/messaging/auth.js:22-62` to `lib/auth/staff.js` with the signature `requireStaff(request, projectId, { permission })`. It must:
  - require a `projectId` on every staff route
  - check access with the user-bound client calling RPC `public.is_project_member`
  - check `property.rbac_allows(permission, projectId)` through the same client
  - return `{ user, projectId, db, scoped }`, where `scoped(table)` is the admin client with `.eq("project_id", projectId)` already applied
- Route → permission map:

| Route | Permission |
|---|---|
| `app/api/messages/send`, `app/api/messages/announce` | `property.message.send` |
| `app/api/payments/checkout`, `options`, `autopay`, `cancel` | `property.payment.collect` |
| `app/api/payments/refund` | `property.payment.refund` |
| `app/api/payments/sync`, `status` (staff path) | `property.accounting.view` |
| `app/api/cron/[job]`, `run-due`, `jobs` (staff "Run now") | `property.settings.manage` |
| `app/api/portal/staff/access` | `property.portal.manage` |

- `app/api/messages/inbound` keeps its secret check, but takes the project from the matched thread or party and never from the request body.
- **Abuse limits (inventory 9.51):**
  - Vercel WAF rate-limit rules on `/api/portal/auth/otp`, `/api/payments/link/*` and `/api/payments/verify`.
  - Security headers in `next.config.mjs` `headers()`: CSP (allow Stripe and the Supabase URL), HSTS, `frame-ancestors 'self'` (the playground iframes the workspace), `Referrer-Policy`.
  - Check the Next 16 `headers` docs in `node_modules/next/dist/docs/` before writing.

*PLAT-01g · Private storage and signed URLs (L)*
- **Buckets** (migration `property_storage_buckets`):

  | Bucket | Access | Holds |
  |---|---|---|
  | `property-files` | private | `<project_id>/<owner_type>/<owner_id>/<file>` |
  | `property-public` | public read | listing photos, property cover images, portal brand logos; only what LEAS public pages show |
  | `property-chat` | private (was public) | chat files |

- **Policies on `storage.objects`:** select, insert, update and delete for `authenticated` when `bucket_id = 'property-files' and property.can_access_project(property.try_uuid((storage.foldername(name))[1]))`. `try_uuid` returns null instead of raising. Writes to `property-public` need the same membership; reads are public.
- **Data model:**
  - Add `bucket text`, `storage_path text` to `documents`, `media`, `maintenance_attachments`, `tenant_documents` and `chat_files`.
  - Metadata-held file refs (insurance documents in `record_items`, work-order and request photos, floor-plan drawings, generated lease `.txt` files from `lib/leasing/workflows.js:99-114`) store `{ bucket, path }` instead of a URL.
- **Server logic:**
  - `lib/supabase/property_storage.js` uploads to `property-files/<projectId>/…` and returns `{ bucket, path }`; it only uploads to `property-public` when the caller passes `public: true`.
  - New `lib/supabase/file_urls.js`: `signedUrls(refs, ttl = 3600)` batches `createSignedUrls`, with an in-memory cache keyed by path until expiry.
  - Hook `useSignedUrl(ref)`, used by:
    - `entity/shared_sections/documents_section.jsx`, `media_section.jsx`, `media_file_section.jsx`, `plan_file_section.jsx`
    - `documents/document_library.jsx`, `leasing/sections/inspection_sections.jsx`, `properties/sections/cover_card.jsx`
  - Portal: `storePortalFile` writes `property-files/<projectId>/portal/<memberId>/…`; `isOwnUpload` checks the path prefix (`lib/portal/files.js:45-48`); portal document routes return 15-minute signed URLs.
- **Migrating existing public URLs** (pre-launch, demo data only):
  1. Add a job `storage-migrate`, registered in `lib/jobs/registry.js`, staff "Run now" only, idempotent. It scans `url` columns and metadata values containing `/object/public/products/property/`, copies each object to `property-files/<project>/…` with the service role, and writes `bucket` + `storage_path`. It leaves `url` in place.
  2. Release the readers that prefer `storage_path`.
  3. After 14 days, a second run removes the old objects and nulls `url`.
  4. Emails must link to portal pages, never to raw file URLs.
- **Sandbox:** the in-memory storage in `lib/sandbox/sandbox_client.js:318+` gets `createSignedUrls` returning its blob URLs.

*PLAT-01h · Secrets, sandbox/demo, verification, conventions (M)*
- **Secrets:**
  - Add `import "server-only"` to `lib/supabase/admin.js`, `lib/stripe/server.js`, `lib/email/client.js` and `lib/auth/staff.js`.
  - Replace the static `NEXT_PUBLIC_TURN_CREDENTIAL` (`lib/supabase/chat_call_signaling.js:18-23`) with short-lived TURN credentials from a staff-only `/api/chat/turn`.
  - New `property.integration_secrets` (project_id, key, ciphertext, created_by, rotated_at). No grants to `anon` or `authenticated`. Values are encrypted with Supabase Vault or AES-256-GCM under `GEIGER_SECRETS_KEY`. It holds webhook signing secrets and future provider tokens (QuickBooks OAuth, screening, e-sign).
  - Document every server env var in the README, which today lists only five (`README.md:63-72`).
- **Sandbox and demo:**
  - The playground needs only `anon` select on global `legal_*` rows (01d).
  - The demo project gets grants for its viewers through `rbac_ensure_membership`. To show it to prospects read-only, add a "Viewer" role holding only `*.view` keys.
  - Update `supabase/seeds/demo_project/generate` to emit `public.roles` and `role_grants` instead of skipping roles.
- **Verification** (written alongside 01d, run before each step ships):
  - **Policy tests:** `tests/rls/*.test.mjs` (`node --test`) use supabase-js clients signed in as fixture users, created with the admin API in a test project. Personas:
    - anon
    - a signed-in outsider
    - another org's member
    - Owner, Manager, Leasing agent, Maintenance tech, Accountant
    - portal resident, owner and vendor
    - the service role
  - For each category table, assert select, insert, update and soft-delete allow/deny. For each RPC: anon is denied, a maintenance tech is denied `ledger_post`, an accountant is allowed, and cross-project calls are denied.
  - Storage: another project's path is denied; a signed URL expires.
  - **SQL audits** (CI step against the test DB):
    - `pg_policies` where `schemaname = 'property' and (qual = 'true' or with_check = 'true')` returns only the `legal_*` global-select policies.
    - `information_schema.routine_privileges` shows no `anon` or `PUBLIC` grantee in schema `property`.
    - Every table has `relrowsecurity = true`.
    - The Supabase Security Advisor reports no permissive-policy or mutable-search-path findings for `property`.
  - **Manual:** signed in as a resident in a browser console, `.from('tenants').select()` returns `[]`. The playground still loads legal resources signed out.
- **Conventions:**
  - Rewrite the RLS section of `conventions/MIGRATION_CONVENTIONS.md` (`:306-318`) so new tables call `property.apply_member_rls(...)`.
  - Update `MODULE_CONVENTIONS.md` Storage (`:165-171`) and RBAC (`:172-187`) and `SUPABASE_CONVENTIONS.md` §7.
  - Fix the stale comment at `context/project-context.js:16-19`.

**Steps**
1. **01a:** check that the new table names are unused in the live DB (`select to_regclass('property.role_grants')`, and the same for `integration_secrets` and `rls_tightening_backup`), then run `adopt_rbac` plus the backfill. Add `geiger-rbac.config.js` and `lib/supabase/rbac.js`, switch the RbacProvider, and call `rbac_ensure_membership` from `ProjectProvider` (`context/project-context.js`).
2. **01b:** add `lib/supabase/scope.js`, replace the null-project fallbacks, run the null-row audit, then the `project_scope_required` migration.
3. **01c:** migration `lock_down_property_functions` plus the immutability triggers. Re-run rent posting, payment posting, void and reconcile as an Accountant and as the service role.
4. **01d:** write the RLS tests first (they fail), then run `rls_project_isolation`. Fix any screen that relied on open access.
5. **01e:** soft-delete guard and settings-key gates. Delete buttons must fail with a clean toast for roles that lack `property.record.delete`.
6. **01f:** `lib/auth/staff.js` and the permission map across the 12 staff routes, WAF rules and headers.
7. **01g:** buckets and policies, storage helper and signed-URL readers, portal path change, `storage-migrate` run, then the cleanup run 14 days later.
8. **01h:** secrets moves, TURN route, seed update, CI audits and convention docs. Then run the full test matrix and attach the results to the PR.

**Research before building**
- `@geiger/rbac` `migrationSql()` output at the pinned sha (`package.json:18`, `1835de3`) versus what content and events generated: `gh api repos/bhargavjoshi1237/geiger-rbac/readme`. Bump the pin if needed.
- RLS performance of set-returning helpers versus per-row calls. Read Supabase "RLS performance recommendations" (https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations), then `explain analyze` the Units, Tenants and General Ledger list queries on the demo project (~8,150 rows).
- Whether the live `public.projects` still carries a permissive legacy policy (noted at `C:\Pro\geiger-pods\research\geiger-ecosystem.md:31`). Property's isolation goes through `is_project_member`, so it doesn't depend on it, but dash should know.
- Supabase Vault availability in the shared project versus app-level AES-GCM.
- Supabase Storage `createSignedUrls` batch limits, and image transforms on private buckets (cover images).
- Vercel WAF rate-limit rules on the current plan.

**Acceptance criteria**
- An anon client gets permission errors or empty results on every `property` table except global `legal_*` rows, and `rpc('ledger_post')` as anon fails with 42501.
- A user in org A sees no rows of org B's project by any path: table, RPC, storage, or API route called with B's `projectId`.
- A Maintenance tech:
  - cannot select `ledger_lines`
  - cannot call `ledger_post`
  - cannot soft-delete a tenant
  - can update a work order
- An Accountant's post-then-void leaves the trial balance unchanged: Σdebit = Σcredit per entry, and the reversal nets each account to zero.
- A direct `update ledger_lines set debit = 0` fails for every role except `service_role`. Updating the reconciliation columns works for an Accountant.
- A portal resident's browser client reads `[]` from every table, while the portal API still serves their balance, ledger and requests.
- No file in `property-files` opens without a signed URL, and signed URLs expire. Old `products/property/*` URLs return 404 after cleanup.
- The 01h SQL audits return the expected sets, and the playground loads signed out with legal resources visible.

**Depends on / unblocks**
- **Depends on:** dash's `public.is_project_member` (exists).
- **Unblocks:**
  - every public-facing item: LEAS public listing pages, online applications and portal work; RISK screening data
  - PLAT-03, 04, 07, 08, 09, 10, 11, 15
  - CORE ledger callers, which must post as an authorised user or the service role after 01c

**Open decisions**
- **Default role for org members without an explicit grant.** Manager (today's UI default, `context/rbac-context.js:48`), or a narrower "Staff" role without accounting, settings and roles?
- **Accounting read access: hard database gate at launch, or UI-only until PLAT-08?** Recommendation: a hard gate, because the ledger holds owner trust money.
- **`public.roles` writes are policed by dash per product** (`C:\Pro\geiger-dash\supabase\migrations\20261024195500_harden_org_and_roles_rls.sql:109-209`). Is that strict enough for Property at launch, or should dash restrict role creation per project first?

#### PLAT-02 · Marketing-claims audit
- **MRI equivalent:** none. This keeps public copy honest before launch.
- **Status · priority · effort:** Broken (copy) · P1 · S
- **Refs:** Inventory 2a.7, 2a.33, 2a.35, 2a.43, 2b.50, 3.56, 4.43, 4.44, 4.47, 5.39, 5.40, 6.42, 7.2, 7.23, 9.20, 9.44, 9.45, 1.47, 1.48 · Gaps 2.1, 2.2, 2.4, 2.5, 7.2, 11.7

**Geiger today:** The landing page, product explorer, journey strip, page metadata and README promise features the code doesn't have. Every claim was checked against the code at `fecb165`.

**What's missing:** copy that matches the product, plus a list that tells each feature owner which claim to restore when the feature ships.

**How to build**
- *Copy only:*
  - `components/landing/landing_page.jsx`
  - `components/landing/product_explorer.jsx`
  - `components/landing/connected_journey.jsx`
  - `app/page.js` metadata
  - `README.md`
  - the animated preview captions in `components/landing/previews/scenes*.jsx` (row 21)
- *Rule going forward:* add a `// claim:` comment next to any copy that depends on an unbuilt feature, naming the owning ID, so a grep finds them.

| # | Where | Claim | What the code does | Fix now | Restore when |
|---|---|---|---|---|---|
| 1 | `landing_page.jsx:23` (FAQ pricing) | "online payments, screening, portals and maintenance included" | Screening is tracking-only; results are typed in (2a.42, 2a.43) | Drop "screening" | RISK screening provider ships |
| 2 | `landing_page.jsx:27` (FAQ team) | "give each one a role. Residents and owners… only see what belongs to them" | "Invite" only creates a row (9.8); roles hide UI only (9.4); any signed-in user can read every table (9.45) | Keep the copy, but launch is blocked until PLAT-01 ships | PLAT-01 (roles, isolation), PLAT-08 (real invites) |
| 3 | `landing_page.jsx:141`; `product_explorer.jsx:25`; `connected_journey.jsx:11` | "Post recurring charges… on a schedule", "Recurring charges post on schedule", "Rent posts on the 1st… owner's statement updates by itself" | No crons are configured (9.44); billing ignores rent changes (gap 0.1) | Keep only if CORE-10 (gap 0.10) (crons) and 0.1 ship before launch; otherwise say "post recurring charges in one click" | CORE 0.10 + 0.1 |
| 4 | `product_explorer.jsx:17` (listing surface) | "Fill vacancies from a listing that takes applications… Prospects apply and pay the application fee on the same page", "Online applications and fees", "Screening starts on submit" | No public listing page (2a.7), no online application (2a.35), fees recorded only (2a.46), no screening provider (2a.43) | Recast as "Track every listing, application and fee in one place" | LEAS public pages + online application; RISK screening |
| 5 | `connected_journey.jsx:8-9` | "publish the listing, and share one link wherever you advertise"; "A prospect applies… the fee and the screening results are saved" | "Publish" changes internal state only (2a.3, 2a.7) | Change to "publish internally and track channels" / "record the application, fee and screening result" | LEAS public pages |
| 6 | `product_explorer.jsx:35` (Showings) | "Prospects book a showing from open slots and get a confirmation straight away" | No self-scheduling (2a.33, gap 11.7) | Change to "Schedule showings and track each prospect's tour" | LEAS self-scheduled tours |
| 7 | `product_explorer.jsx:36` (Applications) | "Credit, background and income checks run on each applicant" | Tracking-only (2a.42–2a.45) | Change to "Record credit, background and income results, then approve or decline" | RISK screening |
| 8 | `product_explorer.jsx:40`; `connected_journey.jsx:10`; `app/page.js:6` ("sign leases") | "Send the lease for signature and see who has viewed and signed it"; "Send the lease for e-signature" | E-sign is tracking-only; statuses are set by hand (2b.50, 2b.54) | Change to "Track signatures on every lease" and "prepare leases" in metadata | LEAS e-signature adapter (geiger-docs or interim provider) |
| 9 | `product_explorer.jsx:43`; `connected_journey.jsx:10` | "Itemize deductions at move-out and refund the balance"; "collect the deposit" | Deposits never reach the ledger (3.56, gap 0.4) | Change to "itemize deductions and send the disposition letter" | CORE 0.4 |
| 10 | `product_explorer.jsx:19` (Maintenance) | "the resident is updated until the job is closed"; "Costs billed to the owner" | No resident update emails (gap 4.3); bill-to-owner unused (5.39); work-order bills skip AP (5.40) | Change to "Residents track status in the portal" and "Costs tracked per job" | COMM work-order notifications; CORE 0.9 |
| 11 | `product_explorer.jsx:24` (Workflows) | "post fees or message residents", "Fees, emails and texts" | 5 step types, no fee step (9.20); SMS is a stub (4.47) | Change to "send emails, create work orders, update status" | PLAT-13 (post-charge step), COMM SMS |
| 12 | `product_explorer.jsx:26` (Scheduled reports) | "PDF and CSV attachments" | Emails carry no attachments (7.23) | Change to "a summary and a link to the full report" | CORE-57 (gap 7.5) |
| 13 | `product_explorer.jsx:50` (Bills) | "pay several in one batch" | No payment batches (6.42) | Change to "Approve vendor bills and record payments" | CORE batch bill pay |
| 14 | `product_explorer.jsx:55` (Announcements) | "Message every resident of a building by email and text, and see who opened it" | No composer since 2026-10-20 (4.43); no SMS (4.47); no open tracking (4.44) | Remove the item or change to "coming soon" | COMM announcements composer + SMS + tracking |
| 15 | `product_explorer.jsx:59` (Delinquency) | "send reminders in bulk" | The delinquency report has no actions (grep `remind` in `lib/reports`, `scr/reports`: none) | Change to "See who owes what by age" | COMM/CORE collections + PLAT-07 |
| 16 | `README.md:27-35` | e-signature; "online applications and forms, tenant screening, credit and background checks, eviction history, income verification, application fees"; "syndication and ILS distribution… virtual tours… self-guided showings"; "payment plans"; "1099 and tax"; "document requests"; "a custom report builder" | All tracking-only or absent: 2b.50, 2a.35, 2a.42–2a.46, 2a.6, 2a.31–2a.32, 3.51, 6.51–6.52 (vendor 1099 report only), 7.2 | Rewrite Highlights to match inventory status; label tracking-only items "tracking" | Each owning item |
| 17 | `README.md:44` | "Leaflet (maps), React Flow (floor plans)" | `leaflet` is never imported (1.48); React Flow is used only by the automation canvas (1.47) | Change to "React Flow (automation builder)"; drop Leaflet or remove the dependency | — |
| 18 | `README.md:107`, `:118-121` | `ui/ shadcn primitives`; convention docs at the repo root | `components/ui/` is unused (`@geiger/ui` only); the docs live in `conventions/` | Fix the paths | — |
| 19 | `poster_field_cta.jsx:134` | "Bring your portfolio over" | No import tool (gap 9.1) | Fine as an invitation; the body copy says "Add your first property" | Add "Import from AppFolio, Buildium…" after PLAT-03 |
| 20 | `landing_page.jsx:15, 175` | "the playground opens the full workspace without signing in… nothing you change is saved" | True (9.58) | Keep | — |
| 21 | Preview scenes: `previews/scenes.jsx:172, 229`; `previews/scenes_leasing.jsx:307, 327-328`; `previews/scenes_operations.jsx:105, 220-237, 362` | Animated captions: "billed to [owner]… rated the repair 5/5", "Maya was notified", "Screening starts as soon as they submit", "Maya signs from her phone… owner countersigns", SMS channel with "Opened 41", "paid together as one batch" | Same gaps as rows 7, 8, 10, 13 and 14; no repair ratings or resident notifications exist | Change the captions to match the copy fixes; drop the SMS channel and "Opened" tiles | Same owners as rows 7–14 |

**Steps**
1. Edit the copy in the five files above and the three preview scene files.
2. Grep `components/landing/**` again for "screening", "sms", "opened", "signed", "batch" and "rated".
3. Add `// claim:` comments.
4. Paste this table into each owning item's acceptance criteria in their files so the copy comes back when the feature ships.

**Research before building:** none. Optionally run `/claude-seo:seo-page` on `/property` after the edit so the canonical and metadata stay intact (commit `4fdcbd7`).

**Acceptance criteria**
- Every row marked "Fix now" is changed.
- A grep of the landing and README for "screening", "e-sign", "text", "batch", "opened", "builder", "book" and "rated" finds only claims the code backs, or claims tagged `// claim:`.

**Depends on / unblocks:** none. Each claim is restored by its owning item.

**Open decisions**
- **Keep or drop the "Listing" surface** (`product_explorer.jsx:17`) until LEAS public pages ship? It is the first tab buyers see.

#### PLAT-03 · Data import: templates, mapping presets, validation, rollback
- **MRI equivalent:** PMX Import/Export tool (import and export jobs, field mapping by source, destination, headers and columns) and "Excel Data Templates" (CSV, tab, XML, SSIS). MRI sells migration as services at £200/hour.
- **Status · priority · effort:** Missing · P1 · XL
- **Refs:** Gap 9.1 (import half) · Inventory 9.31, 1.8, 6.7 · PMX-9.17, PMX-9.18

**Geiger today**
- The only bulk create is "Add units" (`components/internal/screens/properties/actions.jsx:177`).
- No parser dependency exists (`package.json:16-44`; grep `papaparse|xlsx|exceljs` finds nothing).
- Opening balances could only go in as hand-made manual journals (inventory 9.31).
- The landing CTA says "Bring your portfolio over" (`components/landing/poster_field_cta.jsx:134`).

**What's missing**
- Downloadable templates.
- Upload of CSV or XLSX.
- Column mapping with presets for AppFolio, Buildium, Rent Manager and Yardi Breeze.
- A dry-run validation preview.
- A dependency-ordered commit.
- Opening balances: tenant AR, deposits held, prepaid credits, owner balances and a GL trial balance as of a cut-over date.
- Rollback, and saved mappings.

**How to build**
- *Data model* (migration `data_import_jobs`; check the names are free in the live DB first):
  - `property.import_jobs`
    - standard columns plus `project_id`, `entity` (`properties | units | owners | vendors | tenants | leases | open_balances | gl_opening`), `source_system` (`generic | appfolio | buildium | rent_manager | yardi_breeze`)
    - file reference: `file_name`, `bucket`, `storage_path` (private `property-files`, PLAT-01g)
    - `mapping jsonb`, `options jsonb` (`cutoverDate`, `dedupe: skip|update`, `balanceMode: itemized|forward`)
    - `status` (`uploaded → mapped → validated → committing → committed | failed → rolled_back`), `counts jsonb`, `error`, `committed_at`, `rolled_back_at`
  - `property.import_rows`: `job_id`, `row_no`, `raw jsonb`, `mapped jsonb`, `status` (`valid | warning | error | skipped | created | updated`), `messages jsonb`, `target_table`, `target_id`, `before jsonb` (for updates)
  - Every created record is stamped `metadata.importJobId`.
  - RLS through `apply_member_rls` with write = `property.data.import`.
- *Server logic* (new `lib/data_io/`):
  - `schemas.js`: one field catalogue per entity, shared with PLAT-04 export and PLAT-11 API docs.
    - Each field has `key, label, required, type, enum, lookup, example`.
    - `lookup` resolves references by code or name: property by name or short code, unit by property plus unit number, owner and vendor by name or email.
    - Includes the project's custom fields (`cf_<id>`, PLAT-14).
  - `templates.js`: builds CSV and XLSX templates with header, example row and a notes sheet.
  - `parse.js`: CSV via `papaparse`; XLSX via `exceljs` or `read-excel-file` (decision below). Parse in the browser, then post mapped JSON in chunks of 200 rows, which avoids the 4.5 MB function body limit.
  - `presets/{appfolio,buildium,rent_manager,yardi_breeze}.js`: header synonym maps plus value transforms (status words, "Lease From/To", split names, phone lists).
    - Detect the source by header fingerprint. Exact AppFolio headers come from third-party guides:
      - Tenant Directory: "Property Name", "First Name", "Last Name", "Phone Numbers", "Emails", "Lease From", "Lease To", "Move-in", "Move-out", "Rent", "Unit ID", "Tenant ID"
      - Rent Roll: "Unit", "Tenant", "Rent", "Market Rent", "Sq. Ft.", "Past Due"
      - Delinquency: "Amount Receivable", "0-30" … "90+"
    - Buildium, Rent Manager and Breeze publish no export headers, so use fuzzy alias matching. Rent Manager's Report Writer can import a shared `.rrtx` definition, so ship a "Geiger export" report definition for Rent Manager customers.
  - `validate.js`: required fields, types, US date and currency parsing, enums, lookups, duplicates (email or name plus unit), and cross-row checks (unit has at most one active lease). Return a `warnings` array.
  - `commit.js`, server-only, behind `requireStaff(…, { permission: "property.data.import" })`. Order: properties → units → owners (+ `property_owners` %) → vendors → tenants → leases (+ `lease_parties`) → billing setup (CORE's "lease activation creates billing" helper, gap 0.1) → open balances → GL opening.
    - Each chunk is idempotent: `import_rows.status` plus a target id, re-runnable.
  - Opening balances post through `lib/ledger/postings.js` with a new `source_type = 'opening_balance'` and idempotency key `import:<jobId>:<rowNo>`:
    - **Itemized mode:** one open charge per row (account, amount, due date, memo "Balance forward").
    - **Forward mode:** one signed balance per lease (positive = owed, negative = prepaid credit).
    - **Deposits held:** CORE's deposit-held posting (gap 0.4) dated the cut-over.
    - **Owner balances:** owner equity or reserve as of the cut-over.
    - **GL opening:** one journal entry for the trial balance as of the cut-over, with an "Opening balance equity" system account added to `ledger_ensure_default_chart`.
    - After posting, run a tie-out: AR control = Σ tenant open balances, deposit liability = Σ deposits held, Σ owner balances = owner equity accounts. Any difference shows on the job summary.
  - `rollback.js` reverses in dependency order:
    - void every `opening_balance` entry via `ledger_void` (never delete)
    - soft-delete created rows
    - restore updated rows from `before`
    - refuse if any created lease or tenant has non-import ledger activity since the commit
- *API routes:* `app/api/import/jobs/route.js` (create), `[id]/rows` (POST chunk validate/commit), `[id]/rollback`.
- *UI:*
  - Settings → new "Import & Export" screen. Add it to the `sidebar_nav.jsx` Settings subItems and to `SCREEN_REGISTRY` (`components/internal/screens/registry.jsx:167-175`).
  - Import uses `components/internal/shared/wizard_dialog.jsx`, with steps: entity and source → upload → map (auto-mapped columns, unmapped highlighted, "save mapping") → review (`DataTable` of the first 200 rows with error and warning badges, counts, `LogoLoading` while validating) → import (progress) → done (summary, tie-out, "Roll back").
  - A history list of jobs.
  - A "Start migration" checklist card on the Overview empty state.
- *Permissions:* `property.data.import` (Owner and Manager by default).
- *Integrations:* none. API pulls from Buildium's Open API (Premium plan) or AppFolio's Database API are a later option; see Open decisions.

**Steps**
1. Field catalogue and templates for properties and units. Wire the screen shell.
2. Parse and map (generic), validate, commit and rollback for properties and units, end to end.
3. Add owners, vendors, tenants and leases. This needs CORE 0.1's lease-billing activation helper.
4. Open balances (both modes) and deposits held (needs CORE 0.4), plus the tie-out.
5. GL opening trial balance plus the chart-of-accounts import (map external account numbers to Geiger's chart; create missing accounts).
6. Vendor presets: AppFolio first (best-documented), then Buildium, Rent Manager (with the `.rrtx`), and Yardi Breeze.
7. Saved mappings (settings key `import_mappings`), job history, sandbox support (an in-memory commit, so the playground can demo an import).

**Research before building**
- Download Buildium's public onboarding templates (https://www.buildium.com/onboarding-templates/). They are the best public "standard fields" reference. Get one real export per vendor from a friendly customer before finalising presets.
- AppFolio report columns: https://help.pinata.ai/en/articles/9631531-download-tenant-directory-from-appfolio, https://intercom.help/boomhelpcenter/en/articles/12416649-appfolio-report-setup-for-boomreport, https://help.latchel.com/s/topic/0TO5e000000h9wqGAA/How-to-Export-Reports-with-Reference-IDs.
- Rent Manager Report Writer `.rrtx` sharing (https://help.getrentcheck.com/en/articles/5317968-downloading-units-from-rent-manager).
- Yardi Breeze: file-only; Codat's export paths at https://help.codat.io/integrations/yardi-breeze/overview.
- Opening-balance practice: Rentvine balance-forward (https://help.rentvine.com/en/articles/16603250), Propra (https://propra.freshdesk.com/support/solutions/articles/73000609578-entering-opening-balances), Buildium Academy "Opening balances for rentals".
- XLSX library: licence, bundle size, and whether the SheetJS npm package is stale. Prefer a maintained MIT library.

**Acceptance criteria**
- An AppFolio Tenant Directory plus Rent Roll export (sample file) auto-maps at least 90% of columns and imports units, tenants and leases with no manual edits.
- Validation rejects:
  - a lease on a missing unit
  - a duplicate tenant email with `dedupe = skip`
  - a date like `13/31/2026`
  - a currency like `$1,2.00`
- After the open-balance import, the AR aging report total equals the source "Amount Receivable" total to the cent. Deposit liability equals Σ deposits held.
- The GL opening entry balances (Σdebit = Σcredit). If the source trial balance doesn't balance, the import is refused.
- Rollback leaves zero live imported rows and voids every opening entry, so the trial balance returns to its pre-import totals. Rollback is refused after a payment posts against an imported lease.
- Re-running the same job doesn't duplicate anything.
- A user without `property.data.import` can't open the wizard, and the API returns 403.

**Depends on / unblocks**
- **Depends on:** PLAT-01 (01a permissions, 01g private bucket); CORE-01 (gap 0.1) (billing from lease) and 0.4 (deposits on the ledger); PLAT-14 (custom fields in the catalogue; optional).
- **Unblocks:** PLAT-04 (shared catalogue), PLAT-11 (catalogue drives the API schema), PLAT-02 row 19, and INTL self-serve onboarding.

**Open decisions**
- **XLSX parser choice** (`exceljs` vs `read-excel-file` vs SheetJS from its CDN).
- **API-based migration** (Buildium Open API, AppFolio Database API) in addition to files? Recommendation: files first; consider APIs after launch.
- **Transaction history.** Import only balances forward, or also 1–2 years of history? Competitors offer 2–3 years as an option; history makes rollback and tie-outs much harder.

#### PLAT-04 · Full data export
- **MRI equivalent:** PMX full data extract over SFTP; an end-of-contract Oracle Data Pump export.
- **Status · priority · effort:** Partial · P1 · M
- **Refs:** Gap 9.1 (export half) · Inventory 9.33, 7.19–7.21 · PMX-9.18

**Geiger today:** CSV export exists for reports only (`lib/reports/csv.js:1-30`, which already guards against spreadsheet formula injection at `:5-11`), plus browser print-to-PDF. There is no account-wide export and no list export.

**What's missing**
- A one-click "export my whole project" (CSV per table plus documents), for trust, offboarding and backups.
- Per-entity CSV in the import template format, so files round-trip.
- List-screen export is CORE-42 (gap 7.3). This item supplies the shared serializer; PLAT-07 adds "Export selected".

**How to build**
- *Data model:* `property.export_jobs` (project_id, kind `full | entity`, entity, status, `bucket`/`storage_path` of the ZIP, `expires_at`, counts, requested_by, error). RLS with read and write = `property.data.export`.
- *Server logic:*
  - `lib/data_io/export.js` reuses the PLAT-03 `schemas.js`: flatten `metadata` keys into columns, resolve ids to readable references alongside the raw ids, and include custom fields.
  - Full export = one CSV per project table (all rows including soft-deleted, with `deleted_at`) + `ledger_lines` / `ledger_entries` / `gl_accounts` + a documents folder (copied from `property-files`) + `manifest.json` (schema version, counts, checksums).
  - ZIP with `fflate` (streaming).
  - The job runs as `export-full` in `lib/jobs` (staff-triggered; long-running), writes to `property-files/<project>/exports/…` and sends a 7-day signed link through geiger-dash email (new template `property.export_ready`) and geiger-notify.
- *API routes:* `app/api/export/route.js` (POST start, GET status), guarded by `property.data.export`.
- *UI:* the "Import & Export" screen (PLAT-03) gets an Export tab: "Export everything", per-entity CSV buttons, and recent exports with download links.
- *Permissions:* `property.data.export`. Log every export to PLAT-09 audit.

**Steps**
1. `export.js` serializer and per-entity CSV (sync download for ≤5k rows).
2. Full-export job with ZIP, the storage write and the email.
3. Re-import test: export, then import into an empty project.

**Research before building**
- `fflate` versus `archiver` on Vercel functions: memory and `maxDuration` limits for about 10k rows plus documents. If documents are too large, split them into a separate archive.

**Acceptance criteria**
- A full export of the demo project (~8,150 rows, 76 tables) completes, and the manifest counts match `select count(*)` per table.
- Exported tenants re-import with PLAT-03 into a blank project without mapping changes.
- Cells starting with `=`, `+`, `-` or `@` are prefixed.
- The signed link expires after 7 days.
- A user without `property.data.export` gets 403.

**Depends on / unblocks**
- **Depends on:** PLAT-01g (private bucket), PLAT-03 step 1 (catalogue).
- **Unblocks:** PLAT-15 (subject access requests), PLAT-16 (warehouse export), CORE 7.3 (list export uses the serializer).

#### PLAT-05 · Global search (⌘K: pages and records)
- **MRI equivalent:** MRI•GO, which finds "every tenant, guest card, or vendor" and links to resident statements.
- **Status · priority · effort:** Missing (search box is a stub) · P1 · M
- **Refs:** Gap 9.2 · Inventory 9.55 · PMX-9.21

**Geiger today**
- The topbar passes only `searchPlaceholder` (`components/internal/topbar/projects/topbar.jsx:16-20`).
- The shared Topbar opens the CommandPalette only when given `searchNav` or `searchItems` (`C:\Pro\geiger-ui\src\ui\topbar.jsx:29-60`). Events wires it with `searchNav={visibleNav}` and `onSearchSelect` (`C:\Pro\geiger-events\components\internal\topbar\topbar.jsx:24-27`).
- The palette fuzzy-matches a pool built in memory from `nav` + `items` and has no async query hook (`C:\Pro\geiger-ui\src\ui\command-palette.jsx:11-15, 143-158`).

**What's missing:** page navigation from ⌘K, and record search across tenants, prospects, applicants, owners, vendors, properties, units, leases and work orders.

**How to build**
- *Step 1 (S): pages.*
  - Pass `searchNav` from `components/internal/sidebar/sidebar_nav.jsx`, filtered by RBAC `canView`, plus `onSearchSelect={(item) => setTab(item.title)}` and `searchRecentsKey="geiger:property:search-recents"`, exactly as events does.
- *Step 2 (M): records.*
  - *Data model:* `create extension if not exists pg_trgm` (check it's enabled in the shared project) plus GIN trigram indexes on the searched text columns: `tenants(name, email, phone)`, `prospects`, `owners`, `vendors`, `properties(name)`, `units(unit_number)`, `work_orders(name)`, `applications`.
  - RPC `property.search_index(p_project uuid)`, `security invoker` so RLS applies. It returns `(id, type, title, subtitle, keywords)` for active records. A 500-unit project is a few thousand rows, under about 300 KB.
  - Later RPC `property.search_records(p_project, p_query, p_limit)` with `similarity()` ranking, for when the palette supports async.
  - *Server logic:* `lib/supabase/search.js`, `loadSearchIndex(projectId)`. Cache in memory for the session; refresh on palette open if older than 5 minutes.
  - *UI:* pass index rows as `searchItems` with `group` = "Tenants", "Units"… and the record type's Lucide icon. On select, call `openItemInTab(id, tab)` (`lib/hooks/use-workspace-url.js:152-155`); a tenant opens the Tenants tab editor.
  - Add a "Statement" quick action on tenant hits once CORE-12 (gap 3.2) ships.
- *Suite change (follow-up):* propose `onQueryChange` + `loading` + `asyncItems` props on `@geiger/ui` CommandPalette, so all products get server search. Then switch to `search_records`.
- *Permissions:* RLS decides what appears. Records in areas the user can't view are excluded by the PLAT-01 read gates (for example ledger rows aren't indexed).

**Steps**
1. Wire `searchNav` (step 1).
2. Migration `search_index` (pg_trgm, indexes, RPC).
3. Data layer plus `searchItems` wiring with icons.
4. Open a `@geiger/ui` issue or PR for async palette search.

**Research before building**
- Whether `pg_trgm` is installed in the shared Supabase project (`select * from pg_extension`), and which schema holds it.
- Palette performance with about 5,000 items: the fuzzy loop runs per keystroke over the pool. Test in the browser; cap per group at the palette's `maxResults`.

**Acceptance criteria**
- ⌘K opens the palette on every workspace screen. Typing "rent roll" jumps to the Rent Roll report.
- Typing part of a tenant's phone number or email finds the tenant, and Enter opens their editor.
- A Maintenance tech doesn't see owners or bank accounts if their role can't view those areas.
- Results never include another project's records, and soft-deleted rows don't appear.

**Depends on / unblocks**
- **Depends on:** PLAT-01 (RLS decides visibility).
- **Unblocks:** CORE resident-statement shortcut (gap 3.2).

#### PLAT-06 · MFA (suite-level) and enterprise SSO
- **MRI equivalent:** MRI login through Okta with MFA (push or SMS code), identity federation with the client's provider, and Agora Control Hub for identity policy.
- **Status · priority · effort:** Missing · P2 for MFA (before outbound money movement ships), P3 for SAML and SCIM · M (mostly in geiger-dash)
- **Refs:** Gap 9.9 · Inventory 9.38, 9.39 · PMX-9.05

**Geiger today**
- Property has no login of its own. Staff sessions come from the shared suite cookie, and the proxy only refreshes it (`utils/supabase/middleware.js:4-7, 18-25`).
- geiger-dash offers:
  - email and password (`C:\Pro\geiger-dash\app\login\auth-form.jsx:94`)
  - Google and GitHub OAuth (`:140, 257, 270`)
  - passkeys (`C:\Pro\geiger-dash\lib\auth\passkeys.js:42-80`)
  - per-org OAuth2/OIDC SSO through `public.org_oauth_providers`, gated by the `oauth` add-on (`C:\Pro\geiger-dash\supabase\migrations\20260708201330_org_oauth_providers.sql:34-54`; `lib/oauth/session.js:95-157`)
- **No MFA anywhere in the suite:** no `auth.mfa`, `aal2` or TOTP. **No SAML, no SCIM.**
- Portal users sign in with an email code (`lib/portal/auth.js`).

**What's missing**
- TOTP MFA, an org-level "require MFA" policy, and enforcement inside Property's data access.
- Step-up verification for sensitive actions.
- SAML SSO and SCIM provisioning for larger customers.

**How to build**
- *Suite (geiger-dash), primary:*
  - MFA enrolment and challenge screens using Supabase Auth MFA (`supabase.auth.mfa.enroll({ factorType: "totp" })`, `challenge`, `verify`), plus recovery through a second factor.
  - Org setting `organizations.metadata.security.requireMfa` and a SQL helper `public.org_requires_mfa(org uuid)` (security definer).
  - The dash sign-in flow forces enrolment or verification when the org requires it.
  - Raise this as a dash work item; Property must not build its own MFA.
- *Property data model* (migration `rls_mfa_gate`): extend `property.member_project_ids()` (PLAT-01a) so that projects whose org requires MFA are only returned when `(select auth.jwt()->>'aal') = 'aal2'`.
- *Property server logic:*
  - `lib/auth/staff.js` returns 403 `mfa_required` for aal1 sessions in such orgs.
  - Step-up for adding bank accounts, creating API keys (PLAT-11) and approving owner payouts (CORE): check that the `amr` claim shows a TOTP verification within the last 15 minutes.
- *Property UI:* when `ProjectProvider` sees an MFA-required org and an aal1 session, render a "Verify your sign-in" state (`components/internal/shared/project_states.jsx`) linking to dash's MFA page with `?next=`.
- *Enterprise SSO (P3):*
  - SAML through Supabase SSO (`signInWithSSO({ domain })`; providers are added through the Supabase CLI or Management API, which needs a paid plan).
  - SCIM provisioning maps groups to `public.roles` grants.
  - Okta and Entra ID may already work through dash's custom OIDC providers; test that first.
- *Permissions:* org Owner/Admin toggles `requireMfa` in dash.

**Steps**
1. Write the dash MFA spec and build it there: enroll, challenge, recovery, org policy.
2. Property: the `member_project_ids` aal gate, the `staff.js` check and the "Verify" state.
3. Step-up helper for sensitive actions.
4. (P3) SAML and SCIM.

**Research before building**
- Supabase MFA: https://supabase.com/docs/guides/auth/auth-mfa. Read the `aal` and `amr` JWT claims, and how to enforce MFA in RLS (`auth.jwt()->>'aal'`).
- Whether dash's passkey sign-in yields `aal2` or only `aal1`.
- Supabase SAML SSO plan requirements and setup: https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml.
- How AppFolio, Buildium and Rent Manager present 2FA (all offer it). Check whether trust-accounting regulators or E&O insurers in key states expect MFA for systems touching trust funds.

**Acceptance criteria**
- In an org with `requireMfa`, an aal1 session sees the "Verify" state, and the database returns no project rows. After TOTP verification (aal2), data loads.
- Creating an API key without a TOTP in the last 15 minutes asks for re-verification.
- Orgs without the flag behave as today.
- Portal users are unaffected.

**Depends on / unblocks**
- **Depends on:** geiger-dash MFA (new); PLAT-01a.
- **Unblocks:** PLAT-11 key creation step-up; CORE owner payout and vendor payment approval.

**Open decisions**
- **Should MFA be on by default for new orgs, or opt-in?**
- **SMS as a second factor** (costs money, weaker) or TOTP and passkeys only?

#### PLAT-07 · Bulk actions, trash and restore on list screens
- **MRI equivalent:** none confirmed in public material. Expected by mid-market switchers.
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Gap 11.6 · Inventory 9.32

**Geiger today**
- `EntityListScreen` (`components/internal/screens/entity/entity_list_screen.jsx:192`) powers 42 screens. Each row has an action menu with Edit, Duplicate and Delete (`:383-401`), and the table is `@geiger/ui` `DataTable` (`:491-498`).
- `DataTable` has no selection support; its props are `columns, data, getRowKey, onRowClick, empty, className` (`C:\Pro\geiger-ui\src\ui\screen-kit.jsx:625-632`).
- Soft delete is one row at a time (`lib/supabase/entity_factory.js:151-160`). There is no restore and no trash view.

**What's missing**
- Multi-select.
- Bulk delete, restore, status change, field assignment and export.
- A "Deleted" view with restore.

**How to build**
- *Server logic:* `lib/supabase/entity_factory.js` gains:
  - `softDeleteMany(ids)`, `restore(id)`, `restoreMany(ids)`, `updateMany(ids, patch)`: chunked `.in("id", …)` of 150, returning `{ ok, failed: [] }`
  - `listDeleted({ days: 30 })`
  - one `logSystemActivity` per record (`lib/supabase/activity_log.js:116`); audit comes from PLAT-09 triggers
- *UI:*
  - A leading checkbox column in `EntityListScreen` using `Checkbox` from `@geiger/ui` (header = select page; `stopPropagation` so row click still opens the editor).
  - A selection bar inside the Toolbar: "N selected · Select all M matching" with actions:
    - Delete (`property.record.delete`)
    - Change status (from `config.statusOptions`)
    - Assign (`config.bulkAssign`, e.g. property, vendor, owner)
    - Export selected (PLAT-04 serializer)
    - per-screen `config.bulkActions` extras, for example "Send reminder" on Tenants when COMM's messaging ships
  - A "Deleted" option in the view switcher shows soft-deleted rows from the last 30 days, with Restore.
  - Confirm destructive actions with the existing delete-confirm dialog pattern.
- *Suite:* propose a `selectable` prop on `@geiger/ui` `DataTable` so Flow, Events and the others share it. Build locally first if the PR lags.
- *Permissions:* `property.record.delete` for delete and restore (enforced by the PLAT-01e trigger); the screen's write permission for the others.

**Steps**
1. Factory bulk functions plus restore.
2. Selection column and bar in `EntityListScreen`.
3. Deleted view.
4. Per-screen `bulkActions` for Tenants, Units, Work Orders and Vendors.
5. Upstream `selectable` to `@geiger/ui`.

**Research before building:** check Flow and Notes for an existing multi-select list pattern before building one (CLAUDE.md suite consistency).

**Acceptance criteria**
- Selecting 3 of 25 tenants and choosing Delete soft-deletes exactly 3, writes 3 activity entries, and the rows appear in Deleted. Restore brings them back.
- "Select all 412 matching" applies to the filtered set across pages.
- A user without `property.record.delete` doesn't see Delete, and the database rejects a forged call.
- Partial failures are reported per row in a toast.

**Depends on / unblocks**
- **Depends on:** PLAT-01e (delete guard), PLAT-04 (export serializer).
- **Unblocks:** COMM bulk reminders; CORE batch actions.

#### PLAT-08 · Property-scoped access and central user management
- **MRI equivalent:** Advanced User Security: centralised users and roles, security by entity, menu, table and report, and user-activity reports.
- **Status · priority · effort:** Missing · P2 · L
- **Refs:** Gap 9.3 · Inventory 9.6, 9.8, 9.3 · PMX-9.04

**Geiger today**
- Role resolution has no property scope (`context/rbac-context.js:40-50`).
- Team & Members "Invite" only creates a row: no email, no account (`components/internal/screens/settings/team_members.jsx`; inventory 9.8).
- Workspace access comes from dash org membership (`public.is_project_member`).

**What's missing**
- Limiting a user to some properties or portfolios, in the UI, the database, reports and search.
- Real invitations.
- One place to see someone's roles across suite products.

**How to build**
- *Data model* (migration `rls_property_scope`):
  - Use `@geiger/rbac` scope on `property.role_grants.scope`: `{ "property": [ids] }` or `{ "portfolio": [ids] }`.
  - New `property.scope_property_ids(p_project uuid)` (security definer stable) returns null when unscoped, otherwise the allowed property ids. Portfolios expand through the property's portfolio link (confirm the column).
  - Denormalise `property_id` onto every table that carries a unit, lease or tenant link but lacks it: units, inspections, moves, security_deposits, renewals, notices, showings, applications, listings, maintenance_attachments, rent_accounts. Backfill, and keep it in sync with a BEFORE INSERT/UPDATE trigger `property.fill_property_id()` that derives it from `unit_id` or `lease_id`.
  - Add `and (property.scope_property_ids(project_id) is null or property_id = any(property.scope_property_ids(project_id)))` to the select and update policies of property-dimension tables, including `ledger_lines` (property dimension).
  - Owners are visible when linked through `property_owners`; vendors stay project-wide.
- *Server logic:*
  - Report loaders (`lib/reports/sources_server.js`) run with the user's JWT client instead of the admin client when invoked from the UI, so RLS applies.
  - Scheduled reports keep the admin client, but store the creator's scope on the schedule and filter by it.
- *UI:*
  - Port events' Team screen: `C:\Pro\geiger-events\components\internal\screens\settings\team\{members_tab,invitations_tab,invite_dialog,member_drawer,use_team}.jsx`.
  - Member drawer → "Property access: All / Selected properties / Portfolios" (multi-select).
  - Invitations go through dash's `public.organization_invites` + `invite_to_organization` / `accept_invite` RPCs (`C:\Pro\geiger-dash\supabase\migrations\20260629212509_org_invites.sql:87-232`). Grant the Property role on claim, as events' `rbac_claim_invitation` does.
  - A property-scope indicator in the topbar ("3 properties").
- *Permissions:* `property.team.assign` to change scope; owners can't be scoped.

**Steps**
1. Denormalise `property_id` plus the trigger.
2. `scope_property_ids` and policy amendments.
3. Report loaders on the user client.
4. Port the Team screen with invitations.
5. Scope picker.
6. Scheduled-report scope.

**Research before building**
- List every table and the column that ties it to a property. Check `property_id` presence per table in the migrations; some use metadata links.
- Measure RLS cost with `scope_property_ids` on `ledger_lines` (largest table).
- Check whether dash plans the `organization_user_project` table (designed in `C:\Pro\geiger-dash\docs\superpowers\specs\2026-07-04-org-members-management-design.md:56`, never built) for suite-wide project access. Align with it rather than duplicating.

**Acceptance criteria**
- A Leasing agent scoped to Property A sees only A's units, tenants, leases, applications, work orders and ledger lines, in lists, search (PLAT-05), reports and the API, and gets 0 rows for B by direct query.
- Changing scope takes effect on next load.
- An invited email receives a dash invitation, signs up, and lands in the project with the assigned role and scope.

**Depends on / unblocks**
- **Depends on:** PLAT-01a/01d.
- **Unblocks:** regional or portfolio managers; owner-specific staff.

**Open decisions**
- **Vendors and owners under property scope:** project-wide (simpler) or filtered by linked properties?

#### PLAT-09 · Immutable audit trail and sign-in reports
- **MRI equivalent:** the Audit Trail module ("captures an audit trail of changes made to the financial tables", configurable per table, reportable; user audit data kept 1–6 months) plus login and session metrics.
- **Status · priority · effort:** Partial · P2 · M
- **Refs:** Gap 9.4 · Inventory 9.9, 9.10, 9.11, 6.7 · PMX-9.06, PMX-9.07

**Geiger today**
- `property.activity` (`supabase/migrations/20260708132814_property_shared.sql:111-125`) is written from the browser, fire-and-forget (`lib/supabase/activity_log.js:73, 116`). It can be soft-deleted (`:95`) and edited under demo-open RLS.
- Server logs exist: `job_runs`, `notification_sends`, `automation_runs`, `stripe_events`.
- There is no workspace audit viewer and no sign-in history. geiger-dash doesn't use Supabase's `auth.audit_log_entries`; it only shows `last_sign_in_at` (`C:\Pro\geiger-dash\app\profile\[USERID]\page.js:118`).
- Prior art: pods' append-only `pods.audit_events` rejects UPDATE and DELETE (`C:\Pro\geiger-pods\supabase\migrations\foundation\20261006000104_audit_events.sql:7-50`); dash has `public.mcp_audit_log`.

**What's missing**
- Tamper-proof, database-written change history on financial and security tables, with the actor and the source.
- A viewer and an export.
- Sign-in reports.

**How to build**
- *Data model* (migration `audit_log`):
  - `property.audit_log`: `id bigint generated always as identity`, `project_id`, `table_name`, `record_id`, `action` (`insert | update | soft_delete | restore | delete`), `changed text[]`, `before jsonb`, `after jsonb` (changed columns only), `actor_id`, `actor_email`, `actor_role`, `source`, `request_id`, `occurred_at`.
  - Grants: `select` only, via an RLS policy on `property.audit.view`. No insert, update or delete for any client role. A trigger rejects UPDATE and DELETE, as in pods.
  - Generic `property.audit_row()` trigger (security definer, AFTER INSERT/UPDATE/DELETE) reads:
    - `auth.uid()` and `auth.jwt()->>'email'`
    - `source` from `current_setting('request.headers', true)::json->>'x-geiger-source'`
  - `adminClient({ source })` in `lib/supabase/admin.js` sets that header, for example `job:late-fees`, `portal`, `api`, `import:<jobId>`.
  - Attach the trigger via `property.enable_audit(p_table text)` to:
    - ledger_entries, ledger_lines, gl_accounts, bank_accounts, bank_reconciliations
    - transactions, bills, recurring_charges, rent_accounts, security_deposits
    - online_payments, autopay_plans, budgets, budget_lines
    - property_owners, owners (payout fields), leases (rent and terms)
    - settings, role_grants, portal_members, api_keys (PLAT-11), webhook_endpoints (PLAT-10)
  - Index `(project_id, table_name, record_id, occurred_at desc)`.
- *Sign-ins (suite-level, in dash):*
  - `public.org_sign_in_events(p_org uuid, p_since timestamptz)`, security definer, org owner or admin only. It reads `auth.audit_log_entries` (login, logout, token issue, failed attempts where available) for the org's members.
  - Property calls it for the project's org. Portal sign-ins (`app/api/portal/auth/verify`) write an `audit_log` row with `source = 'portal'`.
- *UI:*
  - Settings → "Audit Log" screen: filters for table, record, user, date and source; a diff view of before and after; CSV export.
  - A "Sign-ins" tab.
  - A "History" section in financial record editors (bills, deposits, recurring charges), via a `makeAuditSection(table)` factory in `components/internal/screens/entity/sections/factories.jsx`.
  - `property.activity` stays as the human timeline and notes.
- *Permissions:* `property.audit.view` (Owner and Accountant by default).

**Steps**
1. Migration with table, trigger and `enable_audit` for the ledger tables first.
2. Source header in `adminClient` and the job runner.
3. Extend to the remaining tables.
4. Audit Log screen plus the History section.
5. Dash `org_sign_in_events` plus the Sign-ins tab.
6. Retention job (see Open decisions).

**Research before building**
- Whether Supabase writes `auth.audit_log_entries` to Postgres on the shared project (newer projects can turn it off), and which events and IP fields it holds: https://supabase.com/docs/guides/auth/audit-logs.
- PostgREST `request.headers` GUC availability for the source header.
- Volume estimate: rows per month for a 500-unit portfolio. Decide on monthly partitioning if it exceeds about 5M rows a year.

**Acceptance criteria**
- Voiding an entry writes audit rows (the entry status change plus the reversal insert) with the actor's email and `source = 'app'`. A late-fee job run writes rows with `source = 'job:late-fees'`.
- No client role can update or delete `audit_log`, including through `merge_meta`.
- Changing `fees_policies` shows a field-level diff.
- Sign-ins list successful and failed logins of project members for the last 30 days.

**Depends on / unblocks**
- **Depends on:** PLAT-01.
- **Unblocks:** PLAT-11 (API calls audited), PLAT-15 (privacy actions logged), PLAT-18 (agent actions auditable).

**Open decisions**
- **Retention.** MRI keeps 1–6 months of user audit data. Recommendation: keep financial-table history for 7 years (IRS record-keeping) and the rest for 2 years.

#### PLAT-10 · Outbound webhooks (signed, retried, logged)
- **MRI equivalent:** MIX data exchange: "SOAP Web Services and flat file exchange… over SFTP" with partner keys. PMX has no evidenced event webhooks.
- **Status · priority · effort:** Saved-unused · P2 · M
- **Refs:** Gap 9.5 (webhooks half) · Inventory 9.26, 9.16 · PMX-9.15, PMX-9.16

**Geiger today**
- Endpoints (URL, six event names, enable toggle) are saved in settings key `integrations` (`components/internal/screens/settings/shared.js:91-100`). The screen says "nothing is sent" (`components/internal/screens/settings/integrations.jsx:141-181`).
- There is already a database event queue, `property.automation_events` (`supabase/migrations/20261015212609_messaging_scheduler_automations.sql:150-167`):
  - fed by `record_event_trigger` on leases, applications, work_orders, transactions and moves (`20261015214949_fix_record_event_trigger_array_append.sql:68-131`)
  - and by `emit_record_event` from online payments (`lib/payments/posting.js:250`)
  - The automations runner drains it (`lib/automations/runner.js:111-157`).

**What's missing**
- Delivery itself: HMAC signing, retries with backoff, a delivery log, test sends, auto-disable.
- Event coverage for `tenant.created` and `lease.signed` (no trigger produces them today).
- Secret storage outside client-readable settings.

**How to build**
- *Data model* (migration `webhooks`):
  - `property.webhook_endpoints`: project_id, url, description, events text[], enabled, `secret_id` (references `property.integration_secrets`, PLAT-01h), `failure_streak`, `disabled_reason`, `api_version`, standard columns.
  - `property.webhook_deliveries`: endpoint_id, event_id (references `automation_events.id`), event_type, payload jsonb, status (`pending | delivered | failed | dead`), attempts, `next_attempt_at`, `response_status`, `response_excerpt` (2 KB), `duration_ms`, `delivered_at`.
  - Fan-out: an AFTER INSERT trigger on `automation_events` (security definer) inserts one delivery per enabled endpoint subscribed to that `event_type`.
  - Extend `record_event_trigger` with `tenant.created` (tenants insert) and `lease.signed` (esign request completed, or lease status → signed). This is a new migration that re-owns the function.
  - Move the endpoints out of settings `integrations.webhooks` with a one-off backfill.
  - RLS: `property.integration.manage` for endpoints; deliveries are readable by the same permission.
- *Server logic:*
  - `lib/webhooks/catalog.js`: event names, descriptions and payload builders. Payloads reuse the PLAT-11 resource representations: `{ id, type, created_at, project_id, api_version, data: { object } }`.
  - `lib/webhooks/sign.js`: header `Geiger-Signature: t=<unix>,v1=<hmac_sha256(secret, t + "." + body)>` (Stripe-style), plus a verification snippet for the docs.
  - `lib/webhooks/send.js` guards against SSRF: https only, DNS-resolve and reject private, loopback and link-local ranges, no redirects, 10 s timeout.
- *Jobs:*
  - New `webhook-deliveries` job in `lib/jobs/registry.js` (every minute once CORE 0.10 schedules crons). It claims due deliveries (`for update skip locked` through an RPC).
  - Backoff: 1 m, 5 m, 30 m, 2 h, 6 h, 12 h, 24 h (8 attempts).
  - After 20 consecutive failures, disable the endpoint and notify the owners through geiger-notify and an email template `property.webhook_disabled`.
- *API routes:* `app/api/webhooks/test/route.js` (send a sample event), `app/api/webhooks/[id]/redeliver/route.js`. Both use `requireStaff(…, { permission: "property.integration.manage" })`.
- *UI:* rebuild the Webhooks card in `settings/integrations.jsx`:
  - add endpoint (shows the secret once)
  - event picker from the catalogue
  - "Send test"
  - a deliveries table (status, code, attempts, timestamps) with Redeliver
  - "Rotate secret"
- *Integrations:* geiger-pods already has `pods.event_subscriptions` / `event_deliveries` with signed `x-pods-signature` and retries (`C:\Pro\geiger-pods\supabase\migrations\admin\20261010000001_admin.sql:72-100`), but it is scoped to pods' own customer APIs. Build in Property now, and keep the payload and signature format documented so a later suite event bus can absorb it.

**Steps**
1. Migration (tables, fan-out trigger, trigger extensions).
2. Signing, sending and the SSRF guard, with unit tests.
3. Dispatcher job plus backoff.
4. Card UI, test send and redeliver.
5. Docs page section (shared with PLAT-11).

**Research before building**
- Standard Webhooks spec (https://www.standardwebhooks.com/) versus a Stripe-style signature. Prefer the spec if it's simple.
- Vercel cron minimum interval on the current plan. If crons can't run every minute, consider `after()` dispatch from the posting routes plus cron catch-up.
- SSRF guard libraries for Node (for example `ssrf-req-filter`) versus a hand-rolled IP check.

**Acceptance criteria**
- Creating a work order produces one `work_order.created` delivery per subscribed endpoint within one dispatch run, with a valid HMAC that the docs snippet verifies.
- A 500 response retries on schedule; after 8 attempts the delivery is `dead`. Twenty consecutive failures disable the endpoint and notify the owner.
- `http://localhost` and `https://10.0.0.5` endpoints are rejected at save.
- Secrets never appear in `settings` or in client responses after creation.

**Depends on / unblocks**
- **Depends on:** PLAT-01 (01h secrets), CORE-10 (gap 0.10) (crons).
- **Unblocks:** PLAT-11 (shared representations), PLAT-13 (webhook step), PLAT-12, PLAT-18 (event stream).

#### PLAT-11 · Public REST API: keys, scopes, rate limits, sandbox
- **MRI equivalent:** MIX APIs: "more than 1,000 unique APIs", SOAP and flat file, partner-key access through Partner Connect, "API sandbox or test environment: No".
- **Status · priority · effort:** Missing · P2 · XL
- **Refs:** Gap 9.5 · Inventory 9.25 · PMX-9.15, PMX-9.16

**Geiger today**
- `app/api/` holds first-party routes only (inventory 9.25). There are no API keys.
- The suite has key patterns to copy:
  - dash email keys: `gk_live_`, SHA-256 hash, `active`, `last_used_at` (`C:\Pro\geiger-dash\lib\email\auth.js:7-35`; `supabase/migrations/20260629212506_email.sql:99-108`)
  - dash filestore keys with `scopes text[]` (`20260921132318_filestore.sql:208-221`)
- geiger-pods has keys stored by HMAC, usage plans and token-bucket throttling (`C:\Pro\geiger-pods\supabase\migrations\usage\20261008000002_usage.sql:13-99`), but it routes to customer backends, not to product schemas.

**What's missing**
- A documented, versioned REST API over Property's core objects.
- Per-project keys with scopes, rate limits, a sandbox, and audit of every call.

**How to build**
- *Data model* (migration `api_keys`):
  - `property.api_keys`: project_id, name, `prefix` (first 8 characters, shown), `key_hash` (SHA-256), scopes text[], mode (`live | test`), created_by, last_used_at, expires_at, revoked_at.
  - Format `gp_live_<prefix>_<secret>` / `gp_test_…`. The full key is shown once.
  - `property.api_usage`: key_id, window_start (minute), count. Upsert counter.
  - RLS: `property.api_key.manage`. `key_hash` is never selectable by clients; use a view without it.
- *Server logic* (`lib/api/`):
  - `guard.js`, `withApiKey(handler, { scope })`:
    1. hash and look up the key
    2. check mode, expiry and scope
    3. apply the rate limit (default 120 requests/min per key, 429 with `Retry-After`)
    4. build a `ctx` with `scoped(table)` (service role plus a forced `project_id`, from PLAT-01b `lib/supabase/scope.js`)
    5. audit with `source = 'api:<prefix>'`
  - `resources/*.js`: one module per resource, built from the PLAT-03 `schemas.js` catalogue (fields, custom fields under `custom_fields`).
  - `pagination.js`: cursor on `(updated_at, id)` with `updated_since`.
  - `errors.js`: `{ error: { type, code, message, param } }`.
  - Writes go through the existing domain libraries (ledger builders, `lib/maintenance`), never raw inserts.
  - `POST` honours `Idempotency-Key` (stored 24 h in `property.api_idempotency`).
- *API routes:*
  - `app/api/v1/[resource]/route.js` and `[resource]/[id]/route.js`, starting with:
    - read: properties, units, tenants, leases, owners, vendors, charges (open AR), payments
    - write: prospects (lead intake), work orders (create, update status), charges (post with `charges:write`, through the ledger builder)
  - `app/api/v1/openapi.json/route.js` generates OpenAPI 3.1 from the catalogue.
- *Sandbox:* `gp_test_` keys bind to a per-org sandbox project, created on first test key and seeded from `lib/sandbox/seed` through the demo generator in `supabase/seeds/demo_project/generate/`. A "Reset sandbox" button reseeds it.
- *UI:*
  - Settings → Integrations → "API keys" tab: create (scopes picker, mode, expiry; MFA step-up from PLAT-06), revoke, last used, usage sparkline.
  - A public developer docs page at `/property/developers` that renders the OpenAPI document. Decide the renderer.
- *Gateway evaluation (geiger-pods):*

| Option | Pros | Cons |
|---|---|---|
| A. In-repo `/api/v1` (recommended now) | Simplest; RLS-adjacent; same deploy | Rate limiting and analytics are ours to build |
| B. Pods in front (pods keys and usage plans → HTTP integration to `/api/v1`, with a signed identity header) | Reuses pods throttling, quotas, analytics and its management API | Pods doesn't yet route to suite products; two hops; pods' README is stale; adds a cross-repo dependency before launch |

  Build A with the key check behind an `authenticate(request)` adapter, so B can be plugged in later.
- *Permissions:* `property.api_key.manage`. Key scopes are separate from user roles and can't exceed the creator's permissions at creation (as `pods.grant_role` refuses grants beyond the grantor's).

**Steps**
1. Migration and `guard.js` (keys, scopes, rate limit, audit).
2. Read endpoints for properties, units, tenants and leases, plus OpenAPI.
3. Charges and payments read, prospects create, work orders create and update.
4. Charges write through the ledger.
5. Sandbox projects.
6. Keys UI plus the docs page.
7. Contract tests from OpenAPI (schemathesis or equivalent).

**Research before building**
- Whether to run API queries under a short-lived JWT for a per-key service principal, so RLS applies, instead of the service role. Supabase third-party auth and asymmetric signing keys: https://supabase.com/docs/guides/auth/signing-keys.
- Rate-limit store: Postgres counters versus Upstash Redis (Vercel Marketplace) versus Vercel WAF rate limiting keyed on the `Authorization` header.
- The OpenAPI renderer for the docs page (Scalar, Redoc). Check the licence and that it can load from the allowed CDNs.
- AppFolio Stack and Buildium Open API resource sets, to pick v1 coverage partners expect (https://developer.buildium.com/).

**Acceptance criteria**
- A `gp_test_` key reads sandbox tenants and gets 404 on live-project ids. A `gp_live_` key with only `units:read` gets 403 on `/v1/tenants`.
- The 121st request in a minute returns 429 with `Retry-After`.
- `POST /v1/charges` with the same `Idempotency-Key` twice posts one ledger entry; the trial balance stays balanced.
- Every call writes an audit row. A revoked key fails immediately.
- `openapi.json` validates as OpenAPI 3.1, and the contract tests pass.

**Depends on / unblocks**
- **Depends on:** PLAT-01, PLAT-03 (catalogue), PLAT-09, PLAT-10 (shared representations), PLAT-06 (step-up; optional).
- **Unblocks:** PLAT-12 (Zapier/Make), PLAT-16 (OData/REST BI feed), PLAT-18 (context endpoints), INTL accounting sync (can reuse the resources).

**Open decisions**
- **Route the public API through geiger-pods (option B) at some point?** This is a suite-architecture call.
- **Should API access be included in every plan?** That is the contrast with MIX's partner-gated access.

#### PLAT-12 · Integrations directory that tells the truth
- **MRI equivalent:** Partner Connect: about 281 partners, about 75 tagged PMX, filterable by vertical, "MRI Certified" badges.
- **Status · priority · effort:** Partial · P2 · S
- **Refs:** Gap 9.6 · Inventory 9.28, 9.29, 9.30 · PMX-9.30

**Geiger today**
- Six static provider cards (`components/internal/screens/settings/integrations.jsx:29-36`) all show "Not connected" (`:127`), although Stripe is live through env keys. `stripeStatus()` already exists (`lib/stripe/server.js:36-43`).
- The only live integrations are Stripe and geiger-dash email (inventory 9.29).

**What's missing**
- Honest status per integration.
- One registry that the Integrations screen, Payment Processing and the adapters share.
- A path for partner apps (Zapier/Make) once the API exists.

**How to build**
- *Server logic:*
  - `lib/integrations/registry.js`: `[{ key, category, name, status: "live" | "tracking" | "planned", ownerItem, settingsTab, docsUrl, statusFn }]`. Entries:
    - Stripe (live; `stripeStatus`)
    - Email via geiger-dash (live; checks `GEIGER_EMAIL_API_KEY`)
    - E-signature (tracking; LEAS adapter)
    - Screening (tracking; RISK adapter)
    - Listing syndication (tracking; LEAS)
    - SMS (planned; COMM)
    - Accounting sync for QuickBooks/Xero (planned; **owned by INTL**)
    - Webhooks (PLAT-10) and API (PLAT-11)
  - New `app/api/integrations/status/route.js` (staff) returns server-side status, never secrets.
- *UI:*
  - Cards show the badges "Live", "Tracking only" (with a tooltip saying what's recorded by hand) and "Planned".
  - "Configure" deep-links to the owning settings screen (for example Payment Processing).
  - Remove the dead "Connect" buttons.
- *Later (P3):* a public "Integrations" page on the landing site, and a Zapier app built on PLAT-10 triggers and PLAT-11 actions.
- *Permissions:* `property.integration.manage` to configure.

**Steps**
1. Registry plus status route.
2. Rewrite the Integrations cards.
3. Adapters register themselves in the registry as LEAS, RISK, COMM and INTL ship them.

**Research before building:** which integrations US small and mid-size managers ask for first (QuickBooks, Zillow, TransUnion SmartMove, RentRedi/Pinata, Latchel, Zapier). Check the AppFolio Stack and Buildium Marketplace listings for counts and categories.

**Acceptance criteria**
- With Stripe env keys set, the Payments card shows "Live" and the webhook-secret status. With them unset, it shows "Not configured".
- Every card's status comes from the registry, and none claims "Connected" without a live adapter.

**Depends on / unblocks**
- **Depends on:** none (PLAT-10 and 11 add entries).
- **Unblocks:** PLAT-02 copy honesty; INTL QuickBooks/Xero sync registers here.

#### PLAT-13 · Workflow builder depth: more steps, OR groups, retries, run history
- **MRI equivalent:** PMX Workflow Design ("create and automate notifications, document routing, and approval processes"; licensed) and the Agora Workflow Builder / Orchestrator catalogue. Only the non-AI part applies.
- **Status · priority · effort:** Partial · P2 · L
- **Refs:** Gap 9.7 · Inventory 9.14–9.22 · PMX-9.09

**Geiger today**
- A React Flow canvas (`components/internal/screens/automations/canvas/workflow_canvas.jsx`).
- 12 triggers (`lib/automations/catalog.js:29-104`).
- Condition fields for 6 record types and 9 operators (`:134-186`), evaluated AND-only (`evaluateConditions`, `:188-221`).
- 5 step types (`:225-231`), executed in `runStep` (`lib/automations/runner.js:262-383`).
- `executeRun` marks a run failed with no retry (`:388-441`, failure at `:437`).
- A Run History screen (`components/internal/screens/automations/run_history.jsx`).

**What's missing**
- Steps: post a charge or fee, call a webhook, assign, create a task, request approval, branch, update any field, add a note, send SMS (when COMM ships).
- OR groups and nested conditions, and conditions on custom fields.
- Retries with backoff, re-running a failed run, and run filters and detail.
- More triggers: renewals, notices, inspections, bills, prospects, showings, insurance expiry, any field changed, manual "Run on this record".

**How to build**
- *Data model* (migration `automation_runs_retry`):
  - `automation_runs` gains `attempt int default 0`, `max_attempts int default 3`, `next_retry_at timestamptz`, `parent_run_id uuid` (for re-runs).
  - Condition JSON v2 lives in `automations.metadata.conditions`: `{ op: "and" | "or", rules: [ {field, op, value} | {op, rules} ] }`. A v1 array reads as `{ op: "and", rules }`.
- *Server logic:*
  - `catalog.js`:
    - `evaluateConditions` becomes recursive for groups.
    - `CONDITION_FIELDS` gets a loader that appends the project's custom fields (`cf_<id>`, from PLAT-14).
    - New `STEP_TYPES`:
      - `post_charge`: uses `lib/ledger/postings.js` with idempotency key `auto:<runId>:<stepId>`; the automation's creator must hold `property.accounting.post`, checked at save and at run.
      - `call_webhook`: PLAT-10 signing and SSRF guard.
      - `assign`: set the assignee or vendor on the record.
      - `create_task`: a `record_items` row of kind `task` with due date and assignee (check whether a task model exists first).
      - `request_approval`: pauses the run in `waiting_approval`; it resumes on an approve or reject action from the record or an approvals list. This is the seed of CORE's multi-step approvals (gap 6.2).
      - `branch`: if/else on a condition group, with two sub-sequences on the canvas.
      - `update_field`: any field including custom fields.
      - `add_note`
      - `send_sms`: enabled by COMM.
  - `runner.js`: on a step error, if `attempt < max_attempts`, set status `retrying` and `next_retry_at = now() + backoff(attempt)` (5 m, 30 m, 2 h) and pick it up in `executeDueRuns`. Steps must be idempotent. Add `rerunFromFailed(runId)`.
- *UI:*
  - Condition builder with groups (AND/OR toggle, add group) on the canvas condition node (`canvas/workflow_nodes.jsx`).
  - Step palette with the new types and their config panels.
  - A branch node with two outputs (React Flow handles).
  - Run History: filters (status, automation, date), a run detail drawer showing step log, payloads and errors, and "Retry".
  - The Scheduled Jobs dialog still says "Vercel Cron runs them daily" (`components/internal/screens/automations/scheduled_jobs.jsx:121`). CORE 0.10 owns that fix; don't duplicate it.
- *Permissions:* `property.automation.manage` to edit; financial steps also need `property.accounting.post`.

**Steps**
1. Conditions v2 (groups, custom fields) plus the UI.
2. Retries in the runner, re-run, Run History detail.
3. `update_field`, `assign`, `add_note`.
4. `post_charge` (with permission check and idempotency).
5. `call_webhook` (after PLAT-10).
6. `branch`.
7. `request_approval` plus the approvals list.
8. New triggers via `record_event_trigger` extensions.
9. Templates that use them, for example "Late fee on day 5" (the fee step finally backs the landing claim, PLAT-02 row 11).

**Research before building**
- How Buildium and AppFolio automations, Zapier paths and n8n model branching and retries. Keep the same mental model.
- Whether `record_items` can carry tasks or a dedicated `property.tasks` table is needed. Check that the name is free in the live DB.

**Acceptance criteria**
- `(status = late AND balance > 100) OR priority = Urgent` evaluates correctly in unit tests over 12 cases.
- A `post_charge` step run twice for the same run posts once, and the ledger stays balanced.
- A step that throws retries three times with backoff and then fails. "Retry" re-runs from the failed step without repeating earlier side effects.
- A branch routes to the right path, and the Run History drawer shows each step's input and output.

**Depends on / unblocks**
- **Depends on:** CORE-10 (gap 0.10) (crons), PLAT-01, PLAT-10 (webhook step), PLAT-14 (custom-field conditions).
- **Unblocks:** CORE approvals (gap 6.2); COMM collections workflows; PLAT-18 (action registry).

#### PLAT-14 · Custom fields in lists, filters, reports, templates and automations
- **MRI equivalent:** the field-level part of Application Studio and Application ToolKit (add fields and views that persist through upgrades). Full Page Builder and Logic Builder parity is out of scope (see Not building here).
- **Status · priority · effort:** Partial · P2 · L
- **Refs:** Gap 9.8 · Inventory 9.23, 9.24, 2b.39 · PMX-9.11, PMX-9.13

**Geiger today**
- 11 field types across 10 entities are defined in settings key `custom_fields` (`components/internal/screens/settings/shared.js:104-131`).
- Values are stored as `metadata.cf_<id>` and rendered only as an editor section (`components/internal/screens/entity/sections/factories.jsx:497-569`, used for example at `maintenance/work_order_sections.jsx:260` and `owners/config.jsx:451`).
- Custom fields don't reach list columns, filters, search, reports, lease or notice merge fields (lease documents print `[key]`: `lib/leasing/merge.js:173`, inventory 2b.39), message merge fields (`lib/messaging/merge_fields.js:81`) or automation conditions (`lib/automations/catalog.js:134-186`).

**What's missing**
- Custom fields as first-class citizens: list columns and filters, search, report columns, merge fields, automation conditions and `update_field`, import and export, and the API.

**How to build**
- *Server logic:*
  - New `lib/custom_fields.js`: move `customFieldDescriptor` out of `factories.jsx:502-516`, and add:
    - `loadCustomFields(entity)` (cached `getSetting("custom_fields")`)
    - `cfValue(row, def)`
    - `cfColumn(def)` (DataTable column with type-aware render)
    - `cfFilter(def)` (options, switch or date range)
    - `cfMergeTokens(entity)`
  - Give each definition a stable `key` slug for tokens (`{{cf.pet_policy}}`) and keep `cf_<id>` storage.
- *UI:*
  - `EntityListScreen` gets a "Columns" picker (config columns plus custom fields; saved per user in `localStorage`, or project defaults in settings key `list_views`) and custom-field filters added to `config.filters`.
  - The search index (PLAT-05) includes text custom fields.
- *Reports:* entity-based report definitions (Rent Roll, Tenant directory views in `lib/reports/defs_operations.js`) accept `customFields: ["tenants", "leases", "units"]`, which adds optional columns and CSV output.
- *Templates:* `lib/leasing/merge.js` and `lib/leasing/notice_templates.js` resolve `{{cf.<key>}}` from the lease, tenant and unit, which fixes the `[key]` output. `lib/messaging/merge_fields.js` adds a "Custom fields" group.
- *Automations:* `CONDITION_FIELDS` loads the custom fields per record type, and PLAT-13's `update_field` step targets them.
- *Data I/O and API:* the PLAT-03/04 catalogue and PLAT-11 resources include `custom_fields` from the definitions.
- *Validation:* the server checks required and typed custom fields in import and the API.

**Steps**
1. `lib/custom_fields.js` plus the column picker and filters.
2. Merge tokens (lease, notice, messages).
3. Report columns.
4. Automation conditions.
5. Search.
6. Import, export and API (land with PLAT-03 and PLAT-11).

**Research before building**
- Whether filtering on `metadata->>'cf_x'` needs indexes at 500 units. Expected no: lists load the project's rows client-side.
- AppFolio and Buildium custom-field limits and types, to match import expectations.

**Acceptance criteria**
- A Select field "Pet policy" on Leases appears as a list column, filters the list, prints in a generated lease via `{{cf.pet_policy}}`, appears as a Rent Roll column and CSV field, and works as an automation condition.
- Deleting a definition hides it everywhere without losing stored values.

**Depends on / unblocks**
- **Depends on:** none (PLAT-05, 03 and 13 integrate it).
- **Unblocks:** PLAT-03 (import custom columns), PLAT-13 (conditions), PLAT-11.

#### PLAT-15 · Consent registry, privacy requests and anonymization
- **MRI equivalent:** PMX "Data Consent Acknowledgement" wherever prospect, applicant or resident data is entered; a "Marketing Consent" flag; "Request to Anonymize Data" with a printable letter; and "Data Anonymization", which replaces all PII with redacted data (X.5).
- **Status · priority · effort:** Partial (scattered flags) / Missing · P2 for the consent registry (COMM's SMS work needs it), P3 for anonymization · L
- **Refs:** Gap 8.4 · Inventory 4.49, 4.50, 9.52 · PMX-8.13

**Geiger today**
- Consent is scattered across unrelated metadata flags:
  - prospects "Consented to texts" and "Do not contact" (`components/internal/screens/marketing/prospects.jsx:107-108`)
  - application "Applicant consent on file" and its date (`marketing/sections/application_sections.jsx:251-252`)
  - waitlist "Consented to opening alerts" (`marketing/waitlist.jsx:139`)
  - portal SMS opt-in stamping `smsConsentOn` (`lib/portal/common.js:222`)
  - rent-reporting consent (`tenants/sections/insurance.jsx:55-61`)
  - tenant communication preferences (`tenants/config.jsx:303`)
- No sender reads them (inventory 4.50).
- Data minimization exists: only the last 4 digits of SSN/ITIN, TIN and ID numbers are stored (inventory 9.52).
- There is no privacy-request workflow, deletion or anonymization. Soft delete keeps all PII.

**What's missing**
- **One consent model** with evidence: purpose, channel, timestamp, the exact text shown, and source.
- **Privacy requests:** access, delete, correct, opt-out, each with a due date.
- **An anonymization routine** that keeps the ledger intact, plus retention rules and legal holds.

**How to build**
- *Data model* (migration `privacy_consents`):
  - **`property.consents`**:
    - who: `project_id`, `party_type` (`tenant | prospect | applicant | owner | vendor | occupant`), `party_id`
    - what: `purpose` (`sms_transactional | sms_marketing | email_marketing | screening | rent_reporting | data_processing`), `status` (`granted | revoked`), `channel`
    - provenance: `source` (`portal | application | staff | import | api`), `evidence jsonb` (text version, IP, user agent, document id)
    - timing: `granted_at`, `revoked_at`
  - **`property.privacy_requests`**:
    - who and what: `party_type`, `party_id`, `requester_name`, `requester_email`, `type` (`access | delete | correct | opt_out`)
    - lifecycle: `status` (`received | verifying | in_progress | completed | denied`), `received_at`, `due_at` (45 days by default), `verified_at`, `completed_at`
    - outcome: `denial_reason`, `letter_document_id`, `notes`
  - Backfill: copy the existing flags into `consents`.
  - RLS: `property.privacy.manage` for requests. `consents` are readable by members and writable through the server and the portal API.
- *Server logic:*
  - `lib/privacy/consent.js` provides `hasConsent(db, party, purpose)` and `recordConsent(...)`. COMM's sending path (gap 4.1, inventory 4.50) must call `hasConsent` before SMS or marketing email.
  - `lib/privacy/requests.js`:
    - **Access** returns a per-party export through the PLAT-04 serializer filtered to the party.
    - **Delete** calls `property.anonymize_party(p_party_type, p_party_id, p_request_id)` (security definer; service role only, through `app/api/privacy/requests/[id]/execute` with `property.privacy.manage`). It:
      - replaces PII columns with redacted values ("Former resident #a1b2c3")
      - nulls email, phone, date of birth, last-4 fields, addresses, emergency contacts, and occupants, vehicles and pets in `record_items`
      - redacts message bodies (`thread_messages`, `tenant_communications`)
      - deletes the party's files from storage and soft-deletes the document rows
      - revokes `portal_members` rows
      - **never** touches ledger amounts, dates or ids. Ledger memos that contain the name are scrubbed through a narrow exception in the PLAT-01c ledger guard (memo only, flag `property.anonymize = on`).
    - Audit rows for the party have PII keys removed by the same function, and the function logs its own audit row.
  - **Legal holds:** `metadata.legalHold` on a tenant or lease (open dispute, eviction, unrefunded deposit) blocks deletion. Retention settings decide the earliest anonymization date.
- *UI:*
  - Settings → "Privacy": a requests list, a request detail (verify, export, execute, letter generated as a document), and retention settings.
  - A consent history panel in the tenant, prospect and applicant editors.
  - The portal profile writes consents with evidence (`components/portal/shared/portal_profile.jsx`).
- *Permissions:* `property.privacy.manage` (Owner only by default).

**Steps**
1. Consent table, backfill, `hasConsent`, and the portal and staff capture points.
2. COMM wires `hasConsent` into sending (cross-item).
3. Privacy requests, plus access export.
4. Anonymization function with tests that prove the ledger is unchanged.
5. Retention and legal holds.

**Research before building**
- **CCPA/CPRA applicability.** Check the current revenue threshold (CPPA-adjusted; about $26.6M as of 2025, verify) and the 100,000-consumer test, and which of the roughly 20 state privacy laws reach small landlords. Most exempt small businesses, so Geiger mainly needs to act well as a service provider (processor) for larger customers.
- **TCPA consent rules for SMS**, including the 2025 FCC "revoke by any reasonable means" rule. Coordinate with COMM.
- **Retention minimums:**
  - IRS records: 7 years.
  - State security-deposit record rules.
  - FCRA adverse-action records for screening (RISK).
  - Fair-housing guidance on keeping applications.
- **Contract.** A data processing addendum template for customers (legal, outside code).

**Acceptance criteria**
- An SMS to a tenant without `sms_transactional` consent is blocked and logged (once COMM ships SMS). Revoking from the portal takes effect immediately.
- Anonymizing a former tenant:
  - removes their name, email and phone from every table, file and audit row
  - leaves every ledger line's amount, account, date and `tenant_id` intact, so the trial balance and AR aging are unchanged
- A tenant with a legal hold can't be anonymized.
- Access requests produce a ZIP of only that party's data.

**Depends on / unblocks**
- **Depends on:** PLAT-01 (01c guard exception), PLAT-04 (serializer), PLAT-09 (audit).
- **Unblocks:** COMM SMS and marketing email (consent checks), RISK (screening consent evidence).

**Open decisions**
- **Default retention** after move-out before automatic anonymization, if any (for example 7 years)? Or should anonymization be manual-request only?

#### PLAT-16 · BI access: OData/REST feed and scheduled warehouse export
- **MRI equivalent:** direct SQL access. MRI trains clients in "SQL Queries I/II", and Power BI connects to the PMX SQL database (depends on hosting).
- **Status · priority · effort:** Missing · P3 · M
- **Refs:** Gap 7.7 · Inventory 7.29 · PMX-7.13

**Geiger today:** no BI connector or warehouse export. The demo-open PostgREST is a security gap, not a BI path (inventory 7.29).

**What's missing:** a supported way to pull data into Power BI, Excel or a warehouse.

**How to build**
- *No direct SQL.* The database is the suite-shared multi-tenant Supabase project; it can't be safely handed out as a per-customer SQL login.
- *Data model:* a `property_reporting` set of `security_invoker` views (flattened rent roll, AR aging lines, GL detail with account names, work orders, leases) that respect RLS. They serve both feeds and future reports.
- *Feed A:* read-only OData v4 or REST endpoints under PLAT-11 (`/api/v1/reporting/<view>` with `$filter`, `$top` and `$skip` subsets, and `reporting:read` scope). Power BI and Excel connect with a key header.
- *Feed B:* a nightly `warehouse-export` job writing Parquet or CSV of the views to customer storage (S3, GCS or Azure Blob with credentials in `property.integration_secrets`), or a signed-URL drop. The PLAT-04 serializer is reused.
- *UI:* Integrations → "BI and data warehouse" card (PLAT-12).
- *Permissions:* `property.data.export`.

**Steps**
1. Reporting views.
2. REST and OData endpoints.
3. Warehouse export job.
4. Docs for Power BI and Excel connection.

**Research before building**
- Power BI Web and OData connector authentication options with API-key headers.
- Whether an OData subset library for Node is worth it, versus REST with Power BI's Web connector.
- Parquet writer options in Node.

**Acceptance criteria**
- Power BI Desktop loads the rent-roll feed with an API key, and the totals match the in-app Rent Roll report.
- The nightly export lands in a test S3 bucket with a manifest.
- A key scoped to Property A only (PLAT-08) exports only A.

**Depends on / unblocks**
- **Depends on:** PLAT-11, PLAT-04, PLAT-08 (scope).
- **Unblocks:** CORE custom reporting (gap 7.2) can share the views.

#### PLAT-17 · Shareable configuration kits (MAX-style)
- **MRI equivalent:** MRI Application eXchange (MAX), a client exchange for "reports, pages, and views… utilities and entire apps" (over 3,400 customizations).
- **Status · priority · effort:** Missing · P3 · M
- **Refs:** Gap 9.10 · PMX-9.14

**Geiger today**
- Built-in workflow templates are code constants (`lib/automations/catalog.js:289+`).
- Lease templates, notice templates, message templates, custom fields, fee policies and roles live per project.
- Nothing is shareable between projects.

**What's missing:** a way to export a project's setup and import it into another project, plus a curated library.

**How to build**
- *Server logic:* `lib/kits/{export,import,validate}.js`. A kit is versioned JSON: `{ kit, version, geigerSchema, items: { automations, customFields, leaseTemplates, noticeTemplates, messageTemplates, feePolicies, roles, reportSchedules } }`.
  - The export strips ids, secrets and recipients.
  - The import remaps references, previews the changes, and creates drafts (automations land paused).
- *Library:* curated kits in the repo (`lib/kits/library/*.json`, for example "Single-family starter" and "Multifamily collections"), shown in the PLAT-03 "Import & Export" screen. A suite-wide public exchange comes later.
- *Permissions:* `property.settings.manage`.

**Steps**
1. Export and import of automations plus custom fields.
2. Templates and policies.
3. Curated library.
4. Public exchange (later; suite-level).

**Research before building:** whether other suite products (Flow templates, Forms templates) already have a template-sharing format to align with.

**Acceptance criteria**
- Exporting project A's kit and importing it into an empty project B recreates the automations (paused), custom fields and templates with no dangling ids.
- Secrets and email recipients aren't included.

**Depends on / unblocks**
- **Depends on:** PLAT-14, PLAT-13.
- **Unblocks:** faster onboarding (INTL self-serve).

#### PLAT-18 · AI groundwork and hook points (no AI features)
- **MRI equivalent:** the MRI Agora suite:
  - Ask Agora: natural-language questions over the PMX database (Mar 2024), relaunched as a cross-product "AI companion" (Oct 2025)
  - Page Assistance
  - Agora Orchestrator agents, including month-end reconciliation
  - Agora Intelligence role-based daily briefings (Jun 2026)
  - Agora Voice (3 Nov 2026)
  - Engage Protect AI fraud checks
  - AI-suggested replies
- **Status · priority · effort:** Missing · Deferred (Skip under the standing no-AI decision) · M for the groundwork
- **Refs:** Gaps 10.1–10.7 · Inventory 10.1–10.12 · PMX-10.01, 10.03, 10.04, 10.14, 10.15, 10.18, PMX-3.42

**Geiger today**
- No AI code or dependency (inventory 10.2).
- The "AI Assistant" nav item (`components/internal/sidebar/sidebar_nav.jsx:208`) isn't in the registry, so it falls back to `ComingSoonScreen` (`components/internal/screens/registry.jsx:85-87`; `components/internal/screens/coming_soon.jsx:14-22`).
- Suite prior art:
  - geiger-events ships an MCP server that verifies Supabase OAuth tokens carrying `client_id` (`C:\Pro\geiger-events\lib\mcp\auth.js:16-31`, `lib/mcp/server.js`, `app/api/mcp/route.js`)
  - geiger-dash has `public.mcp_connections` (per-user AI-client project ids and read/write access; writes blocked for `client_id` tokens) and `public.mcp_audit_log` (`C:\Pro\geiger-dash\supabase\migrations\20261030063218_mcp_connections.sql:15-90`)

**What's missing:** the non-AI plumbing a future suite AI package will need, so AI can be added without re-plumbing.

**How to build** (groundwork only; mostly delivered by other items)
- **Event stream.** `property.automation_events` is the single domain-event stream. Add `lib/events/catalog.js` (names, typed payload builders) shared by automations, webhooks (PLAT-10) and a future AI consumer, and add `actor_id` to the events.
- **Structured context endpoints.** New pure builders `lib/context/{tenant,lease,unit,property,work_order,owner,vendor}.js` return a compact, typed summary: balance from the ledger (after CORE-07 (gap 0.7)), lease terms, open work orders, last messages, consents (PLAT-15).
  - They are reused now by the portal overview and by PLAT-11 `?expand=summary`.
  - Later they back the AI page assistant, keyed by `useWorkspaceUrl()` tab and `itemId`.
- **Permission-aware retrieval.** A rule recorded in the conventions: AI reads Property only through the user's JWT (RLS from PLAT-01) or a scoped API key (PLAT-11), never the service role. A Property MCP endpoint would copy events' token check and log to dash's `mcp_audit_log`.
- **Action registry.** `lib/automations/actions.js` exports the PLAT-13 step executors as typed actions: `{ key, inputSchema, permission, idempotent, requiresApproval }`.
  - An agent proposes a draft action, a human approves it (the `request_approval` step), and PLAT-09 records it.
  - This is the Orchestrator pattern without AI.
- **UI slot.** Add an explicit `"AI Assistant": AssistantComingSoon` registry entry, so the suite package can replace a single component. Its copy says what's planned and doesn't over-promise (PLAT-02).

| MRI AI feature | Gap | Future hook in Geiger |
|---|---|---|
| Ask Agora (questions over data) | 10.1 | PLAT-11 read API and PLAT-16 reporting views as the query surface; PLAT-05 index for entity lookup; RLS-bound retrieval |
| Page Assistance | 10.2 | `lib/context/*` builders plus the registry slot; current record from `useWorkspaceUrl` |
| Month-end reconciliation agent (Orchestrator) | 10.3 | `ledger_subledger` RPC; CORE period close (gap 6.1); PLAT-13 actions with `request_approval`; PLAT-09 audit |
| Agora Intelligence briefings; AI collections | 10.4 | Event stream plus scheduled reports job (`lib/jobs/scheduled_reports.js`); PLAT-13 collections workflow; AI would only rank and draft |
| Agora Voice / voice agent | 10.5 | PLAT-11 write endpoints (prospects, showings, work orders); LEAS availability data; COMM telephony adapter |
| AI fraud detection | 10.6 | RISK screening adapter: provider-side AI results stored as screening outcomes |
| AI-suggested replies | 10.7 | COMM staff inbox plus a message context builder; a "draft" status on outbound messages so nothing auto-sends |

**Steps**
1. `lib/events/catalog.js` (with PLAT-10).
2. `lib/context/*` builders, starting with tenant and work order, used by the portal overview.
3. `lib/automations/actions.js` (with PLAT-13).
4. Registry slot.
5. Write the retrieval rule into `conventions/MODULE_CONVENTIONS.md`.

**Research before building**
- Track the suite AI package's interface (no repo yet). The MCP tool shape in `C:\Pro\geiger-events\lib\mcp\tools.js` is the closest existing contract.

**Acceptance criteria**
- The tenant context builder returns the same balance as the ledger for 20 demo tenants.
- Every PLAT-13 action has a schema, a permission and an idempotency flag.
- No code path gives AI-facing endpoints service-role reads.

**Depends on / unblocks**
- **Depends on:** PLAT-01, PLAT-09, PLAT-10, PLAT-11, PLAT-13.
- **Unblocks:** the future suite AI package.

**Open decisions**
- **Positioning risk.** MRI bundles AI even in its small-agency Property Tree (AI invoice processing in every tier) and launched Agora Voice on 3 Nov 2026. Revisit the no-AI decision after launch.
- **Property MCP endpoint.** Is exposing one (customers' own AI tools reading through RLS, as events does) allowed under the no-AI decision? It adds no AI inference to Geiger.

### Not building here
| MRI product | Why not | Revisit trigger |
|---|---|---|
| Application Studio in full (Page Builder, Logic Builder, Configuration Console) and Application ToolKit (custom tables and screens) | Enterprise low-code. The 10–500 unit buyer needs custom fields and workflows (PLAT-13, PLAT-14), not custom apps | Customers above ~2,000 units asking for custom screens or objects |
| MIX SOAP and flat-file SFTP exchange | REST, webhooks and CSV import/export (PLAT-03, 04, 10, 11) cover the need; SOAP is legacy | A required partner only accepts SFTP drops |
| MRI Application eXchange as a public marketplace | No customer community yet; PLAT-17 kits cover sharing | 100+ active customers asking to share setups |
| Direct SQL access to the database | Shared multi-tenant Supabase DB; can't be scoped per customer | A dedicated-database enterprise tier |
| Agora AI features (Ask Agora, Intelligence, Orchestrator, Voice, fraud AI, suggested replies) | Standing no-AI decision; a future suite AI package provides inference | Suite AI package ships, or the post-launch positioning review (PLAT-18) |
| Okta-specific federation and Agora Control Hub | Generic SAML/OIDC through dash (PLAT-06) covers it | An enterprise deal that requires it |
