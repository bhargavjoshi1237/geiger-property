# MRI Agora Orchestrator — Feature & Offering Research

*Researched: 7 Nov 2026 · Purpose: baseline for a feature-to-feature benchmark against another product*

---

## 1. TL;DR

- **What it is:** An agentic workflow-execution layer inside **MRI Agora**, MRI Software's AI platform for real estate. Launched **25 June 2026** alongside **Agora Intelligence**.
- **Core idea:** Intelligence *finds* what needs doing → Orchestrator *does* it, inside client-defined rules, with humans pulled in only for exceptions or judgment calls.
- **Pitch:** "AI without assuming all the risk" — governance, audit trail, explainability and ROI tracking are built in, not bolted on.
- **Moat:** 50+ years of real estate data, workflows and domain context; agents write back directly into MRI's systems of record.
- **Weak spots (publicly):** no pricing, no public agent catalog list, no quantified ROI/case metrics, integration story is MRI-centric.

---

## 2. Context — where Orchestrator sits

| Layer | Product | Role |
|---|---|---|
| Foundation | **MRI Agora** (formerly *Platform X*) | Shared real estate data foundation, semantic layer, governance, security, model orchestration |
| See | **Agora Intelligence** (evolved from *Agora Insights* dashboards) | Daily role-based signals: what changed, why, what to do |
| Ask | **Ask Agora** | Natural-language Q&A over real estate data, with drill-down to source |
| Coordinate | **Agora Workflow** | Connects/coordinates business processes (few public details) |
| **Do** | **Agora Orchestrator** (evolved from *Agora Actions*, 2025) | Deploys and runs agentic workflows; escalates exceptions; logs everything |

**Lineage:** In June 2025 MRI shipped *Agora Actions* — e.g. an agentic month-end reconciliation workflow in Property Management X (PMX), claimed to cut tenant-ledger-to-GL reconciliation to about one-third of the manual time. Orchestrator generalises that into a catalog-driven agent platform.

**Sectors:** commercial, multifamily, residential, social/subsidised housing, local authority, facilities management, corporate occupier. Available globally to MRI clients.

---

## 3. WHY — problems it solves

| Problem in real estate ops | How Orchestrator addresses it |
|---|---|
| High-volume repetitive work (credit control, maintenance triage, document processing, reconciliations) eats staff time | Agents execute those workflows automatically at volume |
| Generic AI tools lack property context → wrong or one-size-fits-all actions | Agents read real estate context (e.g. a renewal showing hesitation is handled differently from one showing commitment) |
| Enterprises fear unaccountable AI (hallucinations, compliance, audit) | Guardrails, configurable approvals, visible reasoning, full audit trail |
| Building AI in-house means building semantic layers, validation rules, governance frameworks and automation logic | MRI ships those as part of the platform |
| Dashboards need humans to interpret them | Intelligence pushes findings; Orchestrator acts on them — no dashboard deciphering |
| AI ROI is usually asserted, not measured | Value dashboard tracks workflows run, time saved and outcomes per agent |
| AI pilots stay as standalone experiments | Embedded directly in the systems, data and workflows clients already run on MRI |
| AI models change fast | Model-agnostic: routes each workload to the most suitable model under one governance layer, so model upgrades don't break workflows |

**Claimed business outcomes:** better occupancy, retention and NOI "from day one" (marketing claim, no published figures).

---

## 4. WHAT — feature inventory

### 4.1 Operating model (4 steps)
1. **Deploy agents** — pick from a pre-built catalog built on real estate best practice, refined across MRI's client base; configure to the client's operation.
2. **Run automatically** — agents execute with real estate context.
3. **Review exceptions** — humans approve, adjust or redirect cases needing judgment.
4. **Govern every action** — every action logged and traceable for review, verification, reporting.

Agent categories shown on product page: **Analytics, Managing agents, Lease management, Asset modelling.**

### 4.2 Autonomous Execution
- Runs workflows within client-defined guidelines
- Context-aware branching (applies the "right response" per situation)
- Surfaces exceptions with a clear explanation
- **Configurable approval controls** — human review where wanted, full automation where not
- **Always writes back to MRI** (system of record stays current)
- Multi-agent workflows: sequences of steps carried out by a combination of AI agents

### 4.3 Guided Completion (human-in-the-loop co-pilot)
For complex cases (judgment, relationship context, non-standard situations):
- Works through the case **step by step** with the team
- Surfaces full context before each decision
- User can ask questions and refine the action before executing
- Reasoning is visible (not a black box)
- Decision stays with the responsible person
- Every decision logged with full approval trail

### 4.4 Review Centre & Value Dashboard
- **Review Centre:** explains in plain language *why* a workflow could not or should not run; resolve / adjust / redirect from the same view
- **Value dashboard:** continuous ROI tracking per agent — workflows, time, outcomes
- **Audit trail:** searchable and exportable, for every agent run (automated or human-approved)

### 4.5 Governance & trust layer (platform-wide)
- Client applies its own rules, language, workflows and risk tolerance
- Role-level permissions (users only see data they're authorised for)
- Every recommendation/action traceable to source MRI data
- MRI Responsible AI framework (secure, private, ethical use)

### 4.6 Upstream: Agora Intelligence (feeds Orchestrator)
- Monitors every workflow across leasing, finance and operations **daily**
- **Role-specific briefings** (finance, leasing, property mgmt, facilities) — what changed, why, next steps
- Findings classified as **risk / trend / watch / opportunity**, ranked by business impact
- Each finding carries a **confidence level** and **data completeness score**
- **Ask Agora** drill-down: plain-language follow-ups, record drill-in, trace to source, without leaving the finding view
- Push model: "the intelligence finds you"

### 4.7 Architecture / platform
- Shared real estate data foundation + semantic layer (2026 Digie Award for data-readiness foundation)
- Model-agnostic, per-workload model selection with consistent governance/security/orchestration
- Embedded in existing MRI products (PMX, residential, Horizon, Qube etc.) rather than a separate tool
- Pairs with **Application Studio** (PMX 10.7) for flexibility (details not public)

---

## 5. HOW — how it eases effort

| Before | After (Orchestrator) | Effort removed |
|---|---|---|
| Staff query dashboards, interpret, decide, then execute manually | Signals pushed → agent executes → human sees only exceptions | Interpretation + execution |
| Every case handled by a person | Routine cases auto-run; complex ones get a guided co-pilot | Volume work |
| Ops team builds rules engines / integrations / governance | Pre-built catalog + built-in governance; configure, don't build | Build + maintenance |
| Unstructured input (emails, maintenance requests, documents) rekeyed by hand | Agents extract, interpret, route and update the system of record | Data entry + triage |
| Audit = digging through emails and logs | Searchable, exportable audit trail per run | Compliance prep |
| "Is the AI worth it?" debates | Per-agent value dashboard | ROI justification |
| Vendor onboarding guesswork | MRI works with the client to identify and validate suitable workflows | Implementation risk |

---

## 6. Documented use cases & proof points

| Use case | Source / status |
|---|---|
| **JAR (James Andrew Residential, London, 6,500+ homes)** — accounting process automation (drafts case-specific outbound messages from records), maintenance-request triage and routing, document/correspondence extraction into the system of record; humans keep sensitive, complex and compliance-critical cases | Customer announcement, Oct 2026 |
| **Debt management** — Intelligence surfaces signal → recommends action → Orchestrator executes | MRI stage demo |
| **Lease renewals** — differentiated handling by tenant intent signal | Product page example |
| **Month-end reconciliation (PMX)** — tenant ledger → GL in ~1/3 the time | Agora Actions, June 2025 (predecessor) |
| **Resident repair (leaking sink)** — AI voice assistant triages severity, creates repair request, updates FM system, routes contractor, issues ticket, texts ETA | MRI Ascend EMEA demo, June 2026 — *not yet GA* |
| **Prospective buyer** — chatbot qualifies buyer and books viewing; Orchestrator runs backend steps | MRI Ascend APAC demo — *demo only* |

---

## 7. Positioning & competitive frame

- **Differentiator claim:** only platform unifying visibility, intelligence and execution on one real estate foundation; value compounds the longer it runs.
- **Strategy:** domain depth > generic AI. Trust/governance is the headline, not raw autonomy.
- **Direct competitors investing in the same space:** Yardi, RealPage, AppFolio (plus point solutions like EliseAI).
- **Commercial model:** enterprise SaaS subscription; no public pricing, free tier or trial.

---

## 8. Gaps & unknowns (useful attack angles for a competing product)

- No public list of catalog agents beyond examples; can't verify breadth
- No published ROI metrics, benchmarks or customer numbers for Orchestrator itself
- Write-back is MRI-centric; third-party integration depth (CRM, email, Teams, accounting outside MRI) not documented
- No custom/no-code agent builder publicly described (configure, not create)
- Voice/chat front-ends shown only in demos, not confirmed GA
- Locked to MRI customers — not usable standalone
- Pricing opacity; implementation appears consultative (slower time-to-value for small operators)
- Third-party coverage mostly from MRI partners/consultancies — limited independent validation

---

## 9. Benchmark template (ready for the comparison step)

**Scoring:** 0 = absent · 1 = partial · 2 = parity · 3 = exceeds
**Weight:** 1 = nice-to-have · 2 = important · 3 = critical
**Gap score** = Weight × (2 − Target score). **"Bump up" trigger:** gap ≥ 4, or any weight-3 feature scored 0.

| ID | Category | MRI Agora Orchestrator capability | Wt | Target score | Gap | Notes / bump-up action |
|---|---|---|---|---|---|---|
| A1 | Agents | Pre-built, domain-specific agent catalog | 3 | | | |
| A2 | Agents | Per-org configuration (rules, thresholds, language) | 3 | | | |
| A3 | Agents | Multi-agent, multi-step workflows | 2 | | | |
| A4 | Agents | Coverage: analytics, lease mgmt, asset modelling, managing agents | 2 | | | |
| B1 | Execution | Autonomous execution within guardrails | 3 | | | |
| B2 | Execution | Context-aware branching per case | 2 | | | |
| B3 | Execution | Exception surfacing with plain-language reason | 3 | | | |
| B4 | Execution | Write-back to system of record | 3 | | | |
| B5 | Execution | Unstructured input → structured (emails, docs, requests) | 2 | | | |
| B6 | Execution | Drafting outbound case-specific messages | 1 | | | |
| B7 | Execution | Voice/chat front-end triggering workflows | 1 | | | |
| C1 | Human-in-loop | Configurable approval controls per workflow | 3 | | | |
| C2 | Human-in-loop | Guided step-by-step completion for complex cases | 2 | | | |
| C3 | Human-in-loop | Ask/refine before acting | 2 | | | |
| C4 | Human-in-loop | Visible reasoning | 2 | | | |
| C5 | Human-in-loop | Review Centre: resolve / adjust / redirect in one view | 2 | | | |
| D1 | Governance | Log of every action (auto + approved) | 3 | | | |
| D2 | Governance | Searchable, exportable audit trail | 3 | | | |
| D3 | Governance | Per-decision approval trail | 2 | | | |
| D4 | Governance | Role-level data permissions | 3 | | | |
| D5 | Governance | Org-defined guardrails / risk tolerance | 3 | | | |
| D6 | Governance | Source traceability for every output | 2 | | | |
| E1 | Value | Per-agent ROI dashboard (runs, time, outcomes) | 2 | | | |
| F1 | Intelligence | Daily role-based briefings (push) | 2 | | | |
| F2 | Intelligence | Findings classified + ranked by impact | 2 | | | |
| F3 | Intelligence | Confidence + data-completeness scores | 1 | | | |
| F4 | Intelligence | Natural-language drill-down (Ask Agora) | 2 | | | |
| F5 | Intelligence | One-click handoff from insight → workflow | 2 | | | |
| G1 | Platform | Domain semantic layer / unified data foundation | 3 | | | |
| G2 | Platform | Model-agnostic, per-workload model routing | 1 | | | |
| G3 | Platform | Embedded in existing apps (no separate tool) | 2 | | | |
| G4 | Platform | Multi-sector coverage | 1 | | | |
| H1 | Commercial | Vendor-assisted workflow discovery & validation | 1 | | | |
| H2 | Commercial | Pricing transparency / trial | 1 | | | |

---

## Sources

- [MRI Software — Launch of Agora Intelligence and Agora Orchestrator (press release, 25 Jun 2026)](https://www.mrisoftware.com/uk/?p=100551)
- [MRI — How MRI Agora Orchestrator works (product page)](https://www.mrisoftware.com/ae/mri-agora-orchestrator/)
- [MRI — MRI Agora platform landing page](https://info.mrisoftware.com/mri-agora)
- [MRI — MRI Agora overview](https://www.mrisoftware.com/mri-agora/)
- [JAR adopts MRI Agora Orchestrator (PR Newswire, 6 Oct 2026)](https://www.prnewswire.co.uk/news-releases/jar-adopts-mri-softwares-agentic-ai-to-streamline-workflows-and-support-resident-service-302899145.html)
- [Commercial Observer — MRI expands data platform under Nihar Malik](https://commercialobserver.com/2026/06/mri-software-data-platform-ai-expansion/)
- [MRI — AI Agent and Page Assistant in PMX (Agora Actions, Jun 2025)](https://www.mrisoftware.com/news/mri-software-introduces-ai-agent-and-page-assistant-to-transform-property-management-operations/)
- [Webull/PR Newswire — PMX reconciliation time claim](https://www.webull.com/news/12921226433225728)
- [Redirect Consulting — MRI Ascend EMEA 2026 recap](https://www.redirectconsulting.com/blog/mri-emea-ascend-2026-how-agora-ai-and-agentic-automation-are-transforming-property-management)
- [Redirect Consulting — MRI Ascend APAC 2026 recap](https://www.redirectconsulting.com/blog/mri-ascend-apac-2026-mri-agora-ai-agentic-automation-and-the-future-of-pmx)
- [BriefGlance — PropTech's new playbook (competitor context)](https://briefglance.com/articles/proptechs-new-playbook-mri-software-unleashes-ai-agents-for-real-estate)
- [Stork.ai — MRI Agora AI profile (pricing model, award)](https://www.stork.ai/en/mri-software-agora-ai)
