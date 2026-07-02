# Sidebar Feature Plan

Build-status snapshot for every area in the workspace sidebar
(`components/internal/sidebar/sidebar_nav.jsx`). Companion to
[`competitive-feature-matrix.md`](./competitive-feature-matrix.md) (the market
research) and [`feature-selection.md`](./feature-selection.md) (relevancy scoring).

## How the sidebar maps to screens

- The full feature taxonomy lives in the sidebar so the product scope is visible.
- A sidebar title renders a real screen only when it's wired in
  `components/internal/screens/registry.jsx`. Everything else falls back to
  `ComingSoonScreen` — a designed placeholder, so the workspace looks complete
  while areas are built one at a time.
- Per-entity concerns (a property's photos, a lease's addenda, a work order's
  vendor) become **tabs inside that entity's editor**, opened by selecting a row —
  they are not separate top-level sidebar destinations (per `MODULE_CONVENTIONS.md`).

## Status snapshot

| Area | Status | Notes |
| --- | --- | --- |
| Overview | ✅ Built | `overview/property_overview.jsx` — portfolio dashboard shell |
| Properties | ⏳ Scaffolded | P0 — build next (the spine); `All Properties` → property editor tabs |
| Listings & Marketing | ⏳ Scaffolded | P0 core; AI listing writer + rent comparables are P2 edges |
| Leads & CRM | ⏳ Scaffolded | P2 — included free (counter-position) |
| Applications & Screening | ⏳ Scaffolded | P0 — universal table stakes |
| Leasing | ⏳ Scaffolded | P0; unlimited eSign + state leases are the anti-gating hook |
| Tenants | ⏳ Scaffolded | P0/P1; rent reporting + rewards are P2 free edges |
| Owners | ⏳ Scaffolded | P1 — pro-tier core (owner portal + statements) |
| Maintenance | ⏳ Scaffolded | P0 core; AI triage + 24/7 coordination are P3 white-space |
| Accounting | ⏳ Scaffolded | P0/P1 core; trust accounting + AI bookkeeping are P3 moat |
| Banking & Fintech | ⏳ Scaffolded | P3 — least-saturated premium battleground (build-toward) |
| Communications | ⏳ Scaffolded | P0/P1; VoIP is P3 (Rent Manager only) |
| Documents & eSign | ⏳ Scaffolded | P1 |
| Tasks & Operations | ⏳ Scaffolded | P1/P2; AI assistant is the agentic-ops edge |
| Associations & HOA | ⏳ Scaffolded | P4 — niche vertical, build on demand only |
| Reports | ⏳ Scaffolded | P0/P1; custom report builder is P2 |
| Insights | ⏳ Scaffolded | P2/P3; rent optimization + AI insights are rare ML |
| Portals | ⏳ Scaffolded | P1/P2; "four portals free" matches Rentvine |
| Integrations | ⏳ Scaffolded | P1 core; open API + Zapier are P3 premium |
| Settings | ⏳ Scaffolded | P1 — standard workspace administration |

Legend: ✅ Built · ⏳ Scaffolded (nav entry + ComingSoon placeholder) · 🚧 In progress.

## Recommended build order

1. **Properties & Units** — the entity spine everything references.
2. **Leasing + Applications & Screening** — the lease lifecycle.
3. **Accounting (rent collection first)** — the money path; the reason people pay.
4. **Maintenance** — work orders + vendors.
5. **Tenants + Portals** — resident experience.
6. **Owners + Reports** — the PM-tier value.
7. **P3 differentiators** — AI, trust accounting, banking, open API — where we beat
   the incumbents on price.
