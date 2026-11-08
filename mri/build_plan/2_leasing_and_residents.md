# 2. Leasing and residents (the Engage suite)


---

## Part A — Leasing front office

### Scope
- **MRI products covered:**
  - Engage CRM (guest cards, lead management, global guest cards, marketing-source reporting)
  - Engage Apply (formerly Prospect Connect)
  - Engage Broadcast (formerly Market Connect), plus the legacy Pricing & Availability pages
  - Engage Secure Sign
  - Engage Interact call and ad tracking (formerly Callmax)
  - ApartmentData
  - Blue Moon lease forms (partner)
  - Core RM leasing features: reservation fee, lease amendments, Lease Renewal Worksheet, unit transfers
- **Geiger areas touched:**
  - Marketing and lead screens: `components/internal/screens/marketing/*`
  - Leasing screens: `components/internal/screens/leasing/*`
  - Data layers: `lib/supabase/{listings,prospects,showings,applications,esign,lease_addenda,lease_templates,renewals,rent_comps,record_items}.js`
  - `lib/leasing/{workflows,merge}.js`, `lib/messaging/*`, `lib/payments/*`, `lib/ledger/*`, `lib/portal/*`, `lib/reports/defs_operations.js`, `lib/jobs/*`
  - New public routes under `app/`
  - Portal role `applicant`
- **Cross-checked against HEAD `fecb165`.** Every `path:line` below was opened. Where the code differs from the inventory or gap report, the item says so.

### Summary
| ID | Feature | MRI product | Geiger today | Priority | Effort |
|---|---|---|---|---|---|
| LEAS-01 | Public listing, availability and property pages fed from the system | Engage Broadcast; Pricing & Availability pages | Done | P1 | L |
| LEAS-02 | Lead intake from web, listing-site email, phone and walk-in, with attribution | Engage CRM | In progress (WIP on item/LEAS-02) | P1 | M |
| LEAS-03 | Message prospects from the UI (email now, SMS on Part B's provider), with consent enforced | Engage CRM; Engage Interact | Partial | P1 | M |
| LEAS-04 | Applicant account and portal role: one login from applicant to resident | Engage Apply + Engage Connect | Missing | P1 | M |
| LEAS-05 | Online application: mobile-first, configurable steps, save and resume, uploads, disclosures | Engage Apply | Missing | P1 | L |
| LEAS-06 | Co-applicants, cosigners and guarantors join by link | Engage Apply | Missing | P1 | M |
| LEAS-07 | Application fees collected through Stripe, posted to the ledger, refunded, capped by state | Engage Apply + Engage Pay | Tracking-only | P1 | M |
| LEAS-08 | Lease document as PDF with addenda merged | Report Gateway / Blue Moon PDF | Done | P1 | M |
| LEAS-09 | E-signature provider adapter: staff send, webhook status, signed copy filed | Engage Secure Sign | Tracking-only | P1 | L |
| LEAS-10 | Signing inside the resident portal (leases, renewals, amendments) | Secure Sign inside Apply/Connect | Missing | P1 | M |
| LEAS-11 | Listing-site syndication: MITS feed, channel adapters, lead return | Engage Broadcast | Tracking-only | P1 | L |
| LEAS-12 | Duplicate leads: detect, merge, and one guest card across properties | RM global guest cards; Engage CRM | Missing | P2 | M |
| LEAS-13 | Holding deposit or reservation fee, unit hold, and a move-in gate until paid | RM reservation fee | Tracking-only | P2 | M |
| LEAS-14 | Prospects self-schedule tours, with confirmations and reminders | RM appointments; Agora Voice | Missing | P2 | M |
| LEAS-15 | Leasing and marketing-source analytics | Engage CRM; Engage Interact reports | Partial | P2 | M |
| LEAS-16 | Lease amendments flow (rent, concessions, fees, items, terms, parties) | RM Lease Amendments | Missing | P2 | L |
| LEAS-17 | Unit transfers with balance and deposit transfer | RM transfers | Missing | P2 | L |
| LEAS-18 | Bulk renewal offers (renewal worksheet) | RM Lease Renewal Worksheet | Missing | P2 | M |
| LEAS-19 | State lease forms (partner forms or a vetted library) | Blue Moon (partner) | Partial | P2 | M |
| LEAS-20 | Call tracking numbers, recording and call log | Engage Interact | Saved-unused | P3 | L |
| LEAS-21 | Market rent data feed | ApartmentData | Partial | P3 | M |

Count: P1 = 11, P2 = 8, P3 = 2.

### Build order
**Before LEAS-01:** PLAT-01 (data security) must land. LEAS-01, 02, 04, 05, 06, 07, 10, 11 and 14 expose data or accept input publicly. Today anon has open RLS on every table, documents sit in the public `products` bucket, and portal uploads are public too (`lib/portal/constants.js:39-41`).

**Phase 1: the public front door (P1)**
1. **LEAS-01** public pages. This is the single public serializer that LEAS-11 feeds and LEAS-14 tours reuse.
2. **LEAS-02** lead intake. Needs the LEAS-01 inquiry form. Start the inbound-email provider decision on day 1.
3. **LEAS-03** prospect messaging. Email works now. SMS waits for Part B's SMS adapter (LEAS-44). Consent checks come from LEAS-40.

**Phase 2: apply online (P1)**
4. **LEAS-04** applicant identity. Changes `portal_members`.
5. **LEAS-05** application flow.
6. **LEAS-06** co-applicants by link.
7. **LEAS-07** application fees. Needs the Stripe money-flow decision; see Open decisions.
   - Hand-off: RISK-08/RISK-09 screening hooks into LEAS-05's submit event ("screening starts on submit"). RISK-10 supplies the fee rules LEAS-07 enforces.

**Phase 3: sign the lease (P1)**
8. **LEAS-08** PDF and addenda.
9. **LEAS-09** e-sign adapter. Needs the interim provider choice.
10. **LEAS-10** portal signing.
    - LEAS-45 (Part B online renewal acceptance) reuses LEAS-09 and LEAS-10.

**Phase 4: syndication (P1, started early)**
11. **LEAS-11** syndication. Built after LEAS-01 and 02 because it reuses their serializer and lead parser. File the partner-program applications in week 1: approvals take weeks and gate go-live, not the build.

**Phase 5: grow (P2)**

| Order | Item | Needs |
|---|---|---|
| 12 | LEAS-12 dedupe | LEAS-02 normalized contact columns |
| 13 | LEAS-13 reservation fee | LEAS-07 |
| 14 | LEAS-14 tours | LEAS-01, 02; CORE-10 (scheduled jobs run), for reminders |
| 15 | LEAS-15 analytics | LEAS-02 attribution, LEAS-03 response times |
| 16 | LEAS-16 amendments | CORE-01 billing write path, CORE-05 concessions, CORE-04 deposits, CORE-03 recurring charges, CORE-60 rentable items, HOUS-10 caps |
| 17 | LEAS-17 transfers | CORE-01, CORE-02 (billing stops at move-out), CORE-04; reuses LEAS-16's apply engine |
| 18 | LEAS-18 renewal worksheet | CORE-01 (renewal acceptance must repoint billing), HOUS-10 / HOUS-11 (caps, notice periods) |
| 19 | LEAS-19 state forms | LEAS-08, LEAS-09 |

**Phase 6: enterprise (P3)**
20. **LEAS-20** call tracking.
21. **LEAS-21** market rent feed.

**New tables:** before creating any table named here, run this against the live DB and confirm the name is free; about 80 orphan tables exist from a deleted branch:

```sql
select table_name from information_schema.tables where table_schema='property' and table_name in (...)
```

Known orphans include `portal_accounts` and `portal_branding` (`supabase/migrations/20261015215447_portal_members_access.sql:7`). Names proposed here:
- `leasing_sites`
- `esign_events`
- `lease_amendments`
- `unit_transfers`

**Schema drift:** the live schema has columns that no file in `supabase/migrations/` creates:
- `property.listings`: `headline`, `deposit`, `sqft`, `description`, `contact_*`, `syndicated`, `lease_id`, `property_label`, `available_on`. The data layer also maps `virtual_tour_url` (`lib/supabase/listings.js:22`), which no migration creates. The live-schema seed writes the others (`supabase/seeds/demo_project/02_leasing.sql:5`), but the only DDL is `supabase/migrations/20261010165221_full_build_tables.sql:320-350`.
- `property.esign_requests`: `sent_at`, `signed_at`, `project_id` (seed `02_leasing.sql:417`).

Every migration below uses `add column if not exists` so it works on both the live DB and a fresh one.

**Staff routes:** every new staff route uses PLAT-01f's `requireStaff(request, projectId, { permission })` (`lib/auth/staff.js`), which falls back to today's `lib/messaging/auth.js:22` until PLAT-01f moves it. Every public route sits behind Turnstile and a Vercel WAF rate limit, and reads through the service-role client only.

**Files:** private files go to PLAT-01g's `property-files` bucket. Only what public pages show (listing photos, property covers, brand logos) goes to `property-public`.

### Items

#### LEAS-01 · Public listing, availability and property pages
- **MRI equivalent:** Engage Broadcast. It pushes availability and pricing to the property's own website and to listing sites. The legacy Pricing & Availability pages were hosted, branded vacancy pages where a prospect could request a unit and hand off to the online application.
- **Status · priority · effort:** Missing · P1 · L
- **Refs:** Gap 2.2 · Inventory 2a.3, 2a.5, 2a.7, 2a.9, 2a.12 · PMX-2.01, PMX-2.06, PMX-2.11

**Geiger today**
- **Publish is internal only.** The action is `setPublished()` at `components/internal/screens/marketing/listings.jsx:201-211`. It writes `status: "Active"` and `metadata.syndication`; the log line says "internal — no syndication provider connected".
- **No public route.** `app/` holds only `org`, `pallet`, `playground`, `portal`, `project`, the landing page and the API.
- **What a public page would draw on:**
  - Listing content is rich: the field sets at `listings.jsx:106-197`, specials and effective rent at `components/internal/screens/marketing/sections/listing_sections.jsx:72-155`, and fee fields at `listing_sections.jsx:102-111`.
  - Photos are `media` rows (`lib/supabase/media.js:12-31`), set up by the `photos: MediaSection` mapping at `listings.jsx:468`.
- **Data access is browser-only.** The listing data layer (`lib/supabase/listings.js:5-30`, through `entity_factory.js`) uses the browser anon client and is project-scoped by a module global (`lib/supabase/project_scope.js:5-19`). There is no server read path.
- **Routing is ready for public pages.** `proxy.js:3-5` → `utils/supabase/middleware.js` only refreshes sessions and never gates, so public routes work. In production the app is served under `/property` (`next.config.mjs:7`).

**What's missing**
- A public, crawlable page for each active listing, each property's availability and each company's vacancy search.
- A strict serializer, so internal metadata (notes, agent, tracking alias, ad spend) never leaks.
- A clear disclosure of every mandatory fee, the published screening criteria, and the Equal Housing Opportunity statement.
- CTAs for "Ask a question" (→ LEAS-02), "Book a tour" (→ LEAS-14) and "Apply" (→ LEAS-05).
- A JSON endpoint and an embeddable widget, so a landlord's existing site can show vacancies.
- SEO: metadata, JSON-LD and a sitemap.

**How to build**
- *Data model.* Migration `leasing_sites`, scaffolded with `npm run db:new -- leasing_sites --template table`:
  - **Table `property.leasing_sites`:** one per project, plus the standard columns.

    | Column | Type / constraint |
    |---|---|
    | `project_id` | uuid, unique, FK `public.projects` |
    | `handle` | text, unique, `^[a-z0-9-]{3,40}$` |
    | `enabled` | bool, default false |
    | `display_name` | text |
    | `brand` | jsonb: logo url, accent colour, hero image |
    | `contact` | jsonb: phone, email, office hours |
    | `feed_token` | text, for LEAS-11 |
    | `custom_domain` | text, null, kept for later |

  - **Listings:** add `slug text`, unique per project (`create unique index … on property.listings (project_id, slug) where deleted_at is null`), and `published_at timestamptz`.
  - **RLS:** open demo policy now, like every table; PLAT-01 tightens it. The public site never reads through anon. It reads only through the server admin client.
- *Server logic.* New `lib/leasing/public/site.js`, server-only:
  - `getSiteByHandle(handle)`.
  - `listPublicListings(site, { propertyId, beds, maxRent, moveInBy, pets })`: Active listings whose `metadata.syndication.website.enabled` is true, with `deleted_at is null`.
  - `getPublicListing(site, slug)`.
  - `publicPropertyAvailability(site, propertyId)`.
  - Two sources feed fees and screening criteria:
    - `resolveApplicantFees` from LEAS-07
    - the published screening criteria: RISK-04's `publishedCriteriaText` policy (property → company cascade); until RISK-04 lands, the company `screening_criteria` setting (`components/internal/screens/marketing/flows.js:69-72`)
  - New `lib/leasing/public/serialize.js`: `serializePublicListing(row, { media, specials, fees, site })`.
    - An **allowlist** of fields: never spread `metadata`.
    - Effective rent reuses `effectiveRent()`. Move it from `listing_sections.jsx:73-87` into `lib/leasing/pricing.js` so the server can import it.
    - LEAS-11's MITS and Zillow formats map from this output.
  - `ensureListingSlug(listing)`: called by `setPublished()`.
- *API routes / jobs:*
  - `app/l/[handle]/page.js`: vacancy search, server-rendered. Filters live in search params.
  - `app/l/[handle]/[slug]/page.js`: listing detail.
    - Gallery, rent and effective rent, a fee table, specials, availability, the pet policy, features, a map (Leaflet is already a dependency) and the tour/virtual-tour links.
    - Includes an inquiry form, Apply and Book-tour buttons, `generateMetadata`, and JSON-LD (`Apartment` / `SingleFamilyResidence` + `Offer`).
    - A Leased or Archived listing returns a "no longer available" page with links to similar units (HTTP 410).
  - `app/l/[handle]/p/[propertyId]/page.js`: one property's availability.
  - `app/l/[handle]/embed/page.js`: a chrome-less list for iframes.
  - `app/api/public/listings/[handle]/route.js`: JSON with an origin-wide CORS GET.
  - `app/l/[handle]/sitemap.js`.
  - Cache public reads and invalidate them when a listing changes. Check `node_modules/next/dist/docs/` for the Next 16 caching API first (`revalidateTag` / `updateTag` / `cacheTag`). `node_modules` isn't installed at HEAD, so run `npm i` before reading.
- *UI:*
  - **Settings → Branding & Portals:** add a "Leasing website" `SectionCard` with the handle, enable switch, display name, contact, and a preview link.
  - **Listing editor:** a "Public page" card on Overview (`ListingOverviewSection`, `listing_sections.jsx:290-361`) showing the live URL, copy link and QR code. It shows a "Not public" reason when the site is disabled, the website channel is off or the status isn't Active.
  - **`setPublished()`** also calls `ensureListingSlug` and stamps `published_at`.
  - Public pages are a separate, minimal layout (`app/l/layout.js`): `@geiger/ui` tokens, mobile-first, no workspace chrome. Use `LogoLoading` only for Suspense fallbacks.
- *Permissions:* add `leasing.publish` ("Publish listings to the public site and listing sites", group "Leasing controls", inherits `view.listings`) to `WORKSPACE_PERMISSIONS` (`lib/rbac.js:4-15`). Gate the Publish action (`listings.jsx:354`) on it.
- *Integrations:* none.

**Steps**
1. Write the migration (`leasing_sites`, `listings.slug`, `listings.published_at`), with a backfill of slugs for existing Active listings.
2. Move `effectiveRent` into `lib/leasing/pricing.js`; re-export it from `listing_sections.jsx`.
3. Build `site.js` and `serialize.js`, with unit tests (allowlist, fee table, a leased listing).
4. Build the public routes, layout and metadata/JSON-LD.
5. Add the settings card and the listing "Public page" card. Hook `setPublished`.
6. Add the JSON endpoint and embed page.
7. Verify with the demo project (`ebcc7910…`): enable the site, publish two listings, open them logged out.

**Research before building**
- Next 16 caching and `sitemap.js` conventions under `basePath` (`node_modules/next/dist/docs/`).
- Fair-housing advertising rules:
  - HUD's Equal Housing Opportunity logo and statement (24 CFR Part 110).
  - HUD's 2024 guidance on advertising through digital platforms: https://www.hud.gov/sites/dmd/documents/FHEO_Guidance_on_Advertising_through_Digital_Platforms.pdf
- All-in fee disclosure for rental ads. Start with California SB 611 (Civil Code 1950.6 / 1947.3) and Colorado HB25-1090 (pricing transparency, effective 2026). Decide what the fee table must show.
- schema.org types for rentals (`Apartment`, `Offer`, `RentAction`); check Google's guidance on rental listing structured data.
- WCAG 2.1 AA for public pages: the DOJ ADA Title II web rule (2024) is a guide for private landlords' expectations.

**Acceptance criteria**
- Signed out, `/l/<handle>/<slug>` renders server-side HTML for an Active listing with the website channel on.
  - It returns 404 for Draft or Paused listings, 410 for Leased or Archived, and 404 when the site is disabled.
- **No leaks:** the page HTML and JSON contain none of these keys: `trackingEmail`, `marketingBudget`, `campaign`, `notes`, `agent`, `showingInstructions`, `contactNotes`, `pricingNotes`, `furnishingsInventory`.
- The fee table lists the application fee, admin fee, holding deposit, pet deposit, pet rent and monthly parking, plus any active special; effective rent equals `effectiveRent()` for the same inputs.
- The screening criteria and Equal Housing Opportunity statement show on every listing page.
- Publish → the page is live within the cache window. Mark leased → it returns 410 within the cache window.
- Lighthouse mobile reaches ≥90 for accessibility and SEO; the layout has no horizontal scroll at 360px.

**Depends on / unblocks**
- **Depends on:** PLAT-01; LEAS-07's `resolveApplicantFees` (stub it to listing metadata until then).
- **Unblocks:** LEAS-02, LEAS-05 (Apply CTA), LEAS-11, LEAS-14.

**Open decisions**
- **URL shape:** use `/property/l/<handle>` on the suite domain now and add custom domains later? Later means Vercel domain API plus a host rewrite in `proxy.js`.
- **Company or listing?** Should a property website be a full CMS page (about, amenities, gallery), or the vacancy pages only? Recommendation: vacancy pages only for P1.

---

#### LEAS-02 · Lead intake: web form, listing-site email, phone and walk-in, with attribution
- **MRI equivalent:** Engage CRM / Lead Management. It captures leads "from multiple sources" into guest cards, with partner CRMs pushing guest cards in through MIX.
- **Status · priority · effort:** Missing · P1 · M
- **Refs:** Gap 2.7 (intake) · Inventory 2a.13, 2a.14, 2a.24 · PMX-2.14, PMX-2.17, PMX-2.24, PMX-2.32

**Geiger today**
- Prospects are created by hand. Two places do it:
  - the create dialog in `components/internal/screens/marketing/prospects.jsx`
  - `createApplicationFor` from the waitlist (`flows.js:152-179`)
- **The inbound route doesn't create leads.** `app/api/messages/inbound/route.js:6-14` is a provider-agnostic stub that appends to message threads. It matches a sender to an existing prospect by email (`:17-38`) but never creates one.
- **Tracking fields go unread:**
  - Per-listing tracking email, phone, campaign and ad spend are saved but never read (`listing_sections.jsx:249-261`).
  - Prospect source and inquiry channel fields exist (`prospects.jsx:111-120`), but nothing sets UTM or first/last touch.
- Every flow in `flows.js` is a `"use client"` module using the anon browser client. There is no server path to create a prospect.

**What's missing**
- A server `ingestLead` used by every channel.
- The public inquiry form from LEAS-01, with bot protection.
- An inbound-email receiver that parses Zillow, Apartments.com, Zumper and generic emails.
- A quick "Log call or walk-in" capture.
- Source, UTM and first/last-touch attribution.
- An auto-acknowledgement message and a response-time follow-up task.

**How to build**
- *Data model.* Migration `prospect_contact_keys`:
  - Add to `property.prospects`:
    - `email_lc text generated always as (lower(btrim(email))) stored`
    - `phone_e164 text`
    - `first_touch_at timestamptz`
  - Indexes: `(project_id, email_lc)` and `(project_id, phone_e164)`, both `where deleted_at is null`.
  - Each inquiry is a `record_items` row (`owner_type 'prospect'`, `kind 'inquiry'`):
    - `name` = channel label, `starts_on` = received date.
    - `metadata`: `{ channel, listingId, propertyId, unitId, message, utm, referrer, externalId, rawRef }`.
  - Store the raw email body truncated to 20 KB in `metadata.raw`. Never store attachments.
  - A ticked consent box on the public form writes a LEAS-40 `message_consents` row (`source 'application'` — LEAS-40's closest source value; add `web_form` to its check if preferred — with wording hash, IP, user agent).
- *Server logic.* New `lib/leasing/leads/intake.js`:
  - `ingestLead(db, { projectId, listingId, propertyId, unitId, source, channel, contact: { name, email, phone }, message, utm, referrer, consent, externalId, raw })` → `{ prospectId, created, matchedBy }`.
  - **Normalize:** `normalizePhone()` to E.164 (US default).
  - **Match an existing prospect:** email first, then phone, within the project. Full dedupe is LEAS-12.
  - **On a match:** append an inquiry. If the prospect is Lost, re-open it to New with a `stageHistory` entry; reuse `nextStageHistory` (`flows.js:39-45`) by moving it to `lib/leasing/leads/stages.js`.
  - **On a new lead:** create the prospect with status New, set `source` from the channel map, and set `metadata.firstTouch` and `metadata.lastTouch`.
  - **Follow-up task:** create a `record_items` follow-up (kind `follow_up`, read by `prospects.jsx:83-94`) due at now + the listing's `responseGoalHours`. The default is 2 hours.
  - **Notify:** alert the assigned agent through geiger-notify `createServerNotifier`, and staff by `staff_alerts` email.
  - **Acknowledge:** auto-acknowledge through `sendPartyMessage` (`lib/messaging/send.js:43`) with a new template `property.lead_ack`. Respect consent (LEAS-03).
  - Server stage helpers: move `advanceProspect` (`flows.js:49-59`) into `lib/leasing/leads/stages.js` so it is isomorphic: it takes a db client and is used by both the client and the server.
  - `lib/leasing/leads/parsers/{index,zillow,apartments_com,zumper,generic}.js`: `parseLeadEmail({ from, to, subject, text, html })` → `{ source, contact, listingRef, message, externalId } | null`, chosen by sender domain.
  - Listing lookup: by `to`-alias `leads+<listingId>@<inbound-domain>` (fill `metadata.trackingEmail` automatically), else by the address or unit named in the email.
- *API routes / jobs:*
  - `app/api/public/leads/route.js`: POST from the LEAS-01 inquiry form or embed. Accepts `{ handle, listingSlug, name, email, phone, message, consentText, utm, turnstileToken, hp }`.
    - Turnstile verify (`TURNSTILE_SECRET_KEY`), honeypot, and CORS for the embed origin.
    - A per-IP limit through a Vercel WAF rate-limit rule on `/api/public/*`.
  - `app/api/leads/inbound-email/route.js`: provider webhook. Verify with `authorizeScheduler`-style bearer auth (`lib/jobs/contract.js:9-15`, secret `INBOUND_LEADS_SECRET`) or the provider's signature.
    - Order: parse → `ingestLead`. Fall through to `/api/messages/inbound` behaviour when the email is a reply to a thread (`reply+<threadId>@`).
  - `app/api/leads/route.js`: POST, staff (`requireStaff`, `lib/messaging/auth.js:22`), for the quick-capture dialog.
- *UI:*
  - **Prospects screen:** a "Log inquiry" header action (`config.headerActions`, `components/internal/screens/entity/entity_list_screen.jsx:436`) with a quick dialog: channel (Phone / Walk-in / Email / Text), contact, listing, notes.
  - **Prospect editor:** a new "Inquiries" tab under Pipeline in `navGroups` (`prospects.jsx:546`), listing `inquiry` record items.
  - **Source tab:** show UTM and first/last touch read-only.
  - **Listing Lead sources tab:** show the auto-generated lead email alias (read-only) instead of a free-text field.
- *Permissions:* none new; view follows `view.prospects`.
- *Integrations:* an inbound-email provider (open decision); Turnstile.

**Steps**
1. Migration (generated `email_lc`, `phone_e164`, indexes); backfill `phone_e164` with a one-off script under `supabase/seeds/` that is idempotent and not ledgered.
2. Build `stages.js` and `intake.js` with unit tests: new lead, match by email, match by phone, Lost re-open, consent false.
3. Public form route plus the LEAS-01 form component.
4. Build the parsers from 3+ real sample emails per site. Collect them with a test listing on each site.
5. Inbound route and provider setup (MX on a subdomain such as `leads.<domain>`).
6. Staff quick capture and the Inquiries tab.

**Research before building**
- **How each listing site delivers leads** (first pass, 2026-11):

  | Source | Delivery | Note |
  |---|---|---|
  | Zillow | Email, or the Lead API: a URL-encoded HTTP POST to our endpoint with fixed fields (https://www.zillowgroup.com/developers/api/rentals/lead-api/) | Turn off Zillow email parsing once the API is live, to avoid duplicate leads |
  | Apartments.com | Email to a dedicated lead address, or a PMS guest-card API | No public lead API |
  | Zumper | Email only | — |

  - MITS Lead Management 4.0 (rettc.org) exists. No ILS was confirmed to send leads in that format.
  - Collect 3+ real sample emails per site before writing parsers.
- Inbound-email providers' webhook payloads, signature checks and pricing (Postmark Inbound, SendGrid Inbound Parse, Mailgun Routes, Cloudflare Email Workers).
- Can geiger-campaign's inbound email receiver (`C:\Pro\geiger-campaign\app\api\public\inbound\email\[secret]\route.js`, `lib/channels/inbound_email.js`) forward a normalized webhook to Property instead of a second provider?
- Cloudflare Turnstile server verification: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

**Acceptance criteria**
- Submitting the public form for listing L creates a prospect with `listingId = L`, `source = "Website"`, `utm.*` saved, one inquiry row and one follow-up due at now + `responseGoalHours`.
- The agent is notified and the lead gets the acknowledgement email.
- **Repeat submissions:**
  - Same email again → no new prospect; a second inquiry row; `lastTouch` updated.
  - Same phone with a different email case → matched (`matchedBy: "phone"`).
- **Inbound email:**
  - A Zillow sample email posted to the inbound route creates a prospect with `source = "Zillow"` linked to the listing by alias.
  - An unparseable email creates a prospect with `source = "Other"` and keeps the raw text.
- **Abuse protection:** a missing or failed Turnstile token, or a filled honeypot → 400 and nothing written. The 21st submission from one IP in a minute is blocked by the WAF rule.
- Prospects with `doNotContact` get no auto-acknowledgement.

**Depends on / unblocks**
- **Depends on:** LEAS-01, PLAT-01.
- **Unblocks:** LEAS-11 (lead return), LEAS-12, LEAS-14, LEAS-15, LEAS-20.

**Open decisions**
- **Inbound-email provider:** pick one (Postmark / SendGrid / Mailgun / Cloudflare), or route through geiger-campaign's receiver.
- **Lead email domain:** which domain gets the lead aliases?

---

#### LEAS-03 · Message prospects from the UI, with consent enforced
- **MRI equivalent:**
  - Engage CRM one-to-one messaging and drip campaigns
  - Engage Interact two-way texting from the guest card
- **Status · priority · effort:** Partial · P1 · M
- **Refs:** Gap 2.7 (messaging) · Inventory 2a.13, 2a.23 · PMX-2.22, PMX-2.24, PMX-4.27

**Geiger today**
- **The send path accepts prospects, but no screen calls it.**
  - `POST /api/messages/send` takes `recipient: { type: "prospect", id }` (`app/api/messages/send/route.js:8-21`).
  - `sendPartyMessage` and `loadParty` support prospects (`lib/messaging/send.js:28`, `lib/messaging/threads.js:8`).
- **Delivery:** email goes through geiger-dash. SMS is a stub that records "not sent" (`lib/messaging/deliver.js:22-25`, `:47`).
- **Consent isn't enforced.** The `consentToText` and `doNotContact` switches exist only in the prospect form (`prospects.jsx:107-108`). Grepping `doNotContact|consentToText` over `lib/` and `app/` finds no reader, so sends ignore them.
- **No staff view of threads.** The staff inbox UI was removed on 2026-10-20 (memory "communications chat"). Nothing in `components/internal/` reads `message_threads`; only `lib/messaging/threads.js` and `lib/portal/common.js` do.

**What's missing**
- A conversation tab on the prospect and application editors: thread view, composer, templates and merge preview.
- Consent and opt-out enforcement on every send.
- SMS through Part B's provider.
- Phone-number matching for inbound SMS.
- A first-response timestamp for analytics.

**How to build**
- *Data model:* none new.
  - Use `message_threads` and `thread_messages` (`supabase/migrations/20261015212609_messaging_scheduler_automations.sql:68-93`).
  - Consent lives in LEAS-40's `property.message_consents` ledger (`party_type 'prospect'`). LEAS-02 writes a row with proof (wording hash, IP, user agent) when the public form's consent box is ticked.
  - Prospect metadata gains `firstResponseAt` only. The existing `consentToText` / `doNotContact` switches (`prospects.jsx:107-108`) become the legacy fallback that LEAS-40's `canContact` already reads.
- *Server logic:*
  - **Consent gate:** LEAS-40 adds `canContact(db, { party, channel, category, now, timezone })` in `lib/messaging/consent.js` and wires it into `sendPartyMessage` (`lib/messaging/send.js:43`).
    - LEAS-03 only checks that prospects resolve: `loadParty` (`lib/messaging/threads.js:10-30`) returns `metadata` so the legacy `doNotContact` / `consentToText` fallback works for `party_type 'prospect'`.
    - Categories use LEAS-40's set: lead acknowledgements, tour confirmations and staff replies to an inquiry are `transactional`; tour reminders are `reminder`; anything bulk or promotional is `marketing`.
    - If LEAS-03 ships before LEAS-40, build `canContact` with LEAS-40's signature and the metadata fallback only, so LEAS-40 swaps in the ledger without touching callers.
  - **On the first outbound to a prospect,** set `metadata.firstResponseAt` (via the `merge_meta` RPC) when it is empty.
  - **`partyByPhone(db, e164, projectId)`** in `threads.js` uses `prospects.phone_e164` from LEAS-02, so inbound SMS (Part B webhook) threads to the prospect.
  - STOP/START keywords are handled by LEAS-44, which writes `opted_out` / `opted_in` rows to LEAS-40's ledger.
- *API routes / jobs:*
  - `GET app/api/messages/threads/route.js?projectId&partyType&partyId` (`requireStaff`) → threads and their last 100 messages.
  - The existing `POST /api/messages/send` stays.
- *UI:*
  - New `components/internal/screens/entity/shared_sections/conversation_section.jsx`:
    - Thread list → message bubbles with delivery status.
    - Composer: channel select Email / SMS / Internal note, a subject for email, and a template picker from `message_templates` (`lib/supabase/message_templates.js`).
    - Merge preview reusing `lib/messaging/merge_fields.js`.
    - A disabled state with the reason when consent blocks the channel.
    - A section-level `LogoLoading` (size 40) while loading; `Loader2` on the Send button.
  - Wire it as a "Messages" tab under Contact in `prospects.jsx` `navGroups` (`:546`) and in `applications.jsx`.
  - Prospect header action "Email" / "Text" opens the tab with the composer focused.
  - LEAS-41 (Part B staff inbox) builds the thread and composer parts from the team-chat components. Build this tab from those parts if LEAS-41 has landed; otherwise build them here, and LEAS-41 reuses them.
- *Permissions:* add `messages.send` ("Send email and texts to contacts", group "Communications").
- *Integrations:* SMS comes from LEAS-44 (Part B's Twilio-first SMS adapter, ported from geiger-campaign).
  - The suite has a working option in geiger-campaign: a per-project Twilio connection, inbound SMS, and STOP/START/HELP handling (`C:\Pro\geiger-campaign\lib\channels\twilio.js`, `lib/channels/sms_inbound.js`).
  - LEAS-03 only calls `deliver()`, so it is provider-agnostic.

**Steps**
1. Extend `loadParty` with `metadata`; confirm LEAS-40's `canContact` covers prospects (or build its minimal form, as above).
2. Add the threads GET route.
3. Build `ConversationSection` and wire it into prospects and applications.
4. Stamp `firstResponseAt`; add `partyByPhone`.
5. Seed three leasing templates in `supabase/seeds/`: tour follow-up, application link, unit available.

**Research before building**
- TCPA rules for marketing texts to leads: prior express written consent for marketing, versus informational replies to an inquiry; quiet hours; state mini-TCPAs (Florida FTSA, Oklahoma).
- 10DLC campaign registration for property-management texting (Twilio/TCR).
- LEAS-44 ports geiger-campaign's Twilio client rather than calling Campaign's API; nothing to decide here beyond confirming prospects are matched by `phone_e164` in LEAS-44's inbound handler.

**Acceptance criteria**
- Staff send an email to a prospect from the Messages tab:
  - a thread is created with `party_type = 'prospect'`
  - the message shows "sent"
  - `firstResponseAt` is set once
- **Consent:**
  - With `doNotContact` on, Send is disabled, and a direct API call returns `ok:false` with reason `dnc`.
  - SMS to a prospect with no SMS consent row (and `consentToText` off) is blocked with reason `no_consent`.
- An inbound email from the prospect's address appears in the same thread (existing inbound matching, `app/api/messages/inbound/route.js:54-71`).
- With no SMS provider, an SMS attempt is recorded as "not sent" with the existing message `SMS provider not connected`.

**Depends on / unblocks**
- **Depends on:**
  - LEAS-02, for `phone_e164`
  - PLAT-01
  - LEAS-40 (consent ledger and `canContact`) and LEAS-44 (SMS adapter), for live SMS
- **Unblocks:** LEAS-15 (response time), LEAS-12 (merge must move threads).

---

#### LEAS-04 · Applicant account and portal role: one login from applicant to resident
- **MRI equivalent:** Engage Apply + Engage Connect: "The account a renter creates to apply is the one they keep as a resident … no activation email, no second password."
- **Status · priority · effort:** Missing · P1 · M
- **Refs:** Gap 2.1 · Inventory 2a.35 · PMX-2.42

**Geiger today**
- **Portal roles** are only `resident`, `owner` and `vendor` (`lib/portal/constants.js:7-32`). The DB enforces this with `portal_members_role_chk` (`supabase/migrations/20261015215447_portal_members_access.sql:46`).
- **Membership uniqueness:** one live membership per `(role, coalesce(tenant_id, owner_id, vendor_id))` (`:68-70`).
- **Sign-in requires an invite.** It is a Supabase email code or magic link (`lib/portal/auth.js:49-82`), and only for emails that already have a membership (`checkPortalEmail`, `:17-35`). The comment at `:6-9` makes this a deliberate guard against random addresses creating suite accounts.
- **Linking and switching already work:**
  - A first sign-in links `auth_user_id` and activates the invite (`lib/portal/session.js:66-88`).
  - One auth user can hold several memberships and switch between them (`app/portal/page.js:21-27`; cookie `gp_portal_member`).

**What's missing**
- An `applicant` role bound to an application.
- A self-registration path from a public listing that is captcha-protected and creates the application, membership and sign-in code together.
- Handoff at conversion: the same auth user gets an active `resident` membership for the new tenant with no invite email, and the applicant membership stays read-only.

**How to build**
- *Data model.* Migration `portal_members_applicant_role`:
  - `alter table property.portal_members add column if not exists application_id uuid`
  - Drop and re-add `portal_members_role_chk` to allow `'applicant'`.
  - Recreate `portal_members_party_uidx` on `(role, coalesce(tenant_id, owner_id, vendor_id, application_id))`.
  - Index `(application_id)`.
  - On `property.applications`, add status vocabulary `Started` (draft online, not yet submitted) and `Invited` (co-applicant, LEAS-06). Status is free text, so no constraint change.
- *Server logic:*
  - **`lib/portal/constants.js`:** add `applicant: { label: "Applicant", title: "Your application", toggle: "applicantPortal", partyType: "application", partyTable: "applications", partyColumn: "application_id" }` and `ROLE_FOR_PARTY.application = "applicant"`.
  - **`roleEnabled`** (`session.js:37-38`) reads `branding_portals.applicantPortal`. Default it to true when the leasing site is enabled.
  - **New `lib/portal/applicant.js`:**
    - `startApplication({ admin, site, listing, email, name, utm })`, which does the following:
      1. `ingestLead` (LEAS-02)
      2. reuses an open `Started` application for the same email and listing, or creates one (status `Started`, `source`, `prospectId`, `listingId`, `unitId`, `propertyId`)
      3. creates a `portal_members` row (`role 'applicant'`, `application_id`, `status 'invited'`)
      4. calls `sendSignInEmail` (`auth.js:49`)
    - `applicantContext(ctx)`: the application, household (LEAS-06), fees (LEAS-07) and documents.
  - **Conversion handoff:** `handoffToResident(admin, { applicationId, tenantId })`:
    - Find the applicant member's `auth_user_id` and `email`.
    - Upsert a `resident` member with `tenant_id`, the same `auth_user_id`, `status 'active'`, and `activated_at`. No invite email.
    - Set `tenants.portal_enabled = true`, mirroring `lib/portal/invite.js:33-43`.
    - Leave the applicant member active (read-only history).
  - Call the handoff from `convertApplicationToLease` (`components/internal/screens/marketing/flows.js:183-292`). That function runs in the browser with the anon client, so add `POST app/api/applications/[id]/portal-handoff/route.js` (`requireStaff`) and call it after the tenant is created. Do the same for each co-applicant who becomes a tenant party (LEAS-06).
- *API routes / jobs:*
  - `POST app/api/public/apply/start/route.js`: `{ handle, listingSlug, name, email, turnstileToken }`. Turnstile plus WAF rate limit. Returns `{ ok, codeSent }`.
  - Sign-in then uses the existing `/portal/login` code entry (`app/api/portal/auth/verify`).
  - Applicant API routes live under `app/api/portal/applicant/*` with `withPortal(handler, { role: "applicant" })` (`lib/portal/session.js:195-206`).
- *UI:*
  - Add `PORTAL_NAV.applicant` (`components/portal/portal_nav.js:16`): Application, Payments, Documents, Messages, Profile.
  - New folder `components/portal/applicant/`. Home shows the step progress and status.
  - The public listing page "Apply" opens a small email-capture sheet, then hands over to `/portal/login?email=…&next=application`.
- *Permissions:* portal-side only.
- *Integrations:* Supabase Auth OTP (existing).

**Steps**
1. Migration; extend `PORTAL_ROLES`, `ROLE_FOR_PARTY`, `memberView`.
2. Write `applicant.js` (`startApplication`, `applicantContext`) and the public start route with Turnstile.
3. Portal shell: the applicant nav and an empty Application tab.
4. The handoff route, called from the convert wizard (`components/internal/screens/marketing/applications.jsx:486-560`).
5. Test the two-membership switch in the portal.

**Research before building**
- Supabase Auth rate limits for `signInWithOtp` at volume (project settings); whether to move to Supabase's custom SMTP through geiger-dash.
- Confirm with PLAT-01 that letting any email create a suite auth user through the apply path is acceptable. Mitigations: captcha, per-IP and per-email rate limits, and purging unverified `Started` applications after N days.

**Acceptance criteria**
- Start from a listing → the applicant receives a code → signs in → sees "Your application" with the listing.
- The `portal_members` row has `role='applicant'`, `application_id` set, and `status='active'` after sign-in.
- Starting again with the same email and listing reuses the same application; no duplicate membership.
- After staff convert the approved application, the same login (no new email) shows a member switcher with the Resident portal. `portal_members` has a `resident` row with the same `auth_user_id`.
- `checkPortalEmail` still rejects an email with no membership.
- An applicant member cannot call `/api/portal/resident/*` (403).

**Depends on / unblocks**
- **Depends on:** PLAT-01; LEAS-01; LEAS-02.
- **Unblocks:** LEAS-05, LEAS-06, LEAS-07, LEAS-10.

**Open decisions**
- Should an applicant who is denied or withdraws keep portal access (read-only, to receive RISK-07 adverse-action notices), and for how long, given RISK-11 retention rules?

---

#### LEAS-05 · Online application: mobile-first, configurable steps, save and resume, uploads, disclosures
- **MRI equivalent:** Engage Apply: a mobile-first flow with smart autofill and drop-off tracking, configurable pages (application settings, additional items, documents, summaries, agreement and payment screens, pending/approved pages) and screening starting at submission.
- **Status · priority · effort:** Missing · P1 · L
- **Refs:** Gap 2.1 · Inventory 2a.34–2a.41 · PMX-2.36, PMX-2.37, PMX-2.40

**Geiger today**
- **The staff application model is complete.** Fields and sections live in `components/internal/screens/marketing/applications.jsx:115-207`:
  - Applicant fields and disclosures; ID last 4 only (`:121` "Never store full ID or SSN numbers here")
  - Unit and listing, household, co-applicants, occupants, pets, vehicles, residence history and references
  - All child data are `record_items` on `owner_type 'application'` with kinds `occupant`, `co_applicant`, `pet`, `vehicle`, `residence`, `reference` and `fee` (`applications.jsx:210, 630-684`; `sections/application_sections.jsx:276`)
- **Qualification and decision already exist:**
  - Income-to-rent qualification against `screening_criteria` (`flows.js:68-96`; `application_sections.jsx:54-111`)
  - The decision wizard (`applications.jsx:390-485`)
- **The landing page claims what isn't built:** "Prospects apply and pay the application fee on the same page" (`components/landing/product_explorer.jsx:17`). There is no applicant-facing flow (inventory 2a.35). PLAT-02 should hold that claim until LEAS-05 and LEAS-07 ship.

**What's missing**
- A public-facing, mobile-first, multi-step flow writing into the same model.
- Per-company step configuration with property overrides.
- Custom questions.
- Document uploads (ID image, pay stubs) to private storage.
- Required disclosures and consents: screening criteria (RISK-04), fee terms, the FCRA authorization (RISK-09), and ESIGN consent.
- Save and resume, drop-off tracking, and a submit that triggers staff alerts and screening.

**Decision: native, not geiger-forms.** geiger-forms (`C:\Pro\geiger-forms`) is a mature generic builder: repeaters, logic, save and resume, signature, sensitive-field encryption, private uploads, webhooks and a REST v1. It fails this use on four counts:
1. **Money flow.** Payments use one global `STRIPE_SECRET_KEY` with no Connect (`lib/server/stripe.js:6-28`), and there are no refunds (`research/feature-catalog.md:189-192`). That means no state-mandated refunds (LEAS-07).
2. **Pricing.** The fee can't be priced per applicant or by an external rule (`lib/forms/logic.js:642-673`).
3. **Respondent identity.** The respondent login is a suite session with no property membership model (`lib/server/public-form.js:75-87`).
4. **Data shape.** Answers land as JSON in `forms.responses`. Geiger needs first-class `applications` and `record_items` that staff screens, screening (RISK), conversion (`flows.js:183`) and reports already read.

Revisit: the "Custom questions" step could later embed a geiger-forms form and pull the answers through its v1 API or webhook.

**How to build**
- *Data model:*
  - **No new table.** The flow writes `applications` columns plus `metadata`, and `record_items` kinds already used by staff. New kinds:
    - `employment`: employer, title, start, monthly income, contact
    - `answer`: a custom question id and its value
  - **Uploads** are `documents` rows with `owner_type 'application'`, `kind` ∈ `id_document | income_proof | other`. They go to the private `property-files` bucket from PLAT-01g (`property-files/<projectId>/application/<id>/…`), never `products`.
  - **Flow config:**
    - Settings key `application_flow` (company): `{ steps: [{ key, enabled, required }], residenceYears, employmentYears, requiredDocs: [{ kind, count, label }], customQuestions: [{ id, label, type: text|select|yesno|date, options, required }], petsAllowedStep, vehiclesStep, introText, successText }`.
    - Property override in `properties.metadata.applicationFlow`, shallow-merged.
  - **Progress** goes in `applications.metadata.progress = { step, completed: [keys], lastSavedAt, startedAt, submittedAt, device }`, which feeds drop-off analytics.
- *Server logic:*
  - **New `lib/leasing/applications/steps.js` (isomorphic).** Step definitions and validators, built from field arrays moved out of `applications.jsx`:
    - `APPLICANT_FIELDS :115`, `UNIT_FIELDS :131`, `HOUSEHOLD_FIELDS :142`
    - `CO_APPLICANT_FIELDS :149`, `OCCUPANT_FIELDS :162`, `PET_FIELDS :169`, `VEHICLE_FIELDS :178`
    - `RESIDENCE_FIELDS :186`, `REFERENCE_FIELDS :200`
    - The staff screen imports them back, so staff and applicant forms never drift.
  - **New `lib/leasing/applications/flow.js`:**
    - `resolveFlow(admin, { projectId, propertyId })` → merged config.
    - `saveStep(admin, application, stepKey, payload)`: validate with `steps.js`, write the columns plus `merge_meta`, and replace the step's `record_items` (soft-delete the removed ones).
    - `submitApplication(admin, application)` performs these steps in order:
      1. Check every required step, every required document and all consents.
      2. Set status `Submitted`, `appliedOn` and `metadata.progress.submittedAt`.
      3. `advanceProspect(..., "Applied")` (server version from LEAS-02).
      4. Log activity.
      5. Email `property.application_received` to the applicant.
      6. Send a staff alert.
      7. Emit automation event `application.submitted`.
      8. Call RISK-08's `createOrders(admin, { applicationId, packageKey, parties, payer })` (`lib/screening/orders.js`). Until RISK-08 exists, set status `Screening` with "provider not connected", as the staff `startScreening` action does.
  - **Consents** are rows in RISK-09's insert-only `property.applicant_consents` (`method 'geiger_hosted'`, `disclosure_key`, `disclosure_version`, `disclosure_sha256`, `signed_name`, `signed_at`, `ip`, `user_agent`).
    - The FCRA authorization and state notices come from RISK-09's `lib/screening/disclosures.js`.
    - The application flow adds its own keys to the same table: `screening_criteria` (RISK-04's `publishedCriteriaText`), `fee_terms`, `esign_consent` (ESIGN Act), `privacy`.
    - The disclosures step posts to RISK-09's consent endpoint (`app/api/apply/consent/[token]/route.js`) or calls its server function directly from the applicant route.
- *API routes / jobs:* all `withPortal(…, { role: "applicant" })`:
  - `GET/PATCH app/api/portal/applicant/application/route.js` (`GET` state + config; `PATCH { step, data }`)
  - `POST …/application/submit/route.js`
  - `POST …/application/documents/route.js` (private upload → `documents`)
  - **Job `stale-applications`:** reminds `Started` applications idle 24h/72h and purges unverified `Started` applications after 30 days (soft delete). Register in `lib/jobs/registry.js:7`; it depends on CORE-10.
- *UI.* `components/portal/applicant/`:
  - `application_flow.jsx` is a stepper. It shows one step per screen on mobile and a sticky Continue button, and autosaves on Continue.
  - Step components: `about_you`, `residences`, `employment`, `household` (occupants, pets, vehicles), `co_applicants` (LEAS-06), `references`, `questions`, `documents`, `disclosures`, `review_pay` (LEAS-07) and `submitted`.
  - Use `@geiger/ui` inputs and the existing portal kit (`components/portal/portal_kit.jsx`, `form_bits.jsx`).
  - **Address autofill:** browser `autocomplete` attributes only; no paid API in P1.
  - **Staff side:**
    - An "Application flow" settings page under Settings → Fees & Policies, or a new "Leasing" settings page, to toggle steps, edit custom questions and edit the disclosure texts.
    - Applications list: a "Started online" saved view and a "Progress" column.
    - Applications overview: show `consents` and the uploaded documents.
- *Permissions:* `settings.manage` for flow config (existing).
- *Integrations:* RISK-08 (screening orders), RISK-09 (applicant consent records), RISK-04 (`publishedCriteriaText` policy, shown before the fee).

**Steps**
1. Move the field arrays into `steps.js`, re-import them in `applications.jsx`, and confirm the staff screen is unchanged.
2. Write `flow.js` (`resolveFlow`, `saveStep`, `submitApplication`) with unit tests per step.
3. Build the applicant API routes and private document upload (after PLAT-01 provides the bucket).
4. Build the portal stepper UI, mobile-first.
5. Staff: the flow settings page, list view and overview consent panel.
6. Add `property.application_received` and `property.application_reminder` templates in geiger-dash (`C:\Pro\geiger-dash\mails`) and catalogue entries in `lib/email/catalog.js` with `live: true`.
7. Register the `stale-applications` job.

**Research before building**
- Pre-application disclosure rules that the flow must show before taking a fee:
  - Washington RCW 59.18.257 (screening criteria and fee notice)
  - California Civil Code 1950.6 (itemized receipt, copy of the report)
  - Colorado (portable screening reports, HB23-1099)
  - New York RPL §238-a
  - Confirm with RISK which ones RISK owns.
- Source-of-income and criminal-history ("fair chance") rules that limit what the form may ask before a conditional offer: Seattle, Cook County, NYC, California (Fair Chance Housing in some cities). Custom questions need a warning list.
- HUD's 2024 guidance on screening (Fair Housing Act application to tenant screening).
- Any ADA/WCAG obligations for the flow.

**Acceptance criteria**
- On a 360px-wide phone, an applicant completes every enabled step, can leave mid-flow, and returns (new session, same email) to the saved step with the data intact.
- Records written:
  - Each step writes the same columns and `record_items` kinds the staff screen shows.
  - Staff open the application and see the pets, vehicles, residences and references entered online with no further mapping.
- Validation and storage:
  - A required document missing → submit blocked with the step named.
  - Every consent is one `applicant_consents` row with its `disclosure_sha256`.
  - Uploaded ID files are not reachable by public URL.
- Submit → status `Submitted`; the prospect stage is Applied; the applicant gets an email; staff get an alert; the automation event fires.
- Disabling the "Vehicles" step in settings removes it from the flow and from required checks.
- No field anywhere stores a full SSN or full ID number.

**Depends on / unblocks**
- **Depends on:** LEAS-04, PLAT-01 (PLAT-01g private bucket), RISK-08 (orders), RISK-09 (`applicant_consents`, `lib/screening/disclosures.js`), RISK-04 (published criteria).
- **Unblocks:** LEAS-06, LEAS-07, LEAS-15 (drop-off).

**Open decisions**
- Does the property manager need an approval workflow for custom questions, given the fair-housing risk? Or is a warning enough?

---

#### LEAS-06 · Co-applicants, cosigners and guarantors join by link
- **MRI equivalent:** Engage Apply: "co-applicants join by link"; Prospect Connect's "Invite Additional Applicants".
- **Status · priority · effort:** Missing · P1 · M
- **Refs:** Gap 2.1 · Inventory 2a.37 · PMX-2.38, PMX-2.62

**Geiger today**
- **Co-applicants are lightweight rows.** Staff enter them as `record_items` (`kind 'co_applicant'`) with name, role, email, income and a screening note (`applications.jsx:149-160, 630`). Each person can't hold their own residences, documents, consent or fee.
- **Two readers use those rows:**
  - `householdIncome` (`flows.js:88-96`)
  - `convertApplicationToLease`, which turns them into `lease_parties` (`flows.js:230-256`)

**What's missing**
- Each additional adult (co-applicant, cosigner, guarantor) completes their own section, consents and pays their own fee, from their own login.
- The primary sees household progress.
- Staff decide once for the household.

**How to build**
- *Data model.* Migration `applications_household`:
  - `applications.primary_application_id uuid`: null for the primary.
  - `applications.party_role text not null default 'applicant'`: `applicant | co_applicant | cosigner | guarantor`.
  - Index `(primary_application_id) where deleted_at is null`.
  - Online invitees are full `applications` rows (status `Invited` → `Started` → `Submitted`), linked to the primary. Legacy staff-entered `co_applicant` record items stay valid.
- *Server logic:*
  - **`lib/portal/applicant.js`:**
    - `inviteHouseholdMember(ctx, { name, email, role })`: create the child application (copies `listingId`, `unitId`, `propertyId`, `prospectId`, `source`), create the `portal_members` row (role applicant), and email `property.application_invite` with a sign-in link.
    - `removeHouseholdMember` (only before they submit).
  - **`resolveFlow` per role:** guarantors get identity, employment/income, documents, disclosures and pay. Co-applicants get the full flow minus household and pets.
  - **`householdOf(admin, primaryId)`** → `{ primary, members[], allSubmitted }`.
  - **`householdIncome`** (`flows.js:88-96`) also sums child applications' `monthlyIncome` and `metadata.otherIncome`:
    - co_applicant: counted when `countCoApplicantIncome`
    - guarantor/cosigner: shown separately for the guarantor-income rule from RISK
  - **`convertApplicationToLease`** (`flows.js:230-256`) adds child applications as `lease_parties`:
    - The role maps to `tenant`, `cosigner` or `guarantor`.
    - Create a `tenants` row for each co_applicant who will live in the unit, and call the LEAS-04 handoff for each.
    - Mark the child applications `Converted`.
  - **Staff decision:** the decision wizard on the primary (`applications.jsx:390-485`) writes status to the whole household. Per-member screening results come from RISK.
- *API routes / jobs:*
  - `POST/DELETE app/api/portal/applicant/household/route.js`
  - `GET …/household`
  - The `stale-applications` job (LEAS-05) also reminds Invited members who haven't started.
- *UI:*
  - **Portal `co_applicants` step:** add a person (name, email, role); per-person status chips (Invited / In progress / Submitted / Paid); resend invite.
  - **Primary's Home:** "Waiting on Sam to finish".
  - **Staff screens:**
    - Applications list filters `primary_application_id is null` by default and adds a "Household" column ("3 applicants · 2 submitted").
    - `CoApplicantsSection` (`applications.jsx:630`) shows linked application rows, which open in the same editor, above the legacy record items.
- *Permissions:* none new.
- *Integrations:* none.

**Steps**
1. Migration; extend the `applicationsLayer` fields (`lib/supabase/applications.js:6-33`) with `primaryApplicationId` and `partyRole`.
2. Write the household server functions, invite email template and routes.
3. Portal step and Home progress.
4. Update `householdIncome`, `convertApplicationToLease` and the staff list/sections.
5. End-to-end test: primary + co-applicant + guarantor → submit → approve → convert → three lease parties, two tenants with portal access.

**Research before building**
- Fee practice and state rules for per-applicant fees: which caps apply per applicant vs per household (part of LEAS-07 research).
- How guarantors are screened differently (income multiple, often 80x rent). Align the fields with RISK-06's criteria engine and RISK-20 (lease guarantee partner).

**Acceptance criteria**
- The primary invites two people; each gets an email, signs in to their own application, and can't see the other's financial data.
- The primary sees each member's status but not their answers.
- Household income on the staff overview = primary + co-applicants, with the guarantor shown separately.
- Converting creates `lease_parties` with the right roles and `responsibilityPct` split across tenants only (`flows.js:242-253`). Every converted adult has an active `resident` member where the role is `tenant`.
- Removing an invited member before submit soft-deletes their application and membership.

**Depends on / unblocks**
- **Depends on:** LEAS-04, LEAS-05.
- **Unblocks:** LEAS-07 (per-person fees), RISK-08 (an order per person).

---

#### LEAS-07 · Application fees through Stripe, posted to the ledger, refundable, capped by state
- **MRI equivalent:** Engage Apply + Engage Pay. "Application fees and deposits are collected in the same flow that triggers the screening report", with "fees shown in full before payment".
- **Status · priority · effort:** Tracking-only · P1 · M. Gap 2.10 is P2, but gap 2.1 (P1) requires "fees in the flow", and the landing page sells it (`product_explorer.jsx:17`).
- **Refs:** Gap 2.10, 2.1 · Inventory 2a.9, 2a.46 · PMX-2.39

**Geiger today**
- **The fee "ledger" is a hand-kept list.** It is a set of `record_items` (`kind 'fee'`) with the note "Fees are recorded only — no payment is processed here" (`components/internal/screens/marketing/sections/application_sections.jsx:265-344`, note at `:338-344`).
- **Fee amounts live in four places:**
  - listing `metadata.applicationFee`, `adminFee`, `holdingDeposit` (`listing_sections.jsx:105-107`)
  - unit `metadata` (`components/internal/screens/units/sections/rent.jsx:35-36`)
  - unit type (`components/internal/screens/unit_types/config.jsx:104`)
  - the policy `applicationFee`, default 45 (`lib/policies.js:85`)
- **Nothing resolves which amount wins.**
- **Stripe Checkout is lease-bound.** `createPaymentCheckout` requires a lease context (`lib/payments/checkout.js:75-101`, `loadPaymentContext`). `postPaymentToLedger` posts Dr cash / Cr AR against the lease (`lib/payments/posting.js:43-108`). An applicant has no lease, so the result would be an unapplied AR credit.
- **The GL account already exists:** `application_fee_income` 4020 (`supabase/migrations/20261015212744_ledger_core.sql:480`).
- **Stripe is one platform account** (`lib/stripe/server.js:9-11`). Every payment, rent included, lands in that account, not the property manager's. See Open decisions.

**What's missing**
- A fee resolver.
- State-cap enforcement and refund rules.
- An applicant checkout.
- Posting to 4020 with property/unit/owner dimensions.
- Automatic sync to the fee list.
- Staff refund and waive actions.
- An itemized receipt.

**How to build**
- *Data model.* Migration `online_payments_purpose`:
  - `online_payments.application_id uuid`
  - `online_payments.purpose text not null default 'lease_payment'`: `lease_payment | application_fee | holding_deposit` (holding_deposit is used by LEAS-13)
  - Index `(application_id)`.
  - No GL changes for fees. 4020 exists.
- *Server logic:*
  - **New `lib/leasing/applications/fees.js`:**
    - `resolveApplicantFees(admin, { projectId, listingId, unitId, propertyId, partyRole })` → `{ applicationFee, perApplicant: bool, adminFee, holdingDeposit, currency, source: 'listing'|'unit'|'unit_type'|'policy', state, capped: { from, to, rule } | null }`.
    - Precedence: listing → unit → unit type → policy cascade (`effectivePolicies`, `lib/policies.js:176-191`).
  - **Fee rules come from RISK-10**, not a second table: `feeRules(effects, criteria)` in `lib/screening/fees.js` → `{ maxFee, capType, receiptRequired, refundIfNotScreened, refundDays, noFeeIfNoUnit, portableReport }`, built on RISK-05's location-rules catalog.
    - `resolveApplicantFees` applies it: cap the amount, drop the fee where `maxFee` is 0, and skip it when `portableReport` applies and the applicant attached one.
    - The researched table below is the seed data for RISK-05/RISK-10; hand it over rather than hard-coding it here.
    - If LEAS-07 ships before RISK-10, block live fee collection in states without a rule row (show "Fee collection isn't available for this state yet").
  - **New `lib/payments/applicant_checkout.js`:** `createApplicantCheckout({ applicationId, purpose, successUrl, cancelUrl, member })`:
    - Loads the application and resolved fees, inserts an `online_payments` row (`purpose`, `application_id`, `property_id`, `unit_id`, no lease/tenant), and creates a Checkout session.
    - Session settings: `mode: payment`; card only for application fees by default (ACH returns arrive after screening is bought); metadata `kind: "applicant_payment"`; no convenience fee unless the policy allows it and the state rule doesn't forbid it.
    - Reuse `findOrCreateCustomer` (`lib/payments/customers.js`), extended to key on the applicant email when there is no tenant.
  - **`postPaymentToLedger`** (`posting.js:43`) branches on `row.purpose`:
    - `application_fee` → `buildCashTransaction({ direction: "in", glAccountId: 4020, cashGlAccountId, propertyId, unitId, ownerId, sourceId, idempotencyKey: "stripe:<pi>", metadata: { applicationId } })` (`lib/ledger/postings.js:424-451`).
    - `holding_deposit` → handed to LEAS-13.
    - Otherwise the existing path.
  - **Refunds:** `postRefundEntry` (`posting.js:164`) gets the same branch (Dr 4020 / Cr cash). `lib/payments/refunds.js` gets a `purpose` guard.
  - **After success:**
    - Upsert the fee `record_items` row (`kind 'fee'`, `feeKind 'Application fee'`, `status 'Paid'`, `method`, `reference = pi id`) and set `applications.fee_paid = true`. This mirrors the client sync at `application_sections.jsx:285-290`.
    - Email the receipt: RISK-10's itemized `property.application_fee_receipt` where the rules require it (CA §1950.6), else `sendPaymentReceipt` (`posting.js:289`).
  - **Staff actions** on the Fees section:
    - "Send fee link": reuse the `createPaymentLink` pattern (`checkout.js:73`) with `purpose`.
    - "Refund" (Stripe refund via `lib/payments/refunds.js`).
    - "Waive" (record only).
- *API routes / jobs:*
  - `POST app/api/portal/applicant/pay/route.js`.
  - `fulfillCheckoutSession` (`lib/payments/fulfill.js:277-299`) needs no change beyond the posting branch, because rows are found by `paymentId`.
  - Staff: `POST app/api/applications/[id]/fee-link` and `/refund` (`requireStaff`).
- *UI:*
  - **Portal `review_pay` step:**
    - An itemized table (application fee × applicants this person pays for, other fees disclosed but due later).
    - The state notice text from RISK-10's rules, the refund policy, and a Pay button.
    - Show the "Application fee capped at $X by state law" line when the cap applied.
  - **Staff Fees section:** replace the "recorded only" note with Stripe status, refund/waive actions and a link to the ledger entry.
  - **Applications overview:** "Fee: Paid $50 · card · Oct 3".
- *Permissions:* refunds need `accounting.post` (`lib/rbac.js:11`).
- *Integrations:* Stripe (existing).

**Steps**
1. Migration; `fees.js` calling RISK-10's `feeRules`, with tests per state (seed RISK-05 from the table below if it isn't populated).
2. `applicant_checkout.js` and the portal pay route; wire the posting branch and the refund branch.
3. Fee `record_items` sync and receipt.
4. Staff fee link, refund and waive.
5. Ledger tests: post, refund, dispute, against the demo chart.

**Research before building**
- **Seed RISK-05/RISK-10's location rules from these sources.** They were checked in a first pass in 2026-11. Verify each one, and confirm every item marked "unverified" before launch.

| Jurisdiction | Rule | Source |
|---|---|---|
| CA, Civ. Code 1950.6 | $30 cap (1998 base), CPI-adjusted, never above actual cost. The 2026 figure is unverified (CAANET publishes it yearly). AB 2493: refund within 7 days if the application isn't considered, or 30 days if undecided. Itemized receipt and a copy of the report. | https://sjud.senate.ca.gov/media/1431 |
| NY, RPL 238-a | Only a background/credit check fee: the lesser of actual cost or $20. Waived if the applicant provides a background check from the last 30 days. All other application fees are barred. A 2026 decision holds that holding fees are barred too. | https://www.nysenate.gov/legislation/laws/RPP/238-A |
| MA, c.186 §15B | No application fee. | https://malegislature.gov/Laws/GeneralLaws/PartII/TitleI/Chapter186/Section15B |
| VT, 9 V.S.A. 4456a | No application fee. | https://legislature.vermont.gov/statutes/section/09/137/04456a |
| ME, 14 MRSA 6030-H | No application fee. Actual screening cost only, once per 12 months, after notice. | https://legislature.maine.gov/statutes/14/title14sec6030-H.html |
| RI, 34-18-59 | No application fee. Actual cost only when the applicant has no report from the last 90 days. | https://codes.findlaw.com/ri/title-34-property/ri-gen-laws-sect-34-18-59/ |
| CT, §47a-4d | No application fee. Screening report fee capped at $50 + CPI (current figure unverified). | https://nlihc.org/resource/new-tenant-protections-go-effect-connecticut-including-limits-late-charges-and-application |
| NJ | $50 cap including all screening, CPI-indexed, from 2026-05-01. 1–2 family homes exempt. The statute citation is unverified. | https://www.lawgapc.com/blog/new-jersey-caps-residential-rental-application-fees-at-50/ |
| DC, 42-3505.10 | Cap $54 in 2026, CPI-adjusted. | https://ota.dc.gov/node/1815961 |
| IL | No fee when the applicant gives a portable screening report (PA 103-0840). $50 cap for leases from 2027-01-01 (PA 104-0479). | https://ilga.gov/Legislation/PublicActs/View/104-0479 |
| CO, 38-12-903/904 | Actual cost only, the same for all applicants. No fee when the applicant gives a portable report from the last 30 days. | https://leg.colorado.gov/bills/HB23-1099 |
| WA, RCW 59.18.257 | Actual cost only, with written notice first, and a statement on whether reusable reports are accepted. | https://app.leg.wa.gov/RCW/default.aspx?cite=59.18.257 |
| OR, ORS 90.295 | Average actual cost. One fee per 60 days. Written criteria first. Refund within 30 days if not screened. | https://oregon.public.law/statutes/ors_90.295 |
| MN, 504B.173 | Disclose criteria first. No fee if no unit is available. Refund on undisclosed-reason rejection, or when the unit goes to a prior applicant. | https://www.revisor.mn.gov/statutes/cite/504B.173 |
| MD, RP 8-213 | Any fee above $25 not actually spent is refunded within 15 days. This is a refund trigger, not a cap. | https://law.justia.com/codes/maryland/2017/real-property/title-8/subtitle-2/section-8-213/ |
| VA, 55.1-1203 | $50 plus actual third-party costs. | https://codes.findlaw.com/va/title-55-1-property-and-conveyances/va-code-sect-55-1-1203/ |
| WI, ATCP 134.05 | Credit report fee capped at $25. Waived when the applicant gives a report less than 30 days old. | https://datcp.wi.gov/Documents2/ATCP134FinalRule.pdf |
| DE, 25 Del. C. 5514(d) | Greater of 10% of monthly rent or $50. The statute text is unverified. | — |

- **"Portable screening report" exemptions** (CO, IL, WI, NY). The flow must let the applicant attach a recent report and skip the fee. Coordinate the report-acceptance UI with RISK.
- **Stripe Checkout:** card-only `payment_method_types` and per-property statement descriptors.
- Stripe Connect requirements if the money-flow decision is Connect: destination charges vs direct charges, `on_behalf_of`, KYC for small landlords. https://docs.stripe.com/connect/charges

**Acceptance criteria**
- Fees follow the state rules:

  | Listing's state | Expected |
  |---|---|
  | New York, fee set to $50 | Checkout charges $20 (the screening-cost cap). The review step shows the cap line. |
  | Massachusetts or Vermont | No fee step. Submitting without payment is allowed. |
  | Colorado, applicant attaches a portable report from the last 30 days | Fee is $0. |
- Paid $50 (CA):
  - one ledger entry, Dr Trust Cash (or the configured deposit bank GL, `posting.js:27-39`) 50 / Cr 4020 Application Fee Income 50, with `property_id`, `unit_id`, `owner_id` dimensions and `idempotency_key stripe:<pi>`
  - re-delivering the webhook creates no second entry
  - the trial balance stays balanced
- Full refund → a reversing entry Dr 4020 / Cr cash. The fee row shows Refunded; `fee_paid` is false.
- A failed card → no ledger entry; the fee row stays Due.
- A co-applicant paying their own fee posts against the same property and unit, with `metadata.applicationId` = their own application.

**Depends on / unblocks**
- **Depends on:** LEAS-05, LEAS-06, RISK-10 (fee rules), CORE-04 (posting patterns for money with no lease yet); the Stripe money-flow decision; PLAT-01.
- **Unblocks:** LEAS-13; RISK-10 (who pays for screening).

**Open decisions**
- **Stripe money flow:** keep one platform account (fees and rent land in Geiger's Stripe balance, then are paid out how?), or adopt Stripe Connect so funds settle to each manager's or owner's account? This affects rent too; flag it to CORE/PLAT. Recommendation: Connect before any live money.
- **Who earns the application fee:** the owner (post 4020 with the owner dimension, which flows to owner statements) or the manager (management income)? This needs a policy switch.
- **Fee basis:** per adult applicant, or per household?

---

#### LEAS-08 · Lease document as PDF with addenda merged
- **MRI equivalent:** Prospect Connect / Report Gateway lease generation with configurable riders (PMX-2.69). Blue Moon's integration "generate and print Blue Moon leases as PDFs" for move-ins, renewals and transfers (PMX-2.70).
- **Status · priority · effort:** Partial · P1 · M
- **Refs:** Gap 2.6 · Inventory 2b.39, 2b.43, 2b.46, 2b.49 · PMX-2.69, PMX-2.70

**Geiger today**
- **Generation writes a `.txt` file.** `generateLeaseDocument` (`lib/leasing/workflows.js:126-137`) merges with `mergeLeaseDocument` (`:117-124`), then `storeTextDocument` (`:99-114`) uploads a `.txt` file to the public `products` bucket (`lib/supabase/property_storage.js:7-13`).
- **The merge engine is pure and reusable** (`lib/leasing/merge.js`): `MERGE_FIELDS :47-87`, `buildMergeValues :103`, `mergeTemplate :173-199`, `DEFAULT_LEASE_BODY :204-243`.
- **Addenda are tracked but never merged or sent.** They are `lease_addenda` rows with `body`, `status` and `requiresSignature` (`components/internal/screens/leasing/sections/lease_document.jsx:302-336`; `lib/supabase/lease_addenda.js:4-13`).
- **Template versioning is only a label.** The text isn't kept per version, and leases don't record the version they used (inventory 2b.43).
- **Template custom fields merge in preview only;** generated documents print `[key]` (2b.39).
- **Generation can't run on the server.** `loadLeaseContext` (`workflows.js:75-96`) reads through browser data layers, which rules out e-sign webhooks and portal signing.
- **No PDF library is installed** (`package.json:16-42`). `node_modules` isn't installed at HEAD.

**What's missing**
- **A server-side PDF render:** numbered sections, page numbers, signature blocks.
- **Addenda appended in order.**
- **Signature anchors per signer,** for LEAS-09.
- **Private storage.**
- **A template snapshot recorded on the document.**
- **Custom fields merged.**

**How to build**
- *Data model:* no new table.
  - `documents` rows (`lib/supabase/documents.js:87`) carry these keys in `metadata`:
    - `templateId`, `templateVersion`, `templateHash` (sha256 of the body used)
    - `addendaIds[]`, `pages`, `sha256` (of the PDF)
    - `signatureAnchors[]`, `generatedBy`
  - Document kinds:
    - `lease_agreement`: the unsigned PDF
    - `lease_agreement_signed`: from LEAS-09
    - `lease_amendment`: from LEAS-16
  - Storage: PLAT-01g's private `property-files` bucket, under `<projectId>/lease/<leaseId>/`, saved as `{ bucket, storage_path }` on `documents`. Read only through PLAT-01g's `signedUrls` (`lib/supabase/file_urls.js`).
- *Server logic:*
  - `lib/leasing/server_context.js` — `loadLeaseContextServer(db, leaseId)`. Same output as `loadLeaseContext`, using the service-role client.
  - `lib/leasing/documents/compose.js` — `composeLeaseDocument(db, leaseId, { templateId, includeAddenda })` → `{ sections, signers, unknown, empty }`:
    1. Merge the template. Inject `template.metadata.customFields` into the merge values (this fixes 2b.39).
    2. Append each non-Void addendum, ordered by `effectiveDate` then `created_at`, merged with the same values.
    3. Build the signers from `lease_parties` (minus occupants, as at `lease_document.jsx:356-358`), plus the landlord or agent countersigner.
  - `lib/leasing/documents/pdf.js` — `renderPdf({ title, sections, signers, footer, anchorFor })` → `Buffer`.
    - Library: `@react-pdf/renderer` (`renderToBuffer`) or `pdf-lib`; see research.
    - Each signature line embeds `anchorFor(signer, field)` from the LEAS-09 adapter as white 1pt text. For BoldSign, Dropbox Sign, SignWell and Documenso this is the provider's text tag or placeholder. The manual adapter returns `""`.
  - `generateLeasePdf(db, leaseId, opts)` — compose → render → private upload → `documents` insert. It sets the same lease `metadata.lastDocument*` keys as today (`lease_document.jsx:82-86`).
  - Keep `storeTextDocument` for notices and inspections.
- *API routes / jobs:*
  - `POST app/api/leases/[id]/document/route.js` (`requireStaff`, `lib/messaging/auth.js:22`) → `{ document, unknown, empty }`.
  - Downloads use PLAT-01g's `signedUrls` / `useSignedUrl`; no new route unless PLAT-01g leaves one out.
- *UI:*
  - Point `LeaseDocumentSection` (`lease_document.jsx:73-90`) and the `generateDocument` header action (`components/internal/screens/leasing/lease_actions.jsx:658-683`) at the route. Keep `Loader2` on the button.
  - The document list shows a PDF badge, the page count and Download.
  - Each addendum row gets a sort order and an "Included in next generation" indicator.
- *Permissions:* none new.
- *Integrations:* a PDF library (npm).

**Steps**
1. Pick and add the PDF library after checking it works with React 19, Next 16 and the Vercel Node runtime.
2. Write `server_context.js` and `compose.js`, with unit tests for addenda order and custom fields.
3. Write `pdf.js`, with a fixture test on page count and extracted text.
4. Add the route and the private upload. Until PLAT-01's bucket exists, refuse with "Private storage isn't configured" rather than writing to `products`.
5. Rewire the UI. Check that the demo lease generates a PDF with two addenda.

**Research before building**
- `@react-pdf/renderer` v4 with React 19 and the Next 16 Node runtime, and its cold-start size. Alternatives: `pdf-lib` with manual layout, or `@sparticuz/chromium` (heavier).
- Text-tag syntax per e-sign candidate (LEAS-09), so `anchorFor` can be provider-specific:
  - BoldSign: https://developers.boldsign.com/text-tags/introduction/
  - Dropbox Sign: https://developers.hellosign.com/docs/walkthroughs/text-tags.md (text tags don't work together with templates)
  - Documenso: https://docs.documenso.com/users/documents/pdf-placeholders
  - SignWell: https://developers.signwell.com/reference/adding-text-tags
- Embedding a Unicode font, so Spanish leases render (the lease language is stored at `lease_document.jsx:48-49`).

**Acceptance criteria**
- A lease with template T and two non-Void addenda produces one PDF:
  - the body, then each addendum in effective-date order, each on a new page
  - "N of M" page footers
  - a signature block per signing party plus the landlord
- Custom template fields render their values, not `[key]`.
- `metadata.templateHash` equals sha256 of the template body used.
- An unauthenticated GET of the storage path returns 403.
- Text extracted from the PDF contains the lease's rent, deposit and term.
- With no template, `DEFAULT_LEASE_BODY` is used.

**Depends on / unblocks**
- **Depends on:** PLAT-01 (PLAT-01g private bucket and signed URLs).
- **Unblocks:** LEAS-09, LEAS-16, LEAS-17, LEAS-19, LEAS-45.

---

#### LEAS-09 · E-signature provider adapter: staff send, webhook status, signed copy filed
- **MRI equivalent:** Engage Secure Sign. It offers drag-and-drop templates, prefilled recipients, signing order, reminders, signers who need no account, status tracking, auto-filing, ID verification and an audit trail. The legacy version used DocuSign.
- **Status · priority · effort:** Tracking-only · P1 · L
- **Refs:** Gap 2.5 · Inventory 2b.50–2b.54 · PMX-2.71, PMX-2.72

**Geiger today**
- **`esign_requests` is tracking-only** (`lib/supabase/esign.js:3-18`).
- **The data layer maps columns no migration creates.** `provider` and `provider_envelope_id` don't appear in any migration; the table DDL is `supabase/migrations/20260708132810_leasing.sql:118-139`.
- **The lease tab builds signers from lease parties,** and staff tick each signer off by hand (`components/internal/screens/leasing/sections/lease_document.jsx:341-430`).
- **The E-signature screen is a manual tracker.** Statuses, audit, signing order, expiry and reminder cadence are all typed in (`components/internal/screens/leasing/esignature.jsx:35-78, 230-262`).
  - Marking a request Signed stamps `leases.signed_date` (`:71-74`).
- **The integrations card is disabled** (`components/internal/screens/settings/integrations.jsx:31`).
- **Standing decision:** e-signature comes from geiger-docs later; an adapter lets an interim provider plug in.

**What's missing**
- **A provider interface and registry.**
- **Sending the LEAS-08 PDF to signers with anchors.**
- **Status, signer and audit updates driven by webhooks.**
- **Reminders and expiry.**
- **Filing the completed PDF and the provider's certificate.**
- **Subjects beyond leases:** renewals, amendments, addenda, any document.

**How to build**
- *Data model.* Migration `esign_provider_tracking`; every change uses `add column if not exists`.
  - Add to `property.esign_requests`:
    - `provider text`, `provider_envelope_id text`
    - `subject_type text` (`lease | renewal | amendment | addendum | document`) and `subject_id uuid`. Backfill from `lease_id`.
    - `document_id uuid`, `signed_document_id uuid`
    - `expires_at timestamptz`, `completed_at timestamptz`
    - `sent_at`, `signed_at` and `project_id`, so a fresh DB has them
    - a unique index on `(provider, provider_envelope_id)` where not null
  - New table `property.esign_events`:
    - Columns: `request_id`, `provider_event_id`, `type`, `signer_key`, `occurred_at`, `ip`, `payload jsonb`, plus the standard columns.
    - Unique on `(request_id, provider_event_id)`, which makes webhooks idempotent.
  - Signers stay in `metadata.signers[]`: `{ id, key, label, email, role, order, providerSignerId, status, viewedAt, signedAt }`.
- *Server logic:*
  - **The interface:** `lib/esign/adapter.js`, documented with JSDoc. Each provider is one object:
    - `key`, `label`, `capabilities: { embedded, anchors, sequential, reminders, idVerification }`
    - `createEnvelope({ requestId, title, message, pdf, signers, sequential, expiresAt, embeddedSigners })` → `{ providerEnvelopeId, signers: [{ key, providerSignerId }] }`
    - `getSigningUrl({ providerEnvelopeId, providerSignerId, returnUrl })` → `{ url, expiresAt }`
    - `remind(…)`, `void(…)`
    - `downloadCompleted(…)` → `{ pdf, certificatePdf? }`
    - `verifyWebhook(request, rawBody)`
    - `parseWebhook(rawBody)` → `[{ providerEventId, type: sent|viewed|signed|declined|completed|voided|expired, providerEnvelopeId, providerSignerId, occurredAt, ip }]`
    - `anchorFor(signer, field)`
  - **The providers:**
    - `lib/esign/providers/manual.js` — today's behaviour; the default.
    - `lib/esign/providers/<interim>.js` — the chosen interim provider.
    - `lib/esign/providers/geiger_docs.js` — a stub.
  - **The registry:** `lib/esign/registry.js` exposes `getEsignProvider(projectId)`.
    - It reads `ESIGN_PROVIDER` and the provider keys from env, at platform level, like Stripe (`lib/stripe/server.js:9-11`).
    - Per-project credentials, when needed, go in `property.integration_secrets` (PLAT-01h); never in `settings`.
  - **The service:** `lib/esign/service.js`.
    - `sendForSignature(db, { projectId, subjectType, subjectId, documentId, signers, message, sequential, expiresAt, actor })` creates the envelope, writes the request with status `Sent`, and logs the activity.
    - `applyProviderEvents(db, events)`:
      - upserts `esign_events`
      - updates the signers and the request status (Viewed / Partially signed / Signed / Declined / Voided / Expired — the existing `ESIGN_STATUS_MAP`)
    - On completed:
      1. Store the signed PDF as `lease_agreement_signed` (or the subject's kind), plus the provider certificate.
      2. Set `completed_at`.
      3. Run the subject hook:
         - lease → `signed_date` (today's behaviour)
         - renewal → LEAS-45's `finalizeRenewal`
         - amendment → LEAS-16 `executeAmendment`
      4. Emit `document.signed` and notify staff.
- *API routes / jobs:*
  - `POST app/api/esign/send/route.js` (`requireStaff`)
  - `POST app/api/esign/[id]/remind` and `…/void`
  - `POST app/api/esign/webhook/[provider]/route.js`: verify, parse and apply.
    - A bad signature returns 401.
    - Processing errors are logged to `esign_events` as `type 'error'`, then the route returns 500 so the provider retries.
  - `GET app/api/esign/[id]/signing-url`, for LEAS-10.
  - Job `esign-reminders`: sends reminders by `metadata.reminderCadence` when the provider can't, and expires overdue requests. Register it in `lib/jobs/registry.js:7`; it depends on CORE-10.
- *UI:*
  - **Settings → Integrations:** the E-signature card goes live (`integrations.jsx:31`). It shows the provider, test or live mode, and webhook status from env, read-only.
  - **`LeaseEsignSection`** (`lease_document.jsx:341+`):
    - With a provider, staff get "Send for signature", which uses the latest PDF or generates one through LEAS-08. They set the signer order, message and expiry.
    - The status, signers and audit then come from events and are read-only.
    - Actions: Remind, Void, Download signed copy.
    - With the manual provider, the UI is unchanged.
  - **E-signature screen** (`esignature.jsx`): same behaviour. The audit section reads `esign_events`, and legacy `metadata.audit` entries stay visible.
- *Permissions:* new key `esign.send`.
- *Integrations:* the interim provider (an open decision); geiger-docs later.

**Steps**
1. Migration; extend the `esignLayer` fields (`lib/supabase/esign.js:6-19`).
2. Write the adapter, registry, manual provider and service. Existing behaviour must be unchanged.
3. Build the interim provider against its sandbox, plus the webhook route.
4. File completed documents; add the lease hook.
5. UI and the reminders job.
6. End to end: generate the PDF → send → tenant and landlord sign in the sandbox → webhook → signed PDF filed and `signed_date` set.

**Research before building** (the API facts below were checked 2026-11; confirm prices before deciding)

Candidate providers:
- **BoldSign:**
  - $30/month including 40 envelopes, then $0.75 per envelope.
  - Includes embedded signing and requesting, templates, branding and a custom email domain, and text tags.
  - https://boldsign.com/pricing
- **Dropbox Sign API:**
  - Embedded signing needs the Standard plan, $250/month for 100 requests.
  - Text tags don't work with templates.
  - https://sign.dropbox.com/products/dropbox-sign-api/pricing
- **Documenso:**
  - Teams plan, $40/month, includes the API and embedded signing.
  - White-label embedding is on the Platform plan, $250/month.
  - Self-hosted under AGPL. Unverified: whether the API and webhooks work on the free self-hosted build.
  - Supports PDF placeholders.
  - https://documenso.com/pricing
- **SignWell:** 25 free API documents a month, then $0.85 down to $0.20 per document. https://www.signwell.com/api-pricing/
- **DocuSign:** developer plans cost $50, $300 or $480 a month. Which tier includes embedded signing and Connect webhooks is unverified. https://ecom.docusign.com/plans-and-pricing/developer
- **Not recommended:**
  - PandaDoc, because embedding is Enterprise-only.
  - OpenSign, because its API terms are unverified.
- **DocuSeal** (open-source) was not checked; add it to the comparison.

Other checks:
- **Legal basis:** ESIGN Act 15 U.S.C. §7001(c) (consumer consent disclosure) and UETA. Find out which party supplies the consumer disclosure.
- **State carve-outs:** state notices that must still be served on paper.

**Acceptance criteria**
- **Manual mode:** every current behaviour still works.
- **Sending:** sending with the interim provider stores one envelope id and emails the signers.
- **Status updates:**
  - A `viewed` event → Viewed.
  - The first of two signatures → Partially signed.
  - Completion → Signed, with `completed_at` set, the signed PDF and certificate filed on the lease, and `leases.signed_date` set.
- **Webhook safety:**
  - A duplicate webhook → one `esign_events` row and no duplicate document.
  - A tampered signature → 401 and no state change.
- **Void and expiry:**
  - Void → the provider envelope is voided and the status is Voided.
  - Past `expiresAt` → Expired after the job runs.

**Depends on / unblocks**
- **Depends on:** LEAS-08, PLAT-01.
- **Unblocks:** LEAS-10, LEAS-16, LEAS-17, LEAS-19, LEAS-45.

**Open decisions**
- **Which interim provider until geiger-docs ships.**
  - Recommendation: Documenso (hosted Teams plan now, self-hosted later). geiger-docs already appears to be built on Documenso: geiger-dash's email route notes "geiger-docs uses this for Documenso's templates" (`C:\Pro\geiger-dash\app\api\email\send\route.js:49-50`). The interim adapter then becomes most of the geiger-docs adapter.
  - Fallback: BoldSign, the cheapest hosted option with embedded signing and text tags on its entry tier, if Documenso's API or webhooks fall short in the sandbox.
- **Whether to require ID verification or knowledge-based authentication at signing.** It costs more per envelope and overlaps RISK-15 (ID verification).

---

#### LEAS-10 · Signing inside the resident and applicant portals
- **MRI equivalent:** Secure Sign "right inside the application and renewal flow"; Engage Connect residents "View, accept, and digitally sign lease renewal offers".
- **Status · priority · effort:** Missing · P1 · M
- **Refs:** Gap 2.5 · Inventory 2b.54 · PMX-2.71, PMX-2.81

**Geiger today**
- **The resident portal lists documents only; nothing can be signed there.**
  - It lists lease documents via `residentDocuments` (`lib/portal/resident.js:295-307`).
  - The UI is `components/portal/resident/resident_lease.jsx`.
- **A pending lease is already in scope.** `residentContext` (`lib/portal/resident.js:27-49`) includes every lease the tenant is a party to, including `Pending` ones (`LIVE_LEASE :11`). A pre-move-in resident can already see the lease.
- **There is no signing entry in the portal nav** (`components/portal/portal_nav.js:16-36`).

**What's missing**
- **A "Waiting for your signature" list**, with embedded or redirect signing and a return to the portal.
- **Signed copies in Documents.**
- **Account-free signing for guarantors and cosigners**, through the provider's email link.

**How to build**
- *Data model:* none beyond LEAS-09.
- *Server logic:* `lib/portal/esign.js`.
  - `pendingSignatures(ctx)` returns requests where all of these hold:
    - The status is Sent, Viewed or Partially signed.
    - A signer matches the member: by email, or by a `lease_parties.tenant_id` equal to `member.tenant_id`.
    - In sequential mode, it's that signer's turn.
  - `signingUrl(ctx, requestId)` re-checks the match, then calls `adapter.getSigningUrl` with `returnUrl = <portal>/portal?tab=lease&signed=<id>`.
- *API routes / jobs:* two routes, both `withPortal` (`lib/portal/session.js:195-206`) and open to the resident and applicant roles:
  - `GET app/api/portal/esign/route.js`
  - `POST app/api/portal/esign/[id]/url/route.js`
- *UI:*
  - **Resident Home** (`components/portal/resident/resident_home.jsx`) gets a "1 document to sign" card.
  - **Lease & documents** gets a "To sign" section. "Review & sign" opens the provider's embedded signing in a full-screen dialog when `capabilities.embedded` is true and the provider allows framing; otherwise it redirects.
  - **On return**, show a thank-you and poll until the status updates.
  - **The applicant portal** gets the same list on its Documents tab.
  - Show `LogoLoading` (40px) while the URL loads.
- *Permissions:* signer checks in the portal routes.
- *Integrations:* through the LEAS-09 adapter.

**Steps**
1. Write `lib/portal/esign.js` and the routes.
2. Build the resident UI, then the applicant UI.
3. Test on a phone viewport with the sandbox provider, including sequential order.

**Research before building**
- **Embedded signing rules for the chosen provider:**
  - domain allowlist and `frame-ancestors`
  - mobile behaviour
  - signer-URL lifetime
  - whether its emails can be suppressed for embedded signers while guarantors still get them

**Acceptance criteria**
- **Happy path:** a tenant with a Sent request sees it on Home and in the Lease tab, signs on a 360px viewport and returns. After one webhook cycle the request is Signed and the PDF is under Documents.
- **Access:** a member who isn't a signer gets 403 from `…/url`.
- **Order:** sequential order is respected in both directions.
- **Account-free signing:** a guarantor with no portal access signs by email, and the request completes.

**Depends on / unblocks**
- **Depends on:** LEAS-09, LEAS-04.
- **Unblocks:**
  - LEAS-45: online renewal accept and sign (Part B).
  - LEAS-16: residents sign amendments.

---

#### LEAS-11 · Listing-site syndication: MITS feed, channel adapters, lead return
- **MRI equivalent:** Engage Broadcast. It is built on MITS 5.0 and pushes availability, pricing and fees "from one source" to about 25 listing sites. When a unit leases, every channel updates. Adding a portal is "a setting rather than a project".
- **Status · priority · effort:** Tracking-only · P1 · L
- **Refs:** Gap 2.3 · Inventory 2a.5, 2a.6, 2a.8 · PMX-2.01–2.05, PMX-2.11, PMX-8.18

**Geiger today**
- **Channel status is typed by hand.** The screen says "nothing is sent to Zillow, Apartments.com or any other site" (`components/internal/screens/marketing/sections/listing_sections.jsx:157-228`, notice at `:176-179`).
- **The channel list is hard-coded.** `SYNDICATION_CHANNELS` has eight channels (`components/internal/screens/marketing/shared.js:268-277`); `CHANNEL_STATUS_MAP` includes `Error` (`:279-285`).
- **Publish and mark-leased only flip internal state:**
  - `publishChannels` (`listing_sections.jsx:57-70`)
  - `syndicated: false` on conversion (`flows.js:285-289`)
- **Standing decision:** stay tracking-only until a vendor is chosen. This item builds the adapter design plus an open-standard feed, so connecting a vendor becomes configuration.

**What's missing**
- **A MITS feed** generated from the LEAS-01 serializer.
- **A channel registry** with feed, API and manual modes.
- **System-driven per-channel status.**
- **Leads returned to LEAS-02.**
- **Fee transparency in the feed.**

**How to build**
- *Data model:* no new table.
  - Each site gets a feed secret in `leasing_sites.feed_token` (LEAS-01).
  - Channel config lives at `leasing_sites.metadata.channels[key] = { enabled, mode, accountId?, lastFetchedAt, lastCount, lastError, partnerStatus }`.
  - Each listing's `metadata.syndication[key]` (`listing_sections.jsx:43-54`) gains `systemStatus` (`InFeed | Fetched | Error | Manual`) and `lastSyncedAt`. Typed `status` and `url` stay for manual channels.
- *Server logic:*
  - **Channel registry** — `lib/syndication/channels.js` replaces `SYNDICATION_CHANNELS`, keeping its keys and re-exporting from `shared.js`. Each entry is `{ key, label, kind, mode: feed|api|manual, format: mits|zillow|null, leadReturn: email|api|null, partnerProgramUrl, requiresApproval }`.
  - **Adapter** — `lib/syndication/adapter.js`:
    - `buildFeed(site, listings)` → `{ contentType, body }`
    - `publish` / `unpublish`, for API mode
    - `parseLead(payload)` → the LEAS-02 input
  - **Formats:**
    - `lib/syndication/formats/mits.js` builds MITS Property Marketing/ILS: Property → Floorplan → ILS_Unit, with rent, deposit, fees, concessions, photos, availability, pets and contact.
      - Target 5.0. Add the 5.1 fee elements, since 5.1 adds fee transparency.
    - Add `zillow.js` only if MITS is refused.
    - Every format maps from `serializePublicListing` (LEAS-01) only.
  - **Validation** — `validateForChannel(listing, channel)` returns the missing required fields. It drives the `Error` status and the fix list.
- *API routes / jobs:*
  - **Feed** — `GET app/api/syndication/[channel]/[token]/route.js` returns XML of the Active listings with that channel enabled.
    - Cache it for 15–60 minutes.
    - Stamp `lastFetchedAt` and `lastCount`, throttled.
    - Mark the included listings `InFeed`.
  - **Lead return** goes to one of two places:
    - `app/api/leads/inbound-email` (LEAS-02), using per-channel parsers
    - `POST app/api/leads/ils/[channel]/route.js`, starting with Zillow's Lead API (a URL-encoded POST callback). Turn off email parsing for Zillow once the API is on, to avoid duplicates.
  - **Job `syndication-health`** runs daily. It flags channels with no fetch in 48 hours and listings that fail validation.
- *UI:*
  - **`SyndicationSection`** shows, per channel:
    - a mode badge (Automatic feed or Manual)
    - the system status and when it last synced
    - validation errors that link to the field
  - Manual channels keep today's Select and URL.
  - Replace the "nothing is sent" notice with per-channel text.
  - **Settings → Integrations → Listing syndication** (`integrations.jsx:33`) gets per-channel switches, the feed URL with Copy and Regenerate, and the partner status.
  - **"Copy listing text"** formats a listing for manual posting.
- *Permissions:* `leasing.publish`.
- *Integrations:* ILS partner programs; the vendor choice is open.

**Steps**
1. **Registry and adapter.** Move the constants with no user-visible change.
2. **MITS formatter.** Add an XSD validation test using the RETTC schema.
3. **Feed route and token,** with validation and the system status.
4. **UI changes.**
5. **Each approved channel:** register the feed URL, then add a lead parser or endpoint. Test one listing end to end.
6. **Health job.**

**Research before building** (checked 2026-11; source links in each bullet)
- **MITS standard.** RETTC maintains it, and the free XSDs are at https://rettc.org/mits-data-models.
  - Property Marketing/ILS 5.0 is the current approved version. Version 5.1 was released 2026-10-01 and adds fee transparency.
  - Lead Management 4.0 also exists. Check whether any channel sends leads in that format.
- **Zillow Rental Network** (Zillow, Trulia, HotPads): https://www.zillowgroup.com/developers/api/rentals/rentals-feed-integrations/
  - The program is for PMS vendors. It costs nothing, but there's an intake form and 4–6 weeks of testing on production data.
  - Feeds are Zillow XML or MITS (Zillow links to 4.1). Leads come by email or through the Lead API (https://www.zillowgroup.com/developers/api/rentals/lead-api/).
  - **Restriction:** Zillow shows multifamily listings only with a paid client agreement above a unit threshold, and sources disagree whether it's 25+ or 50+ units. It also restricts by state (e.g. Oregon). Confirm both with Zillow.
- **Rent. (Rent.com, ApartmentGuide) and Redfin.** Zillow is currently their exclusive multifamily source. The 2026-08 FTC settlement requires Redfin to relaunch its own rental ads. Until a feed spec appears, the Zillow feed covers them.
- **Apartments.com / CoStar.** Its feed program is MITS-based, delivered by FTP or URL. Get the spec from feeds@apartments.com (https://mymedia.apartments.com/advertise/resources/listings-feed-program).
  - Leads come by email or through a PMS guest-card API.
  - **Confirm:** cost, minimums, and whether the feed reaches ApartmentFinder and ForRent.
- **Zumper / PadMapper.** Zumper takes an XML feed in Trulia format, or MITS. Join by sending an order form and the feed URL to feeds@zumper.com. Leads come by email only (https://help.zumper.com/hc/en-us/sections/43549953493147-Feeds).
- **Apartment List.** It takes MITS 5 through PMS and syndication partners, but has no public application. Ask about a partnership.
- **Realtor.com rentals.** There is no public program; listings arrive through syndicators such as RentSpree.
- **Craigslist.** Its Bulk Posting Interface is for high-volume posters only, case by case (https://www.craigslist.org/about/bulk_posting_interface). Treat it as **manual**.
- **Facebook Marketplace.** Partner rental feeds ended in 2021. Treat it as **manual**.
- **Fee-transparency rules** that apply to syndicated prices: Colorado HB25-1090, California SB 611. Also check Apartment List's fee-transparency requirements.

**Acceptance criteria**
- **Feed contents.** A valid token returns XML that validates against the MITS 5.0 XSD and holds exactly the Active listings with the channel enabled. A bad token returns 404.
- **Data parity.** Rent, deposit, every mandatory fee and the specials match the LEAS-01 page.
- **Leased units drop out.** After a unit is marked leased, the next feed omits it and its status leaves `InFeed`.
- **Validation.** A listing with no photos shows Error with a fix message and is excluded from that channel's feed.
- **Lead return.** A Zillow Lead API POST or a channel lead email creates a prospect with `source` set to that channel.
- **Manual channels unchanged.**

**Depends on / unblocks**
- **Depends on:** LEAS-01, LEAS-02, PLAT-01.
- **Unblocks:** LEAS-15.

**Open decisions**
- **Launch channels.** Recommendation: launch Zillow Rental Network first (free, PMS program, reaches Rent. and Redfin today), then Apartments.com and Zumper. Keep Craigslist and Facebook manual.
- **Zillow paid-listing thresholds.** How to handle Zillow's paid-listing rule for larger multifamily clients, given it affects the 10–500-unit target.
- **Direct feeds or an aggregator?** A per-channel feed, or a paid aggregator that gives one integration?

---

#### LEAS-12 · Duplicate leads: detect, merge, and one guest card across properties
- **MRI equivalent:**
  - RM global guest cards share one guest card between two or more properties, with groups set up per portfolio (X.5.4).
  - Engage CRM's unified renter record holds every interaction from first inquiry to renewal.
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Gap 2.7 (dedupe) · Inventory 2a.16, 2a.25 · PMX-2.15, PMX-2.19, PMX-2.20, PMX-2.23

**Geiger today**
- **No duplicate handling.** Grepping for dedupe or merge in `components/internal/screens/marketing` and `lib/supabase/prospects.js` finds nothing (inventory 2a.25).
- **Prospects are already project-wide.** The project scope covers every property in the workspace (`lib/supabase/project_scope.js:16-19`). The real gap is that a prospect carries one `property_id` / `listing_id` / `unit_id` (`lib/supabase/prospects.js:13-18`). Interest in a second property means a second prospect.
- **Linked records hang off `prospect_id`:**
  - `showings.prospect_id`, `applications.prospect_id`, `waitlist_entries.prospect_id`
  - `record_items` with `owner_type 'prospect'` (follow-ups, quotes, inquiries)
  - `documents` and activity
  - `message_threads.party_id`, which LEAS-03 adds

**What's missing**
- Automatic matching on intake (LEAS-02 does exact email or phone matching).
- A "possible duplicates" finder for fuzzy matches.
- A safe, atomic merge.
- Several property and listing interests on one guest card.

**How to build**
- *Data model:*
  - **Migration `prospect_merge`** adds the SQL RPC `property.merge_prospects(p_keep uuid, p_merge uuid[], p_actor uuid)`, `security definer`. It runs in one transaction:
    1. Re-point `prospect_id` on `showings`, `applications` and `waitlist_entries`.
    2. Re-point `owner_id` on `record_items`, `documents` and `activity` where the owner type is `prospect`.
    3. Re-point `party_id` on `message_threads` where `party_type = 'prospect'`.
    4. Merge `metadata.stageHistory` arrays by timestamp.
    5. Keep the most advanced status using the `STAGE_RANK` order (`flows.js:48`).
    6. Fill empty columns on the kept row from the merged rows.
    7. Set `metadata.mergedFrom[]` on the kept row.
    8. Soft-delete each merged row with `metadata.mergedInto`.
    9. Insert an activity row.
  - **Interests** are `record_items` with `kind 'interest'` on the prospect: `{ propertyId, listingId, unitId, source, at }`. The prospect's own `property_id` / `listing_id` stay as the primary interest.
- *Server logic:*
  - `lib/leasing/leads/dedupe.js`:
    - `findDuplicates(db, projectId, prospect)`: candidates scored on exact `email_lc` (100), exact `phone_e164` (90), and the same last name plus phone last 7 digits (60), or the same name plus a move-in date within 14 days (40). Returns those ≥ 60.
    - `mergeProspects(db, keepId, mergeIds, actor)` calls the RPC.
  - `ingestLead` (LEAS-02) appends an `interest` when it matches an existing prospect from a different listing or property.
- *API routes / jobs:*
  - `POST app/api/prospects/merge/route.js` (`requireStaff`).
  - `GET app/api/prospects/[id]/duplicates`.
- *UI:*
  - **Prospect Overview:** a "Possible duplicate of Jordan Blake (same phone)" banner, plus a Merge wizard (`wizard_dialog.jsx`) that compares the records side by side and lets staff pick the field values to keep.
  - **Prospects list:** a "Possible duplicates" saved view.
  - **New "Interests" tab** under Preferences.
  - **Filters:** the property filter and listing Lead sources (`listing_sections.jsx:231-245`) also match interests, so a shared guest card counts for every property it toured or inquired about.
- *Permissions:* `records.delete` (`lib/rbac.js:10`) is required to merge, because merge soft-deletes rows.
- *Integrations:* none.

**Steps**
1. Write the RPC migration, with a SQL test on two prospects that each have showings, an application and a thread.
2. Write `dedupe.js` and the routes.
3. Build the banner, the merge wizard and the duplicates view.
4. Add interests in intake and the readers.

**Research before building**
- How existing CRMs merge guest cards. Engage CRM's real-time guest-card sync (PMX-2.20) is a reference for the conflict rules.
- Whether merge must respect `doNotContact`: keep the strictest consent.

**Acceptance criteria**
- Merging B into A moves every showing, application, waitlist entry, follow-up, inquiry, document and thread from B to A.
- A shows the more advanced stage and both stage histories in time order. B is soft-deleted with `mergedInto = A`.
- Funnel counts (`loadFunnel`, `flows.js:99-121`) drop by one lead and keep every downstream count.
- A single prospect who inquires about two properties appears once, with two interests, and counts in both properties' lead-source tables.
- If `doNotContact` is true on either record, the merged record keeps it.

**Depends on / unblocks**
- **Depends on:** LEAS-02 (normalized keys), LEAS-03 (threads).
- **Unblocks:** LEAS-15 (clean counts).

---

#### LEAS-13 · Holding deposit or reservation fee, unit hold, and a move-in gate until paid
- **MRI equivalent:** RM reservation fee or earnest money, with "three different calculation methods". The move-in can't be scheduled until it is collected (X.5.6); it is integrated with Prospect Connect.
- **Status · priority · effort:** Tracking-only · P2 · M
- **Refs:** Gap 2.10 · Inventory 2a.18, 2a.52 · PMX-2.65, PMX-2.66

**Geiger today**
- **The hold is only a note on the prospect.** The "Hold a unit" wizard (`components/internal/screens/marketing/prospects.jsx:425-458`) writes `holdUnitId`, `holdUntil`, `holdDeposit` and `holdStatus` into prospect metadata. Its own description says "Tracked on the prospect only".
- **Nothing acts on the hold:**
  - The unit status doesn't change.
  - Nothing charges the deposit.
  - Nothing expires the hold.
- **The "Holding deposit" fee kind is recorded only** (`shared.js:305`; `application_sections.jsx:265-344`).
- **No move-in gate exists.** The Activate wizard's readiness check covers unit, tenant, term, rent and signed date only (`components/internal/screens/leasing/lease_actions.jsx:57-76`, validated at `:133-136`). `scheduleMoveIn` (`lib/leasing/workflows.js:251-281`) has no gate.

**What's missing**
- A reservation-fee policy that sets how the fee is calculated and whether it is refundable.
- Collecting the fee by Stripe (LEAS-07 checkout, `purpose 'holding_deposit'`), or recording an office payment.
- Posting the fee to a liability account.
- An enforced unit hold with expiry.
- Applying the fee to move-in charges or the deposit at conversion, or refunding or forfeiting it under the state rules.
- Blocking Activate and move-in until the fee is collected.

**How to build**
- *Data model:*
  - **Migration `holding_deposits_gl`.** Add the system account `holding_deposits` (2150 "Holding Deposits & Reservation Fees", Liability, subtype `deposits`). The default-chart function (`ledger_ensure_default_chart` in `supabase/migrations/20261015212744_ledger_core.sql:453-528`) must be re-created to include the row. Back-fill it for existing projects with `select property.ledger_ensure_default_chart(id) from public.projects`.
  - **Holds** live in `listings.metadata.hold = { applicationId, prospectId, until, paymentId }` and in `units.metadata.hold` (same shape). No new unit status. List screens show a "Held" badge.
  - **Policy definitions** (`lib/policies.js`, leasing group):
    - `reservationFeeRule`: none | fixed | percent_of_rent | one_month
    - `reservationFeeAmount`
    - `reservationFeeRefundable`
    - `holdDays`, default 3
    - `requireReservationBeforeMoveIn`
- *Server logic:*
  - **`lib/leasing/holds.js`:**
    - `placeHold(db, { applicationId | prospectId, unitId, until })` refuses if another active hold exists on the unit.
    - `releaseHold`.
    - `expireHolds(db, now)`.
  - **`postPaymentToLedger` branch for `holding_deposit`** (`lib/payments/posting.js:43`): Dr cash / Cr `holding_deposits`, with property and unit dimensions, `metadata.applicationId`, and key `stripe:<pi>`.
  - **Office payments:** an "Record reservation payment" staff action posts the same entry with source `staff`.
  - **`lib/leasing/applications/reservation.js`:**
    - `applyReservation(db, { applicationId, leaseId, target: 'charges'|'deposit' })`:
      - `charges`: Dr `holding_deposits` / Cr AR on the new lease, allocated to the move-in charges.
      - `deposit`: Dr `holding_deposits` / Cr `security_deposits` on the new lease, plus a `security_deposits` row.
      - Both use `buildJournal` (`lib/ledger/postings.js:410-422`) with `source_type 'adjustment'` (`ledger_core.sql:73-76`), `metadata.kind 'reservation_applied'`, and the idempotency key `reservation:<paymentId>:apply`.
    - `refundReservation`: Stripe refund through `lib/payments/refunds.js`, then Dr `holding_deposits` / Cr cash.
    - `forfeitReservation`: Dr `holding_deposits` / Cr `other_income`. It is blocked where the location rules (RISK-05 / HOUS-07 rule tables) forbid forfeiture.
  - **`moveInGate(lease)`** returns the blocking reasons: reservation unpaid when the policy requires one, and, from CORE, deposit or move-in funds unpaid. It is shared by the Activate wizard, `scheduleMoveIn` and the Complete-move wizard (`components/internal/screens/leasing/moves.jsx:366-438`).
  - **`convertApplicationToLease`** (`flows.js:183`) calls `applyReservation` and `releaseHold`.
- *API routes / jobs:*
  - `POST app/api/portal/applicant/pay` (LEAS-07) with `purpose: 'holding_deposit'`.
  - Staff routes: `POST app/api/applications/[id]/reservation/{record,refund,forfeit}`.
  - Job `unit-holds`: daily. It expires holds and notifies the agent. It depends on CORE-10.
- *UI:*
  - **Prospect and application "Reserve unit" action:** amount from the policy, with "send a payment link" or "record payment". The prospect hold tab (`prospects.jsx` nav "hold") shows the payment status.
  - **Applicant portal Payments:** the reservation fee, when it's requested.
  - **`ReadinessList`** gets a "Reservation fee collected" row, and Activate's `validate` blocks with the reason.
  - **Unit and listing lists:** a "Held until …" badge.
- *Permissions:* refund and forfeit require `accounting.post`.
- *Integrations:* Stripe.

**Steps**
1. Migration (GL account and back-fill); add the policy definitions.
2. Write `holds.js` and `reservation.js`, with ledger tests: collect, apply to charges, apply to deposit, refund, forfeit.
3. Add the posting branch.
4. Build the gate and wire it into Activate, `scheduleMoveIn` and the move wizard.
5. Build the UI and the job.

**Research before building**
- **Holding-deposit laws:**

  | State | Rule (first-pass findings) |
  |---|---|
  | Washington | Capped at 25% of first month's rent. Needs a receipt and written terms. Must be credited to rent or deposit. Penalty up to 2×. RCW 59.18.253, https://app.leg.wa.gov/RCW/default.aspx?cite=59.18.253 |
  | Oregon | Allowed only after approval, with a written statement. Refund within 4 days if the landlord is at fault. ORS 90.297, https://oregon.public.law/statutes/ors_90.297 |
  | New York | Holding fees barred (2026 decision). |
  | California | No dedicated statute (unverified). Counts toward the AB 12 one-month deposit cap. |
  | DC | Holding deposits are excluded from the application-fee definition. |

- **Whether a reservation fee counts as "security"** in the states that cap deposits. Coordinate with CORE-04 and CORE-20 (calculated deposits to meet legal caps).

**Acceptance criteria**
- **Collection:** a $500 reservation paid by card posts Dr Trust Cash 500 / Cr 2150 500, and the unit and listing show "Held until D".
- **Hold:** a second hold on the same unit is refused.
- **Conversion:** applying the reservation to move-in charges leaves 2150 at 0 for that application and reduces the new lease's AR by 500. The trial balance stays balanced.
- **Gate:** with `requireReservationBeforeMoveIn` on and the fee unpaid, Activate and Schedule move-in are blocked with the reason. Paying unblocks both.
- **Expiry:** the job expires the hold after `until`, clears both badges and notifies the agent.
- **Washington:** a fee above 25% of the first month's rent is refused.
- **Forfeiture:** forfeiting in a state that forbids it is refused.

**Depends on / unblocks**
- **Depends on:**
  - LEAS-07
  - CORE-04 (deposits on the ledger)
  - CORE-01 `onLeaseActivated` (first-period and deposit billing)
  - CORE-10
- **Unblocks:** none in this part.

---

#### LEAS-14 · Prospects self-schedule tours, with confirmations and reminders
- **MRI equivalent:**
  - RM lead appointments, with automated text and email confirmation and reminders "the day before" and "the day of" (X.5.4).
  - Lead Management's online tour scheduling.
  - Agora Voice books tours by phone, but that is AI and deferred.
- **Status · priority · effort:** Missing · P2 · M. The gap report rates it P2, but the landing page already claims "Prospects book a showing from open slots and get a confirmation straight away" (`components/landing/product_explorer.jsx:35`). PLAT-02 (marketing-claims audit) should pull that claim until this ships.
- **Refs:** Gap 11.7 · Inventory 2a.28–2a.33 · PMX-2.18, PMX-2.33

**Geiger today**
- **Staff can schedule.** They book a showing from the prospect (`components/internal/screens/marketing/prospects.jsx:308-363`) via `scheduleShowingFor` (`flows.js:124-149`), which runs on the client.
- **The lifecycle exists:** confirmed, completed, no-show and cancelled, plus feedback (`components/internal/screens/marketing/showings.jsx:110-127, 266-410`).
- **Confirmation and reminder are manual switches only** (`showings.jsx:97-98`). No job sends anything.
- **Listing settings are saved but unused.**
  - `selfGuidedTours` and `virtualTours` are switches.
  - `bookingLink` is a free-text URL.
  - All three are in `components/internal/screens/marketing/listings.jsx:134-135, 196`.
- **No availability rules, slot logic or conflict check.** A grep finds none (inventory 2a.33).

**What's missing**
- **Availability rules** per property or agent.
- **A public slot picker** on the listing page.
- **Atomic booking** that rejects double-booked slots.
- **Confirmation email** with an `.ics` attachment, plus a manage link to cancel or reschedule.
- **Reminders** a day before and 2 hours before, by email now and SMS once Part B's provider is in.
- **Notifying the current resident** for occupied units, which is already a field.

**How to build**
- *Data model.*
  - **Settings key `tour_scheduling`** (company), with an override in `properties.metadata.tourSchedule`:

    | Field | Meaning |
    |---|---|
    | `enabled` | Turns self-scheduling on |
    | `timezone` | Not stored here: read the property time zone (`components/internal/screens/properties/sections/property_tabs.jsx:81`), else the company time zone (`components/internal/screens/settings/shared.js:35`, default `America/New_York`) |
    | `weekly` | Array of `{ day, start, end }` windows |
    | `slotMinutes` | Slot length |
    | `bufferMinutes` | Gap between tours |
    | `leadTimeHours` | Minimum notice before a tour |
    | `horizonDays` | How far ahead prospects can book |
    | `maxPerSlot` | Tours allowed per slot |
    | `types` | `In-person`, `Self-guided`, `Virtual` |
    | `blackouts` | Dates closed to booking |
    | `agentIds` | Agents for round-robin |

  - **Migration `showings_slot_guard`:**
    - Partial unique index on `property.showings (unit_id, showing_date, showing_time) where status in ('Scheduled','Confirmed') and deleted_at is null`. This works when `maxPerSlot = 1`. For more per slot, the RPC counts instead.
    - Add `manage_token text` (unique).
- *Server logic:*
  - **`lib/leasing/tours/slots.js`** is pure and isomorphic. `computeSlots({ rules, booked, now, from, to })` returns `[{ date, time, agentId }]` and handles the property time zone.
  - **`lib/leasing/tours/book.js`:**
    - `bookTour(db, { site, listing, slot, type, contact, utm, consent })` does five things:
      1. Calls `ingestLead` (LEAS-02).
      2. Inserts the showing through the RPC `property.book_showing(...)`, which holds an advisory lock on the unit and re-checks capacity.
      3. Advances the prospect to Touring.
      4. Sends a confirmation email with an `.ics` attachment. geiger-dash email supports attachments (`C:\Pro\geiger-dash\lib\email\send.js`).
      5. Notifies the agent.
    - Also exports `cancelTour(token)` and `rescheduleTour(token, slot)`.
  - **Move server-safe helpers** out of `flows.js` (as in LEAS-02), so the staff flow and the public flow share them.
- *API routes / jobs:*
  - `GET app/api/public/tours/slots/route.js?handle&listing&from&to`
  - `POST app/api/public/tours/route.js`, protected by Turnstile and a WAF rate limit.
  - `GET/POST app/api/public/tours/[token]/route.js`, for manage and cancel.
  - **Job `showing-reminders`** runs hourly. It sends the day-before and 2-hours-before reminders, then sets `metadata.reminderSent` and `reminderSentAt`. It also auto-marks No-show candidates for staff review. It needs CORE-10.
- *UI:*
  - **Listing page (LEAS-01):** a "Book a tour" sheet with day chips, time slots and contact fields.
  - **Manage page:** `app/l/[handle]/tour/[token]/page.js`.
  - **Staff settings:** a "Tour scheduling" card in Branding & Portals (Leasing website) for the weekly grid, slot length and buffers. Each property gets an override card.
  - **Showings screen:** a "Booked online" badge and a source column. The confirmation and reminder switches become read-only, set by the system.
  - **Staff calendar sync** (optional, P3): a per-agent read-only ICS feed at `app/api/calendar/[token]/route.js`.
- *Permissions:* none new.
- *Integrations:*
  - Email: geiger-dash.
  - SMS: Part B's provider.
  - Smart locks for self-guided access codes are out of scope; codes stay tracking-only (2a.31).
  - ID check at the tour belongs to RISK-16.

**Steps**
1. Migration (index, token, `book_showing` RPC).
2. `slots.js` with time zone and DST tests.
3. `book.js` and the public routes.
4. Listing-page booking sheet and manage page.
5. Settings UI.
6. Reminders job and the email templates: `property.tour_confirmation`, `property.tour_reminder`.

**Research before building**
- Time zone handling without a new dependency. Is `Intl` plus `date-fns` (already a dependency) enough, or is `date-fns-tz` needed?
- iCalendar (RFC 5545) fields for `METHOD:REQUEST` vs `PUBLISH`, and how Gmail and Outlook treat each.
- Fair-housing consistency: every prospect sees the same slot availability. No screening before the tour, except the ID check under RISK.

**Acceptance criteria**
- **Slot generation:** rules Mon–Fri 10:00–17:00, 30-minute slots, 15-minute buffer and 2-hour lead time produce the right slots in the property's zone, including across a DST change.
- **Booking:** a booking creates the prospect, the showing (status Scheduled, source Website) and a confirmation email with a valid `.ics`. The slot then disappears from `/slots`.
- **No double booking:** two simultaneous bookings for a `maxPerSlot = 1` slot produce exactly one showing and one 409.
- **Manage link:** cancelling releases the slot and logs the change on the prospect.
- **Reminders:** they send once at T-24h and T-2h (idempotent on re-run). They are skipped for `doNotContact`.

**Depends on / unblocks**
- **Depends on:** LEAS-01, LEAS-02, PLAT-01, CORE-10.
- **Unblocks:** LEAS-15 (tour-booked rates).

---

#### LEAS-15 · Leasing and marketing-source analytics
- **MRI equivalent:**
  - Engage CRM's configurable views and reporting, and marketing-source effectiveness.
  - Market Connect source reporting.
  - Engage Interact's ad-tracking reports.
- **Status · priority · effort:** Partial · P2 · M
- **Refs:** Gap 7.6 · Inventory 2a.11, 2a.14, 2a.21, 2a.59 · PMX-7.21, PMX-7.22

**Geiger today**
- **Per-listing views exist.**
  - Lead sources and conversion per listing (`components/internal/screens/marketing/sections/listing_sections.jsx:231-288`).
  - A per-listing funnel (`:290-343`).
  - Funnel KPIs on list headers (`flows.js:98-121`).
- **The code is ahead of the gap report and inventory.** Both say the funnel is "per listing only" and that the Leasing Report "covers leases, not leads". In fact the Leasing Report already shows a company-wide prospect → showing → application → lease funnel for the period (`lib/reports/defs_operations.js:488-512`).
- **What the report lacks:**
  - Breakdowns by source, channel, property or agent.
  - Lost-reason analysis, though lost reasons are captured at `prospects.jsx:169-175`.
  - Response-time metrics.
  - Cost per lead or lease. Listing ad spend is saved but unread (`listing_sections.jsx:259`).

**What's missing**
- A "Lead Sources" report covering:
  - the funnel by source, property and agent
  - conversion rates per stage
  - median first-response time
  - lost reasons
  - application drop-off by step, from LEAS-05
  - cost per lead and per lease from ad spend
- Report scheduling and CSV export through the existing report framework.

**How to build**
- *Data model:*
  - **Ad spend** is stored as `record_items` with `kind 'ad_spend'` on the listing: `{ month, amount, channel }`. Any amount still in the legacy `metadata.marketingBudget` field is treated as monthly spend while the listing is Active.
  - **Attribution keys** come from LEAS-02 (`source`, `metadata.firstTouch`, `metadata.lastTouch`, `utm`) and LEAS-03 (`metadata.firstResponseAt`).
- *Server logic:* add `leadSourceReport` to `lib/reports/defs_operations.js`, following the `leasingReport` shape (`:488`).
  - **Sources:** `prospects`, `showings`, `applications`, `leases`, `listings`, and `record_items` (kinds `inquiry`, `ad_spend`, `interest`).
  - **Filters:** range, property, source, agent.
  - **Sections:**
    1. Funnel by source, as a table: leads → contacted → toured → applied → approved → leased, with the rate at each step.
    2. Median and p90 first-response time, by agent.
    3. Lost reasons × source.
    4. Cost per lead and per lease, by source.
    5. Online application drop-off by step.
    6. Days from first contact to lease.
  - Add any missing loaders to `lib/reports/sources_server.js` and `sources_client.js`, then register the report in `lib/reports/catalog.js`.
- *API routes / jobs:* none new. Scheduling uses the existing `scheduled_reports` job.
- *UI:*
  - Add the sidebar entry "Lead Sources" under Reports (`components/internal/sidebar/sidebar_nav.jsx:177-196`), registered in `components/internal/screens/registry.jsx` beside "Leasing Report" (`:150`).
  - Add a listing "Ad spend" child-records card in the Lead sources tab.
- *Permissions:* `view.lead_sources` (derived from the title); `reports.export`.
- *Integrations:* none. Call reporting arrives with LEAS-20.

**Steps**
1. Add the ad-spend child records.
2. Write the report definition and data loaders, with unit tests on a fixture dataset.
3. Wire up the sidebar, registry and catalog.
4. Check the numbers against the demo seed.

**Research before building**
- Industry KPI definitions (NAA, NMHC): lead-to-lease, tour-to-lease, cost per lease. This keeps the labels standard.
- Attribution model: first touch (the default, as MRI's "originating source"), or last touch. Expose both as a toggle.

**Acceptance criteria**
- On a fixture of 20 prospects across three sources, the funnel counts per source match a hand count, and the lead totals equal the Leasing Report's prospect count for the same range and property.
- Median first-response time uses only prospects with `firstResponseAt`. Prospects with no response are listed separately.
- Cost per lease for Zillow equals Zillow ad spend in range ÷ Zillow-sourced leases. It shows "—" when there are no leases.
- After a LEAS-12 merge, the counts drop by one lead and nothing else.
- CSV export matches the on-screen table.

**Depends on / unblocks**
- **Depends on:** LEAS-02, LEAS-03, LEAS-05, LEAS-12 (for clean counts).
- **Unblocks:** LEAS-20 (call reporting slots in here).

---

#### LEAS-16 · Lease amendments flow (rent, concessions, fees, rentable items, terms, parties)
- **MRI equivalent:** RM Lease Amendments: "Update rent and concession amounts. Add rentable items to leases. Review resident security deposits. Add other fees to leases. Update lease terms."
- **Status · priority · effort:** Missing · P2 · L
- **Refs:** Gap 2.13 · Inventory 2b.1, 2b.9, 2b.10, 2b.31 · PMX-2.73, PMX-2.75

**Geiger today**
- **Billing fields are edited directly on the lease form:**
  - `rent` at `components/internal/screens/leasing/sections/lease_money.jsx:72`
  - `deposit` at `:580`
  - term dates at `components/internal/screens/leasing/config.jsx:125-126`
- **Lease changes don't reach billing.** "Apply N due" rent steps (`lease_money.jsx:107-121`) and the month-to-month wizard (`lease_actions.jsx:592-620`) write `leases.rent` only. Billing reads `rent_accounts.rent` (`lib/jobs/financial.js:190-207`). This is the gap 0.1 defect, owned by CORE-01, which adds `property.lease_rent_steps` (with `source 'amendment'`) and `property.lease_sync_current_rent`.
- **Concessions are tracking-only:** `record_items` with `kind 'concession'` (`lease_money.jsx:394`), never posted. This is gap 0.6, owned by CORE-05.
- **No amendment record, document or signature exists anywhere.**

**What's missing**
- A dated, versioned amendment with typed changes.
- A generated document and e-signature.
- Execution that writes billing through CORE's single write path, never through `leases.rent` directly.
- An amendment history on the lease.
- Lease billing fields locked once the lease is Active.

**How to build**
- *Data model.* Migration `lease_amendments`, which adds the table `property.lease_amendments`:

  | Column | Type / values |
  |---|---|
  | `project_id` | |
  | `lease_id` | uuid, not null |
  | `number` | int, per lease |
  | `effective_date` | date |
  | `status` | `Draft \| Pending signature \| Executed \| Applied \| Voided` |
  | `changes` | jsonb array of typed operations (below) |
  | `document_id` | uuid |
  | `esign_request_id` | uuid |
  | `executed_at` | |
  | `applied_at` | |
  | `applied_by` | |
  | `apply_result` | jsonb: ledger and charge ids |
  | standard columns | |

  - Unique key: `(lease_id, number)`.
  - Typed operations in `changes`:
    - `{ op: 'rent', from, to }`
    - `{ op: 'concession_add', concession }` / `{ op: 'concession_remove', id }`
    - `{ op: 'charge_add' | 'charge_change' | 'charge_end', charge }`
    - `{ op: 'rentable_item_add' | 'rentable_item_remove', itemId, rate }`, which needs CORE-60 (rentable items)
    - `{ op: 'deposit_change', from, to }`
    - `{ op: 'term', termEnd, termType }`
    - `{ op: 'party_add' | 'party_remove', party }`
    - `{ op: 'clause_add', text }`
- *Server logic:* `lib/leasing/amendments.js`.
  - **`draftAmendment(db, leaseId, changes, effectiveDate)`** validates against the lease's current state and computes a billing preview (old vs new monthly charges from the effective date).
  - **`generateAmendmentDocument`** uses LEAS-08 with an amendment template. `lease_templates` gets `kind 'amendment'` in `metadata`, with a default body. Changes render as a numbered list.
  - **`sendAmendmentForSignature`** uses LEAS-09 with `subjectType 'amendment'`.
  - **`executeAmendment(db, id)`** runs on e-sign completion, or on staff "Mark executed" when signed on paper.
  - **`applyAmendment(db, id)`** runs on or after the effective date, either immediately or via a job. It calls only the CORE write paths:

    | Change | CORE write path |
    |---|---|
    | rent / term | CORE-01: insert a `lease_rent_steps` row (`source 'amendment'`, `effective_date`), then `lease_sync_current_rent`; term changes go through CORE-01's billing window |
    | concessions | CORE-05's engine (`lib/billing/concessions.js`), period-specific (PMX-2.75) |
    | recurring charges | `recurring_charges` rows, with CORE-03's frequency, GL and end-date fixes |
    | deposit | an additional deposit charge, or a partial refund, via CORE-04 (`lib/billing/deposits.js`) |
    | parties | `lease_parties` changes and the `responsibilityPct` rebalance |

    It is idempotent: `apply_result` records what was done, and a re-run does nothing.
  - **The CORE-01 dependency:** this item must not write `leases.rent` or `rent_accounts` itself. If CORE-01 isn't merged, LEAS-16 is blocked.
- *API routes / jobs:*
  - `POST app/api/leases/[id]/amendments` (draft)
  - `…/[amendmentId]/send`
  - `…/[amendmentId]/execute`
  - `…/[amendmentId]/apply`
  - Job `apply-amendments` (daily) applies Executed amendments whose `effective_date <= today`. It needs CORE-10.
- *UI:*
  - **"Amend lease" header action** in `lease_actions.jsx` opens a wizard (`wizard_dialog.jsx`) with three steps:
    1. Pick the changes from a checklist.
    2. Enter the values per change.
    3. Review the billing preview, then choose "Generate & send for signature" or "Save draft".
  - **New "Amendments" lease tab** (under Lifecycle) lists amendments with their status, document and apply result.
  - **Field locks once Active:** in `lease_money.jsx` and `config.jsx`, the billing fields (rent, deposit, term) become read-only with an "Amend" link. Drafts stay editable.
  - **Rent-schedule "Apply due"** routes through the same CORE path, owned by CORE-01. This item only adds the read-only lock.
  - **Resident portal:** amendments to sign appear through LEAS-10.
- *Permissions:* `leases.amend` ("Create and apply lease amendments"). Applying needs `accounting.post` as well.
- *Integrations:* through LEAS-08 and LEAS-09.

**Steps**
1. Confirm CORE-01's write-path API (function names) and CORE's concession API before starting.
2. Migration; the data layer `lib/supabase/lease_amendments.js` via `makeEntityData`.
3. `amendments.js`: draft and preview, then execute and apply, with tests per op type.
4. Routes, the wizard and the tab; lock the fields.
5. Document template and e-sign wiring.
6. Job.

**Research before building**
- Local rent-increase notice and cap rules that apply to a mid-lease amendment (HOUS-10, HOUS-11). Usually a rent increase mid-term needs tenant consent; the amendment is that consent.
- Whether the amendment must restate the lease (some state forms require a full re-execution). This is a Blue Moon/NAA question for LEAS-19.

**Acceptance criteria**
- **Billing follows the amendment.** A rent change from $1,500 to $1,600 effective the 1st:
  - before applying, the next rent charge is still $1,500
  - after applying on or after the effective date, the next charge job posts $1,600
  - both `leases.rent` and the CORE billing record read $1,600
  - re-running apply changes nothing
- **Concession example.** Adding a $100 concession for March only posts a single March credit through CORE's engine, and nothing in April.
- **Fee example.** Adding a $50/month parking fee from mid-month creates a recurring charge with the correct proration, per CORE's prorate setting.
- **Locks and void.**
  - An Active lease's rent field is read-only.
  - Editing through the API without an amendment is rejected (the server checks this in CORE-01's sync).
  - Voiding a Pending-signature amendment voids the e-sign envelope.
- **Ledger balance.** The trial balance stays balanced after every op.

**Depends on / unblocks**
- **Depends on:**
  - CORE-01 (billing follows the lease)
  - CORE-05 (concessions)
  - CORE-03 (recurring charges)
  - CORE-04 (deposits)
  - CORE-60 (rentable items)
  - LEAS-08, LEAS-09, LEAS-10
  - HOUS-10 (rent-increase caps)
- **Unblocks:** LEAS-17 (reuses the apply engine).

**Open decisions**
- Should small changes (adding a pet fee, for example) be allowed without a signature? Recommendation: a per-op "requires signature" default that staff can override, logged.

---

#### LEAS-17 · Unit transfers with balance and deposit transfer
- **MRI equivalent:** RM unit transfers. "Transfer residents from one unit to another", "Schedule and complete unit transfers", with transferred balances and transfer concession codes. Moves, including transfers, can be undone (X.5.3).
- **Status · priority · effort:** Missing · P2 · L
- **Refs:** Gap 2.11 · Inventory 2b.83 · PMX-2.84, PMX-2.91

**Geiger today**
- **There is no transfer flow.** A grep for `transfer` in `components/internal/screens/leasing` and `lib/leasing` finds only bank and ledger transfers and the renewal carry-over switches (inventory 2b.83).
- **The closest code is renewal acceptance.** `acceptRenewal` (`lib/leasing/workflows.js:183-240`) creates a new lease, copies parties, and repoints recurring charges and Held deposits. It doesn't repoint the rent account (gap 0.1, fixed by CORE-01), and AR stays on the old lease's ledger (inventory 2b.61).
- **Deposits are held per lease in the ledger.** Balances are computed by `lease_id` (`lib/jobs/financial.js:444-452`), so moving the `security_deposits` row alone leaves the ledger liability on the old lease.

**What's missing**
- **A transfer wizard:** target unit, date, new terms, and options to transfer the balance and the deposit, add a transfer concession and charge a transfer fee.
- **The two leases and moves:** a new lease, plus a move-out on the old unit and a move-in on the new one, with inspections.
- **Ledger journals:** for the AR balance and the deposit liability between leases.
- **Billing switch-over:** billing stops on the old lease and starts on the new one.
- **Undo.**

**How to build**
- *Data model.* Migration `unit_transfers`, which creates the table `property.unit_transfers`.

  | Column | Notes |
  |---|---|
  | `project_id` | |
  | `from_lease_id` | |
  | `to_lease_id` | |
  | `from_unit_id` | |
  | `to_unit_id` | |
  | `tenant_id` | |
  | `transfer_date` | |
  | `status` | `Scheduled \| Completed \| Undone \| Cancelled` |
  | `options` | jsonb: `{ transferBalance, depositMode: 'transfer'\|'refund_recollect', depositAmount, concession, fee }` |
  | `ledger_entry_ids` | jsonb |
  | `move_out_id`, `move_in_id` | |
  | standard columns | |

- *Server logic.* New file `lib/leasing/transfers.js`.
  - **`scheduleTransfer(db, input)`** creates:
    - the new lease (status Pending, `metadata.transferFromLeaseId`), with parties copied and the copy logic factored out of `acceptRenewal` (`workflows.js:212-231`) into a shared `copyParties(db, fromId, toId)`
    - a move-out on the old lease and a move-in on the new one, via the `scheduleMoveOut` and `scheduleMoveIn` patterns (`workflows.js:251-340`), using server versions with `metadata.transferId`
    - optionally a hold on the target unit (LEAS-13 `placeHold`)
  - **`completeTransfer(db, transferId)`** runs on the transfer date or from the staff action. Every step below is idempotent and keyed `transfer:<id>:<step>`.
    1. Stop billing on the old lease through CORE-02's `closeOutLease(admin, lease, throughDate)` (`lib/billing/rent.js`). Prorate per CORE-02.
    2. Start billing on the new lease through CORE-01, and activate it.
    3. If `transferBalance`: post a journal (`buildJournal`, `lib/ledger/postings.js:410-422`) for the net open AR, as Dr AR with the new lease's dimensions / Cr AR with the old lease's dimensions. Allocate it to the old open items, so the old lease nets to 0. Reverse the sides for a credit balance.
    4. If `depositMode = transfer`: post Dr `security_deposits` (old lease) / Cr `security_deposits` (new lease) for the held amount, and repoint the `security_deposits` row as `acceptRenewal` does (`workflows.js:228-230`). The `refund_recollect` mode is not built in this item; it is left to CORE's deposit disposition.
    5. Post the transfer concession through CORE's concession engine and the transfer fee as a charge (`buildCharge`).
    6. Update occupancy: the old unit goes Make-ready or Vacant (unit turn optional), the new unit Occupied, and the tenant points to the new lease (`syncOccupancy`, `workflows.js:343-367`, server version). The old lease is set to status Ended with `metadata.transferredTo`.
  - **`undoTransfer(db, transferId)`** voids the recorded ledger entries (`voidPosted`, `lib/ledger/store.js:62-70`), restores the statuses and repoints, and is allowed only before the next billing run on the new lease.
  - Every ledger entry uses `source_type 'adjustment'` with `metadata.kind 'unit_transfer'`, since `ledger_entries_source_chk` (`supabase/migrations/20261015212744_ledger_core.sql:73-76`) has no transfer type.
- *API routes / jobs:*
  - `POST app/api/leases/[id]/transfer` (schedule)
  - `POST app/api/transfers/[id]/{complete,undo,cancel}`
  - Optional job `complete-transfers` for the scheduled date. It needs CORE-10.
- *UI:*
  - **Header actions.** "Transfer to another unit" on the lease (`lease_actions.jsx`, shown for live leases) and on the tenant.
  - **The wizard.** Steps:
    1. Target unit: vacant or make-ready, filtered by property.
    2. Date and terms: rent prefilled from the unit, plus the term.
    3. Money: balance shown live from the ledger, deposit mode, concession, fee.
    4. Review: the journal preview.
  - **Moves screen.** Shows "Transfer" badges.
  - **Lease Lifecycle tab.** Shows the transfer chain in both directions.
- *Permissions:* `leases.transfer`, plus `accounting.post`.
- *Integrations:* none.

**Steps**
1. Confirm the CORE-01 (`onLeaseActivated`) and CORE-02 (`closeOutLease`) write paths.
2. Migration and data layer.
3. `copyParties` refactor (no behaviour change to renewals).
4. `transfers.js` with ledger tests: debit balance, credit balance, zero balance; deposit transfer; undo.
5. Routes, wizard, badges.

**Research before building**
- How PMX treats transfer proration and the transferred balance (Skilljar "Move-Outs and Transfers"). Whether a balance transfer should carry the original charge dates for aging, or show as one transfer line. Recommendation: one line, with a memo listing the source items.
- State rules on transferring a deposit between units without a full move-out accounting (CA 1950.5, for example). Coordinate with CORE's deposit item.

**Acceptance criteria**
- **Debit balance.** Old lease with $320 open AR and an $1,800 deposit, transferred with both options on:
  - the old lease shows AR 0 and deposits held 0
  - the new lease shows AR 320 and deposits held 1,800
  - the trial balance is unchanged in total
- **Credit balance.** A credit balance moves as a credit.
- **Billing.** The next rent run bills only the new lease. The old lease bills its prorated final period per CORE.
- **Occupancy.** The old unit is Make-ready, the new unit Occupied, and the tenant's `lease_id` is the new lease.
- **Undo.** Undo before the next billing run restores every balance and status, and every journal is void.
- **Idempotency.** Re-running `completeTransfer` posts nothing new.

**Depends on / unblocks**
- **Depends on:**
  - CORE-01
  - CORE-02 (billing stops at move-out)
  - CORE-04 (deposits)
  - CORE-05 (concessions)
  - LEAS-16 (shared apply engine and patterns)
  - LEAS-08/09 (new lease signing)
- **Unblocks:** none.

---

#### LEAS-18 · Bulk renewal offers (renewal worksheet)
- **MRI equivalent:** RM Lease Renewal Worksheet, which creates "renewal offers for multiple residents at a time". Multi-property worksheets offer LRO and DHCR options, and there is a Worksheet Management page.
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Gap 2.12 · Inventory 2b.55–2b.68 · PMX-2.76, PMX-2.78

**Geiger today**
- **Offers exist one lease at a time.**
  - Single offer: the "Offer renewal" wizard (`components/internal/screens/leasing/lease_actions.jsx:193-248`) calls `createRenewalOffer` (`lib/leasing/workflows.js:140-165`).
  - That function already supports `metadata.offerOptions[]`. Nothing writes it (inventory 2b.65).
- **Several renewal fields are saved but never read.**
  - `marketRent` and `rentCapPct` on the renewal (`components/internal/screens/leasing/renewals.jsx:548-549`).
  - The policy `renewalNoticeDays` (default 90, `lib/policies.js:103`).
- **The renewal-offer email isn't live.** The catalog has it with `live: false` (`lib/email/catalog.js:56-63`).
- **No batch caller exists for `createRenewalOffer`.**

**What's missing**
- **A worksheet** listing the leases expiring in a window, with current rent, market rent, proposed rent and cap checks.
- **Bulk rules:** % increase, a cap at market, rounding, term options and an incentive.
- **Bulk create**, with an optional send.
- **Saved worksheets.**

**How to build**
- *Data model:* no new table.
  - Each offer is a `renewals` row with:
    - `metadata.worksheetId`, `worksheetName`
    - `offerOptions[]`: `{ termMonths, rent }`
    - `marketRent`, `capPct`
  - The worksheet header is stored in settings key `renewal_worksheets` as `[{ id, name, createdAt, filters, rules }]`. The header is small, so that is enough.
- *Server logic:* `lib/leasing/renewal_worksheet.js`.
  - `candidateLeases(db, { projectId, propertyIds, endFrom, endTo })`: Active, Expiring soon or Month-to-month leases with no open renewal.
  - `priceRow(lease, { rule, marketRent, capPct, rounding, termOptions })` → `{ proposedRent, options[], capped, warnings }`. It is pure and unit-tested.
  - **Inputs to `priceRow`:**
    - Market rent comes from the unit's market rent field, else the median of nearby `rent_comps` for the same bed count, else LEAS-21 data.
    - The cap comes from HOUS-10's cap check, once built. Until then, use the renewal's `rentCapPct`.
    - Response due defaults to today + `renewalNoticeDays`. It warns when the lease ends sooner than the notice period allows.
  - `createOffers(db, worksheetId, rows, { send })` → a batch `createRenewalOffer` (server version), plus the email `property.renewal_offer`. Mark that email `live: true` once it is sent.
  - Online accept and sign is LEAS-45 (Part B). Accepting must repoint billing via CORE-01; `acceptRenewal`'s defect is fixed there.
- *API routes / jobs:*
  - `POST app/api/renewals/worksheet/preview`
  - `POST app/api/renewals/worksheet/create`
- *UI:*
  - **Entry point:** a "Renewal worksheet" button in the Renewals header (`config.headerActions`, `entity_list_screen.jsx:436`). It opens a full-width worksheet screen.
  - **Filters:** window, property.
  - **Rule bar:** +% or +$, cap at market, round to $5/$10, term options (e.g. 12 months at X, 6 months at X + $50), incentive.
  - **Editable table:** unit, tenant, end date, current rent, market rent, proposed rent, Δ%, cap flag, include checkbox. Paginate with `components/internal/shared/pagination.jsx`.
  - **Footer:** totals (current vs proposed monthly revenue).
  - **Actions:** "Create offers" / "Create & send".
  - **Saved worksheets:** a drop-down to reopen them.
- *Permissions:* `renewals.bulk` ("Create renewal offers in bulk").
- *Integrations:* geiger-dash email.

**Steps**
1. Write `priceRow` with tests.
2. Write `candidateLeases` and the preview route.
3. Build the worksheet UI.
4. Build bulk create and send, and turn on the email template.
5. Save and reopen worksheets.

**Research before building**
- **Rent-increase notice periods by state and city** (HOUS-11): for example, CA 90 days for increases over 10%, and OR 90 days.
  - Use the stricter of policy and law.
- **Market-rent source precedence:** check with the user.

**Acceptance criteria**
- **Candidates:** a 90–120 day window with 12 matching leases lists exactly those leases. Leases with an open renewal are excluded.
- **Pricing rule:** "+4%, cap at market, round to $5" with current $1,500 and market $1,540 proposes $1,540, flagged as capped at market.
- **Rent-cap warning:** under a 5% cap with a $1,600 proposal against $1,500, the row warns and blocks unless overridden.
- **Create offers:** 12 renewals rows with the same `worksheetId` and `offerOptions`. With "send", 12 emails are logged and `offerSentOn` is set.
- **Short notice:** a lease ending in 45 days with a 90-day notice policy is flagged.

**Depends on / unblocks**
- **Depends on:**
  - CORE-01, so that acceptance repoints billing.
  - HOUS-10 (rent-increase caps), HOUS-11 (notice periods).
  - LEAS-21 (optional, for market rent).
- **Unblocks:** LEAS-45 (bulk offers then accepted online).

---

#### LEAS-19 · State lease forms (partner forms or a vetted library)
- **MRI equivalent:** Blue Moon. The integration "populates over 50 resident data points" into state apartment-association lease forms and generates PDF leases for move-ins, renewals and transfers.
- **Status · priority · effort:** Partial · P2 · M
- **Refs:** Gap 2.6 (state forms) · Inventory 2b.35, 2b.41, 2b.44 · PMX-2.70

**Geiger today**
- **Templates can be generic or state-specific.** The scope is `generic` or `state` (`lib/supabase/lease_templates.js:4-15`; `components/internal/screens/leasing/lease_templates.jsx:58, 239-240`). Each manager writes their own body text.
- **Several settings are stored but have no effect:**
  - The clause flags "required in every lease" and "only for states" (2b.41).
  - The state disclosure checklists, such as lead paint (2b.44).
- **No vetted form content ships with Geiger.**

**What's missing**
- **Vetted state forms.** Either licensed through a partner, or a vetted starter library per state.
- **Required clauses and disclosures enforced** before a PDF can be generated.

**How to build**
- *Data model:*
  - `lease_templates` gets `source` (`custom | partner:<key>`), `form_id` and `form_version` in `metadata`.
  - Partner credentials come from env, or `property.integration_secrets` (PLAT-01h) per project.
- *Server logic:*
  - **Partner adapter** in `lib/leasing/forms/adapter.js`:
    - `listForms(state)`
    - `populate({ formId, data })` → `{ pdf, fieldsUsed }`
    - `mapMergeValues(values)`, which maps our 39 `MERGE_FIELDS` (`lib/leasing/merge.js:47-87`) to the partner's field names.
  - **When a lease uses a partner template,** LEAS-08 gets its PDF from `populate()` instead of rendering text. Signature anchors come from the partner's form layout, or fall back to coordinate fields if the e-sign provider supports them.
  - **Enforcement** in `lib/leasing/forms/requirements.js`: before generating, check required clauses for the lease's state and the template's disclosure checklist. Block with a list of what's missing.
- *API routes / jobs:* none new beyond LEAS-08's route.
- *UI:*
  - **Templates screen:** an "Import state form" action that shows the partner's catalogue for the state.
  - **Template editor:** a read-only body for partner forms, plus a field-map preview.
  - **Lease Document tab:** shows blocking requirements.
- *Permissions:* `settings.manage`.
- *Integrations:* Blue Moon or NAA Click & Lease, if chosen.

**Steps**
1. Get a partner decision and access.
2. Build requirement enforcement. This is useful without a partner.
3. Write the adapter and field map against the partner sandbox.
4. Add the import UI.

**Research before building**
- **Blue Moon.**
  - Blue Moon powers NAA Click & Lease and the TAA/GAA libraries.
  - Its developer API is server-side SOAP (lease forms, rental applications, admin services), and vendors must register: https://cms.bluemoonforms.com/resources/developers/
  - NAA says the API is "open and free" for software providers, but each property needs its own active Click & Lease or association membership: https://naahq.org/lease/faq
  - Rent Manager and Rentec Direct already integrate: https://www.rentmanager.com/integrations/blue-moon/
- **Coverage.** Which states have association forms through Blue Moon, versus states with no association form.
- **Alternatives.** No public lease-form API was found from ezLandlordForms, LawDepot or Rocket Lawyer (unverified). Instead, consider a starter library reviewed by a landlord-tenant attorney, kept as seed templates per state (`supabase/seeds/`).
- **Required disclosures by state.** Lead paint is federal (pre-1978). Also mold, bed bugs, flood zone, and others. Use the `us-landlord-tenant-resources` skill and the Legal Resources data (`property.legal_resources`).

**Acceptance criteria**
- **Required clauses.** A Texas lease on a template missing a required clause can't generate a PDF, and the missing clause is named.
- **Partner import (if a partner is chosen).**
  - Importing a state form creates a template with `source = partner:bluemoon`.
  - Generating for a lease produces the partner PDF with ≥ 50 data points filled.
  - The lease records the form version.

**Depends on / unblocks**
- **Depends on:** LEAS-08, LEAS-09.
- **Unblocks:** none in this part.

**Open decisions**
- **Blue Moon (via NAA).** Integrate Blue Moon for members of NAA or a state association? This requires each customer's membership, which many 10–500-unit landlords lack.
- **Attorney-reviewed library.** Or fund an attorney-reviewed starter library for the top N states. That carries cost and liability.
- **Neither.** Or offer only enforcement and templates the customer supplies.

---

#### LEAS-20 · Call tracking numbers, recording and call log
- **MRI equivalent:** Engage Interact. It provides:
  - unique tracking numbers
  - inbound call recording
  - ad-effectiveness reports
  - a summary, transcript and recording for every call, logged against the guest card

  Interact's automated answering (speech recognition) is not covered here.
- **Status · priority · effort:** Saved-unused · P3 · L
- **Refs:** Gap 2.14 · Inventory 2a.10 · PMX-2.25–2.27, PMX-7.22

**Geiger today**
- **The listing has a manual "Tracking phone" field** (`components/internal/screens/marketing/sections/listing_sections.jsx:257`). Nothing reads it.
- **There is no voice integration.**

**What's missing**
- **Tracking numbers per listing and source:** provisioned, then forwarded to the office.
- **Recording**, with a consent announcement.
- **A call log on the prospect.**
- **Missed-call follow-up tasks.**
- **Source attribution**, plus call metrics in LEAS-15.

**How to build**
- *Data model:*
  - **Tracking numbers.** Stored in `leasing_sites.metadata.trackingNumbers[]`: `{ e164, providerSid, listingId?, source, forwardTo }`.
  - **Calls.** Each call is a `record_items` row with `kind 'call'` on the prospect, holding:
    - `{ direction, from, to, trackingNumber, durationSec, status: answered|missed|voicemail }`
    - `recordingRef`: a `{ bucket: 'property-files', path }` ref (PLAT-01g), never a public URL
    - `transcript` (optional) and `providerCallId`
- *Server logic:*
  - **Adapter** in `lib/calls/adapter.js`:
    - `provisionNumber({ areaCode })`
    - `releaseNumber`
    - `parseCallWebhook(payload)` → `{ callId, from, to, status, duration, recordingUrl }`
    - `fetchRecording`
  - **Providers** in `lib/calls/providers/{twilio,callrail}.js`.
  - **On call completed:**
    1. `ingestLead(db, { channel: 'phone', source: tn.source, contact: { phone: from } })` (LEAS-02).
    2. Append the call item.
    3. Copy the recording into private storage.
    4. If the call was missed, create a follow-up due in 1 hour.
  - **TwiML or flow for Twilio:** a recording announcement, then dial the forward-to number with `record` set.
- *API routes / jobs:*
  - `POST app/api/calls/webhook/[provider]/route.js`, with signature verification.
  - `POST app/api/calls/voice/[numberId]/route.js` (Twilio voice URL).
- *UI:*
  - **Settings → Integrations:** a "Call tracking" card to buy and release numbers and assign them to listings or sources.
  - **Prospect "Calls" tab:** audio played through a signed URL.
  - **Listing page:** shows the tracking number.
  - **LEAS-15 report:** gains calls by source, answer rate and missed calls.
- *Permissions:* `settings.manage` to buy numbers.
- *Integrations:* Twilio or CallRail. The provider choice is an open decision.

**Steps**
1. Choose the provider.
2. Write the adapter and webhook.
3. Provision numbers in the UI.
4. Build the call log and recordings.
5. Add the report sections.

**Research before building** (first pass 2026-11)

| Provider | Pricing | Docs |
|---|---|---|
| Twilio | Local numbers $1.15/mo; recording $0.0025/min; transcription $0.05/min | https://www.twilio.com/voice/pricing/us, https://www.twilio.com/docs/voice/api/recording |
| CallRail | $50–$195/mo with 5 numbers and 250 minutes; transcription by tier; post-call webhooks with the recording link | https://www.callrail.com/pricing, https://support.callrail.com/hc/en-us/articles/5711246459149 |

- **Recording consent.** All-party consent states include CA, CT, FL, IL, MD, MA, MT, NH, PA and WA. Play an announcement on every call. Source: https://www.dmlp.org/legal-guide/recording-phone-calls-and-conversations (the page is no longer maintained; verify).
- **Reuse.** Can geiger-campaign's per-project Twilio connection (`C:\Pro\geiger-campaign\lib\channels\twilio.js`) be extended to voice, sharing one Twilio account per customer?

**Acceptance criteria**
- **Answered call from a new number.** Creates a prospect with `source` set to the tracking number's source, plus a call item with duration and a private recording. The recording is playable by staff only.
- **Missed call.** Creates a 1-hour follow-up.
- **Recording announcement.** Plays before the connect.
- **Duplicate webhooks.** Produce one call item, keyed on `providerCallId`.
- **Reporting.** LEAS-15 shows calls per source.

**Depends on / unblocks**
- **Depends on:** LEAS-02, LEAS-15, PLAT-01.
- **Unblocks:** none.

**Open decisions**
- **Which provider:** Twilio, cheaper and in the suite via geiger-campaign, or CallRail, turnkey with dashboards.
- **AI call summaries are deferred.** This follows the no-AI decision. Store transcripts now as the hook.

---

#### LEAS-21 · Market rent data feed
- **MRI equivalent:** ApartmentData. It provides publicly advertised asking rents, occupancy, specials and policies for comp sets, with surveys and change scans. It explicitly does not give pricing recommendations, and it covers about 17,000 communities in 12 metros.
- **Status · priority · effort:** Partial · P3 · M
- **Refs:** Gap 2.15 · Inventory 2a.58, 2b.13 · PMX-2.12

**Geiger today**
- **Rent comps are entered by hand.** Each comp has observations over time, stored as `record_items` with `owner_type 'comp'` (`lib/supabase/rent_comps.js:3-24`; `components/internal/screens/marketing/rent_comps.jsx:48-123`; `sections/comp_sections.jsx:13-87`).
- **The lease's market-rent field is saved but not used** (`lease_money.jsx:73`, inventory 2b.13).
- **Nothing connects comps to pricing or renewals.**

**What's missing**
- **A provider feed** for estimated market rent and nearby comparables per unit or address.
- **Scheduled refresh**, and history.
- **Use in the renewal worksheet** (LEAS-18) and on listings: an "asking vs market" indicator.

**How to build**
- *Data model:*
  - **No new table.**
  - **Provider comps:** stored as `rent_comps` rows with `source = 'rentcast'` (or another provider) and `metadata.providerId`.
  - **Observations:** stored as `record_items` with kind `observation`.
  - **Unit market rent:** `units.metadata.marketRent = { amount, low, high, source, asOf }`.
- *Server logic:*
  - **Adapter** — `lib/market_data/adapter.js`:
    - `rentEstimate({ address, beds, baths, sqft, propertyType })` returns `{ rent, low, high, comps[] }`.
    - `fairMarketRent({ zip | county })` uses HUD FMR, which is useful to HOUS too.
  - **Providers** — `lib/market_data/providers/{rentcast,hud_fmr}.js`.
  - **Refresh** — `refreshUnitMarketRent(db, unitId)` updates `units.metadata.marketRent` and upserts the comps.
- *API routes / jobs:*
  - `POST app/api/market/units/[id]/refresh` (staff).
  - Job `market-rents`, monthly, for vacant units and leases expiring within 120 days. It runs within the provider quota and depends on CORE-10.
- *UI:*
  - **Unit Rent section:** a "Market rent" card showing the estimate, its range, the source and the date, plus a Refresh button.
  - **Rent Comparables screen:** an "Import nearby comps" action.
  - **Listing overview:** "Asking $1,650 · market $1,600–1,720".
  - **LEAS-18 worksheet:** reads `marketRent`.
- *Permissions:* none new.
- *Integrations:* RentCast and HUD FMR (free).

**Steps**
1. Choose the provider.
2. Write the adapter and the HUD FMR provider (free, so it can be tested first).
3. Add the RentCast provider.
4. Build the UI cards and the job.

**Research before building** (first pass, 2026-11)

| Source | Cost and access | Notes |
|---|---|---|
| RentCast API | 50 free requests/month. Paid tiers reported at $74, $199 and $449/month for 1k, 5k and 25k requests | Same nationwide data on every plan. https://developers.rentcast.io/reference/billing-and-pricing |
| Rentometer | Requires Pro, credit-based | Commercial use is governed by an API addendum (unverified). https://www.rentometer.com/rentometer-api-pricing |
| HUD FMR API | Free, needs a token | Must carry a "not endorsed by HUD" notice. https://www.huduser.gov/portal/dataset/fmr-api.html |
| Zillow ZORI | Free CSV | Commercial use is unverified |
| ApartmentData (MRI) | Price unpublished | Covers properties with 50+ units; a poor fit for this market |

- **Data rules:** check each provider's terms on storing and redisplaying its data.

**Acceptance criteria**
- **Refresh with a provider configured:** writes `marketRent` with `source` and `asOf`, and adds or updates at most N comps per unit.
- **Re-runs stay within quota:** a second refresh in the same month uses the cached value.
- **Worksheet:** LEAS-18 shows that market rent.
- **No provider configured:** the card shows "Not connected" and manual comps still work.

**Depends on / unblocks**
- **Depends on:** CORE-10.
- **Unblocks:** LEAS-18 (market rent), HOUS (FMR).

**Open decisions**
- **Paid provider.** Whether to pay for RentCast (or similar) at platform level and include it in the per-unit price, or offer it as an add-on.

---

### Not building here
| MRI product | Why not | Revisit trigger |
|---|---|---|
| Engage Interact automated answering (speech-recognition IVR, community voicemail; PMX-2.26, PMX-10.25) | A call-centre feature for large operators. LEAS-20 covers tracking and recording. | Customers with more than 500 units or several leasing offices ask for after-hours call handling. |
| Engage Leasing Chatbot and Agora Voice tour booking (PMX-2.29, PMX-10.15) | AI is out of scope under the standing no-AI decision. Hook points for a future suite AI package: the public inquiry API (LEAS-02), the tour slots and booking API (LEAS-14), and the stored call transcripts (LEAS-20); see PLAT-18 for the AI groundwork. | The suite AI package ships. |
| ApartmentData locator network, market surveys and Competition Radar (PMX-2.12, PMX-2.13) | MRI-owned data built for properties with 50+ units, outside our 10–500-unit focus. LEAS-21 gives estimates instead. | Customers ask for comp-set surveys. |
| Website live chat (Engage Interact web chat, PMX-2.28) | Covered by LEAS-54 (Part B, live chat on the property website); it should mount on LEAS-01's public pages. | — |
| Craigslist and Facebook Marketplace automated posting | No feed path: Facebook ended partner rental feeds in 2021, and Craigslist bulk posting is limited to high-volume posters case by case. These stay manual in LEAS-11. | Either channel reopens feeds to software vendors. |


---

## Part B — Resident experience and payments

### Scope
- **MRI products covered:** Engage Connect (was Resident Connect / Online Renewals, plus the new Engage Connect app), Engage Pay (was RentPayment; also DuesPayment and StorageRentPayment), Engage Interact (was Callmax), Engage Insure (was MRI Multifamily Insurance).
- **Geiger areas touched:** `lib/messaging/*`, `app/api/messages/*`, `lib/email/*`, `lib/portal/*`, `app/api/portal/*`, `components/portal/*`, `lib/payments/*`, `app/api/payments/*`, `app/api/stripe/webhook`, `lib/jobs/*`, `lib/automations/runner.js`, `lib/leasing/workflows.js`, renewals and work-order screens, Settings → Notifications / Payment Processing / Integrations, the tenant record, and new staff screens (Conversations, Announcements, On-call, Packages).
- **Verified at HEAD `fecb165`.** No file in scope has changed since the inventory's `4fdcbd7`. Where the inventory's line numbers are wrong, the item says so.

### Summary
| ID | Feature | MRI product | Geiger today | Priority | Effort |
|---|---|---|---|---|---|
| LEAS-40 | Contact preferences, consent ledger and a multi-channel notify dispatcher | Engage Interact | Saved-unused | P1 | M |
| LEAS-41 | Staff inbox for resident, owner and vendor threads | Engage Interact (hub) | Saved-unused | P1 | L |
| LEAS-42 | Work-order updates to residents, with staff replies on requests | Engage Connect | Partial | P1 | M |
| LEAS-43 | Announcement and bulletin composer with segments and scheduling | Engage Interact (Bulletins) | Partial | P1 | M |
| LEAS-44 | SMS provider adapter (Twilio first): send, receipts, inbound, STOP/HELP, sender registration | Engage Interact | Missing | P1 | L |
| LEAS-45 | Resident views, accepts and signs a renewal online | Engage Connect (Online Renewals + Secure Sign) | Missing | P1 | L |
| LEAS-46 | SMS rent reminders and receipts; pay by replying to a text; saved payment methods | Engage Pay, Engage Interact | Partial | P2 | M |
| LEAS-47 | Autopay options: fixed amount, cap, charge day, skip months, end date, scheduled payments | Engage Pay | Partial | P2 | M |
| LEAS-48 | Installable resident app (PWA) with push and an in-portal notification bell | Engage Connect app | Missing | P2 | M |
| LEAS-49 | Emergency on-call routing with on-call schedules and escalation | Engage Interact | Partial | P2 | L |
| LEAS-50 | Renters insurance: partner sale, verified compliance, force-placed coverage | Engage Insure | Tracking-only | P2 | L |
| LEAS-51 | In-office payments: fast counter entry and check scanning (remote deposit) | Engage Pay | Missing | P2 | L |
| LEAS-52 | Cash rent at retail stores | Engage Pay (MoneyGram partner) | Missing | P2 | M |
| LEAS-53 | Package tracking with notifications and pickup records | Engage Interact | Missing | P3 | M |
| LEAS-54 | Live chat on the property website | Engage Interact (Web Chat) | Missing | P3 | M |
| LEAS-55 | Resident surveys (maintenance CSAT, community surveys) | Engage Interact | Missing | P3 | M |
| LEAS-56 | Rent reporting to credit bureaus | Engage Pay (Piñata partner) | Tracking-only | P3 | M |
| LEAS-57 | Pay by phone (24/7 IVR) and voice bulletins | Engage Pay, Engage Interact | Missing | P3 | M |
| LEAS-58 | Bank balance check before an ACH debit | Engage Pay (Revenue Shield / Plaid) | Missing | P3 | S |
| LEAS-59 | Flexible (split) rent through a partner | Engage Pay (Flex partner) | Missing | P3 | M |

### Build order
1. **LEAS-40** first. Every later sender goes through its dispatcher, so opt-outs, quiet hours and channel choice get enforced in one place.
2. **LEAS-41** next. Residents can already message the office, but no staff screen shows those messages (`lib/portal/common.js:142-188`), so they go unread. This is the most visible P1 defect in scope.
3. **LEAS-42** and **LEAS-43** are email-first and gain SMS automatically once LEAS-44 lands.
4. **LEAS-44** (SMS). It has a lead time: sender registration with carriers takes days to weeks, so start registration research early.
5. **LEAS-45** (online renewal). Needs LEAS part A's e-signature adapter (gap 2.5) and lease PDF (gap 2.6) to be fully automatic. Needs the CORE billed-rent fix (gap 0.1) so an accepted renewal bills correctly. LEAS part A's bulk renewal offers (gap 2.12) reuse its `sendRenewalOffer`.
6. P2 order: **LEAS-46**, then **LEAS-47** (they share the off-session charge helper), **LEAS-48** (adds the push channel), **LEAS-49** (needs SMS and push), **LEAS-50** (sale point inside LEAS part A's online application, gap 2.1), **LEAS-51** and **LEAS-52** (both need the CORE deposit batching / undeposited-funds item, gap 11.4, and manual receipts, gap 11.1).
7. P3 in any order once the above exist. **LEAS-54** needs LEAS part A's public property pages (gap 2.2). **LEAS-56** and **LEAS-59** need the PLAT public API and webhooks (gap 9.5). **LEAS-57** reuses the LEAS-44 Twilio account.
- **Cross-cutting:** every portal-facing item depends on **PLAT-01** (data security; open RLS, public `products` bucket). Every scheduled behavior depends on the scheduling fix for gap 0.10 (CORE/PLAT): `vercel.json` has no crons, and LEAS-49 needs a run every 1–5 minutes.

### Items

#### LEAS-40 · Contact preferences, consent ledger and a multi-channel notify dispatcher
- **MRI equivalent:** Engage Interact. Residents are reached one at a time, by segment or all at once, by text, email or voice; SMS receipts carry STOP/HELP keywords.
- **Status · priority · effort:** Saved-unused · P1 · M
- **Refs:** Gap 4.1 (opt-outs) · Inventory 4.49, 4.50, 4.46 · PMX-4.18, PMX-4.25

**Geiger today**
- Residents and staff set preferred channel, email opt-in, SMS opt-in plus consent date, quiet hours and do-not-contact (`components/internal/screens/tenants/shared.js:80-91`; portal `lib/portal/common.js:192-245`).
  - The portal stamps `smsConsentOn` but keeps no proof of consent: no IP address, user agent or wording (`lib/portal/common.js:222`).
- Nothing reads these preferences.
  - `sendNotificationEmail` checks only the project toggles (`lib/email/notifications.js:216-231`).
  - `deliver()` sends to any address (`lib/messaging/deliver.js:34-71`).
  - Announcements go to every non-past tenant (`lib/messaging/announcements.js:254-264`).
  - Reminders call `sendOnce` directly (`lib/messaging/reminder_jobs.js:51-90`).
- Do-not-contact is a display badge only (`components/internal/screens/tenants/sections/overview.jsx:77`).
- Each send path (reminders, receipts, late notices, automations, announcements, staff sends) picks its own channel and dedupe.

**What's missing**
- An append-only consent ledger with proof, per party, channel and scope.
- One `canContact` gate covering opt-out, DNC, quiet hours, consent and address validity.
- One dispatcher that picks channels from the catalog, the project settings and the resident's preference, then dedupes and logs.
- A message category on every catalog notification (transactional, reminder, announcement, marketing, legal, emergency).

**How to build**
- *Data model:* migration `message_consents`, scaffolded with `npm run db:new -- message_consents --template table`.
  - New table `property.message_consents`: `project_id`, `party_type`, `party_id`, `channel` (email|sms|voice|push), `address` (lower-case email or E.164), `status` (opted_in|opted_out), `scope` (all|transactional|marketing), `source` (portal|staff|sms_keyword|application|import), `proof jsonb` (ip, userAgent, wordingHash, messageSid, note), `occurred_at`, plus the standard columns.
  - Indexes: `(party_type, party_id, channel, occurred_at desc)` and `(channel, address)`.
  - Append-only: grant insert/select only. RLS lands with PLAT-01.
  - Add `send_after timestamptz` and `payload jsonb` to `property.notification_sends`, so quiet-hours deferrals can be re-driven.
  - Before pushing, confirm both names are unused in the live DB (`select to_regclass('property.message_consents')`); the DB has orphan tables.
- *Server logic:*
  - `lib/messaging/consent.js`: `recordConsent(db, {...})`, `latestConsent(db, { projectId, partyType, partyId, channel })`, and `canContact(db, { party, channel, category, now, timezone })` → `{ ok, reason: opted_out|dnc|no_consent|quiet_hours|no_address, retryAt? }`.
  - Rules:
    - SMS and voice need a latest `opted_in` row. Fall back to `metadata.smsOptIn` until the ledger has rows.
    - DNC blocks everything except `legal`.
    - `emailOptIn === false` blocks `announcement` and `marketing` but not transactional mail.
    - Quiet hours defer SMS, voice and push unless the category is `emergency`. Use the property timezone (`components/internal/screens/properties/sections/property_tabs.jsx:81`), else the company timezone (`components/internal/screens/settings/shared.js:35`).
  - `lib/messaging/notify.js`: `notifyParty({ db, projectId, party, notification, data, channels?, dedupeKey, recordType, recordId })`.
    - Resolves channels from catalog defaults, `settings.notifications.channels[key]` and `party.preferredContact`.
    - Gates each channel with `canContact`.
    - Delivers through `deliver()`, which gains `sms` (LEAS-44) and `push` (LEAS-48).
    - Upserts `notification_sends` with key `${dedupeKey}:${channel}`.
    - Mirrors the send into `tenant_communications` through `logCommunication` (`lib/messaging/threads.js:148`).
  - `lib/email/catalog.js`: add `category` and `channels` to every entry (`:19-128`). Add new keys `portal_message`, `payment_failed`, `package_arrived` and `emergency_page` as later items need them.
  - Refactor these callers to use `notifyParty` or `canContact`:
    - `sendOnce` (`lib/messaging/reminder_jobs.js:51`)
    - `deliverAnnouncement` (`lib/messaging/announcements.js:269`)
    - `sendPartyMessage` (`lib/messaging/send.js:114`): staff sends honor opt-out and return `not_sent` with a reason.
    - the late notice (`lib/jobs/financial.js:231-251`)
    - `sendPaymentReceipt` (`lib/payments/posting.js:289`)
  - `updateProfile` (`lib/portal/common.js:213`) writes a consent row with proof. Pass `ip` and `ua` from `app/api/portal/profile/route.js`.
- *API routes / jobs:*
  - New job `deferred-notifications` in `lib/jobs/operations.js`, every 15 minutes: re-sends `notification_sends` rows where `status='deferred' and send_after <= now`.
  - `GET /api/messages/consents?partyType&partyId` (staff, `requireStaff`) returns the ledger.
- *UI:*
  - Tenant → Communication section: a "Consent history" list (read-only `ChildRecords`) and a "Record consent" action (wizard: channel, status, source = staff, note, e.g. "signed lease addendum").
  - Portal Profile (`components/portal/shared/portal_profile.jsx`): SMS consent checkbox with the exact disclosure text (program name, frequency, "Msg & data rates may apply", STOP/HELP).
  - Settings → Notifications: a channel matrix (rows = catalog notifications, columns = Email / SMS / Push).
- *Permissions:* new `messaging.consent.manage` in `WORKSPACE_PERMISSIONS` (`lib/rbac.js:4-15`), advisory until PLAT-01.
- *Integrations:* none.

**Steps**
1. Migration for `message_consents` plus the `notification_sends` columns. Run `db:status`, `db:push`, `db:status`.
2. `consent.js` with unit-style checks covering DNC, quiet hours across midnight, missing timezone and the metadata fallback.
3. Catalog categories and channels.
4. `notify.js` dispatcher (email only until LEAS-44 and LEAS-48).
5. Refactor the five callers listed above.
6. Portal consent capture with proof.
7. Staff consent history, the "Record consent" action and the channel matrix.
8. `deferred-notifications` job.

**Research before building**
- TCPA consent for informational texts versus marketing texts. Check the FCC revocation order (reported as FCC 26-67, Sep 30 2026, effective Nov 25 2026): the seven keywords, the 10-business-day processing window, and scope limited to the message category for informational texts. https://tcpaworld.com/2026/01/07/breaking-fcc-pushes-back-tcpa-consent-revocation-rule-new-effective-date-now-january-31-2027/ and https://www.dlapiper.com/en/insights/publications/2026/10/fcc-tcpa-rule. Confirm against the FCC order itself.
- CTIA Messaging Principles and Best Practices: disclosure wording and the HELP response content.
- State mini-TCPA quiet hours (Florida 8am–8pm, Oklahoma, Maryland) and whether they reach non-marketing landlord texts.
- CAN-SPAM's transactional exemption: which notices may ignore email opt-out.

**Acceptance criteria**
- An `opted_out` SMS consent makes every path return `not_sent` with reason "opted out": staff send, automation step, announcement, rent reminder, receipt. Nothing reaches the provider.
- DNC on a tenant blocks a rent reminder but still sends a `legal`-category notice.
- An SMS planned at 22:30 property time with quiet hours 21:00–08:00 is stored `deferred` with `send_after` = next 08:00 and sent by the job. The same send with category `emergency` goes immediately.
- Ticking SMS consent in the portal inserts one ledger row with IP, user agent and wording hash. Unticking it inserts an `opted_out` row. Nothing is ever updated in place.
- Re-running a reminder job creates no duplicate per channel (`notification_sends` unique key).

**Depends on / unblocks**
- Depends on PLAT-01 (RLS on the ledger) and the gap 0.10 scheduling fix.
- Unblocks LEAS-41 through LEAS-49, LEAS-53 and LEAS-55, and LEAS part A lead texting (gap 2.7).

**Open decisions**
- Should email opt-out also suppress rent reminders, which are arguably transactional? Recommended: no. Only announcements and marketing honor email opt-out.

---

#### LEAS-41 · Staff inbox for resident, owner and vendor threads
- **MRI equivalent:** Engage Interact. A single hub threads calls, texts and email, with two-way text chat from the online portal.
- **Status · priority · effort:** Saved-unused · P1 · L
- **Refs:** Gap 4.1 · Inventory 4.38, 4.39, 4.40, 4.45, 4.48 · PMX-4.27

**Geiger today**
- Tables `property.message_threads` and `property.thread_messages` (`supabase/migrations/20261015212609_messaging_scheduler_automations.sql:67-120`), with `assigned_to`, `unread_count` and `status`.
- Portal members post into them (`lib/portal/common.js:142-188`) and read replies (`:102-139`).
- The staff send/reply API works on the server (`app/api/messages/send/route.js`; `lib/messaging/send.js:114-252`), but no component calls it.
- Only `lib/portal/common.js`, `lib/messaging/{send,threads}.js` and the inbound stub touch the thread tables. The inbox screen was removed on 2026-10-20.
- Inbound email/SMS: a provider-agnostic stub with a `reply+<threadId>@` matcher (`app/api/messages/inbound/route.js:6-13, 402-476`). It isn't wired, and geiger-dash's `/api/email/send` accepts no reply-to address (`C:\Pro\geiger-dash\app\api\email\send\route.js:41`).
- Templates exist (`lib/supabase/message_templates.js`), but their editor was removed (Inventory 4.45).

**What's missing**
- A staff screen to list, read, assign, reply to and close threads.
- Unread counts and new-message alerts.
- Inbound email replies.
- A template editor.
- Staff attachments.

**How to build**
- *Data model:*
  - Reuse `message_threads` and `thread_messages`.
  - Migration `message_threads_inbox`:
    - adds `last_read_at timestamptz`, `snoozed_until timestamptz` and `priority text`
    - adds index `(project_id, status, last_message_at desc)`
    - adds both tables to the `supabase_realtime` publication
- *Server logic:*
  - Keep `sendStaffMessage` as the single send path. Add `channel: "portal"`: a portal-only reply that also emails a `portal_message` "You have a new message" notice with a deep link `?tab=messages&thread=<id>` through `notifyParty` (LEAS-40).
  - `lib/messaging/threads.js`: add `markThreadRead`, `assignThread`, `setThreadStatus`.
  - Inbound email:
    1. Extend geiger-dash `/api/email/send` with `replyTo` (cross-repo change).
    2. Set `replyTo` = `reply+<threadId>@<inbound domain>` in `deliver()`.
    3. Route the inbound provider's webhook (Resend inbound, or a mailbox-forwarding service) through a small adapter into `/api/messages/inbound`.
- *API routes / jobs:*
  - `GET /api/messages/threads` (filters: status, mine, unassigned, partyType, propertyId, channel, unread; cursor pagination)
  - `GET /api/messages/threads/[id]`
  - `PATCH /api/messages/threads/[id]` (assign, status, read)
  - Use `requireStaff` (`lib/messaging/auth.js:22`) and the service-role client, matching the existing routes.
  - Staff alert on new inbound: `notifyParty` to `alertEmails`, or the assignee when set, debounced per thread for 10 minutes.
- *UI:*
  - New screen `components/internal/screens/messaging/conversations.jsx`, registered in `registry.jsx` and `sidebar_nav.jsx`.
  - Layout: a three-pane list → thread → context panel. The context panel shows the tenant/lease/property card, open work orders and balance.
  - Reuse the visual parts of the team chat (`components/internal/screens/communications/parts/{conversation_list,chat_thread,composer}.jsx`) for suite consistency.
  - Composer: channel picker (Portal / Email / SMS, disabled with a reason from `canContact`), template picker with merge preview (`lib/messaging/merge_fields.js`), internal note, attachments (private bucket after PLAT-01).
  - Tabs: Conversations, Templates (template CRUD over `message_templates`).
  - "Message" action on the Tenant/Owner/Vendor editors opens the composer prefilled.
  - Loaders use `LogoLoading`; buttons use `Loader2`.
- *Permissions:* `messaging.reply`, `messaging.assign`, `messaging.templates.manage`.
- *Integrations:*
  - **Recommended: native, not geiger-comms.** At `C:\Pro\geiger-comms`, Comms has a real shared inbox, assignment, SLAs and an email outbox (`app/api/inbox`, `lib/inbox`), but:
    - conversations live in schema `comms` against Comms contacts
    - it has no SMS channel
    - it has no cross-app API to create or append conversations
    - Property threads must link to tenant, lease and work order, and to portal membership
  - Revisit if Comms ships a conversation API plus SMS.

**Steps**
1. Migration (columns, index, realtime).
2. Thread routes plus lib helpers.
3. Conversations screen: list and thread.
4. Composer with channel gating and templates.
5. Context panel.
6. Templates tab.
7. "Message" actions on party editors.
8. New-inbound staff alerts.
9. Inbound email (after the dash `replyTo` change).

**Research before building**
- Whether geiger-dash can add `replyTo`, and which inbound route to use (Resend inbound emails docs at resend.com/docs; or Postmark inbound) on a subdomain of the sending domain.
- Supabase Realtime limits for the shared project. The chat already uses realtime (`mig/20261019205301_chat_workspace.sql`).

**Acceptance criteria**
- A portal message appears in Conversations within 5 seconds with an unread badge. Opening it clears `unread_count`.
- A staff reply on the "Portal" channel shows in the resident's Messages tab and sends one notice email.
- An "Email" reply delivers through geiger-dash. With inbound wired, the resident's email reply lands in the same thread.
- An SMS reply to an opted-out resident is blocked in the composer with the reason.
- An internal note is never returned by `listMessages` (`lib/portal/common.js:117`).
- An assigned thread shows under "Mine" for the assignee only.

**Depends on / unblocks**
- Depends on LEAS-40 and PLAT-01.
- Unblocks LEAS-44 (inbound SMS threads), LEAS-42 (staff replies) and LEAS part A lead messaging (gap 2.7).

**Open decisions**
- Sidebar placement and naming. Recommended: a "Messaging" group with Conversations and Announcements, beside the team-chat "Communications" item. This reverses part of the 2026-10-20 staff-UI removal, so it needs a yes.

---

#### LEAS-42 · Work-order updates to residents, with staff replies on requests
- **MRI equivalent:** Engage Connect. Residents "track, and receive updates on work orders".
- **Status · priority · effort:** Partial · P1 · M
- **Refs:** Gap 4.3 · Inventory 4.29, 4.30, 4.32, 5.51, 5.52 · PMX-4.38

**Geiger today**
- The portal shows status, timeline, schedule and photos (`lib/portal/resident.js:154-191`).
- `work_order_update` is in the catalog with `live: false` (`lib/email/catalog.js:65-73`).
- Staff toggles `shareWithTenant` and `notifyTenantOnStatus` are saved (`components/internal/screens/maintenance/sections/wo_approval.jsx:233-237`), and the schedule wizard sets them (`sections/wo_actions.jsx:206-229`). No code reads them.
- The portal filters on a different key, `hideFromTenant` (`lib/portal/resident.js:190`), which nothing writes.
- Status changes happen in three places:
  - the browser, via `statusPartial` / `withStatusHistory` (`sections/wo_shared.js:24-45`)
  - the vendor portal (`lib/portal/vendor.js:121-160`)
  - the owner portal (`lib/portal/owner.js:270-300`)
- The DB trigger emits only `work_order.created` and `.completed`, and only for kind `work_order` (`supabase/migrations/20261015214949_fix_record_event_trigger_array_append.sql:34-38`).
- Resident comments are stored in `metadata.portalComments` but never shown to staff (Inventory 4.30).

**What's missing**
- Status notifications to the resident.
- A staff view of resident comments, and replies to them.
- A status-change event for automations.

**How to build**
- *Data model:* migration `record_event_work_order_status`. It replaces `property.record_event_trigger()` and emits `work_order.status_changed` (payload: status, previousStatus, kind) for both kinds. Coordinate with the COMM item for gap 5.51 so request-kind creation also fires.
- *Server logic:* new `lib/maintenance/resident_updates.js` with `notifyWorkOrderUpdate(admin, workOrderId, { status, historyEntryId, comment })`.
  - Notify when:
    - the work order has a `tenant_id`, **and**
    - `shareWithTenant !== false` (default true when `metadata.source === "tenant"`), **and**
    - `notifyTenantOnStatus !== false`, **and**
    - the status is in {Approved/Converted → "scheduled", Scheduled, In progress, On hold, Completed, Rejected, Cancelled (by staff)}.
  - Include `tenantNote`, the scheduled date when `showScheduleToTenant`, and a deep link `?tab=requests&id=`.
  - Send through `notifyParty` (`notification: "work_order_update"`, category transactional), dedupe `wo-status:<id>:<historyEntryId>`.
  - Flip `live: true` in the catalog.
- *API routes / jobs:*
  - `POST /api/maintenance/work-orders/[id]/notify` (staff; `requireStaff`): the browser calls it fire-and-forget after a successful status commit in `withStatusHistory`.
  - `lib/portal/vendor.js:121` and `lib/portal/owner.js` call `notifyWorkOrderUpdate` directly after their update.
  - `POST /api/maintenance/work-orders/[id]/reply` (staff): appends `{ from: "staff" }` to `portalComments` and notifies.
- *UI:*
  - Work order → new "Resident updates" panel in `sections/wo_execution.jsx`, showing resident comments, staff replies and the notification log from `notification_sends` (`record_id`).
  - Reply box.
  - Portal `resident_requests.jsx` renders staff replies, styled differently.
- *Permissions:* `maintenance.reply_resident` (inherits `view.work_orders`).

**Steps**
1. Trigger migration.
2. `resident_updates.js` and the catalog flip.
3. Notify route and the call in `withStatusHistory`.
4. Vendor and owner portal hooks.
5. Reply route and panel.
6. Portal rendering of replies.

**Research before building**
- None external. Confirm with the COMM owner which visibility key wins (`shareWithTenant` versus `hideFromTenant`) and fix the portal filter in the same PR.

**Acceptance criteria**
- Moving a resident request to Scheduled with a date sends one email (and SMS once LEAS-44 is live) containing the date. Re-saving the same status sends nothing.
- A vendor setting In progress in the vendor portal notifies the resident.
- `notifyTenantOnStatus = false` suppresses all sends.
- A staff reply appears in the portal thread of that request and is emailed.
- `automation_events` gets `work_order.status_changed` for both kinds.

**Depends on / unblocks**
- Depends on LEAS-40 and COMM (gaps 5.51, 5.52).
- Unblocks LEAS-55 (completion CSAT) and LEAS-48 (push).

---

#### LEAS-43 · Announcement and bulletin composer with segments and scheduling
- **MRI equivalent:** Engage Interact Bulletins. Phone, text and email bulletins with a delivery date and time, targeted lists, templates and history.
- **Status · priority · effort:** Partial · P1 · M
- **Refs:** Gap 4.1 · Inventory 4.42, 4.43, 4.44 · PMX-4.25, PMX-4.26

**Geiger today**
- Delivery works on the server, idempotent per recipient (`lib/messaging/announcements.js:269-362`; `app/api/messages/announce/route.js`).
- The audience is all tenants, a property, a building, owners or vendors (`:225-265`). There is one channel per announcement.
- The scheduled job reads the date-only `scheduled_for` (`lib/messaging/reminder_jobs.js:520-542`).
- The portal shows sent announcements (`lib/portal/common.js:14-43`).
- No staff screen exists, and there is no data layer under `lib/supabase/`.
- The landing page claims open tracking (Inventory 4.44).

**What's missing**
- A composer screen.
- Segments: units, lease status, delinquent balance, leases ending in N days, a hand-picked list.
- Multiple channels per announcement.
- Time-of-day scheduling.
- A recipient preview showing consent exclusions.
- Per-recipient results.
- An emergency category.

**How to build**
- *Data model:* migration `announcements_segments` adds to `property.announcements`:
  - `channels text[]`
  - `segment jsonb`, e.g. `{ unitIds, leaseStatuses, minBalance, endingWithinDays, tenantIds }`
  - `scheduled_at timestamptz`
  - `category text default 'announcement'`
  - Keep `channel` and `scheduled_for` readable for old rows.
- *Server logic:*
  - `resolveAudience` applies `segment`. The balance segment uses ledger AR via `leaseReceivable` (`lib/payments/context.js:48`), not `tenants.balance`.
  - `previewAudience(db, a)` → `{ total, byChannel, excluded: [{ name, channel, reason }] }` using `canContact`.
  - `deliverAnnouncement` loops recipients × channels through `notifyParty` and writes `announcement_deliveries` per channel (key `${type}:${id}:${channel}`).
- *API routes / jobs:*
  - `POST /api/messages/announce/preview`
  - The existing `/announce` sends now.
  - The `scheduled-announcements` job switches to `scheduled_at <= now`, every 15 minutes.
- *UI:*
  - New `components/internal/screens/messaging/announcements.jsx` (list: Draft / Scheduled / Sent with stats).
  - Editor through the entity engine: title, body with merge fields, channels, audience builder, schedule, expires on, emergency switch.
  - The SMS editor shows a segment counter (GSM-7 160 / UCS-2 70).
  - "Preview recipients" dialog.
  - Sent view: delivery table.
- *Permissions:* `messaging.announce`.

**Steps**
1. Migration.
2. Data layer `lib/supabase/announcements.js` (`makeEntityData`).
3. Audience segments and preview.
4. Multi-channel delivery.
5. Composer screen.
6. Scheduling change in the job.
7. Remove the "open tracking" claim, or add pixel tracking only if geiger-dash supports it.

**Research before building**
- Whether geiger-dash/Resend exposes open/click events per message id (needed to back the landing-page claim).

**Acceptance criteria**
- An announcement to "Property tenants · balance > $0 · SMS + Email" previews the right count and lists opted-out recipients as excluded.
- Sending twice never double-sends (unique per recipient and channel).
- Scheduled for 09:00 tomorrow, it sends on the first job run after 09:00.
- Emergency SMS ignores quiet hours.
- The portal feed shows it until `expires_on`.

**Depends on / unblocks**
- Depends on LEAS-40 and LEAS-44 (SMS channel).
- Unblocks LEAS-55 (survey blasts) and LEAS-57 (voice bulletins).

---

#### LEAS-44 · SMS provider adapter (Twilio first): send, receipts, inbound, STOP/HELP, sender registration
- **MRI equivalent:** Engage Interact two-way texting with delivery receipts; Engage Pay SMS with STOP/HELP.
- **Status · priority · effort:** Missing · P1 · L
- **Refs:** Gap 4.1, 3.8 · Inventory 4.47, 4.48 · PMX-4.27, PMX-4.18

**Geiger today**
- `sendSms()` returns `not_sent` "SMS provider not connected" (`lib/messaging/deliver.js:22-25`).
- The status route hard-codes `sms: false` (`app/api/messages/status/route.js`).
- The settings screen says no provider is connected (`components/internal/screens/settings/notification_settings.jsx:31, 212-217`).
- The Integrations card "Email & SMS" is disabled (`components/internal/screens/settings/integrations.jsx:35`).

**What's missing**
- A provider, number provisioning, carrier registration, delivery callbacks, inbound threading and keyword handling.

**How to build**
- *Data model:* migration `messaging_channels`.
  - `property.messaging_channels`: `project_id`, `provider` (twilio), `kind` (sms|voice), `status` (draft|registering|active|suspended), `external_account_id` (subaccount SID), `messaging_service_sid`, `phone_number`, `number_type` (toll_free|local_10dlc), `registration jsonb` (brand/campaign or toll-free verification ids and status), `config jsonb` (`optOutNotice`, `helpReply`, `autoReply`).
  - `property.messaging_channel_secrets`: `channel_id`, `secrets jsonb`. Revoke from anon/authenticated and grant the service role only (do this now, not waiting for PLAT-01).
  - `thread_messages.provider_id` already exists; add an index on it.
- *Server logic:*
  - `lib/messaging/sms/index.js`: `getSmsChannel(admin, projectId)` and `sendSms({ admin, projectId, to, body, mediaUrls, statusCallback })` → `{ status, providerId, error }`.
  - `lib/messaging/sms/twilio.js`: port the thin REST client, `toE164` and `validateSignature` from geiger-campaign (`C:\Pro\geiger-campaign\lib\channels\twilio.js`).
  - `lib/messaging/sms/keywords.js`, mirroring Campaign's `matchSmsKeyword`:
    - opt-out: STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE, OPT OUT
    - opt-in: START, UNSTOP, YES
    - help: HELP, INFO
  - `deliver()` calls `sendSms`.
  - The first SMS to an address appends `config.optOutNotice` (as Campaign's `lib/messaging/providers/sms.js` does).
  - Inbound handling:
    - verify `X-Twilio-Signature`
    - match the sender's E.164 to a tenant/owner/vendor/prospect `phone`
    - a keyword → `recordConsent` (LEAS-40, source `sms_keyword`, proof = MessageSid) plus the configured reply
    - any other text → append to the open thread or create one (`findOrCreateThread` / `appendThreadMessage`)
    - hook point `onInboundSms` for LEAS-46 (PAY) and LEAS-49 (ACK)
- *API routes / jobs:*
  - `POST /api/sms/twilio/inbound` (TwiML reply)
  - `POST /api/sms/twilio/status`: maps queued/sent/delivered/undelivered/failed onto `thread_messages`, `announcement_deliveries` and `notification_sends` by provider id. It never moves a status backwards.
  - Staff onboarding routes:
    - `POST /api/messaging/sms/setup`: create the subaccount and Messaging Service, buy a number
    - `POST /api/messaging/sms/registration`: submit toll-free verification, or a 10DLC brand and campaign
    - `GET /api/messaging/sms/status`
- *UI:*
  - Settings → Integrations → "Text messaging" card, a setup wizard (`wizard_dialog.jsx`):
    1. business details (legal name, EIN, address, website, privacy policy and terms URLs)
    2. sample messages and opt-in description
    3. number choice
    4. registration status
  - The Notifications screen's SMS section shows the live status.
  - `app/api/messages/status` returns `sms: true` when the channel is active.
- *Permissions:* `settings.manage` (exists).
- *Integrations:* Twilio Programmable Messaging plus Trust Hub / toll-free verification APIs. The adapter keeps the provider swappable (Telnyx, Bandwidth).
- *Suite reuse:*
  - geiger-campaign already sends SMS through Twilio with a consent ledger and STOP/HELP handling. It runs on **BYO Twilio credentials per Campaign project**, Campaign contacts, and the `campaign` schema (`lib/channels/sms_inbound.js`, `app/api/v1/messages/route.js`).
  - Routing resident texts through Campaign's v1 API would need:
    - every Property customer to own a Campaign project
    - residents synced as Campaign contacts
    - consent split across two ledgers
  - **Recommended:** port the client code. Keep transport, consent and threads native. Consider extracting a shared `@geiger/sms` package once both apps are stable.

**Steps**
1. Migration with locked-down secrets.
2. Twilio client port.
3. `sendSms` plus `deliver` wiring.
4. Status webhook.
5. Inbound webhook with keywords and threading.
6. Setup and registration routes.
7. Settings wizard.
8. End-to-end test with a Twilio test account (magic numbers).
9. Flip catalog `channels` defaults to include SMS where the user chooses.

**Research before building**
- Registration model (see Open decisions).
  - Twilio ISV guidance: subaccounts, Trust Hub, A2P 10DLC via API, Toll-Free Verification API: https://pages.twilio.com/10DLC-HelpArticles-WW
  - Twilio's Apr 2026 change requiring privacy and terms URLs at campaign registration from Jun 30 2026: https://www.twilio.com/en-us/changelog/a2p-10dlc-campaign-registration-will-require-privacy-policy-and-
- TCR use-case fit for "Customer Care / Account Notifications" versus "Mixed" for landlords. Sole-proprietor brand limits for very small landlords (no EIN).
- Fees per brand, campaign and number, and who pays (pass-through billing via geiger-dash).
- Twilio Advanced Opt-Out on the Messaging Service versus our own keyword handling: avoid double replies.

**Acceptance criteria**
- With an active channel, a staff SMS shows `sent`, then `delivered` from the status callback.
- A resident replying "STOP":
  - gets exactly one confirmation
  - gets an `opted_out` ledger row
  - is blocked on every later send
- "START" re-opts in.
- "HELP" returns the property name and contact.
- A free-text reply lands in the right thread with an unread badge.
- An inbound request with a bad signature gets 403.
- Secrets are never selectable with the anon key.

**Depends on / unblocks**
- Depends on LEAS-40, LEAS-41 and PLAT-01.
- Unblocks LEAS-43, LEAS-46, LEAS-49, LEAS-53, LEAS-55, LEAS-57 and LEAS part A texting (gap 2.7).

**Open decisions**
- **Sender model:**
  - (a) Geiger-managed Twilio subaccount per project with a toll-free number and toll-free verification. Fastest, and simplest for small landlords. **Recommended to start.**
  - (b) The same with 10DLC brand and campaign registration (local numbers, more steps).
  - (c) BYO Twilio, as Campaign does.
- Whether Geiger passes SMS costs through, and how, via geiger-dash billing.

---

#### LEAS-45 · Resident views, accepts and signs a renewal online
- **MRI equivalent:** Engage Connect. Residents "View, accept, and digitally sign lease renewal offers" (Online Renewals with Secure Sign).
- **Status · priority · effort:** Missing · P1 · L
- **Refs:** Gap 4.2 · Inventory 4.27, 2b.55–2b.65 · PMX-2.81

**Geiger today**
- Offers are created by `createRenewalOffer` (`lib/leasing/workflows.js:140-181`) from the wizard (`components/internal/screens/leasing/lease_actions.jsx:192-248`).
  - "Mark sent" only sets the status (`renewals.jsx:374`).
  - Counter-offers are recorded by staff (`renewals.jsx:382-415`).
  - `offerOptions` is written but never read (`workflows.js:161`).
- The renewal-offer email is `live: false` (`lib/email/catalog.js:56-64`). The offer letter is unsaved text (`renewals.jsx:191-225`).
- `acceptRenewal` runs in the **browser** through anon-key data layers (`workflows.js:183-241`; callers `renewals.jsx:443`, `sections/lease_lifecycle.jsx:331`). It does not repoint the rent account (CORE-01 (gap 0.1)).
- The portal has no renewal route. Only a status label exists (`components/portal/resident/resident_lease.jsx:10-18`).
- Statuses: Not started / Offer sent / Negotiating / Accepted / Declined / Moving out (`components/internal/screens/leasing/shared.js:241-250`).

**What's missing**
- An offer email with a portal link.
- A portal offer view with term options.
- Resident accept / counter / decline.
- E-signature of the renewal lease by all signers.
- Server-side finalization usable from the portal and from e-sign webhooks.

**How to build**
- *Data model:* migration `renewals_portal_response`.
  - Add to `property.renewals`: `responded_at timestamptz`, `response jsonb` ({ decision, optionIndex, counterRent, counterTerm, note, signer: { tenantId, typedName, ip, ua, offerHash } }) and `signature_request_id uuid` (LEAS part A e-sign table).
  - Add statuses "Resident accepted" and "Signing" to `RENEWAL_STATUS_MAP` and `RENEWAL_OPEN_STATUSES`.
- *Server logic:*
  - New `lib/leasing/renewal_server.js` (admin client):
    - `sendRenewalOffer(admin, { renewalId, actor })`: status Offer sent, `offer_sent_on`, default `response_due` +30 days, and the offer letter stored as a document (LEAS part A PDF renderer, gap 2.6). Emails `renewal_offer` through `notifyParty` to every `lease_parties` tenant (role tenant) with a `?tab=renewal` link. Flip `live: true`.
    - `respondToRenewal(admin, ctx, input)`: validates that the member is a party on the lease and the offer is open, records `response`, notifies staff (inbox thread line plus team alert), then:
      - accept: if an e-sign provider is configured, creates the renewal lease document and a signature request for all signers (LEAS part A adapter); if not, sets "Resident accepted"
      - counter: appends to `metadata.counters`, sets Negotiating
      - decline / moving out: calls `declineRenewal` semantics and drafts a notice to vacate
    - `finalizeRenewal(admin, renewalId)`: the **single server implementation** of `acceptRenewal` (create lease, parties, move charges and held deposits, mark old lease Renewed). It calls the CORE billed-rent hook (gap 0.1).
  - The browser `acceptRenewal` becomes a call to the staff route, so there is one path.
- *API routes / jobs:*
  - `GET /api/portal/resident/renewal` and `POST /api/portal/resident/renewal` (`withPortal`, role resident).
  - `POST /api/leasing/renewals/[id]/send` and `POST /api/leasing/renewals/[id]/accept` (staff).
  - The e-sign adapter's completion webhook (LEAS part A) calls `finalizeRenewal`.
  - The `lease-reminders` job (`lib/messaging/reminder_jobs.js:130-222`) adds a "respond by" reminder 7 days before `response_due` for open offers.
- *UI:*
  - Portal: Home card "Your renewal offer" plus a new `renewal` tab (nav item shown only with an open offer) in `components/portal/portal_nav.js` and `portal_shell.jsx` `SCREENS.resident`.
  - The new component `components/portal/resident/resident_renewal.jsx` shows current versus offered rent, term options, concession, response due and the letter, with Accept / Request changes / I'm moving out actions.
  - Signing opens the provider's embedded or hosted signing URL.
  - Staff: "Send offer" replaces "Mark sent" and calls the route. The renewal detail shows the portal response and signature status.
- *Permissions:* `leasing.renewals.send`.
- *Integrations:* the LEAS part A e-signature adapter (geiger-docs later; geiger-dash's send route already notes geiger-docs uses Documenso templates).

**Steps**
1. Migration and status maps.
2. `finalizeRenewal` server port, with the staff route switched over.
3. `sendRenewalOffer` with the email and catalog flip.
4. Portal GET/POST routes and `respondToRenewal`.
5. Portal tab and Home card.
6. E-sign handoff (when LEAS part A's adapter exists).
7. Response-due reminder.

**Research before building**
- Whether a click-to-accept with typed name, timestamp, IP and offer hash meets ESIGN/UETA for a renewal *agreement* in target states, versus requiring the full signed lease.
- Rules on minimum notice for rent increases by state: use Legal Resources rows (`supabase/seeds/legal_resources/`) for the reminder copy.

**Acceptance criteria**
- "Send offer" emails every leaseholder with a working portal link.
- The resident sees two term options and accepts option 2:
  - with e-sign configured, a signature request goes to all signers, and on completion a new Pending lease exists with the option-2 rent, parties copied, held deposits moved, the old lease Renewed and the rent account repointed (CORE 0.1 check: next billing uses the new rent)
  - without e-sign, status becomes "Resident accepted" and staff can finalize
- A counter from the portal appears in counter history.
- A resident on another lease gets 404.
- Accepting twice is idempotent (one new lease).

**Depends on / unblocks**
- Depends on LEAS part A (e-sign adapter gap 2.5, lease PDF gap 2.6), CORE (billed rent gap 0.1), LEAS-40 and PLAT-01.
- Unblocks LEAS part A bulk renewal offers (gap 2.12).

**Open decisions**
- Until an e-sign provider exists, may a portal click-accept count as the resident's acceptance, with staff finalizing? Recommended: yes, labelled "Accepted — awaiting signature".

---

#### LEAS-46 · SMS rent reminders and receipts; pay by replying to a text; saved payment methods
- **MRI equivalent:**
  - Engage Pay RentByText ("reply to the monthly text message … rent paid!") and SMS receipts with STOP/HELP.
  - Engage Interact reminders and past-due notices by voice, text or email.
- **Status · priority · effort:** Partial · P2 · M
- **Refs:** Gap 3.8 · Inventory 4.15, 4.20, 4.51, 3.24 · PMX-4.15, PMX-4.18, PMX-3.39

**Geiger today**
- Rent reminders are email-only. Their balance merge field reads stale `tenants.balance` (`lib/messaging/reminder_jobs.js:272`).
- Receipts are emailed (`lib/payments/posting.js:289-320`), but the catalog still says `live: false` (`lib/email/catalog.js:29-37`).
- Late notices are email-only (`lib/jobs/financial.js:231-251`).
- Failed or returned payments notify no one but staff activity (`lib/payments/fulfill.js:93-145`).
- Methods are saved to the Stripe customer when asked (`lib/payments/checkout.js:187`). There is no list, reuse or remove (Inventory 4.15).

**What's missing**
- SMS for reminders, receipts, late and failed notices.
- Pay by text.
- Saved-method management.

**How to build**
- *Data model:* migration `sms_payment_requests`, table `property.sms_payment_requests`: `project_id`, `lease_id`, `tenant_id`, `phone`, `amount`, `stripe_customer_id`, `stripe_payment_method_id`, `code_hash`, `expires_at`, `status` (open|paid|expired|declined), `online_payment_id`, `notification_send_id`.
  - Tenant metadata `payByText: { enabled, paymentMethodId, consentId }`.
- *Server logic:*
  - Rent reminders, late notices and receipts move to `notifyParty`. The reminder balance comes from `leaseReceivable` (`lib/payments/context.js:48`).
  - New `payment_failed` notification is sent from `handlePaymentFailure`.
  - New `lib/payments/off_session.js` `chargeSavedMethod(admin, { ctx, amount, paymentMethodId, customerId, source, idempotencyKey, description })`, extracted from `chargeAutopayPlan` (`lib/payments/autopay.js:341-415`). It inserts `online_payments`, creates a confirmed off-session PaymentIntent and calls `syncPaymentIntent`. Autopay calls it too.
  - Pay by text:
    1. A reminder to an enrolled tenant includes "Reply PAY 4821 to pay $1,250.00 with Visa •4242".
    2. The inbound hook (LEAS-44) matches the phone and code, checks `expires_at` (72 h), recomputes the balance, and runs `assessPayment` (`lib/payments/context.js:140`).
    3. It charges min(quoted, current balance) and replies "Payment submitted"; the receipt follows from the webhook.
    4. A wrong code three times locks the request.
  - `lib/payments/customers.js`: `listSavedMethods(stripe, customerId)` and `detachMethod`.
- *API routes / jobs:*
  - `GET /api/portal/resident/payment-methods`, `DELETE /api/portal/resident/payment-methods/[id]`
  - `POST /api/portal/resident/pay-by-text` (enroll or disable with the chosen method; writes consent)
- *UI:*
  - Portal Payments: "Saved payment methods" panel (list, remove, set default).
  - "Pay by text" switch with disclosure.
  - Staff tenant Payments section shows enrollment.
- *Permissions:* none new (resident self-service; staff view under `view.online_payments`).
- *Integrations:* Stripe off-session PaymentIntents; LEAS-44 SMS.

**Steps**
1. Move reminders, late notices and receipts onto `notifyParty`, with the ledger balance and catalog flips.
2. `payment_failed` notice.
3. `chargeSavedMethod` refactor, with autopay re-pointed and regression-tested.
4. Saved-methods routes and UI.
5. `sms_payment_requests` migration.
6. Pay-by-text enrollment, reminder copy and inbound handler.

**Research before building**
- NACHA rules for a text-initiated ACH debit: whether the reply is a single-entry WEB authorization or needs a standing authorization captured at enrollment. Read Stripe's ACH mandate docs for off-session reuse.
- Card network rules for merchant-initiated versus customer-initiated off-session charges.
- CTIA guidance on financial transactions over SMS (no full amounts or account numbers beyond last 4).

**Acceptance criteria**
- An SMS-consented resident gets the reminder by SMS and email, with the ledger balance.
- Reply "PAY 4821" posts one payment: `online_payments.source = 'sms'`, ledger Dr cash / Cr AR oldest-first, trial balance unchanged in total.
- Replying twice charges once (idempotency key `sms:<requestId>`).
- A wrong code is refused.
- A certified-funds-only tenant gets "not available" and no charge.
- An ACH return on an SMS payment runs the standard reversal and NSF fee (`lib/payments/fulfill.js:93`).

**Depends on / unblocks**
- Depends on LEAS-40, LEAS-44 and the gap 0.10 scheduling fix.
- Unblocks LEAS-47 and LEAS-57 (share `chargeSavedMethod`).

---

#### LEAS-47 · Autopay options: fixed amount, cap, charge day, skip months, end date, scheduled payments
- **MRI equivalent:** Engage Pay "Balance Autopay" (within min/max limits) or "Fixed Amount Autopay", "Skip Dates", end dates, and scheduled future payments.
- **Status · priority · effort:** Partial · P2 · M
- **Refs:** Gap 4.7 · Inventory 4.16, 4.17, 4.18, 3.39 · PMX-4.17

**Geiger today**
- The library supports `amountMode` fixed/balance, `maxAmount` and `chargeDay` (`lib/payments/autopay.js:55-162`), and the staff link can set them (`:167-220`).
- The portal enrolls with no options at all (`lib/portal/payments.js:41-51`; `app/api/portal/resident/autopay/route.js:8-18`; `components/portal/resident/resident_payments.jsx:101-113`).
  - The inventory's citation `lib/portal/payments.js:152-162` is wrong; the file has 58 lines.
- No skip, end date or edit without redoing Stripe setup. There is one plan per lease (`lib/payments/fulfill.js:242-248`), so co-tenants can't each autopay a share.
- Balance mode is a **variable-amount** preauthorized debit, and no advance notice is sent.

**What's missing**
- Resident-chosen options, an edit flow, skip months, start/end dates, one-time scheduled payments, and an upcoming-charge notice.

**How to build**
- *Data model:* migration `autopay_options`.
  - `autopay_plans` add `skip_periods text[] not null default '{}'`, `starts_on date`, `ends_on date`.
  - New `property.scheduled_payments`: `project_id`, `lease_id`, `tenant_id`, `amount`, `scheduled_on`, `method`, `stripe_customer_id`, `stripe_payment_method_id`, `status` (scheduled|processing|succeeded|failed|canceled), `online_payment_id`, `idempotency_key` unique, `created_by`.
- *Server logic:*
  - `enrollAutopay` takes portal options; `startAutopay` passes them through.
  - New `updateAutopayPlan({ projectId, leaseId, planId, patch })` changes amount, cap, day, skips and dates without a new setup session.
  - `chargeAutopayPlan`:
    - skips when `period ∈ skip_periods` (`last_status: 'skipped'`)
    - skips before `starts_on`
    - cancels after `ends_on`
    - honors a policy `autopayMaxSkipsPerYear`
  - `schedulePayment` / `cancelScheduledPayment` use `chargeSavedMethod` (LEAS-46).
  - New settings in `PAYMENT_SETTINGS_DEFAULTS` (`lib/payments/constants.js:6-30`): `autopayAllowFixed`, `autopayAllowSkip`, `autopayMaxSkipsPerYear`, `autopayNoticeDays` (default 10).
- *API routes / jobs:*
  - `PATCH /api/portal/resident/autopay` (update) and `GET/POST/DELETE /api/portal/resident/scheduled-payments`.
  - New job `scheduled-payments` (daily) in `lib/jobs/autopay.js` `PAYMENTS_JOBS`.
  - New job `autopay-notices`: for balance-mode plans, `notifyParty` "Your autopay of about $X will run on <date>" `autopayNoticeDays` ahead, dedupe per plan-period.
- *UI:*
  - Portal `AutopayPanel` gets an enrollment dialog (balance or fixed, cap, day 1–28, start and end month) and a manage dialog (edit, skip next / pick months, cancel).
  - New "Scheduled payments" panel (add with date ≤ 90 days and a saved method; cancel).
  - Staff `components/internal/screens/payments/autopay_panel.jsx` shows the same fields.
  - Payment Processing settings show the new switches.
- *Permissions:* none new.

**Steps**
1. Migration.
2. Library option plumbing and `updateAutopayPlan`.
3. Skip, start and end logic in `chargeAutopayPlan`, with tests per month boundary.
4. Scheduled payments plus job.
5. Notice job.
6. Portal dialogs.
7. Staff panel and settings.

**Research before building**
- Reg E §1005.10(d) (12 CFR 1005.10(d)): the 10-day notice for preauthorized transfers that vary in amount, or the consumer's election of a range. Does it apply to balance autopay, and does a payee notice satisfy it?
- Whether a skip during a lease with `autopayRequired` (`lib/policies.js`) should need staff approval.

**Acceptance criteria**
- A resident enrolls "fixed $600 on day 3, ends Dec 2027" from the portal. The plan stores those values, and the job charges $600 on day 3 only.
- Skipping March: no March charge, `last_status` "skipped", April charges.
- Editing the amount needs no new Stripe setup.
- A scheduled payment for the 20th posts once on the 20th.
- A balance-mode plan sends the notice 10 days ahead.
- Two runs on the same day never double-charge (`autopay:<plan>:<YYYY-MM>` key unchanged).

**Depends on / unblocks**
- Depends on LEAS-46 (`chargeSavedMethod`, saved methods), LEAS-40 and the gap 0.10 scheduling fix.
- Unblocks LEAS-58.

**Open decisions**
- Per-payer autopay for co-tenants (one plan per payer, each a fixed share) instead of one plan per lease? Recommended for P2 follow-up; it changes the "one live plan per lease" rule in `activatePlan`.

---

#### LEAS-48 · Installable resident app (PWA) with push and an in-portal notification bell
- **MRI equivalent:** Engage Connect app (iOS v1.0.1, 8 Sep 2026, early rollout).
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Gap 4.4 · Inventory 9.40, 9.41, 4.54 · PMX-4.07

**Geiger today**
- The portal is responsive (`app/portal/page.js:10`, viewport set).
- There is no manifest, service worker, push or `app/portal/layout.js`. `public/` holds only favicons and SVGs.
- The app runs under basePath `/property` in production (`next.config.mjs`).
- No in-portal notifications (Inventory 4.54).

**What's missing**
- Home-screen install, an offline shell, web push, and an unread notification bell in the portal.

**How to build**
- **Recommendation:** PWA first. Native (a Capacitor wrapper of the same portal) only when a revisit trigger fires.
  - iOS supports web push for home-screen-installed web apps (16.4+).
  - MRI's own app is new and unrated.
  - One codebase keeps portal parity.
- *Data model:* migration `portal_push_subscriptions`, table `property.portal_push_subscriptions`: `project_id`, `portal_member_id`, `user_id`, `endpoint` unique, `p256dh`, `auth`, `user_agent`, `last_success_at`, `failure_count`, `revoked_at`.
- *Server logic:*
  - `lib/messaging/push.js` `sendPush(admin, { memberIds, title, body, url, tag })` uses `web-push` with VAPID (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). 404/410 revokes the subscription.
  - The `notifyParty` channel `push` resolves the party's portal members.
- *API routes / jobs:* `POST/DELETE /api/portal/push` (`withPortal`).
- *UI and files:*
  - `app/portal/layout.js` exporting `metadata` (`manifest: ${basePath}/portal/manifest.webmanifest`, `appleWebApp`, icons) and `viewport.themeColor`.
  - `app/portal/manifest.webmanifest/route.js`: the root `app/manifest.js` convention would cover the staff app too; scope `${basePath}/portal/`, `id` set, `display: standalone`.
  - `public/portal-sw.js`: offline fallback page, `push` and `notificationclick` handlers, no caching of API JSON.
  - `components/portal/pwa_register.jsx` registers it with scope `${basePath}/portal/`.
  - Icons `public/portal-icons/{192,512,maskable,apple-180}.png`.
  - Portal Profile → "Notifications on this device" toggle with iOS add-to-home-screen guidance.
  - Topbar bell (`components/portal/portal_topbar.jsx`) via **@geiger/notify** `NotificationsProvider`.
    - Server sends with `createServerNotifier` (service role may target any user) to the resident's auth user id.
    - Needs `@geiger/notify` added to `package.json` and `transpilePackages`.
- *Permissions:* none.
- *Suite reuse:* geiger-notify provides the in-app bell but has no web push (`C:\Pro\geiger-notify\src`). Push is native here (see Open decisions).

**Steps**
1. Read `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` and the manifest file-convention doc (Next 16.3; copy from a sibling repo since this repo has no `node_modules` installed).
2. Layout, manifest route and icons.
3. Service worker and registration.
4. Push subscription table, routes and `sendPush`.
5. Dispatcher `push` channel.
6. Notify bell.
7. Lighthouse PWA check on a production build.

**Research before building**
- Service-worker scope under a basePath shared origin (`geiger.studio/property/…`): confirm there is no clash with other suite apps' workers.
- iOS web-push limits (installed only; permission must follow a user gesture).
- Whether geiger-notify should own push for all suite apps.

**Acceptance criteria**
- On Android Chrome and iOS Safari the portal installs, opens standalone at `/property/portal`, and shows an offline page with no network.
- With push enabled, a work-order status change (LEAS-42) shows a notification that deep-links to the request.
- A revoked subscription is marked after one 410.
- The bell shows unread counts and marks read.

**Depends on / unblocks**
- Depends on PLAT-01 and LEAS-40.
- Unblocks LEAS-49 (push paging) and LEAS-53.

**Open decisions**
- Add web push to geiger-notify (suite-wide) instead of Property? Recommended: build it in Property now behind `lib/messaging/push.js`, and move it when Notify adds it.
- Per-project branded app name and icon? That needs per-project manifest URLs; recommended later.

---

#### LEAS-49 · Emergency on-call routing with on-call schedules and escalation
- **MRI equivalent:** Engage Interact. Emergency calls are "routed straight to whoever is on call, with the office notified", with primary and secondary on-call schedules and office hours.
- **Status · priority · effort:** Partial · P2 · L
- **Refs:** Gap 4.6 · Inventory 5.10 · PMX-5.14, PMX-4.39

**Geiger today**
- Emergency forces Urgent priority (`lib/portal/resident.js:203-204`).
- The portal tells residents to call "the office emergency line" without showing a number (`components/portal/resident/resident_requests.jsx:93-97`).
- Policy `emergencyPhone` exists (`lib/policies.js:139`), but nothing reads it.
- No schedules, paging or escalation.

**What's missing**
- The emergency number shown to residents.
- On-call schedules.
- Paging the on-call person by SMS, push and email with acknowledgement.
- Escalation to secondary.
- Office notification.
- A phone line that forwards to on-call.

**How to build**
- *Data model:* migration `oncall`.
  - `property.oncall_schedules`: `project_id`, `name`, `property_ids uuid[]` (empty = all), `timezone`, `office_hours jsonb`, `escalation_minutes int default 10`, `max_rounds int default 2`, `notify_office bool`, `status`.
  - `property.oncall_shifts`: `schedule_id`, `tier` (primary|secondary|backup), `assignee_type` (team_member|vendor), `assignee_id`, `assignee_name`, `phone`, `email`, `starts_at`, `ends_at`.
  - `property.emergency_pages`: `project_id`, `work_order_id`, `schedule_id`, `shift_id`, `tier`, `round`, `status` (paging|acknowledged|escalated|exhausted|resolved), `paged_at`, `next_escalation_at`, `acked_at`, `acked_by`, `ack_token_hash`, `channels jsonb`.
- *Server logic:* `lib/maintenance/oncall.js`.
  - `whoIsOnCall(admin, { propertyId, at })`.
  - `startEmergencyPage(admin, workOrderId)`, called from `createRequest` when `emergency`, and from staff WO create when Urgent plus emergency:
    - pages primary via `notifyParty` (category `emergency`, notification `emergency_page`) with SMS, push and email, plus an ack link
    - alerts the office (`alertEmails`)
    - tells the resident "the on-call technician has been notified"
  - `acknowledgePage(token|userId)` and `escalateDuePages(admin, now)` (primary → secondary → backup → office, `max_rounds`).
  - The LEAS-44 inbound hook treats "ACK <code>" replies as acknowledgements.
  - `residentContext` exposes `emergencyPhone` from `effectivePolicies`.
- *API routes / jobs:*
  - `GET /api/oncall/ack/[token]`
  - Staff CRUD through data layers `lib/supabase/oncall_*.js`
  - Job `oncall-escalations` with `intervalMinutes: 1`. It needs a real scheduler (gap 0.10); Vercel Cron's per-minute schedule needs a paid plan, otherwise use Supabase `pg_cron` plus `pg_net` calling `/api/cron/oncall-escalations`.
  - Phase B voice:
    - `POST /api/voice/twilio/emergency` (TwiML): IVR "press 1 for a maintenance emergency", then `<Dial>` primary, then secondary with timeouts, then voicemail.
    - The caller-ID match creates a work order and a page.
- *UI:*
  - New staff screen "On-call" under Maintenance in `sidebar_nav.jsx` and `registry.jsx`: schedules list, week grid of shifts with a rotation generator, and a "On call now" card.
  - Work order → "Emergency page" timeline.
  - The portal shows the emergency number in the request form and on Home.
  - COMM tech app: an Acknowledge button.
- *Permissions:* `maintenance.oncall.manage`.
- *Integrations:* Twilio Messaging (LEAS-44) and Voice (same subaccount).

**Steps**
1. Show `emergencyPhone` in the portal (quick win, S).
2. Migration.
3. Schedules UI and `whoIsOnCall`.
4. Paging, ack link and office alert.
5. Escalation job and scheduler wiring.
6. SMS ACK.
7. Phase B voice line.

**Research before building**
- Sub-minute versus 1-minute scheduling options on the current Vercel plan; Supabase `pg_cron` / `pg_net` availability on the shared project.
- Twilio `<Dial>` sequential ring, voicemail transcription costs and call recording consent by state (two-party consent states).
- Lone-worker monitoring (PMX) is out of scope.

**Acceptance criteria**
- An emergency request at 23:00 pages the primary by SMS and push within 1 minute.
- No ack in 10 minutes pages the secondary. Acknowledging stops escalation and notifies the resident and the office.
- During office hours the office is paged first.
- With no schedule, the office alert recipients get it.
- The portal shows the configured emergency number.
- Phase B: calling the property number at night and pressing 1 rings the on-call phone.

**Depends on / unblocks**
- Depends on LEAS-40, LEAS-44, LEAS-48, COMM (tech app, WOs) and the gap 0.10 scheduling fix.

---

#### LEAS-50 · Renters insurance: partner sale, verified compliance, force-placed coverage
- **MRI equivalent:** Engage Insure (underwritten by Assurant). Insurance sold inside Engage Apply, a managed compliance program, and force-placed coverage ($100k liability, ≥5 days' written notice).
- **Status · priority · effort:** Tracking-only · P2 · L
- **Refs:** Gap 4.5 · Inventory 4.33–4.36, 8.13, 8.14, 2b.24 · PMX-4.32, PMX-4.33, PMX-4.34

**Geiger today**
- Residents upload a policy for staff review (`lib/portal/resident.js:348-382`). Compliance states and reminders work (`lib/compliance.js:1-60`; `lib/messaging/reminder_jobs.js:325+`).
- The portal reads the requirement from the tenant only, ignoring the lease fields `insuranceRequired`, `insuranceMinLiability` and `insuranceProgram` (`components/internal/screens/leasing/sections/lease_terms.jsx:38-55`; `lib/portal/resident.js:340-345`).
- "Master policy" is a dropdown plus a $12 line in the benefits package (`components/internal/screens/leasing/shared.js:388-397`).
- No carrier, purchase or force-placement.

**What's missing**
- An embedded quote and purchase.
- Carrier-verified policy status (bound, lapsed, cancelled).
- Automatic force-placed enrollment after notice, billed to the lease and remitted to the carrier.
- Auto-cancel when proof arrives.

**How to build**
- *Data model:* migration `insurance_programs`.
  - `property.insurance_programs`: `project_id`, `property_ids uuid[]`, `provider`, `kind` (embedded_sale|force_placed), `monthly_premium`, `admin_fee`, `liability_limit`, `grace_days`, `notice_days`, `income_gl_account_id`, `payable_gl_account_id`, `carrier_vendor_id`, `config jsonb`, `status`.
  - `property.insurance_enrollments`: `lease_id`, `tenant_id`, `program_id`, `status` (notice_sent|enrolled|cancelled), `notice_sent_on`, `starts_on`, `ends_on`, `recurring_charge_id`, `provider_ref`.
  - Policies stay in `record_items` kind `insurance_policy` with `metadata.source = 'partner:<key>'`, `providerPolicyId` and `verified`.
  - Add `insurance_premiums_payable` (liability) to the default chart (`ensureDefaultChart`, `lib/supabase/ledger.js:78`).
- *Server logic:*
  - `lib/insurance/providers/{index,<partner>}.js` adapter: `quote` / `embedUrl({ tenant, lease, coverage })`, `verifyPolicy`, `parseWebhook`, `enrollForcePlaced`, `cancelForcePlaced`.
  - `lib/insurance/compliance.js` `leaseRequirement(lease, tenant)` (lease first, then tenant).
  - The daily `insurance-compliance` job:
    1. missing or lapsed past `grace_days` → `notifyParty` written notice (category legal) with the cure date
    2. at the cure date → create the enrollment plus a CORE recurring charge (Dr AR / Cr premiums payable; admin fee to income)
    3. a compliant policy arriving later → cancel the enrollment, end the charge, prorate per program terms
  - Monthly AP bill to the carrier for the premiums payable balance (CORE AP).
- *API routes / jobs:* `POST /api/integrations/insurance/[provider]/webhook` (signature-verified), plus the `insurance-compliance` job.
- *UI:*
  - Portal Insurance tab (`components/portal/resident/resident_insurance.jsx`): "Get covered" partner card (iframe or redirect) beside upload.
  - LEAS part A online application (gap 2.1): an insurance step.
  - Settings → new "Renters insurance" page (programs).
  - Lease Money section shows the enrollment.
  - The Insurance Compliance report (`lib/reports/defs_operations.js:596-663`) reads lease-level requirements and enrollments.
- *Permissions:* `settings.manage`; `leasing.insurance.manage`.
- *Integrations:* partner shortlist to research:
  - Sure (API, white-label, iframes; used by TurboTenant)
  - Assurant (MRI's underwriter; force-placed programs)
  - APOLLO (Yardi, Payquad embedded API)
  - Liberty Mutual Renters API
  - Vertical Insure
  - Cover Genius (Rhino)
  - Lemonade (no public partner API found)
  - Effective Coverage, Foxen (compliance plus liability waiver programs)

**Steps**
1. Lease-first requirement fix (S).
2. Migration and chart account.
3. Provider adapter interface plus one partner.
4. Webhook route and verified policy records.
5. Portal sale card.
6. Program settings.
7. Compliance job with notice and force-placement.
8. Ledger and AP remittance.
9. Report update.

**Research before building**
- Partner APIs, revenue share and onboarding: https://www.sureapp.com/solutions/connect/renters-insurance, https://verticalinsure.com/rentals/, Assurant multifamily, APOLLO.
- State insurance-producer licensing for a software platform that refers or embeds sales.
- State rules on force-placed or landlord-required renters insurance and charging residents for it (notice periods, caps, disclosure).

**Acceptance criteria**
- A resident buys through the partner and the policy appears as verified/compliant within a minute of the webhook.
- A lease requiring insurance with no policy past grace gets the notice. After `notice_days` it is enrolled with a recurring charge that bills monthly (Dr AR, Cr premiums payable; admin fee to income).
- Uploading a verified policy cancels the enrollment and stops the charge.
- The premiums-payable balance equals enrolled leases × premium and clears when the carrier bill is paid.

**Depends on / unblocks**
- Depends on CORE (recurring charges gap 0.3, AP), LEAS part A (online application gap 2.1), LEAS-40 and PLAT-01.

**Open decisions**
- Which partner (needs commercial talks).
- Whether Geiger offers force-placed coverage at launch or only the embedded sale.

---

#### LEAS-51 · In-office payments: fast counter entry and check scanning (remote deposit)
- **MRI equivalent:** Engage Pay in-person payments with a check scanner (Jack Henry RDC); card payments for residents or applicants.
- **Status · priority · effort:** Missing · P2 · L
- **Refs:** Gap 3.6 · Inventory 3.27, 3.30, 3.31, 3.32, 3.43 · PMX-3.19

**Geiger today**
- Staff manual payment entry with method, reference and bank (`components/internal/screens/accounting/ledger_dialogs.jsx:52-58, 303-333`; `buildPayment` `lib/ledger/postings.js:222-242`; browser `postPayment` `lib/supabase/ledger.js:360`).
- "Take payment now" through Stripe Checkout (`components/internal/screens/payments/collect_payment.jsx:28-40`).
- No receipt for manual payments, no deposit batching or undeposited funds, no scanner.
- Tenant restrictions (certified funds only, no checks) are not checked on manual entry (Inventory 3.32).

**What's missing**
- A counter workflow for many payments.
- Policy gates on manual entry.
- Check images and MICR via a scanner.
- Electronic deposit (Check 21 image or check-to-ACH conversion).
- Returned-item handling.

**How to build**
- *Data model:* migration `check_items`, table `property.check_items`: `project_id`, `deposit_batch_id` (CORE-16 (gap 11.4)), `lease_id`, `tenant_id`, `payer_name`, `amount`, `check_number`, `micr_masked`, `front_image_path`, `back_image_path` (private bucket per PLAT-01), `status` (scanned|submitted|accepted|returned|voided), `provider`, `provider_item_id`, `ledger_entry_id`, `return_reason`, `returned_at`.
- *Server logic:*
  - `lib/payments/office.js`: `assessManualPayment(ctx, { method, amount })` reuses `assessPayment` rules plus the "no checks", "certified funds only" and eviction rules. Called from a new staff route, not the browser.
  - `recordOfficePayment` posts Dr undeposited funds / Cr AR (CORE-16 (gap 11.4)) and sends the receipt (CORE-11 (gap 11.1)).
  - `lib/payments/rdc/{index,<provider>}.js`: `createCaptureSession`, `submitDeposit({ items, bankAccountId })`, `parseWebhook` (accepted, returned, adjusted).
  - Returned item: void the entry, NSF fee and tenant flag, reusing `postNsfFee` / `flagTenantReturn` patterns (`lib/payments/posting.js:134, 269`) via the CORE-17 (gap 11.8) item.
- *API routes / jobs:* `POST /api/payments/office` (record), `POST /api/payments/rdc/session`, `POST /api/payments/rdc/deposit`, `POST /api/integrations/rdc/[provider]/webhook`.
- *UI:*
  - Accounting → Rent Collection → new "Receive payments" batch-entry dialog: resident search, amount, method, check number, a live policy warning, running batch total, "Print receipts".
  - "Scan checks" mode using the provider's web SDK and scanner: images and MICR prefill, staff edit before submit.
  - Deposit batch view (CORE).
- *Permissions:* `accounting.post` (exists); new `payments.scan_checks`.
- *Integrations:* RDC / check processing shortlist:
  - Payabli (embedded RDC for SaaS, property management target)
  - Jack Henry ProfitStars (MRI's choice)
  - Deluxe RDC
  - Payology / Check21.com (mobile check capture API)
  - Scanner hardware support (Digital Check, Panini, Epson) depends on the provider

**Steps**
1. Server route for manual payments with policy gates (closes the 3.32 gap for office entry).
2. Batch "Receive payments" dialog on CORE undeposited funds plus receipts.
3. Provider selection.
4. `check_items` migration and RDC adapter.
5. Scan UI.
6. Deposit submission and webhook.
7. Returned-item flow.

**Research before building**
- Check 21 image deposit into the customer's own bank (bank-provided RDC) versus processor check-to-ACH conversion (NACHA BOC/ARC). Settlement timing, return windows, and which bank account receives funds when Stripe is a single platform account (`lib/stripe/server.js`).
- Provider APIs and scanner SDKs: https://payabli.com/remote-deposit-capture-for-saas-modernize-check-payments/, https://check21com.github.io/Payology-Website/saas/mobile-check-capture-api, https://www.deluxe.com/remote-deposit-capture
- Stripe Terminal for card-present office payments (optional).

**Acceptance criteria**
- Entering a check for a certified-funds-only tenant is refused with the reason.
- A batch of 10 office payments posts 10 entries to undeposited funds, prints or emails 10 receipts, and the batch deposit moves the total to the bank account (CORE).
- A scanned check prefills amount and number.
- A returned check voids the payment, re-opens the charges, posts the NSF fee and flags the tenant.
- Trial balance stays balanced throughout.

**Depends on / unblocks**
- Depends on CORE (deposit batching gap 11.4, manual receipts gap 11.1, manual NSF gap 11.8) and PLAT-01 (private images).
- Unblocks CORE lockbox (gap 3.11) later.

**Open decisions**
- RDC provider.
- Whether card-present (Stripe Terminal) is in scope.

---

#### LEAS-52 · Cash rent at retail stores
- **MRI equivalent:** Engage Pay with MoneyGram ("40,000 locations", PayByCash account numbers).
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Gap 3.7 · Inventory 4.23 · PMX-4.13

**Geiger today**
- Checkout offers only card and US bank account (`lib/payments/checkout.js:179`; `ONLINE_METHODS` `lib/payments/constants.js:38-41`).
- Policy `paymentMethods` already has a `cash` option (`lib/policies.js:62-73`).
- `online_payments` and posting assume Stripe: the idempotency key is `stripe:<pi>` (`lib/payments/posting.js:16, 74`).
- Stripe has no US retail-cash method.

**What's missing**
- A cash network partner, a per-resident pay slip or barcode, payment webhooks into the ledger, and settlement reconciliation.

**How to build**
- *Data model:* migration `payments_providers_cash`.
  - `online_payments` add `provider text not null default 'stripe'` and `provider_payment_id text` (unique per provider).
  - New `property.cash_pay_accounts`: `lease_id`, `tenant_id`, `provider`, `provider_account_id`, `slip_url`, `barcode`, `status`.
- *Server logic:*
  - Generalize `posting.js` `ref()` to `${row.provider}:${id}` for non-Stripe rows (keep `stripe:` keys unchanged).
  - `lib/payments/cash/{index,<provider>}.js`: `createPayAccount({ lease, tenant })`, `parseWebhook` (posted, reversed).
  - Webhook: insert `online_payments` (`method: 'cash'`, `source: 'retail_cash'`), then `postPaymentToLedger`, then the receipt.
  - Respect the policy: allowed only when `paymentMethods` includes `cash`. Settable per project for certified-funds-only residents, since cash cannot bounce.
- *API routes / jobs:* `POST /api/portal/resident/cash-slip`; `POST /api/integrations/cash/[provider]/webhook`.
- *UI:*
  - Portal Payments: "Pay with cash at a store" panel (slip or barcode, store finder link, payer fee note).
  - Staff Online Payments lists cash payments with the provider.
  - Settings → Payment Processing: provider connection.
- *Permissions:* `settings.manage`.
- *Integrations:* shortlist:
  - PayNearMe (7-Eleven, CVS, Walgreens, Family Dollar…; past AppFolio and RentPaidOnline integrations)
  - Fiserv CheckFreePay (30,000+ walk-in locations)
  - MoneyGram (MRI's partner)
  - InComm VanillaDirect

**Steps**
1. Provider-generalized `online_payments` and posting keys.
2. Adapter plus one provider.
3. Portal slip.
4. Webhook into ledger and receipt.
5. Settlement mapped to CORE deposit batches.

**Research before building**
- Current PayNearMe and CheckFreePay biller APIs, fees and settlement files: https://www.multihousingnews.com/paynearme-and-rentpaid-online-partner-to-make-cash-payments-easy/, https://fiserv.com/en/solutions/bill-payment/checkfreepay.html
- Which bank account receives settlement under the single-Stripe-account model.

**Acceptance criteria**
- A resident gets a reusable barcode.
- A provider "posted" webhook creates one payment (replay-safe), applies it oldest-first, and emails a receipt.
- A reversal webhook voids it and re-opens the charges.
- A settlement file of N payments matches N ledger entries in one deposit batch.

**Depends on / unblocks**
- Depends on CORE (deposit batching gap 11.4) and PLAT-01.

**Open decisions**
- Cash provider.

---

#### LEAS-53 · Package tracking with notifications and pickup records
- **MRI equivalent:** Engage Interact Package Tracking. Documents incoming packages, notifies the recipient, tracks storage and pickup, batch scanning, follow-ups until pickup.
- **Status · priority · effort:** Missing · P3 · M
- **Refs:** Gap 4.8 · Inventory 4.61 · PMX-4.41

**Geiger today**
- Only a "Mailroom / package room" switch on buildings (`components/internal/screens/buildings/sections.jsx:120`) and a "Package lockers" amenity label.

**What's missing**
- Package log, notifications, reminders, pickup proof and a portal view.

**How to build**
- *Data model:* migration `resident_packages`, table `property.resident_packages`: `project_id`, `property_id`, `building_id`, `unit_id`, `tenant_id`, `carrier`, `tracking_number`, `size`, `location`, `photo_path`, `received_at`, `received_by`, `notified_at`, `reminder_count`, `picked_up_at`, `picked_up_by_name`, `signature_path`, `status` (received|notified|picked_up|returned). Check the name against orphan tables.
- *Server logic:*
  - `lib/supabase/resident_packages.js` (`makeEntityData`).
  - `lib/maintenance/packages.js` `notifyPackage(admin, id)` via `notifyParty` (`package_arrived`).
  - Job `package-reminders` (day 3, day 7, then staff digest).
- *API routes / jobs:* `POST /api/packages/[id]/notify` (staff); `GET /api/portal/resident/packages`.
- *UI:*
  - New staff screen "Packages" (sidebar under Property, or a "Front desk" group): quick check-in (camera barcode via the `BarcodeDetector` API, or a keyboard-wedge scanner), recipient search by unit or name, bulk check-in, pickup dialog with signature canvas and photo.
  - Portal "Packages" tab.
- *Permissions:* `packages.manage`.
- *Integrations:* none at first. Smart lockers (Luxer One, Parcel Pending by Quadient, Amazon Hub Apartment Locker) are a revisit trigger.

**Steps**
1. Migration and data layer.
2. Staff screen and check-in.
3. Notify plus reminders job.
4. Pickup capture.
5. Portal tab.

**Research before building**
- `BarcodeDetector` browser support (not Safari iOS). Fall back to a JS decoder library from cdnjs if needed.

**Acceptance criteria**
- Checking in 5 packages for 5 units notifies 5 residents once each.
- Reminders stop at pickup.
- The pickup record shows the name, signature and time.
- The portal shows only the resident's own pending packages.

**Depends on / unblocks**
- Depends on LEAS-40, LEAS-44, LEAS-48 and PLAT-01 (private photos).

---

#### LEAS-54 · Live chat on the property website
- **MRI equivalent:** Engage Interact Web Chat. Connects prospects and residents with on-site staff via the client website.
- **Status · priority · effort:** Missing · P3 · M
- **Refs:** Gap 4.9 · Inventory 4.68 · PMX-2.28

**Geiger today**
- None. Team chat "external" contacts are suite users (`components/internal/screens/communications/parts/external_contact_dialog.jsx:10-25`).
- There are no public property pages yet (LEAS-01 (gap 2.2)).

**What's missing**
- A chat widget on public pages and a staff place to answer.

**How to build**
- **Reuse geiger-comms plus `@geiger/comms-widget`.**
  - Comms already has the widget API (`C:\Pro\geiger-comms\app\api\widget\*`: sessions, conversations, messages, leads), the shared inbox and automations with a webhook action (`lib/automation/actions.js:181`).
  - Building chat natively would duplicate it.
- *Data model:* settings key `live_chat`: `{ enabled, appId (wg_…), propertyOverrides }`. The signing secret goes in a service-role-only store (same pattern as LEAS-44 secrets).
- *Server logic:*
  - `lib/integrations/comms_widget.js` `signWidgetJwt(resident)` signs a JWT for signed-in portal residents (optional).
  - A Comms automation webhook ("new lead / conversation") goes to Property `POST /api/integrations/comms/webhook`, which creates or links a prospect (LEAS part A CRM, gap 2.7).
- *UI:*
  - LEAS part A public property pages load `GeigerProvider` from `@geiger/comms-widget/react` (pin a commit sha).
  - Optional in the portal.
  - Settings → Integrations → "Live chat" card. Staff answer in Geiger Comms.
- *Permissions:* `settings.manage`.

**Steps**
1. Settings card and secret storage.
2. Widget on public pages.
3. Optional portal identity JWT.
4. Comms webhook to prospect.

**Research before building**
- The Comms webhook payload and signing.
- Whether Comms projects map 1:1 to Property projects in the shared `public.projects`.
- Licensing: does a Property customer need a Comms seat?

**Acceptance criteria**
- A visitor on a property page chats; staff see it in Comms.
- The visitor's email creates a prospect in Property, deduped by email.
- The widget is disabled when the setting is off.

**Depends on / unblocks**
- Depends on LEAS part A (public pages gap 2.2, CRM gap 2.7) and PLAT-01.

**Open decisions**
- Is answering in a separate app (Comms) acceptable, versus bridging chats into LEAS-41 Conversations?

---

#### LEAS-55 · Resident surveys (maintenance CSAT, community surveys)
- **MRI equivalent:** Engage Interact. "Send text or voice surveys to monitor and increase resident satisfaction."
- **Status · priority · effort:** Missing · P3 · M
- **Refs:** Gap 4.10 · Inventory 4.62, 5.47 · PMX-4.28

**Geiger today**
- Staff type a satisfaction rating; "ask for feedback" only sets a flag (`components/internal/screens/maintenance/sections/wo_execution.jsx:303-321`).
- No surveys.

**What's missing**
- Sending surveys, collecting responses against tenant and work order, and reporting.

**How to build**
- **Reuse geiger-forms** for multi-question surveys: NPS/CSAT fields, signed personal links, signed webhooks with retries, REST v1 (`C:\Pro\geiger-forms\README.md`).
- Native for one-question SMS CSAT (reply 1–5) through the LEAS-44 inbound hook.
- *Data model:* responses as `record_items` kind `survey_response` on tenant (and `metadata.workOrderId`): `name` = form title, `amount` = score, `metadata` = answers and form ids. Project settings key `surveys`: `{ formsApiKey (service-only), csatFormId, sendCsatOnComplete, smsCsat }`.
- *Server logic:*
  - `lib/integrations/forms.js` `personalLink({ formId, hidden: { tenantId, workOrderId, projectId } })`.
  - The LEAS-42 completion hook sends CSAT via `notifyParty`.
  - Webhook ingest writes `record_items` and `work_orders.metadata.satisfactionRating`.
- *API routes / jobs:* `POST /api/integrations/forms/webhook` (HMAC verify).
- *UI:*
  - Settings → Integrations → "Surveys" card.
  - Announcements composer (LEAS-43) "Insert survey link".
  - Tenant → Surveys section.
  - COMM Maintenance Report gets average CSAT by property and vendor.
- *Permissions:* `settings.manage`.

**Steps**
1. Forms link helper and settings.
2. Webhook ingest.
3. WO completion CSAT.
4. SMS 1–5 reply.
5. Composer link.
6. Reporting.

**Research before building**
- The geiger-forms v1 API and webhook signature format; signed personal link parameters.

**Acceptance criteria**
- Completing a resident request sends one CSAT. The resident's answer appears on the tenant and the work order.
- An SMS reply "5" records a score.
- A duplicate webhook is ignored.

**Depends on / unblocks**
- Depends on LEAS-42, LEAS-43 and LEAS-44.

---

#### LEAS-56 · Rent reporting to credit bureaus
- **MRI equivalent:** Engage Pay with Piñata. Points for on-time rent; free positive-only reporting to 3 bureaus; Premium adds 24-month back-reporting.
- **Status · priority · effort:** Tracking-only · P3 · M
- **Refs:** Gap 4.11 · Inventory 4.37 · PMX-4.21

**Geiger today**
- Tenant "Rent reporting" section records consent and status by hand and says "Reporting provider not connected" (`components/internal/screens/tenants/sections/insurance.jsx:55-69`).
- A $5 "credit reporting" item in the benefits catalog (`components/internal/screens/leasing/shared.js:390`).

**What's missing**
- A furnishing partner, resident consent capture, monthly tradeline export from the ledger, and status sync.

**How to build**
- *Data model:* migration `rent_reporting`.
  - `property.rent_reporting_enrollments`: `tenant_id`, `lease_id`, `provider`, `status`, `enrolled_at`, `consent_id` (LEAS-40 ledger, scope `rent_reporting`), `provider_ref`, `backreport_months`.
  - `property.rent_reporting_runs`: `period`, `provider`, `counts`, `file_path`, `status`, `errors`.
- *Server logic:*
  - `lib/rent_reporting/{index,<provider>}.js`: `enroll`, `submitPeriod(rows)`, `parseWebhook`.
  - `buildPeriodRows(admin, period)` from ledger AR per lease: amount due, paid date and amount, days late, from `ledger_lines` and `openItems` (`lib/ledger/postings.js:526`).
  - Positive-only by default.
- *API routes / jobs:* `POST /api/portal/resident/rent-reporting` (enroll with disclosure); job `rent-reporting` monthly; provider webhook.
- *UI:* portal Payments "Build credit with rent" card; tenant section becomes live; Settings → Integrations card.
- *Permissions:* `settings.manage`.
- *Integrations:* shortlist:
  - Esusu (landlord-paid, positive reporting)
  - Piñata (MRI partner; rewards)
  - Boom (rent-reporting-as-a-service API with sandbox; Metro 2 furnishing): https://docs.boompay.app/rent-reporting-as-a-service
  - Metro2 by Switchlabs
  - RentReporters (resident-paid)
  - Experian RentBureau (direct furnishing)
  - LevelCredit, Jetty Credit

**Steps**
1. Partner choice.
2. Migration.
3. Consent and enrollment.
4. Period builder from the ledger.
5. Monthly job.
6. Status sync.

**Research before building**
- FCRA furnisher duties (accuracy, disputes; 12 CFR 1022.42) if reporting negatives. Recommended: positive-only through a partner acting as furnisher.
- Partner data model (Metro 2 fields) and back-reporting rules.

**Acceptance criteria**
- An enrolled resident with an on-time March payment appears in the March run with the correct paid date and amount.
- Unenrolled residents never appear.
- A re-run of the same period is idempotent.

**Depends on / unblocks**
- Depends on CORE ledger correctness (gaps 0.1, 0.7), LEAS-40 and the PLAT API (gap 9.5) if the partner pulls.

---

#### LEAS-57 · Pay by phone (24/7 IVR) and voice bulletins
- **MRI equivalent:**
  - Engage Pay pay-by-phone: live agents or a 24/7 IVR that "can only pay the full balance".
  - Engage Interact phone bulletins.
- **Status · priority · effort:** Missing · P3 · M
- **Refs:** Gap 3.12, 4.1 (voice) · PMX-4.16, PMX-4.26

**Geiger today**
- None.

**What's missing**
- A phone number per project, caller identification, balance read-out, PCI-safe card capture, receipts, and recorded-message broadcasts.

**How to build**
- *Data model:*
  - The `messaging_channels` row with `kind: 'voice'` (LEAS-44).
  - Tenant metadata `phonePinHash` for callers whose number isn't on file.
- *Server logic:* `lib/voice/twilio_pay.js` TwiML flow:
  1. Identify by caller ID (E.164 to tenant), else account number plus PIN.
  2. Read the balance (`leaseReceivable`).
  3. `<Pay paymentConnector="Stripe_…">` in **tokenize** mode, returning a Stripe payment method.
  4. Charge through `chargeSavedMethod` (LEAS-46), so metadata, ledger posting and receipts stay on the existing path.
  - Card only; ACH by phone would need NACHA TEL recordings.
  - Voice bulletins: an announcements (LEAS-43) `voice` channel using `<Say>` / `<Play>` outbound calls, honoring consent (prerecorded calls to mobiles need consent).
- *API routes / jobs:* `POST /api/voice/twilio/pay` (signature-verified, multi-step); `POST /api/voice/twilio/status`.
- *UI:* Settings → Integrations → phone number and IVR on/off; the portal shows the pay-by-phone number and PIN setup; the Announcements voice channel.
- *Permissions:* `settings.manage`.
- *Integrations:* Twilio Voice plus `<Pay>` with the Stripe connector: https://www.twilio.com/docs/voice/twiml/pay/pay-connectors

**Steps**
1. Voice number on the channel.
2. Caller identification.
3. Balance read-out.
4. `<Pay>` tokenize plus charge.
5. Receipt.
6. Voice bulletins.

**Research before building**
- `<Pay>` tokenize versus charge mode with the Stripe connector, and whether metadata can be passed.
- PCI scope (Twilio handles the DTMF).
- Costs per minute.

**Acceptance criteria**
- A known caller hears the balance, pays by keypad, gets a confirmation number, and the payment posts once to the ledger.
- An unknown caller with a wrong PIN three times is disconnected.
- A voice bulletin skips opted-out numbers.

**Depends on / unblocks**
- Depends on LEAS-44, LEAS-46 and LEAS-43.

---

#### LEAS-58 · Bank balance check before an ACH debit
- **MRI equivalent:** Engage Pay Revenue Shield (Plaid balance verification before processing).
- **Status · priority · effort:** Missing · P3 · S
- **Refs:** Gap 3.13 · PMX-3.21

**Geiger today**
- ACH setup requests only the `payment_method` Financial Connections permission (`lib/payments/checkout.js` payment_method_options; `lib/payments/autopay.js:145-154`).
- Returns are handled well after the fact (`lib/payments/fulfill.js:93-145`).

**What's missing**
- A balance permission, a refresh before off-session ACH, and a policy for insufficient funds.

**How to build**
- *Data model:* none; record results in `online_payments.metadata.balanceCheck` and `autopay_plans.last_status`.
- *Server logic:*
  - Request `permissions: ['payment_method','balances']` and `prefetch: ['balances']` on ACH collection (Checkout, autopay setup).
  - In `chargeSavedMethod`, for ACH:
    1. Retrieve the PaymentMethod and its `us_bank_account.financial_connections_account`.
    2. Refresh balance; handle `financial_connections.account.refreshed_balance` in the Stripe webhook route, or poll briefly.
    3. Compare `available` with the amount.
    4. Per setting `achBalanceCheck` (off|warn|block): block means skip the debit and notify the resident (`payment_failed` with reason); warn means debit and flag.
  - Manually entered accounts (no FC account) skip the check.
- *API routes / jobs:* the Stripe webhook route `app/api/stripe/webhook/route.js` gains the event.
- *UI:* Payment Processing setting; autopay status shows "Skipped — low balance".
- *Integrations:* Stripe Financial Connections balances (needs Stripe approval): https://docs.stripe.com/financial-connections/balances

**Steps**
1. Apply for Stripe balances access.
2. Permission change on collection.
3. Check inside `chargeSavedMethod`.
4. Webhook event.
5. Setting and UI.

**Research before building**
- Stripe approval criteria and cost per refresh.
- Whether a pre-debit check changes NACHA or Reg E obligations.

**Acceptance criteria**
- In test mode, an account with a balance below the autopay amount and setting `block` produces no PaymentIntent, a "low balance" status and a resident notice.
- Setting `off` behaves as today.

**Depends on / unblocks**
- Depends on LEAS-46 and LEAS-47.

---

#### LEAS-59 · Flexible (split) rent through a partner
- **MRI equivalent:** Engage Pay with Flex. Residents split rent into smaller payments; the property receives full rent.
- **Status · priority · effort:** Missing · P3 · M
- **Refs:** Gap 3.14 · PMX-3.46

**Geiger today**
- None. Flex can already pay as the resident through the portal by card, but with no integration.

**What's missing**
- A partner integration that reads rent amount and due date, posts Flex's payment to the ledger, and reconciles settlement.

**How to build**
- *Data model:* `online_payments.provider = 'flex'` (LEAS-52 generalization); tenant metadata `flexEnrolled`.
- *Server logic:* the partner pulls the roster, leases, balances and due dates and pushes payments through the **PLAT public API** with a partner-scoped key. Payments post with `provider: 'flex'`, method ACH, and settle into a CORE deposit batch.
- *API routes / jobs:* PLAT API endpoints `GET /v1/leases?include=balance` and `POST /v1/payments` (external), with partner scopes.
- *UI:* Settings → Integrations → "Flexible rent" card; the portal shows "Split your rent with Flex" with a link when enabled.
- *Integrations:* Flex (free to managers; integrates with Yardi, RealPage, AppFolio, Entrata, MRI, Rent Manager, ResMan): https://getflex.com/integration-partners. Alternatives: Livble (RealPage), others to research.

**Steps**
1. PLAT API scopes.
2. Partner onboarding.
3. External payment posting.
4. Settlement mapping.
5. Portal card.

**Research before building**
- Flex's integration types (https://help.getflex.com/hc/en-us/articles/32293160543383-Flexible-Rent-and-integration-types) and data contract.
- State consumer-lending or BNPL disclosures for promoting split rent.

**Acceptance criteria**
- A Flex-posted payment applies oldest-first, shows "Flex" as the source, and appears in a deposit batch that matches Flex's settlement.

**Depends on / unblocks**
- Depends on the PLAT public API and webhooks (gap 9.5), PLAT-01, LEAS-52 (provider column) and CORE deposit batching (gap 11.4).

### Not building here
| MRI product | Why not | Revisit trigger |
|---|---|---|
| Engage Pay — DuesPayment (HOA/association dues) | Association management is not the target market. Geiger's HOA fields record the landlord's own dues (Inventory 8.19). | Geiger adds an HOA/community-association product. |
| Engage Pay — StorageRentPayment (self-storage) | Self-storage is not the target market. | Customers ask to manage storage facilities. |
| Engage Pay live-agent pay-by-phone (8–8 EST call centre) | Geiger has no call centre; LEAS-57 covers the 24/7 IVR. | A white-label agent partner becomes available cheaply. |
| Engage Interact voice surveys and Lone Worker Monitoring | Low demand at 10–500 units; LEAS-55 covers SMS and web surveys. | Enterprise or upmarket customers. |
| Native iOS/Android resident app | PWA first (LEAS-48). | Customers require app-store presence, or a native-only capability (smart-lock NFC, background location) is needed. |
