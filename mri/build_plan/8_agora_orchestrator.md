# 8. MRI Agora Orchestrator: what it offers, what Geiger must offer, and how to build it

**Date:** 2026-11-08 · **Code verified at:** HEAD `fecb165` (no app code has changed since the 2026-11-04 inventory at `4fdcbd7`) · **Items:** 17 (ORCH-01–10, ORCH-20–26)

**Sources:**
- MRI research: [`mri-agora-orchestrator-research.md`](<../../mri-agora-orchestrator-research.md>) (7 Nov 2026) and [MRI Software product portfolio](<../reports/MRI Software product portfolio.md>)
- Geiger evidence: [`geiger_feature_inventory.md`](<../notes/PMX Residential vs Geiger gaps/geiger_feature_inventory.md>), with row numbers cited as "Inventory x.y"
- Related specs in this folder: PLAT-01, PLAT-09, PLAT-13 and PLAT-18 ([file 6](6_platform_security_and_ai.md)); CORE-07, CORE-10, CORE-41 and CORE-47 ([file 1](1_core_property_management_and_accounting.md)); LEAS-40 and LEAS-41 ([file 2](2_leasing_and_residents.md))

**How this file is organised:**
1. **Part 1** lists everything MRI Agora Orchestrator offers.
2. **Part 2** scores Geiger today against each feature.
3. **Part 3** describes, in plain terms, what Geiger needs to offer.
4. **Part 4** is the build plan: a summary, prerequisites, build order and full item specs.
5. **Part 5** lists what we won't build, followed by the open decisions.

**The standing no-AI decision still applies** (README, "Standing decisions"). The plan therefore has two tracks:
- **Track A (ORCH-01–10)** delivers Orchestrator's governance, human review and value features with rules. It can be built now.
- **Track B (ORCH-20–26)** adds the AI layer. It is fully specified, but it is **gated** on the user lifting the no-AI decision.

---

## Part 1. What MRI Agora Orchestrator offers

### 1.1 In one paragraph
Agora Orchestrator is MRI Software's layer for running AI agents. It launched on **25 June 2026**, together with Agora Intelligence. The pitch: "Intelligence finds what needs doing; Orchestrator does it." A client chooses agents from a pre-built real-estate catalog and configures them with its own rules. The agents then run on their own, write back into MRI's systems, and bring in a person only for exceptions or judgement calls. Every action is logged, explained and counted on a value dashboard. MRI's headline is **trust, not raw autonomy**: "AI without assuming all the risk."

### 1.2 Where it sits in MRI Agora
| Layer | Product | Role |
|---|---|---|
| Foundation | **MRI Agora** (formerly Platform X) | Shared real-estate data foundation, semantic layer, governance, security, model orchestration |
| See | **Agora Intelligence** (evolved from Agora Insights dashboards) | Daily role-based signals: what changed, why, what to do |
| Ask | **Ask Agora** | Plain-language questions over real-estate data, with drill-down to source |
| Coordinate | **Agora Workflow / Workflow Builder** | Connects business processes (few public details) |
| **Do** | **Agora Orchestrator** (evolved from Agora Actions, 2025) | Deploys and runs agent workflows, escalates exceptions, logs everything |

### 1.3 Timeline
| Date | Event |
|---|---|
| Oct 2022 | MRI Agora launched as an "open and connected", AI-first platform, starting with Agora Insights |
| 7 Mar 2024 | Ask Agora first ships in PMX: plain-language questions over the PMX database |
| Jun 2025 | Agora Actions: an agent for month-end tenant-ledger-to-GL reconciliation (claimed ~1/3 of the manual time) and an in-page assistant, both in limited availability |
| 20 Oct 2025 | Ask Agora relaunched as a cross-product "AI companion" (MRI cites 250k+ monthly active users of its AI features) |
| 10 Jun 2026 | MRI Agora wins a Digie Award for its data-readiness foundation |
| 25 Jun 2026 | **Agora Intelligence and Agora Orchestrator launch** (EMEA in June, APAC in August) |
| 6 Oct 2026 | JAR (London, 6,500+ homes) is the first named Orchestrator customer |
| 3 Nov 2026 | Agora Voice announced: a voice agent for leasing questions, tour booking and maintenance intake |

### 1.4 Feature inventory
These IDs match the benchmark template in the research doc (section 9). The X rows are Agora AI features that sit next to Orchestrator.

**A. Agents and catalog**
| ID | Feature | What MRI offers |
|---|---|---|
| A1 | Pre-built agent catalog | Agents chosen from a catalog "built on real estate best practice" and refined across MRI's client base. No public list. Examples: credit control and debt management, maintenance triage, document processing, reconciliations, lease renewals |
| A2 | Per-org configuration | Each client applies its own rules, language, workflows, thresholds and risk tolerance |
| A3 | Multi-agent, multi-step workflows | Sequences of steps carried out by a combination of agents |
| A4 | Coverage | Categories on the product page: Analytics, Managing agents, Lease management, Asset modelling |

**B. Execution**
| ID | Feature | What MRI offers |
|---|---|---|
| B1 | Autonomous execution | Workflows run on their own, within client-defined guidelines |
| B2 | Context-aware handling | The right response for each case. MRI's example: a renewal showing hesitation is handled differently from one showing commitment |
| B3 | Exception surfacing | Cases the agent can't or shouldn't handle are raised with a clear explanation |
| B4 | Write-back | Agents always write back into MRI systems of record (PMX, residential, Horizon, Qube), so the record stays current |
| B5 | Unstructured input | Emails, maintenance requests and documents are extracted, interpreted, routed and written into the record (JAR) |
| B6 | Drafting outbound messages | Case-specific outbound messages drafted from records (JAR accounting) |
| B7 | Voice or chat front-ends | Ascend demos: a voice assistant triages a leaking sink, creates the repair, routes a contractor and texts an ETA; a chatbot qualifies a buyer and books a viewing. Demo only, not GA |

**C. Human in the loop**
| ID | Feature | What MRI offers |
|---|---|---|
| C1 | Configurable approvals | Human review where the client wants it, full automation where it doesn't |
| C2 | Guided Completion | For complex cases, the agent works through the case step by step with the team |
| C3 | Ask and refine | Before an action runs, the user can ask questions and change it |
| C4 | Visible reasoning | The agent's reasoning is shown; "not a black box" |
| C5 | Review Centre | Explains in plain language why a workflow couldn't or shouldn't run; resolve, adjust or redirect from the same view |

**D. Governance**
| ID | Feature | What MRI offers |
|---|---|---|
| D1 | Every action logged | Automated and human-approved actions alike |
| D2 | Audit trail | Searchable and exportable, for every agent run |
| D3 | Approval trail | Every decision is logged with its full approval trail |
| D4 | Role-level permissions | Users only see data they're authorised for |
| D5 | Guardrails | Client-defined rules and risk tolerance; MRI's Responsible AI framework |
| D6 | Source traceability | Every recommendation and action traces back to source MRI data |

**E. Value**
| ID | Feature | What MRI offers |
|---|---|---|
| E1 | Value dashboard | Continuous ROI tracking per agent: workflows run, time saved, outcomes |

**F. Intelligence (feeds Orchestrator)**
| ID | Feature | What MRI offers |
|---|---|---|
| F1 | Daily briefings | Every workflow across leasing, finance and operations is monitored daily. Each role (finance, leasing, property management, facilities) gets a briefing: what changed, why, next steps. Push model: "the intelligence finds you" |
| F2 | Classified, ranked findings | Each finding is a risk, trend, watch or opportunity, ranked by business impact |
| F3 | Confidence and completeness | Each finding carries a confidence level and a data-completeness score |
| F4 | Ask Agora drill-down | Plain-language follow-up questions, record drill-in and trace to source, without leaving the finding |
| F5 | Insight to action | A finding hands off to an Orchestrator workflow |

**G. Platform**
| ID | Feature | What MRI offers |
|---|---|---|
| G1 | Data foundation | A shared real-estate data foundation and semantic layer |
| G2 | Model-agnostic | Each workload is routed to the most suitable model under one governance layer, so model upgrades don't break workflows |
| G3 | Embedded | Runs inside existing MRI products, not as a separate tool. Pairs with Application Studio |
| G4 | Sectors | Commercial, multifamily, residential, social and subsidised housing, local authority, facilities management, corporate occupier; available globally |

**H. Commercial**
| ID | Feature | What MRI offers |
|---|---|---|
| H1 | Workflow discovery | MRI works with each client to identify and validate suitable workflows (consultative) |
| H2 | Pricing | Enterprise SaaS subscription. No public pricing, free tier or trial. Only for MRI customers |

**X. Agora AI features next to Orchestrator**
| ID | Feature | What MRI offers | Covered here by |
|---|---|---|---|
| X1 | Page assistant | Ask Agora inside a PMX page, aware of the record on screen | ORCH-21 ("Ask about this") |
| X2 | AI-suggested replies | Reply suggestions in Engage messaging | ORCH-22 |
| X3 | Agora Voice | Renter-lifecycle voice agent (3 Nov 2026) | ORCH-26 (chat); voice not building (Part 5) |
| X4 | AI fraud checks | Engage Protect screening | RISK file (provider-side results) |
| X5 | Workflow Builder / Application Studio | Low-code pages, reports and workflows | PLAT-13, PLAT-14 |

### 1.5 How MRI says it removes effort
| Before | With Orchestrator | Effort removed |
|---|---|---|
| Staff read dashboards, interpret them, decide, then act by hand | Signals are pushed, the agent acts, and people see only exceptions | Interpretation and execution |
| A person handles every case | Routine cases run on their own; complex cases get guided help | Volume work |
| The ops team builds rules engines, integrations and governance | A pre-built catalog with built-in governance: configure, don't build | Build and maintenance |
| Emails, requests and documents are retyped by hand | Agents extract, interpret, route and update the record | Data entry and triage |
| Audits mean digging through emails and logs | A searchable, exportable audit trail per run | Compliance prep |
| "Is the AI worth it?" debates | A value dashboard per agent | ROI justification |

### 1.6 Documented use cases
| Use case | Status |
|---|---|
| **JAR** (6,500+ homes, London): accounting process automation with drafted case-specific messages, maintenance-request triage and routing, extraction of documents and correspondence into the record. Staff keep sensitive and compliance-critical cases | Customer announcement, Oct 2026 |
| Debt management: Intelligence finds the signal and recommends; Orchestrator executes | Stage demo |
| Lease renewals handled differently by tenant intent | Product page example |
| Month-end reconciliation in PMX, ~1/3 of the manual time | Agora Actions, June 2025 |
| Resident repair by voice (leaking sink) | Ascend EMEA demo, not GA |
| Prospective buyer chatbot that books a viewing | Ascend APAC demo only |

### 1.7 Positioning and weak spots
- **Claims:** the only platform that unifies visibility, intelligence and execution on one real-estate foundation. Domain depth beats generic AI.
- **Rivals investing in the same space:** Yardi, RealPage, AppFolio, plus point solutions such as EliseAI.
- **Publicly visible weak spots:**
  - no public catalog of agents
  - no published ROI figures
  - write-back is MRI-centric, and third-party integration depth is undocumented
  - you configure agents; you can't build your own
  - voice and chat exist only in demos
  - only for MRI customers
  - no public pricing, and a consultative rollout that slows time-to-value for small operators

---

## Part 2. Geiger today, feature by feature

Scale: 0 = absent · 1 = partial · 2 = parity · 3 = exceeds. **Wt** is the weight from the research template (1 = nice-to-have, 3 = critical).

Geiger has **no AI code**. Every score of 1 means a rules-based or manual equivalent exists.

| ID | Wt | Today | What Geiger has |
|---|---|---|---|
| A1 | 3 | 1 | 11 workflow templates (`lib/automations/catalog.js:289-514`) and 12 scheduled jobs (`lib/jobs/registry.js:7`). They follow fixed rules |
| A2 | 3 | 1 | Fees & Policies settings, overridable per property and per lease (`lib/policies.js:176`); conditions; message templates. Many policy keys are saved but unread |
| A3 | 2 | 1 | 5 step types in a straight line (`catalog.js:225-231`). "Wait" picks up where it left off. No branching |
| A4 | 2 | 1 | Lease, maintenance and collections automations; 15 reports. No asset modelling |
| B1 | 3 | 1 | Runs are idempotent (`lib/automations/runner.js:388-441`), but **no crons are configured** (Inventory 9.44), so nothing runs without "Run now" |
| B2 | 2 | 1 | Conditions combine with AND only (`catalog.js:188-221`) |
| B3 | 3 | 1 | The Needs Attention card (`components/internal/screens/overview/property_overview.jsx:711-900`); raw error text in Run History |
| B4 | 3 | 2 | Geiger is the system of record. Automations and jobs write to it directly |
| B5 | 2 | 0 | Uploads are stored, never read (`lib/portal/files.js:17`) |
| B6 | 1 | 1 | Templates with merge fields (`lib/messaging/merge_fields.js`) |
| B7 | 1 | 0 | No chat. Portal maintenance requests don't fire automations (Inventory 5.51) |
| C1 | 3 | 1 | One-step approvals for bills, owner work-order approvals, amenities and applications (Inventory 9.12). Automations have no approval step |
| C2 | 2 | 1 | 75 multi-step action wizards (`components/internal/shared/wizard_dialog.jsx`) |
| C3 | 2 | 1 | Wizard fields can be edited before commit. No way to ask questions |
| C4 | 2 | 1 | Rules are readable, and Run History logs each step. It doesn't record why a run matched |
| C5 | 2 | 1 | Run History can view and cancel runs. No retry, resolve or redirect |
| D1 | 3 | 1 | `property.activity` (browser-written and editable) plus `automation_runs`, `job_runs` and `stripe_events` (Inventory 9.9–9.10) |
| D2 | 3 | 1 | Timeline per record only. No workspace audit view and no export (Inventory 9.11) |
| D3 | 2 | 1 | The bill approver's name is a free-text field (`components/internal/screens/accounting/bills.jsx:664`) |
| D4 | 3 | 1 | Roles and permissions are enforced only in the UI. RLS is demo-open (Inventory 9.4, 9.45) |
| D5 | 3 | 1 | Bill and work-order approval limits; policy thresholds |
| D6 | 2 | 1 | GL entry drill-in works. Reports don't drill down to records (Inventory 7.14) |
| E1 | 2 | 1 | Run History tiles: runs, success rate, failures (`run_history.jsx:192-203`). No time saved, no outcomes |
| F1 | 2 | 1 | Scheduled report emails; expiry digests (Inventory 7.22, 8.14–8.16) |
| F2 | 2 | 1 | Needs Attention urgency levels: urgent, soon, routine |
| F3 | 1 | 0 | — |
| F4 | 2 | 0 | — |
| F5 | 2 | 0 | Needs Attention only navigates to a tab |
| G1 | 3 | 1 | One schema and one GL. Metric math is duplicated across the Overview and the reports (Inventory 7.26) |
| G2 | 1 | 0 | — |
| G3 | 2 | 2 | Everything lives in one app, with suite sign-in |
| G4 | 1 | 1 | Residential plus light commercial |
| H1 | 1 | 1 | Self-serve templates and the sandbox playground (`lib/sandbox/sandbox_client.js`) |
| H2 | 1 | 2 | A free playground and a stated per-unit pricing model, but no published price |

**Totals:** 3 rows at parity, 25 partial, 6 absent. Weighted, that is **69 / 144 = 48% of parity**.

---

## Part 3. What Geiger needs to offer

### 3.1 Shape: rules first, AI second
- **MRI sells trust, not autonomy.** Its headline features are approvals, exceptions, audit and value tracking, and none of them needs AI. Geiger can match them with rules and give a better answer to "why did it do that?", because every decision is a rule the customer can read.
- **AI needs these rails before it ships.** An AI agent that drafts, extracts or decides must pass through the same autonomy gate, review queue and audit trail. Building Track A first means Track B adds models, not plumbing.
- **The suite already has an AI engine.** geiger-comms ships a multi-provider layer (`C:\Pro\geiger-comms\lib\server\ai.js`, `lib/engine/llm.js`, `lib/ai/features.js`). It covers bring-your-own provider keys, per-feature switches, daily quotas and usage logs. It is the obvious seed for the "future shared suite package" named in the standing decision (ORCH-20).

### 3.2 The eight things Geiger should offer
| # | What the customer gets | In plain words | Answers MRI | Items |
|---|---|---|---|---|
| 1 | **Playbooks** | Ready-made automations for the real jobs: collections, renewals, maintenance intake, move-out and deposits, vacancy turns, month-end close, owner payouts. Switch one on, answer a few setup questions, tune it, or build your own on the canvas | A1–A4, H1 | ORCH-07 |
| 2 | **An autonomy dial with hard limits** | Each playbook can only suggest, ask first, ask above a limit, or run on its own. Guardrails cap money and message volume, respect do-not-contact and quiet hours, and include a kill switch | B1, C1, D5, A2 | ORCH-05 |
| 3 | **One review queue** | Everything that needs a person in one list: failures, approvals, flagged cases and drafts. Each item gives a plain-language reason and offers resolve, retry, adjust, reassign or snooze | B3, C5, D3 | ORCH-04 |
| 4 | **A daily briefing** | Each role gets the signals that matter, ranked by money at stake, pushed in-app and by email. Each signal says why, how complete the data is, and offers a one-click action | F1, F2, F3 | ORCH-06 |
| 5 | **Act from the insight** | Preview exactly what will happen, edit it, then run it on the selected records. Complex cases open a guided case sheet with full context | F5, C2, C3 | ORCH-08 |
| 6 | **Proof** | Every run explains why it ran and what it did, with links to the records. Tamper-proof audit with export. An impact page shows hours saved and money collected per playbook | C4, D1, D2, D6, E1 | ORCH-02, ORCH-09, PLAT-09 |
| 7 | **One set of numbers** | Shared metric definitions, so the Overview, reports, signals, impact and AI answers agree, and every number opens the rows behind it | G1, D6 | ORCH-03 |
| 8 | **AI inside the same rails** *(Track B)* | Ask questions in plain English, AI-drafted messages, reading of invoices and certificates, triage and intent, agent steps, and a resident chat. All of it runs through the autonomy dial, review queue and audit | B2, B5–B7, C3, F4, G2, X1–X3 | ORCH-20–26 |

### 3.3 Where Geiger should beat MRI rather than copy it
- **Build, not just configure.** The workflow canvas already lets customers create their own automations, which is a gap MRI admits. Keep playbooks editable on the canvas.
- **Explainable by construction.** A rule's "why" is exact, not a model's account of itself. Show it everywhere (ORCH-02).
- **Measured, not asserted, value.** MRI publishes no ROI numbers. Show the method behind every impact number (ORCH-09).
- **Self-serve and standalone.** Use in-product recommendations instead of consultants (ORCH-07), keep the free playground, and publish pricing (INTL-01).
- **Open, not MRI-centric.** Signed webhooks and a public API (PLAT-10, PLAT-11) let playbooks reach other systems.

### 3.4 Target scorecard
| ID | Wt | Today | After Track A | After Track B | Built by |
|---|---|---|---|---|---|
| A1 | 3 | 1 | 2 | 2 | ORCH-07 (+ ORCH-25 agent steps) |
| A2 | 3 | 1 | 2 | 2 | ORCH-05, ORCH-07 |
| A3 | 2 | 1 | 2 | 2 | PLAT-13, ORCH-07 |
| A4 | 2 | 1 | 1 | 1 | ORCH-07 (asset modelling not building) |
| B1 | 3 | 1 | 2 | 2 | CORE-10, ORCH-05 |
| B2 | 2 | 1 | 1 | 2 | PLAT-13 branch; ORCH-24 |
| B3 | 3 | 1 | 2 | 2 | ORCH-02, ORCH-04 |
| B4 | 3 | 2 | 2 | 2 | — |
| B5 | 2 | 0 | 1 | 2 | ORCH-10; ORCH-23 |
| B6 | 1 | 1 | 1 | 2 | ORCH-22 |
| B7 | 1 | 0 | 1 | 2 | ORCH-01; ORCH-26 |
| C1 | 3 | 1 | 2 | 2 | CORE-47, ORCH-05 |
| C2 | 2 | 1 | 2 | 2 | ORCH-08 |
| C3 | 2 | 1 | 1 | 2 | ORCH-08 preview; ORCH-21 |
| C4 | 2 | 1 | 2 | 2 | ORCH-02 |
| C5 | 2 | 1 | 2 | 2 | ORCH-04 |
| D1 | 3 | 1 | 2 | 2 | PLAT-09, ORCH-02 |
| D2 | 3 | 1 | 2 | 2 | PLAT-09, ORCH-02 |
| D3 | 2 | 1 | 2 | 2 | CORE-47, ORCH-04 |
| D4 | 3 | 1 | 2 | 2 | PLAT-01, PLAT-08 |
| D5 | 3 | 1 | 2 | 2 | ORCH-05 |
| D6 | 2 | 1 | 2 | 2 | ORCH-03, ORCH-02 |
| E1 | 2 | 1 | 2 | 2 | ORCH-09 |
| F1 | 2 | 1 | 2 | 2 | ORCH-06 (+ ORCH-25 narrative) |
| F2 | 2 | 1 | 2 | 2 | ORCH-06 |
| F3 | 1 | 0 | 2 | 2 | ORCH-06 |
| F4 | 2 | 0 | 0 | 2 | ORCH-21 |
| F5 | 2 | 0 | 2 | 2 | ORCH-08 |
| G1 | 3 | 1 | 2 | 2 | ORCH-03 |
| G2 | 1 | 0 | 0 | 2 | ORCH-20 |
| G3 | 2 | 2 | 2 | 2 | — |
| G4 | 1 | 1 | 1 | 1 | HOUS / COMM files |
| H1 | 1 | 1 | 2 | 2 | ORCH-07 recommendations |
| H2 | 1 | 2 | 2 | 2 | INTL-01 (published pricing would make it 3) |
| | | **69 (48%)** | **127 (88%)** | **141 (98%)** | |

**How to read "After Track A".** This column counts a rules-based equivalent as parity. A buyer comparing AI features won't see it that way: B2, B5, B6, B7, C3, F4 and G2 stay below parity until Track B ships.

---

## Part 4. Build plan

### Summary
| ID | Feature | MRI IDs | Status | Priority | Effort | Track |
|---|---|---|---|---|---|---|
| ORCH-01 | Resident maintenance requests fire automations | B7, B5 | **Done** (2026-11-08) | P1 | S | A |
| ORCH-02 | Explainable, exportable runs | C4, D2, D6 | **Done** (2026-11-08) | P2 | M | A |
| ORCH-03 | One metrics layer for overview, signals, impact and AI | G1, D6 | **Done** (2026-11-08) | P2 | M | A |
| ORCH-04 | Review queue | B3, C5, D3 | **Done** (2026-11-08) | P2 | L | A |
| ORCH-05 | Autonomy levels and guardrails | C1, D5, B1, A2 | **Done** (2026-11-08) | P2 | M | A |
| ORCH-06 | Signals engine and daily briefing | F1, F2, F3 | **Done** (2026-11-08) | P2 | L | A |
| ORCH-07 | Playbook catalog | A1–A4, H1 | **Done** — 11 of 13 installable; owner payouts and payment-plan follow-up wait on CORE-51/54 and installment tracking (2026-11-08) | P2 | L | A |
| ORCH-08 | Insight-to-action handoff and guided cases | F5, C2, C3 | **Done** (2026-11-08) | P2 | M | A |
| ORCH-09 | Impact dashboard | E1 | **Done** (2026-11-08) | P2 | M | A |
| ORCH-10 | Rules-based intake from email and the portal | B5, B7 | **Done** — needs a mail provider webhook (2026-11-08) | P3 | M | A |
| ORCH-20 | AI foundation: shared engine, model routing, AI governance | G2, D1, D5 | Missing | Gated | L | B |
| ORCH-21 | Ask Geiger: plain-language questions, answers with sources | F4, C3, D6, X1 | Missing | Gated | L | B |
| ORCH-22 | AI drafts for case-specific messages | B6, X2 | Missing | Gated | M | B |
| ORCH-23 | Document and email extraction | B5 | Missing | Gated | L | B |
| ORCH-24 | AI triage and intent signals | B2, F3 | Missing | Gated | M | B |
| ORCH-25 | Briefing narrative and agent steps | F1, A1, B1 | Missing | Gated | L | B |
| ORCH-26 | Resident and prospect chat in the portal | B7, X3 | Missing | Gated | L | B |

"Gated" means it waits on the AI decision (see Open decisions). Once that is approved, treat these items as P2.

**Build notes (Track A, 2026-11-08, branch `feat/agora-orchestrator`).** Open decisions 4–8 took the recommendations. Prerequisites were built only as the slices the orchestration layer needs; the full items stay open in their files:
- **PLAT-09:** `property.audit_log` + `enable_audit()` (append-only), enabled on automations, review_items and playbook_installs. The viewer, sign-ins and the financial tables are still open.
- **PLAT-13:** run retries with backoff, re-run from the failed step, and the steps `post_charge`, `assign`, `create_task`, `request_approval` and `branch` (an "if / otherwise" that stops or skips ahead). Also the `manual`, `work_order.overdue`, `vendor.compliance_expiring`, `autopay.failed` and `maintenance_request.created` triggers, and v2 condition groups (evaluation plus "match all / any"; nested groups only from playbooks). Still open: the `branch` canvas node with two outputs, `call_webhook`, `update_field` and custom-field conditions.
- **CORE-47:** bill approvals reach the review queue through the `bill_review_sync` trigger, and approving from the queue posts to AP with the bill screen's key. Policies and multi-step approvals are still open.
- **LEAS-40:** `lib/messaging/consent.js` reads the existing contact preferences (do-not-contact, opt-ins, quiet hours). The consent ledger and the dispatcher refactor are still open.
- **PLAT-18:** `lib/context/record_context.js` for the case sheet. The action registry is still open.
- **CORE-07:** the metrics layer reads the ledger; the rent trend widget still reads rent-account metadata.
- **Not wired yet:**
  - No crons (CORE-10): signals, briefings, impact and housekeeping run from Scheduled Jobs → Run now.
  - Inbound email needs `NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN`, `INBOUND_EMAIL_SECRET` and a provider webhook.
  - The `property.daily_briefing` email template sits uncommitted in geiger-dash; until dash deploys it, briefings use `property.message`.
  - Guardrail overrides per property are read (`metadata.guardrailOverrides`) but have no editor yet.
- **Track B:** `property.ai_runs` and `property.ai_insights` already exist in the live DB as orphan tables. Pick other names for ORCH-20.

### Prerequisites owned by other files
These items are already specified elsewhere. The orchestration layer builds on them; it does not repeat them.

| Item | Why the orchestration layer needs it |
|---|---|
| PLAT-01 Data security | Automations and agents act on data. D4 needs enforced, role-scoped reads, and AI must read through RLS |
| CORE-10 Crons in production | B1: nothing runs on its own until jobs are scheduled |
| CORE-07 Dashboards read the ledger | Signals and metrics must read the GL, not legacy rent-account metadata |
| CORE-41 Ledger aggregates | Server-side metrics at portfolio scale |
| PLAT-09 Immutable audit trail | D1 and D2: tamper-proof, exportable history of every automated and approved change |
| PLAT-13 Workflow builder depth | OR groups, `branch`, retries and re-run, `post_charge`, `request_approval`, `assign`, `create_task`, the manual "Run on this record" trigger |
| CORE-47 Approval engine | Multi-step approval policies; the approvals half of the review queue |
| PLAT-18 AI groundwork | The event catalogue, `lib/context/*` builders and the typed action registry |
| LEAS-40 Consent and notify dispatcher | Guardrails must honour do-not-contact, opt-ins and quiet hours |
| PLAT-07 Bulk actions | Running workflows on, and resolving, many records at once |
| PLAT-08 Property-scoped access | D4 at MRI's level: users see only their properties |
| LEAS-41 Staff inbox | Intake, AI drafts and chat hand-offs land in threads |
| INTL-01 Published pricing | H2 |

### Build order
1. **Wave 0: prerequisites.** PLAT-01, CORE-10 and CORE-07 are already on the launch path. Then PLAT-09, PLAT-13 (steps 1–2, 4, 7 and 8), CORE-47, PLAT-18 (steps 1–3) and LEAS-40.
2. **Wave 1: quick wins that can start now.**
   - ORCH-01 is a defect fix and P1.
   - ORCH-02 ships alongside PLAT-13 step 2, since both touch Run History.
3. **Wave 2: the rails.**
   - ORCH-03 comes first, because the signals and impact pages depend on it.
   - ORCH-04 then gives every later item a place to send cases to a person.
   - ORCH-05 then puts the autonomy gate in front of every side effect.
4. **Wave 3: the visible product.** ORCH-06, then ORCH-07, then ORCH-08, then ORCH-09. Launch playbooks one at a time as their PLAT-13 steps land (see the table in ORCH-07).
5. **Wave 4: intake.** ORCH-10, after LEAS-41.
6. **Wave 5: AI, only after the AI decision.**
   - ORCH-20 first.
   - Then ORCH-21 and ORCH-24 in parallel.
   - Then ORCH-22, ORCH-23, ORCH-25 and ORCH-26.

### Items

#### ORCH-01 · Resident maintenance requests fire automations
- **MRI equivalent:** maintenance-request triage and routing (JAR). A request from any front-end starts the workflow.
- **Status · priority · effort:** Broken · P1 · S
- **Covers:** B7, B5 · **Refs:** Inventory 5.51 · LEAS-42

**Geiger today**
- `property.record_event_trigger()` is owned by `supabase/migrations/20261015214949_fix_record_event_trigger_array_append.sql`. It emits `work_order.created` and `work_order.completed` only when `kind = 'work_order'` (`:34-37`).
- Resident-portal requests have `kind = 'request'`. The built-in "Maintenance request received" workflow (`lib/automations/catalog.js:413-447`) therefore never fires for them, and converting a request fires nothing either.

**How to build**
- *Data model.* A migration `record_event_maintenance_requests` replaces `property.record_event_trigger()`:
  - an INSERT with kind `request` emits `maintenance_request.created`
  - an UPDATE where kind changes from `request` to `work_order` emits `work_order.created` with `convertedFromRequest: true` in the payload
  - `work_order.completed` fires for both kinds
  - Coordinate with LEAS-42, which also replaces this function (to add `work_order.status_changed`). Whichever ships second extends the other's version. Only one migration should own the function at a time.
- *Catalog:*
  - Add a `maintenance_request.created` trigger to `TRIGGERS` (group Maintenance, record `work_order`).
  - Point the "Maintenance request received" template at it.
  - Add `kind` and `source` to the work-order `CONDITION_FIELDS`, so one workflow can target both kinds.
- Don't touch the `emit_record_event` grant to `anon` here. PLAT-01 owns it.

**Research before building**
- How a request becomes a work order: a kind update on the same row, or a new row. Check `components/internal/screens/maintenance/*` and `lib/portal/resident.js`.

**Acceptance criteria**
- A portal request creates exactly one `maintenance_request.created` event, and the template's run completes.
- Converting the request emits `work_order.created` once. Saving it again emits nothing.
- Staff-created work orders behave exactly as before.

**Depends on / unblocks**
- **Depends on:** nothing (coordinate with LEAS-42).
- **Unblocks:** the maintenance playbooks in ORCH-07, and ORCH-10.

---

#### ORCH-02 · Explainable, exportable runs
- **MRI equivalent:** visible reasoning; the Review Centre's plain-language explanations; a searchable, exportable audit trail for every agent run.
- **Status · priority · effort:** Partial · P2 · M
- **Covers:** C4, D2, D6 (feeds B3) · **Refs:** Inventory 9.22 · PLAT-13 step 2

**Geiger today**
- `automation_runs` stores a snapshot of the steps and a per-step `log` (`supabase/migrations/20261015212609_messaging_scheduler_automations.sql:170-196`).
- Run History shows the status, the step log and the raw `error` (`components/internal/screens/automations/run_history.jsx:72-135`).
- `evaluateConditions` returns only a boolean (`lib/automations/catalog.js:188-221`). A run doesn't record why it matched, and a trigger whose conditions failed leaves no trace.
- Run History can't be exported.

**How to build**
- *Server logic:*
  - Add `explainConditions(rules, row)`, returning `{ matched, results: [{ field, label, op, expected, actual, passed }] }`, nested for PLAT-13's v2 groups. `evaluateConditions` becomes a thin wrapper around it.
  - `createRun` (`lib/automations/runner.js:77`) stores `metadata.explanation`:
    - the trigger (event type, event id, actor)
    - the condition results
    - the record reference and the key field values that were used
  - `runStep` (`:262`) adds three things to each log entry:
    - `input`: resolved recipients, template, amounts
    - `output`: ids created, such as the send id, work order id or ledger entry id
    - `links`: `[{ type, id, label }]`
  - When a trigger fires but its conditions fail, write a run with status `skipped` that carries the explanation. A retention job deletes skipped runs after 30 days.
  - New pure module `lib/orchestration/explain.js` with `explainRun(run)`, which returns sentences such as: "Ran because Maya Patel's balance ($412) is over $100 and rent is 6 days late (rule: at least 5)." Run History, the review queue (ORCH-04) and emails all use it.
- *UI:*
  - The Run History drawer gets a "Why this ran" section, plus each step's inputs and outputs linked to their records through `useWorkspaceUrl`.
  - Run History gains a filter by record, and a CSV export through `lib/reports/csv.js`, gated by `reports.export`.
  - Record editors get an "Automation runs" related section built with `components/internal/screens/entity/sections/related_section.jsx`.

**Acceptance criteria**
- A rent-overdue run shows each condition with its expected and actual values, plus the sentence form.
- Every step that created a record links to it.
- The filtered export opens in a spreadsheet with an explanation column.
- Skipped evaluations are visible for 30 days.

**Depends on / unblocks**
- **Depends on:** PLAT-13 steps 1–2 (build together).
- **Unblocks:** ORCH-04, ORCH-09, ORCH-25.

---

#### ORCH-03 · One metrics layer for overview, signals, impact and AI
- **MRI equivalent:** Agora's shared real-estate data foundation and semantic layer.
- **Status · priority · effort:** Partial · P2 · M
- **Covers:** G1, D6 · **Refs:** Inventory 7.26, 7.31 · CORE-07, CORE-41, CORE-59

**Geiger today**
- Every module already shares one schema and one GL, so the foundation exists.
- The metric math is scattered:
  - The Overview computes its own occupancy, collections and aging (`components/internal/screens/overview/property_overview.jsx:783-900`), from legacy rent-account metadata (the CORE-07 defect).
  - The reports compute theirs separately in `lib/reports/defs_*.js`.
  - Needs Attention derives aging again.

**How to build**
- `lib/metrics/` holds named, documented metric definitions:
  - **Shape:** `{ key, label, unit, description, grain, dimensions: ['property', 'owner', 'month'], compute(sources, params), sourceRecords(sources, params) }`.
  - **First set:**
    - occupancy; physical and economic vacancy; days vacant; turn time
    - rent collected; collection rate; delinquent balance and aging buckets
    - open and overdue work orders; median work-order turnaround
    - renewal rate; leases expiring in 30, 60 and 90 days
    - AP due; unapproved bills; trust shortfall; budget variance
  - **Sources:** CORE-41 aggregates and the existing layers. The compute functions are pure and shared by client and server, the way reports already share `sources_client.js` and `sources_server.js`.
  - **Drill-down:** `sourceRecords` returns the record ids behind each number, so any figure can open its rows (D6).
- Move the consumers over in this order:
  1. Overview KPIs and Needs Attention (together with CORE-07)
  2. report stats, where the definitions match
  3. ORCH-06, ORCH-09 and ORCH-21
- A "Metric definitions" help page is generated from the catalogue: description, formula and sources. This makes the semantic layer visible to customers.

**Acceptance criteria**
- The Overview, the Delinquency report and the signals engine show the same delinquent balance on the demo project.
- Every Overview KPI tile opens the records behind it.
- Each metric has unit tests over the demo seed.

**Depends on / unblocks**
- **Depends on:** CORE-07, CORE-41.
- **Unblocks:** ORCH-06, ORCH-09, ORCH-21, CORE-59 widgets.

---

#### ORCH-04 · Review queue
- **MRI equivalent:** the Review Centre ("explains in plain language why a workflow could not or should not run; resolve, adjust or redirect from the same view") and Orchestrator's exception escalation.
- **Status · priority · effort:** Missing · P2 · L
- **Covers:** B3, C5, D3 · **Refs:** Inventory 9.12, 9.13, 9.22 · PLAT-13, CORE-47

**Geiger today**
- Failures live only in Run History, as raw error text, and failed runs are never retried (`lib/automations/runner.js:388-441`).
- Job failures sit in `job_runs` and show only in the Scheduled Jobs dialog.
- Approvals are single-step and live on separate screens.
- Needs Attention links to a tab. It has no assignment and no state.

**How to build**
- *Data model* (migration `review_items`). Check the name against the live DB's orphan tables first.
  - **`property.review_items`** columns:
    - identity: `id`, `project_id`, `dedupe_key` (unique per project)
    - type: `kind` (`exception` | `approval` | `decision` | `intake`); `source_type` (`automation_run` | `job_run` | `approval_request` | `signal` | `intake` | `ai_proposal`); `source_id`
    - record: `record_type`, `record_id`, `record_label`, `property_id`
    - reason: `title`, `reason_code`, `reason_text`, `severity` (`urgent` | `soon` | `routine`), `amount_at_stake`
    - workflow: `status` (`open` | `snoozed` | `resolved` | `dismissed`), `assignee_id`, `assignee_role`, `due_at`, `snoozed_until`
    - `proposed_action jsonb` (an action key plus inputs, for "suggest" mode and for AI later)
    - `resolution jsonb` (`{ action, note, by, at }`)
    - timestamps
  - **Approvals:** CORE-47's `approval_requests` stays the source of truth. When a request becomes pending at a step, CORE-47 upserts an `approval` item (dedupe `approval:<requestId>:<step>`), and the decision closes it. One inbox, one engine.
  - **Audit:** turn on PLAT-09 auditing with `enable_audit('review_items')`.
- *Server logic* (`lib/orchestration/review.js`):
  - **`raiseReview(admin, item)`**, an idempotent upsert, is called from:
    - the runner, on a final failure after PLAT-13 retries, and on `request_approval` or escalate steps
    - the job executor, on a failed job (`lib/jobs/execute.js`)
    - ORCH-05 guardrail blocks
    - ORCH-06 signals that need a decision
    - ORCH-10 intake drafts
  - **Reason catalogue** in `lib/orchestration/reasons.js` maps a `reason_code` to `{ title, explain(ctx), fixes: [action keys] }`. Codes include:
    - `no_recipient_email`, e.g. "Maya Patel has no email address, so 'Rent reminder' couldn't be sent."
    - `guardrail_money_cap`, `quiet_hours`, `template_missing`, `record_deleted`, `provider_error`, `approval_required`
    - known runner errors map to codes; anything else becomes `unexpected_error`, with the raw text in a details fold
  - **Actions:**
    - `resolve(note)`, `dismiss(reason)`, `snooze(until)`, `reassign(user | role)`
    - `retry()`, using PLAT-13's `rerunFromFailed`
    - `adjustAndRetry(inputs)`: edit the failed step's inputs (another recipient, another amount) and re-run from that step
    - `approve` and `reject`, delegated to CORE-47
    - `runSuggested()`, which executes `proposed_action` through the PLAT-18 action registry
  - Every action writes `resolution` and a `property.activity` entry on the record, and is audited.
  - **Notifications** go through `@geiger/notify/server` (`createServerNotifier`): the assignee hears on create, and open items appear in the daily briefing (ORCH-06).
- *UI:*
  - "Review Queue" becomes the first entry in the Automations sidebar group (`components/internal/sidebar/sidebar_nav.jsx:200-206`), with an open-count badge.
  - The list uses a `@geiger/ui` DataTable with tabs All / Exceptions / Approvals / Decisions, filters for property, assignee, severity and source, and bulk resolve or assign (PLAT-07 pattern).
  - The detail sheet shows the plain-language reason, the ORCH-02 explanation, a record context card, the fixes as buttons, and the item's history.
  - Record editors show a banner when the record has open review items.
- *Permissions:* `property.review.view` and `property.review.resolve`. Approvals still apply CORE-47's approver rules, and financial fixes need `accounting.post`.

**Acceptance criteria**
- A collections run that fails for a tenant with no email raises exactly one item, with a one-sentence reason. Adding the email and clicking Retry completes the run and resolves the item.
- A failed late-fees job raises one item per failure, not one per retry.
- A pending bill approval appears once, and disappears when the bill is approved on the bill screen.
- No action can close an item without a resolution entry, and every action has audit rows.

**Depends on / unblocks**
- **Depends on:** PLAT-13 (retries, re-run, `request_approval`), CORE-47, PLAT-09, PLAT-01.
- **Unblocks:** ORCH-05, ORCH-08, ORCH-10, ORCH-22–25.

---

#### ORCH-05 · Autonomy levels and guardrails
- **MRI equivalent:** "configurable approval controls — human review where wanted, full automation where not"; client rules and risk tolerance.
- **Status · priority · effort:** Missing · P2 · M
- **Covers:** C1, D5, B1, A2 · **Refs:** Inventory 9.12, 4.49–4.50 · CORE-47, LEAS-40

**Geiger today**
- An automation is Draft, Active or Paused. Once it is active, every step runs.
- Money limits exist only for bills (`billApprovalLimit`, `components/internal/screens/accounting/bills.jsx:83-88`) and for owner work-order approvals (`lib/policies.js:125`).
- Automations ignore contact preferences: do-not-contact, quiet hours and opt-ins (LEAS-40).

**How to build**
- *Data model* (migration `automation_autonomy`):
  - **`automations.autonomy`**, a text column so it can be queried, with these modes:
    - `suggest`: never executes
    - `approve`: every side effect needs approval
    - `approve_over`: approval only above a threshold
    - `auto`: runs on its own
  - **`automations.metadata.autonomyConfig`:** `{ threshold, approverRole, appliesTo: [step types] }`.
  - **Project guardrails** live in the `automation_guardrails` settings key and cascade to property overrides, like `resolvePolicies` in `lib/policies.js:176`:
    - `maxChargePerRun`, `maxChargesPerDay`, `maxMessagesPerRecordPerWeek`
    - `quietHours: { start, end, tz }`, `respectDoNotContact: true`, `pauseAll: false`
- *Server logic* (`lib/orchestration/autonomy.js`):
  - `runStep` calls `gate(step, ctx)` before every step with a side effect. It returns one of three results:
    - `allow`
    - `review(reason_code, proposed)`
    - `block(reason_code)`
  - What each mode does at the gate:
    - `suggest` raises a `decision` item (ORCH-04) with `proposed_action`, and the run waits in `waiting_review`.
    - `approve` uses PLAT-13's `request_approval`. Add `automation_action` to CORE-47's subject types for this.
    - `approve_over` sends a charge for approval only at or above the threshold. Messages pass.
    - `auto` executes. Guardrails still apply.
  - Guardrails:
    - A breached money cap raises a review item.
    - A breached message cap skips the send and logs the explanation, without raising an item (to avoid noise).
    - Quiet hours defer the step by setting `resume_at`.
    - Do-not-contact checks go through the LEAS-40 dispatcher.
    - `pauseAll` makes the runner exit before any step runs.
  - An approve or reject resumes or cancels the run, and the decision is recorded (D3).
- *UI:*
  - The canvas header gets an "Autonomy" control with four options: Suggest only, Ask first, Ask above a limit, Run automatically. Each option has a one-line explanation.
  - Settings → Automations gets a guardrails card.
  - "Pause all automations" appears in the Automations header and in Settings, with a banner while paused.
- *Defaults:* new and playbook-installed workflows default to "Ask first" for steps that post money or send legal notices, and to "Run automatically" for reminders and internal notes. This is an open decision.

**Acceptance criteria**
- In `suggest` mode, a run creates a decision item and sends nothing until "Run suggested" is clicked.
- With `approve_over` set to $50, a $45 late fee posts at once. A $75 fee waits for approval and posts exactly once when approved.
- A send inside quiet hours is deferred to the next allowed time.
- "Pause all" stops step execution within one runner tick, and resuming continues without duplicate sends.

**Depends on / unblocks**
- **Depends on:** PLAT-13 (`request_approval`, `post_charge`), CORE-47, LEAS-40, ORCH-04.
- **Unblocks:** ORCH-07, and ORCH-22–25 (AI actions pass the same gate).

---

#### ORCH-06 · Signals engine and daily briefing
- **MRI equivalent:** Agora Intelligence: daily monitoring; role-specific "what changed, why, next steps" briefings; risk, trend, watch and opportunity findings ranked by impact, with confidence and completeness scores; a push model.
- **Status · priority · effort:** Partial · P2 · L
- **Covers:** F1, F2, F3 · **Refs:** Inventory 7.22, 7.26, 8.14–8.16, 9.56 · CORE-59

**Geiger today**
- The Needs Attention card runs six rules: overdue rent, urgent work orders, overdue bills, renewals, moves and pending applications. Each rule has an urgency (`urgent`, `soon` or `routine`), and everything is computed in the browser on every Overview load (`components/internal/screens/overview/property_overview.jsx:808-900`). There is no history, no ranking by money, and no push.
- Scheduled report emails (`lib/jobs/scheduled_reports.js`) and expiry digests (`lib/messaging/reminder_jobs.js`) push some information out.
- The topbar bell reads `public.flow_notifications`, which Property never writes (`components/internal/topbar/dialogue/notifications_dropdown.jsx:25-40`).

**How to build**
- *Data model* (migration `signals`):
  - **`property.signals`:**
    - identity: `id`, `project_id`, `detector_key`, `dedupe_key` (unique per project)
    - classification: `category` (`risk` | `trend` | `watch` | `opportunity`); `area` (`collections` | `leasing` | `maintenance` | `accounting` | `compliance` | `automation`); `audience_roles text[]`
    - content: `title`, `why`, `record_refs jsonb`, `suggested_actions jsonb` (`[{ type: 'playbook' | 'workflow' | 'wizard' | 'report', key, label }]`)
    - scoring: `impact_amount`, `impact_units`, `score`, `confidence` (`certain` for rules; 0–1 once AI arrives), `completeness` (0–1), `completeness_note`
    - lifecycle: `status` (`open` | `acknowledged` | `actioned` | `resolved` | `expired`), `first_seen_at`, `last_seen_at`, `resolved_at`
  - **`property.briefings`:** `project_id`, `user_id`, `role_key`, `date`, `summary jsonb` (ids of new, worse and resolved signals), `sent_at`; one row per user per day.
- *Server logic:*
  - **Detectors.** `lib/signals/detectors/*.js`, each a pure `detect(sources, ctx) → findings[]`. A detector declares its key, area, category, roles, the fields it needs (for the completeness score) and an `impact(finding)` function. Detectors use ORCH-03 metrics.
  - **First 16 detectors:**
    | # | Detector | Category |
    |---|---|---|
    | 1 | Rent delinquency, new or worsening (per tenant; impact = balance) | risk |
    | 2 | Collection rate down against the prior month | trend |
    | 3 | Renewal at risk: lease ends within 60 days, offer sent, no reply for 14+ days | risk |
    | 4 | Lease ends within 90 days and has no renewal offer | watch |
    | 5 | Below-market rent at renewal (market rent minus lease rent above the policy %) | opportunity |
    | 6 | Unit vacant for more than N days (impact = daily rent × days) | risk |
    | 7 | Unit turn overdue (move-out done, make-ready still open) | watch |
    | 8 | Urgent work order unassigned for 4+ hours, or any work order past due | risk |
    | 9 | Repeat repairs: 3+ in the same unit and category within 90 days | watch |
    | 10 | Vendor COI or licence expiring or expired, with open work | risk |
    | 11 | Bills past due, or waiting for approval for more than N days | risk |
    | 12 | Deposit-return deadline approaching for a moved-out tenant | risk |
    | 13 | Bank account not reconciled for more than 35 days | watch |
    | 14 | Year-to-date budget variance above X% on an expense account | trend |
    | 15 | Application pending for more than 48 hours | opportunity |
    | 16 | An automation failing repeatedly for the same reason | risk |
  - **Score.** `impact_amount × urgency weight × category weight`. Signals that don't involve money get a configured nominal value, and ties go to the oldest. The method is shown on the metric help page.
  - **Completeness.** The share of required inputs found across the records the detector examined, e.g. "3 of 41 leases have no end date and were skipped."
  - **Lifecycle.** A daily `signals` job, registered in `lib/jobs/registry.js` and also runnable on demand:
    - upserts each finding by dedupe key and bumps `last_seen_at`
    - marks a signal `resolved` when the detector stops finding it
    - marks it `expired` after N days unseen
  - **Briefings job.** Runs after `signals`, once per member:
    - maps the member's role (`lib/rbac.js`) to areas
    - builds what changed since yesterday (new, worse, resolved), the top 5 signals by score, and the count of open review items
    - sends in-app through `@geiger/notify/server`, and by email through a new geiger-dash template `property.daily_briefing`
    - honours each member's notify preferences
- *UI:*
  - On the Overview, a "Today" panel replaces `NeedsAttentionCard`. It shows the top signals for my role, change chips (new / worse / resolved) and one-click actions (ORCH-08). The six existing rules become detectors, so nothing is lost.
  - A "Briefing" screen lists every signal, with filters for area, category and property. Each signal's detail shows the why, impact, completeness note, records, suggested actions and an Acknowledge button.
  - Swap the topbar bell for `@geiger/notify/react`'s `NotificationBell` (it reads `notify.inbox`), so Property signals and review assignments appear across the suite.
  - Settings → Notifications gets the briefing email on/off switch, a send time and area choices.
- *Permissions:* signals are filtered by the areas a role can see. Financial signals also need accounting view.

**Acceptance criteria**
- Running `signals` twice on unchanged data creates no duplicates. Fixing the cause resolves the signal on the next run.
- An accountant's briefing shows accounting signals only, and a leasing agent's shows leasing signals only.
- Every signal shows its impact, its why, its completeness and at least one action.
- The bell shows new review assignments and the morning briefing. Briefing emails go out at most once per user per day.

**Depends on / unblocks**
- **Depends on:** ORCH-03, CORE-07, CORE-10, PLAT-01 (role-filtered reads).
- **Unblocks:** ORCH-08, ORCH-09, ORCH-24, ORCH-25, CORE-59 widgets.

---

#### ORCH-07 · Playbook catalog
- **MRI equivalent:** Orchestrator's pre-built agent catalog ("built on real estate best practice"), deployed and then configured to each client's operation, in the categories Analytics, Managing agents, Lease management and Asset modelling. MRI's consultative workflow discovery (H1).
- **Status · priority · effort:** Partial · P2 · L
- **Covers:** A1, A2, A3, A4, H1 · **Refs:** Inventory 9.14–9.22, 9.42

**Geiger today**
- 11 built-in workflow templates (`lib/automations/catalog.js:289-514`). "Use template" copies one into a Draft (`components/internal/screens/automations/workflow_templates.jsx:34-35`). Each template is a single workflow with fixed wording: no setup questions, no versions, and no link back to its template.
- 12 scheduled jobs run fixed domain processes (late fees, recurring charges, autopay, reminders, preventive maintenance, management fees), configured in Fees & Policies.

**How to build**
- **A playbook** is a versioned bundle in `lib/orchestration/playbooks/<key>.js`, registered in `lib/orchestration/playbooks/index.js`. Its fields:
  - `key`, `version`, `area`, `title`, `outcome` (one line) and `description`
  - `prerequisites`, e.g. `'stripe'`, `'sms'` or `'bank_feed'`
  - `questions`: the wizard fields that produce its config
  - `workflows`: a function from config to automation rows
  - `defaultAutonomy`
  - `kpis` (metric keys for ORCH-09) and `signals` (the detector keys it answers)
- *Data model* (migration `playbook_installs`):
  - **`property.playbook_installs`:** `project_id`, `playbook_key`, `version`, `config jsonb`, `status` (`active` | `paused` | `removed`), `automation_ids uuid[]`, `installed_by`, timestamps.
  - Each generated automation carries `metadata.playbook = { key, version, installId, customized }`.
- **Install flow:**
  1. Open a playbook card.
  2. The setup wizard (`components/internal/shared/wizard_dialog.jsx`) asks for thresholds, wording, properties and autonomy.
  3. A preview shows the workflows it will generate.
  4. Install creates them as Active or Draft.
  - "Customize" opens the workflows on the canvas. Editing their steps sets `customized: true`.
- **Upgrades.** A new version shows "Update available" with a list of changes. Updating regenerates the non-customized workflows from the saved config. Customized workflows are left alone, with a notice.
- **Recommendations (H1), in-product instead of consultants.** `recommendPlaybooks(project)` reads ORCH-06 signals and project data. For example: 5 or more delinquent tenants suggests Collections ladder; leases expiring within 90 days with no offers suggests Renewal pipeline. Recommendations appear at the top of the catalog and in the briefing.
- **First catalog: 13 playbooks**, and what each needs:
  | Playbook | Area | What it does | Needs |
  |---|---|---|---|
  | Collections ladder | Collections | Reminder 3 days before rent is due; a due-day notice; a day-1 late notice; the late fee on the policy day; escalation to the review queue on day 10; a demand-letter draft for approval on day 30 | PLAT-13 `post_charge`, `branch`, `request_approval` |
  | Payment-plan follow-up | Collections | Installment reminders; a missed installment goes to review | PLAT-13 `create_task`, `branch` |
  | Autopay failure recovery | Collections | A failed autopay sends the resident a pay link, then a reminder, then a staff review item | New trigger `autopay.failed` from Stripe events |
  | Renewal pipeline | Leases | Day -120: proposed rent, checked against rent caps; day -90: offer, sent after approval; days -60 and -45: nudges; no answer raises a renewal-at-risk signal | `request_approval`, `branch`; LEAS-18; HOUS-07–11 caps |
  | Application to move-in | Leases | Approved application → lease draft → deposit request → move-in scheduled → welcome email | `create_task`; existing steps |
  | Move-out and deposit return | Leases | Notice → move-out inspection → deposit-disposition draft before the deadline → approval → refund | `request_approval`; CORE-04 |
  | Vacancy turn | Leases / Maintenance | Move-out → make-ready work orders → listing published when they're complete | `create_work_order`; LEAS listing items |
  | Maintenance intake and routing | Maintenance | Category and priority rules (emergency keywords set Urgent and page on-call); vendor chosen by trade and property; acknowledgement to the resident | ORCH-01; `assign`, `branch`; LEAS-49 |
  | Work-order SLA watchdog | Maintenance | Unassigned or overdue work orders escalate to review, then nudge the vendor | PLAT-13 step 8 triggers |
  | Vendor compliance chase | Compliance | An expiring COI or licence sends a request to the vendor; an expired one blocks new assignments and goes to review | `assign` guard; existing reminders |
  | Month-end close checklist | Accounting | Readiness checks (unreconciled banks, unposted recurring charges, pending bills, unposted deposits, trust shortfalls) raise one review item per blocker; the period closes when approved | CORE-40, CORE-41, CORE-50 |
  | Owner statements and payouts | Managing agents | Prepare statements → approval → send → payout run | CORE-54, CORE-51 (payments-provider decision) |
  | Weekly owner and portfolio digest | Analytics | A weekly KPI email per owner, from the metrics layer | ORCH-03; scheduled reports |
- *UI:* in the Automations group, "Playbooks" replaces "Workflow Templates". The plain templates stay available in a "Single workflows" tab. Cards are grouped by area and show the outcome line, prerequisite status and install state, plus KPIs once installed (ORCH-09).

**Acceptance criteria**
- Installing Collections ladder with a $50 fee on day 5 creates workflows that carry exactly those values. Uninstalling pauses them and keeps their run history.
- A playbook with missing prerequisites says what to set up, and links there.
- A version bump updates non-customized installs and leaves customized ones alone, with a notice.
- A recommendation appears only while its data condition holds.

**Depends on / unblocks**
- **Depends on:** PLAT-13, ORCH-05, ORCH-01, ORCH-03, ORCH-06, plus each playbook's own needs in the table above.
- **Unblocks:** ORCH-09, and ORCH-25 (agent versions of these playbooks).

---

#### ORCH-08 · Insight-to-action handoff and guided cases
- **MRI equivalent:** "Intelligence finds, Orchestrator does"; Guided Completion (works through a case step by step, shows full context, lets the user ask and refine, and leaves the decision with the person).
- **Status · priority · effort:** Partial · P2 · M
- **Covers:** F5, C2, C3 (refine) · **Refs:** Inventory 7.26 · PLAT-13 step 8, PLAT-18, PLAT-07

**Geiger today**
- 75 multi-step action wizards on record screens, declared as `config.actions[].wizard` (for example Activate lease, Offer renewal and Record notice to vacate in `components/internal/screens/leasing/lease_actions.jsx`).
- They can only be reached from the record itself. Needs Attention only navigates to a tab.
- There is no manual "run this workflow on these records" trigger and no dry run.

**How to build**
- **Launcher.** `lib/orchestration/launch.js` takes a signal or review item plus the suggested action the user chose:
  - `playbook` or `workflow`: creates runs with the `manual` trigger (PLAT-13 step 8) for the selected records, under that workflow's autonomy.
  - `wizard`: opens the record's wizard pre-filled from the signal (for example, Offer renewal with detector 5's proposed rent).
  - `report`: opens the report filtered to the records.
- **Preview (dry run).** `runner.simulate(automation, records)` evaluates conditions and resolves step inputs without side effects. It returns the plan, e.g. "Email 7 tenants (template 'Late notice'), post 7 late fees totalling $350, raise 1 item for Sam Okafor (no email)." Before confirming, the user can untick records and edit the message text for this batch. This is the "refine before acting" step.
- **Guided case sheet** (`components/internal/screens/orchestration/case_sheet.jsx`) opens from a review item or a signal. It shows:
  - the why (ORCH-02 or ORCH-06)
  - a context summary from the PLAT-18 `lib/context/*` builders: balance, lease terms, recent messages, open work orders
  - a checklist built from the playbook or the reason's `fixes`, where each step launches a wizard or an action
  - When the checklist is complete, the result is written to the review item's resolution and the record's activity.
- **Entry points:** the Overview "Today" panel, the Briefing screen, the review queue detail, and list screens (bulk "Run workflow…" through PLAT-07 selection).

**Acceptance criteria**
- From a "7 tenants delinquent" signal, a manager previews the collections workflow, unticks one tenant and runs it. 6 runs start, the 7th tenant is untouched, and the signal moves to `actioned`.
- A preview writes no rows (row counts are identical before and after).
- From a renewal-at-risk item, the case sheet opens Offer renewal pre-filled, and submitting it resolves the item.

**Depends on / unblocks**
- **Depends on:** ORCH-04, ORCH-06, PLAT-13 step 8, PLAT-18 context builders, PLAT-07.
- **Unblocks:** ORCH-21 (answers launch the same actions).

---

#### ORCH-09 · Impact dashboard
- **MRI equivalent:** the value dashboard: continuous ROI tracking per agent (workflows run, time saved, outcomes).
- **Status · priority · effort:** Partial · P2 · M
- **Covers:** E1 · **Refs:** Inventory 9.22

**Geiger today**
- Run History shows four tiles for all workflows combined: total runs, success rate, failed and in progress (`components/internal/screens/automations/run_history.jsx:192-203`). Nothing measures time saved or outcomes.

**How to build**
- **Time saved (estimated).** Baseline minutes per step type live in `lib/orchestration/value.js`, for example `send_email` 4, `notify` 2, `create_work_order` 6, `update_status` 1, `post_charge` 5, `assign` 2. Customers can edit them in Settings → Automations ("Your team's minutes per task"). Hours saved is the sum over completed steps, always labelled "estimated".
- **Outcomes** use attribution windows defined by each playbook's `kpis`:
  - Collections: dollars received from a tenant within 14 days after a collections run on that tenant, and the change in delinquency.
  - Renewals: offers sent, renewals accepted, average days before lease end.
  - Maintenance: median time from request to assignment and to completion, before and after install.
  - Reminders: on-time payment rate for reminded tenants against tenants who weren't reminded.
  - Exceptions: items raised and resolved, and the median time to resolve.
- **Before and after.** Compare the 90 days before install with the period since. The page says plainly that there is no control group.
- *Data model* (migration `impact_daily`): `property.impact_daily` with `project_id`, `date`, `playbook_key`, `automation_id`, `metric` and `value`. A nightly job fills it, so the page stays fast and the history outlives run retention.
- *UI:* Automations → "Impact" shows:
  - KPI tiles: hours saved this month, dollars collected after collections runs, exceptions resolved
  - a table per playbook: runs, success, exceptions, hours, outcome
  - a 12-month trend chart, using the suite's chart components
  - CSV export
  - The monthly owner or manager digest includes a summary.

**Acceptance criteria**
- On the demo project, every number reconciles to the underlying runs and the ledger (test).
- Editing minutes-per-task recalculates hours saved.
- Every outcome shows its method in a tooltip.

**Depends on / unblocks**
- **Depends on:** ORCH-02, ORCH-03, ORCH-07, CORE-41.

---

#### ORCH-10 · Rules-based intake from email and the portal
- **MRI equivalent:** JAR's extraction of documents and correspondence into the record, and its routing of maintenance requests. This item is the rules half; the AI half is ORCH-23.
- **Status · priority · effort:** Missing · P3 · M
- **Covers:** B5 (partly, without AI), B7 · **Refs:** Inventory 4.38–4.40 · LEAS-41, CORE-49

**Geiger today**
- Inbound email is a stub with a `reply+<threadId>@` matcher and is not wired (`app/api/messages/inbound/route.js:6-13, 402-476`). LEAS-41 owns wiring it.
- Portal requests are structured forms. Uploads are stored but never read (`lib/portal/files.js:17`).

**How to build**
- Give each project inbound addresses, `maintenance+<project>@` and `bills+<project>@`, on the LEAS-41 inbound route.
- Rules:
  - The sender is matched to a tenant, vendor or owner by email address.
  - Keyword rules, configurable per category with an emergency list, decide what gets created:
    - a maintenance request (`kind = 'request'`, which fires the ORCH-01 trigger)
    - a bill draft with the attachment (CORE-49 bills inbox)
  - Each creates an `intake` review item for confirmation, unless the sender is known and the intake autonomy is `auto`.
  - An unknown sender creates a review item with a "Link to person" fix.
- Attachments go to private storage (PLAT-01g).

**Acceptance criteria**
- An email from a known tenant that says "leak" creates an Urgent request linked to their unit, plus a review item.
- A vendor invoice email creates a bill draft with the PDF attached.
- Nothing posts to the ledger without a person confirming it.

**Depends on / unblocks**
- **Depends on:** LEAS-41, PLAT-01g, ORCH-01, ORCH-04, CORE-49.
- **Unblocks:** ORCH-23.

---

#### ORCH-20 · AI foundation: shared engine, model routing, AI governance
- **MRI equivalent:** model-agnostic routing of each workload to a suitable model under one governance layer; MRI's Responsible AI framework.
- **Status · priority · effort:** Missing · Gated · L
- **Covers:** G2, and D1, D5 and D6 for AI output · **Refs:** Inventory 10.1–10.12 · PLAT-18

**Geiger today**
- Property has no AI code or dependency (Inventory 10.2).
- geiger-comms already ships the engine this item needs:
  - `lib/server/ai.js`: the one helper every AI feature calls. It refuses in a fixed order (no default provider, feature switch off, no consent, over quota, provider failing). It only ever uses the workspace's own provider key, never a platform key.
  - `lib/engine/llm.js` (`buildLanguageModel`, `resolveModel`)
  - `lib/ai/provider_kinds.js`: presets, chat and embedding capabilities, custom base URLs
  - `lib/ai/features.js`: per-feature switches and daily limits
  - usage events and `lib/engine/embeddings.js`
  - All of it is built on AI SDK `ai` 7.0.143, with Anthropic, OpenAI, Google and OpenAI-compatible providers. The spec is `C:\Pro\geiger-comms\docs\specs\2026-10-18-knowledge-base-and-ai-providers-design.md`.

**How to build**
- Extract the comms engine into a shared `@geiger/ai` package, source-shipped like `@geiger/ui` and `@geiger/notify`. Comms becomes its first consumer and Property its second. This is the "future shared suite package" the standing decision refers to.
- **Feature registry.** Property's `lib/ai/features.js` lists `ask`, `draft`, `extract`, `triage`, `briefing`, `agent` and `residentChat`. Each has its own switch, daily limit and model choice: a cheap model for triage and classification, a strong one for drafting and agents. That is the per-workload routing.
- **Governance** (migration `ai_runs`):
  - `property.ai_runs` records `project_id`, `feature`, `provider`, `model`, the user or automation run, the record references, input and output tokens, latency, `prompt_version` and the `outcome` (`accepted` | `edited` | `rejected` | `auto_executed`). Content is stored or only hashed, per a project setting.
  - AI output never executes directly. It becomes a proposed action that must pass ORCH-05's `gate()`, so autonomy, guardrails, review and audit all apply unchanged.
- **Data access** (the PLAT-18 rule): AI reads through the user's JWT or a scoped key, never the service role. Automation-time AI uses a per-project, RLS-scoped service identity, designed together with PLAT-01.
- **Privacy:**
  - Only the masked identifiers already stored are sent (Geiger keeps last-4 digits only).
  - Account-number and SSN-like patterns are stripped before a prompt is sent.
  - A per-project switch decides whether AI may read documents.
- *UI:* Settings → AI, following the comms pattern: provider connection, features on/off, limits, data handling and a usage chart.

**Acceptance criteria**
- With no provider configured, every AI entry point shows a "Connect a provider" state and nothing errors.
- Feature switches and quotas refuse correctly.
- Every AI call writes exactly one `ai_runs` row.
- No AI code path reads with the service role (test).

**Depends on / unblocks**
- **Depends on:** PLAT-01, PLAT-18, ORCH-05, and the AI decision.
- **Unblocks:** ORCH-21–26.

**Open decisions**
- **Who pays for AI:** bring-your-own key (the comms model), a platform key metered per unit, or both.
- **Extract or port:** extract a shared package (recommended), or copy the engine into Property.

---

#### ORCH-21 · Ask Geiger: plain-language questions, answers with sources
- **MRI equivalent:** Ask Agora: plain-language questions with drill-down to records and trace to source, including from inside a finding; the page assistant (X1).
- **Status · priority · effort:** Missing · Gated · L
- **Covers:** F4, C3 (ask), D6, X1

**How to build**
- **Toolset.** Tool calling over read-only tools only, with no free-form SQL. Every tool is bound to the caller's permissions.
  - `run_metric(key, filters)` (ORCH-03)
  - `run_report(key, filters)` (the `lib/reports` definitions)
  - `search_records(query, type)` (the PLAT-05 index)
  - `get_context(type, id)` (the PLAT-18 builders)
  - `list_signals(filters)` and `list_review_items(filters)`
- **Answers cite their sources.** Every number links to its metric's `sourceRecords`, and a "How I got this" fold lists the tool calls.
- **Surfaces:**
  - The "AI Assistant" slot in `components/internal/screens/registry.jsx` becomes the Ask screen.
  - "Ask about this" on signals, review items, reports and records opens Ask with that context loaded.
  - Answers can offer ORCH-08 actions, which still preview and pass the autonomy gate.
- **Evaluation.** A set of 50 questions over the demo seed, each with an expected answer. Ship only at 90% or better exact answers.

**Acceptance criteria**
- "Which Harbor Lofts tenants are more than 30 days late?" returns the same list as the Delinquency report, with each tenant linked.
- A leasing agent who asks for bank balances is refused, according to their role.

**Depends on / unblocks**
- **Depends on:** ORCH-20, ORCH-03, PLAT-05, PLAT-18.

---

#### ORCH-22 · AI drafts for case-specific messages
- **MRI equivalent:** case-specific outbound messages drafted from records (JAR); AI-suggested replies (X2).
- **Status · priority · effort:** Missing · Gated · M
- **Covers:** B6, X2

**How to build**
- **New PLAT-13 step: `ai_draft_message`.**
  - Inputs: a purpose (collections, renewal, maintenance update or custom), a tone, the template as the style and legal anchor, and the record context.
  - Output: a draft subject and body.
- **Autonomy (ORCH-05).** In `suggest` or `approve` mode, the draft goes to the review queue to be edited and sent. `auto` is allowed only for purposes flagged as low-risk, and only after a configurable number of drafts were accepted without edits.
- **Inbox (LEAS-41).** A "Draft reply" button, using the thread as context.
- **Guardrails:**
  - Facts such as amounts and dates are inserted from data through merge fields, never generated.
  - A banned-claims check (legal threats, fair-housing terms) runs before a draft is shown.
- Acceptance and edit rates are recorded in `ai_runs.outcome` and feed ORCH-09.

**Acceptance criteria**
- Across 20 test cases, no draft contains an amount that differs from the ledger.
- In the default mode, nothing is sent without approval.

**Depends on / unblocks**
- **Depends on:** ORCH-20, ORCH-05, PLAT-13, LEAS-41.

---

#### ORCH-23 · Document and email extraction
- **MRI equivalent:** agents that extract, interpret and route emails, maintenance requests and documents into the record; AI invoice processing (bundled in every Property Tree tier).
- **Status · priority · effort:** Missing · Gated · L
- **Covers:** B5

**How to build**
- **Extractors** with structured-output schemas:
  - invoice or receipt → bill draft: vendor match, dates, lines, and a GL suggestion based on the vendor's history
  - insurance certificate → policy record: insurer, policy number, dates, coverage, additional insured
  - lease PDF → lease abstract: parties, dates, rent, deposit, escalations, key clauses (useful for PLAT-03 imports and commercial leases)
  - maintenance email or SMS → request: category, location in the unit, urgency, access
- **Confidence.** Every field carries a confidence score, and low-confidence fields are highlighted on the review form.
- **Review.** Drafts land in the review queue as `intake` items. Auto-accept is only possible above an accuracy threshold measured per extractor, on the project's own confirmed history.
- **Entry points:** the ORCH-10 inbound addresses, upload buttons on Bills, Insurance and Leases, and portal uploads.

**Acceptance criteria**
- On a 30-invoice test set, vendor, total and due date are at least 95% correct.
- Every record created links to its source document.
- Nothing posts to the ledger without confirmation.

**Depends on / unblocks**
- **Depends on:** ORCH-20, ORCH-10, PLAT-01g, CORE-49.

---

#### ORCH-24 · AI triage and intent signals
- **MRI equivalent:** context-aware handling (a hesitant renewal handled differently from a committed one); maintenance triage.
- **Status · priority · effort:** Missing · Gated · M
- **Covers:** B2, F3 (confidence on a probability scale)

**How to build**
- **`triage_maintenance(request)`** returns a category, priority, trade, emergency flag and a suggested vendor based on history. It can also return a self-help tip for the resident, which staff see first.
- **`classify_intent(thread)`** classifies:
  - renewals: committed, hesitant, leaving or unknown
  - collections: promise to pay, dispute, hardship or no response
- **Outputs** are stored as `metadata.ai.<field> = { value, confidence, model, at }`. They become condition fields for PLAT-13 `branch`, and inputs to ORCH-06 (renewal-at-risk uses intent when it is present).
- **Below the confidence threshold,** nothing branches on AI and the rules path runs instead.

**Acceptance criteria**
- On 100 labelled demo threads, intent accuracy is at least 85%.
- No branch ever acts on an output below the threshold.

**Depends on / unblocks**
- **Depends on:** ORCH-20, ORCH-06, PLAT-13 `branch`, LEAS-41.

---

#### ORCH-25 · Briefing narrative and agent steps
- **MRI equivalent:** Intelligence's "what changed, why, what to do" briefings; Orchestrator agents that decide and act within guardrails; the month-end reconciliation agent.
- **Status · priority · effort:** Missing · Gated · L
- **Covers:** F1 (narrative), A1, B1 (agentic execution)

**How to build**
- **Briefing narrative.** A short summary written only from that day's signals and metrics, with every sentence citing a signal. If generation fails, the rules briefing is sent unchanged.
- **The `ai_decide` step.** Given a case and the list of allowed actions from the PLAT-18 action registry (`{ key, inputSchema, permission, idempotent, requiresApproval }`), the model proposes one action and a reason.
  - The proposal passes ORCH-05's `gate()`.
  - The reason is stored and shown (C4).
- **Agent versions of ORCH-07 playbooks:**
  - collections next-best-action
  - a month-end reconciliation assistant: matches bank lines to the ledger (CORE-50) and proposes adjustments for approval
  - a renewal assistant that only makes proposals

**Acceptance criteria**
- An agent can only call registry actions, with valid inputs.
- Every agent decision has a stored reason and passes the autonomy gate.
- When AI is unavailable, the rules version of the playbook runs.

**Depends on / unblocks**
- **Depends on:** ORCH-20, ORCH-22, ORCH-24, PLAT-18, CORE-40, CORE-50.

---

#### ORCH-26 · Resident and prospect chat in the portal
- **MRI equivalent:** Ascend demos (a voice assistant triaging a leak; a chatbot booking a viewing) and Agora Voice (X3).
- **Status · priority · effort:** Missing · Gated · L
- **Covers:** B7, X3 (chat only)

**How to build**
- Reuse geiger-comms' Messenger answers (the `messengerAnswers` feature) and `geiger-comms-widget`, with a Property knowledge base: house rules, FAQs and policies.
- **Resident tools:** report a repair (which creates a request and fires the ORCH-01 trigger), check my balance, get a pay link, book an amenity, ask about my lease dates.
- **Prospect version** on listing pages: answers questions about the listing and books a showing (LEAS-14).
- **Hand-off.** Any conversation can become a LEAS-41 thread.
- **Voice** is not part of this plan (see Part 5).

**Acceptance criteria**
- A resident who types "my sink is leaking" gets a Plumbing request (Urgent if water is spreading) and can follow its status in the portal. Staff see the chat transcript on the request.

**Depends on / unblocks**
- **Depends on:** ORCH-20, ORCH-24, LEAS-41, LEAS-14, PLAT-01 (portal isolation).

---

## Part 5. Not building here
| MRI offering | Why not | Revisit trigger |
|---|---|---|
| Asset-modelling agents (part of A4) | Investment management is a "don't enter" market (README, market scope) | A decision to enter investment management |
| Agora Voice (voice agent) | Needs telephony (LEAS-44), and is costly and risky for the 10–500-unit buyer. Chat comes first (ORCH-26) | LEAS-44 has shipped and customers ask for phone answering |
| Learning across customers ("refined across MRI's client base") | Needs data-sharing consent and scale; privacy risk. PLAT-17 configuration kits share setups in the meantime | 100+ customers and an opt-in benchmark programme |
| Consultant-led workflow discovery | In-product recommendations (ORCH-07) suit a self-serve market | Enterprise deals |
| Hosting or fine-tuning our own models | Bring-your-own provider through ORCH-20 covers model choice | Cost or data-residency demand |
| Deep write-back into third-party systems | Geiger is the system of record. Other systems integrate through PLAT-10 webhooks and the PLAT-11 API | Integration partners ask for it |

## Open decisions for the user
| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | AI timing (Track B) | Keep it deferred under the standing decision, or bring it forward | Build Track A now. Decide on Track B when Wave 3 starts: MRI bundles AI even in Property Tree, and launched Agora Voice on 3 Nov 2026 |
| 2 | Who pays for AI | Bring-your-own provider key (comms model); a platform key metered per unit (needs INTL-01 usage billing); or both | Start with bring-your-own, since it reuses comms and needs no billing work. Add metered usage once INTL-01 supports it |
| 3 | Shared AI package | Extract the comms engine into `@geiger/ai`, or copy it into Property | Extract it |
| 4 | Default autonomy for installed playbooks | — | "Ask first" for money and legal notices; "Run automatically" for reminders and internal notes |
| 5 | UI naming | Plain names (Review Queue, Briefing, Playbooks, Impact) or one branded area | Plain names, to match the suite's naming |
| 6 | Briefing email | On or off by default; send time | On for Owner and Manager, off for other roles; 7:00 local time |
| 7 | Minutes-saved baselines | Geiger defaults, or only figures the customer enters | Geiger defaults, editable and always labelled "estimated" |
| 8 | Retention | — | Skipped-run logs 30 days; resolved signals 13 months; AI prompt content stored only as a hash by default |

## Sources
- [MRI: Agora Intelligence and Agora Orchestrator launch (25 Jun 2026)](https://www.prnewswire.com/news-releases/mri-software-launches-agora-intelligence-and-agora-orchestrator-delivering-ai-powered-recommendations-and-workflow-execution-for-real-estate-302810129.html)
- [MRI: how Agora Orchestrator works (product page)](https://www.mrisoftware.com/ae/mri-agora-orchestrator/)
- [MRI Agora overview](https://www.mrisoftware.com/mri-agora/)
- [JAR adopts MRI Agora Orchestrator (6 Oct 2026)](https://www.prnewswire.co.uk/news-releases/jar-adopts-mri-softwares-agentic-ai-to-streamline-workflows-and-support-resident-service-302899145.html)
- [MRI: AI agent and page assistant in PMX (Agora Actions, Jun 2025)](https://www.mrisoftware.com/news/mri-software-introduces-ai-agent-and-page-assistant-to-transform-property-management-operations/)
- [MRI: Ask Agora AI companion (20 Oct 2025)](https://www.prnewswire.com/news-releases/mri-software-unveils-advanced-ai-companion-to-transform-real-estate-workflows-302588719.html)
- [Commercial Observer: MRI expands its data platform (Jun 2026)](https://commercialobserver.com/2026/06/mri-software-data-platform-ai-expansion/)
- [REdirect Consulting: MRI Ascend EMEA 2026 recap](https://www.redirectconsulting.com/blog/mri-emea-ascend-2026-how-agora-ai-and-agentic-automation-are-transforming-property-management)
- [REdirect Consulting: MRI Ascend APAC 2026 recap](https://www.redirectconsulting.com/blog/mri-ascend-apac-2026-mri-agora-ai-agentic-automation-and-the-future-of-pmx)
- Agora Voice (3 Nov 2026): as cited in [PMX Residential vs Geiger gaps](<../reports/PMX Residential vs Geiger gaps.md>), section 10
