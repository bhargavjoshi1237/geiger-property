# Module Initiation Prompt

Paste this prompt to kick off a new workspace module. Fill in the two inputs at
the top, then let the orchestration run. It splits the work across focused
sub-agents so each concern (requirements, UI, DB, build) gets proper attention,
in line with `MODULE_CONVENTIONS.md`, `crafting.md`, and
`docs/sidebar-feature-plan.md`.

---

## Inputs

- **Module name:** `<e.g. Registrations>`
- **Basic info:** `<1–3 sentences: what this area is for, the entity it manages,
  and any must-have sub-features from the sidebar>`

---

## Prompt

You are the **orchestrator** for building the **`<Module name>`** module. Do
**not** write feature code yourself — handle requirements directly, then dispatch
the build sub-agents below in order, review each result, and only proceed when
the prior step is settled. Per-event config belongs in editor tabs; this module
is a **workspace-level** surface (read `sidebar-feature-plan.md` for the split).

First, **you** read `MODULE_CONVENTIONS.md`, `crafting.md`, and the `Events`
reference files they point to — once. Don't make each sub-agent re-read them;
pass each one a short distilled brief (the agreed spec + the few files it must
touch) so context isn't paid for repeatedly.

**Keep it efficient — scale to the module's size.** Only fan out where the work
is genuinely independent. A small or UI-only module can skip the DB step and let
one agent do UI + build; reserve parallel build tracks for modules large enough
to need them.

### 1. Requirements (you handle this in the main thread — no sub-agent)
Collect everything needed before any code. Sub-agents can't talk to the user, so
**you** ask directly — and doing it here reuses existing context instead of
spinning up a fresh one:
- Propose the module's scope: which sidebar sub-items are real workspace screens
  vs. small per-event settings that should fold into the event editor instead.
- For the workspace screen, suggest and confirm: the **entity + fields/types**,
  the **status set + colors**, **filters/search/sort**, **stat-bar KPIs**,
  **detail tabs**, **create-dialog** required fields/defaults, **row actions**,
  whether it's **permission-gated** (`view.*`), and the **persistence shape**.
- Offer opinionated **feature suggestions** drawn from the reference + matrix,
  but mark every assumption and get explicit **confirmation** in one batched
  round. Output a short, agreed spec.

Pause here and surface the spec to the user. Do not continue until confirmed.

### 2. UI design agent
From the confirmed spec, design the screen using the shared kit
(`screen_kit.jsx`) + shadcn — header, stats, toolbar, table, three list states,
semantic tokens only. Define the detail/tabbed editor layout and the create
dialog. Output a component/layout plan (files, props, states), not a wall of code.

### 3. DB design agent (only if persisted)
If the module needs storage, design the `flow_*` table(s), columns, `metadata`
bag, RLS, and the data-layer module shape (`normalize`/`toRow`, tri-state
returns) per `MODULE_CONVENTIONS.md` → Persistence and `SUPABASE_CONVENTIONS.md`.
Output the SQL DDL + the `lib/supabase/<area>.js` surface. Skip entirely if the
module is UI-only for now.

### 4. Build agents (parallelize where independent)
Implement the agreed plan in small, exact diffs. Split into independent tracks so
each gets focus, e.g.:
- **Data track:** the `lib/supabase/<area>.js` module + SQL (from step 3).
- **Screen track:** the workspace screen + `constants.js`, fetch-on-mount,
  `useMemo`-derived lists/stats, optimistic mutations + toasts.
- **Detail track:** the tabbed editor / dialogs.
- **Wiring track:** register in `registry.jsx` under the exact sidebar title;
  add any `view.*` permission.
Each build agent lints its files (`npx eslint <files>`) and reports what it
changed.

### Orchestrator close-out
Review the assembled module against `crafting.md`'s quality bar (loading/empty/
filtered-empty states, optimistic + persisted mutations, semantic tokens, kit
reuse, lint clean). Report what was built and what the user must do next
(e.g. `npm run db:push`).

Follow the MODULE_CONVENTIONS.md, SUPABASE_CONVENTIONS.md, and Crafting.md's intruction when requires taking desision related to its context.
