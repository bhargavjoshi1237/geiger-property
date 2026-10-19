export const meta = {
  name: 'us-landlord-tenant-resources',
  description: 'Research + independently verify official landlord-tenant (rent, repairs, deposits, eviction) resources for 50 states + DC, federal, major cities, and pullable data sources',
  phases: [
    { title: 'National', detail: 'federal agencies, data sources/APIs, major-city rent boards, peer/legal framing' },
    { title: 'States', detail: '13 batches of ~4 jurisdictions researching official resources' },
    { title: 'Verify', detail: 'independent link-by-link audit of every URL' },
    { title: 'Gap fill', detail: 'targeted search for core categories still missing after verification' },
  ],
}

const TODAY = args.today
const STATES = args.states
const BATCH = 4
const batches = []
for (let i = 0; i < STATES.length; i += BATCH) batches.push(STATES.slice(i, i + BATCH))
const codes = (b) => b.map((s) => s.code).join('-')

const CONTEXT = `Context: we are building "Geiger Property", a US property-management app (manager workspace + resident/owner/vendor portals; every property stores its US state). We want an in-app "Guidelines & Resources" section that PINS users to ORIGINAL official resources about landlord-tenant law: rent violations (illegal increases, rent control/stabilization, late fees), repairs and habitability (repair-and-deduct, rent withholding/escrow, code enforcement), security deposits, landlord entry, eviction process, retaliation, fair housing, lead/mold/pests. It is NOT legal advice: the app only shows a title, publisher, one neutral sentence describing the resource, and a link to the original source. Prefer official, non-commercial sources: state legislatures (statute text), attorneys general / consumer-protection offices, state housing or community-affairs agencies, state judiciary self-help centers, state civil-rights / fair-housing agencies, federal agencies (HUD, CFPB, EPA, FTC, DOJ), LSC-funded legal aid and the LawHelp.org network, public universities / extension services. Do NOT list commercial sources (law-firm blogs, Nolo, Avail, TurboTenant, iPropertyManagement, rental-listing sites) as resources.`

const TOOLS = `Tools: use WebSearch (mode "standard"; switch to "extended" for hard-to-find, very recent or niche facts) and WebFetch to open pages. If either tool is listed as deferred, load it first with ToolSearch (query "select:WebSearch,WebFetch"). Today is ${TODAY}. Government sites move pages often (hud.gov was redesigned in 2025), so never trust a URL from memory or guess a URL pattern - search, then open it.`

const CATEGORY = ['statute', 'official_guide', 'hud_state_page', 'court_self_help', 'legal_aid_directory', 'fair_housing', 'rental_assistance', 'rent_regulation', 'code_enforcement', 'health_safety', 'complaint_filing', 'data_source', 'other']
const TOPICS = ['general', 'repairs_habitability', 'rent_increase', 'rent_control', 'late_fees', 'security_deposit', 'entry_privacy', 'eviction', 'retaliation', 'lease_termination', 'fair_housing', 'lead_mold_pests', 'utilities', 'rental_assistance', 'accessibility', 'domestic_violence', 'military', 'tenant_screening']
const PUBLISHER_TYPE = ['state_legislature', 'state_attorney_general', 'state_agency', 'state_court', 'federal_agency', 'local_government', 'legal_aid', 'university', 'bar_association', 'nonprofit', 'other']

const CATEGORY_DEFS = `statute = official statute text (deep link to chapter or section); official_guide = government/bar/court-published tenant or landlord handbook; hud_state_page = HUD's per-state tenant-rights page; court_self_help = judiciary self-help/forms for landlord-tenant cases; legal_aid_directory = statewide legal-aid / LawHelp site; fair_housing = state or federal housing-discrimination agency; rental_assistance = renter/emergency rental assistance program; rent_regulation = rent control/stabilization/rent-cap agency, board or statute; code_enforcement = housing-code / repair-complaint office; health_safety = lead, mold, pests, carbon monoxide etc.; complaint_filing = a page where a tenant or landlord files a complaint (AG consumer complaint, agency complaint); data_source = dataset/API; other = anything else official and relevant.`

const RESOURCE = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    url: { type: 'string' },
    publisher: { type: 'string' },
    publisherType: { type: 'string', enum: PUBLISHER_TYPE },
    category: { type: 'string', enum: CATEGORY },
    topics: { type: 'array', items: { type: 'string', enum: TOPICS } },
    audience: { type: 'string', enum: ['tenant', 'landlord', 'both'] },
    format: { type: 'string', enum: ['html', 'pdf', 'other'] },
    description: { type: 'string', description: 'One neutral sentence on what the resource is/covers. No legal advice or interpretation.' },
    citation: { type: 'string', description: 'For statutes: official citation, e.g. "Cal. Civ. Code 1940-1954.06". Empty otherwise.' },
    lastUpdated: { type: 'string', description: 'Revision/updated date shown on the page, else empty' },
    fetched: { type: 'boolean', description: 'true only if you opened this exact URL in this session and confirmed the content' },
    notes: { type: 'string' },
  },
  required: ['title', 'url', 'publisher', 'publisherType', 'category', 'topics', 'audience', 'format', 'description', 'fetched'],
}

const STATE_SCHEMA = {
  type: 'object',
  properties: {
    states: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          name: { type: 'string' },
          primaryLawCitation: { type: 'string', description: 'Name + citation of the main residential landlord-tenant statute' },
          rentRegulation: {
            type: 'object',
            properties: {
              statewideRentCap: { type: 'boolean' },
              localRentControlPreempted: { type: 'string', enum: ['yes', 'no', 'partial', 'unknown'] },
              summary: { type: 'string', description: '1-2 factual sentences on status only (no advice), with the year of any recent change' },
              localJurisdictions: { type: 'array', items: { type: 'string' } },
              sourceUrl: { type: 'string' },
            },
            required: ['statewideRentCap', 'localRentControlPreempted', 'summary', 'sourceUrl'],
          },
          resources: { type: 'array', items: RESOURCE },
          gaps: { type: 'array', items: { type: 'string' } },
        },
        required: ['code', 'name', 'primaryLawCitation', 'rentRegulation', 'resources', 'gaps'],
      },
    },
  },
  required: ['states'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          url: { type: 'string' },
          status: { type: 'string', enum: ['ok', 'redirected_ok', 'blocked', 'dead', 'wrong_content', 'outdated'] },
          finalUrl: { type: 'string' },
          replacementUrl: { type: 'string' },
          replacementTitle: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['url', 'status'],
      },
    },
    rentRegulationCorrections: {
      type: 'array',
      items: { type: 'object', properties: { code: { type: 'string' }, correction: { type: 'string' }, sourceUrl: { type: 'string' } }, required: ['code', 'correction'] },
    },
    dataSourceCorrections: {
      type: 'array',
      items: { type: 'object', properties: { name: { type: 'string' }, correction: { type: 'string' } }, required: ['name', 'correction'] },
    },
  },
  required: ['results'],
}

const GAP_SCHEMA = {
  type: 'object',
  properties: {
    states: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          resources: { type: 'array', items: RESOURCE },
          stillMissing: { type: 'array', items: { type: 'string' }, description: 'item + one-line reason it does not exist or could not be sourced officially' },
        },
        required: ['code', 'resources', 'stillMissing'],
      },
    },
  },
  required: ['states'],
}

const NATIONAL_SCHEMA = {
  type: 'object',
  properties: {
    resources: {
      type: 'array',
      items: {
        ...RESOURCE,
        properties: {
          ...RESOURCE.properties,
          scope: { type: 'string', enum: ['federal', 'national', 'state', 'county', 'city'] },
          jurisdiction: { type: 'string', description: 'e.g. "Federal", "New York, NY", "Montgomery County, MD"' },
          stateCode: { type: 'string' },
        },
      },
    },
    dataSources: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          url: { type: 'string' },
          provider: { type: 'string' },
          accessMethod: { type: 'string', enum: ['api', 'bulk_download', 'rss_feed', 'structured_html', 'html_only', 'pdf', 'none'] },
          auth: { type: 'string' },
          license: { type: 'string', description: 'Terms/licence as stated, incl. whether we may store, display, deep-link, attribution' },
          updateFrequency: { type: 'string' },
          whatItGives: { type: 'string' },
          usefulness: { type: 'string', enum: ['high', 'medium', 'low'] },
          fetched: { type: 'boolean' },
          notes: { type: 'string' },
        },
        required: ['name', 'url', 'provider', 'accessMethod', 'auth', 'license', 'whatItGives', 'usefulness', 'fetched'],
      },
    },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['resources', 'dataSources', 'notes'],
}

const BENCH_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string', enum: ['peer_product', 'legal_framing', 'link_maintenance', 'ux'] },
          point: { type: 'string' },
          sourceTitle: { type: 'string' },
          sourceUrl: { type: 'string' },
        },
        required: ['area', 'point', 'sourceUrl'],
      },
    },
    disclaimerExamples: {
      type: 'array',
      items: { type: 'object', properties: { product: { type: 'string' }, text: { type: 'string' }, sourceUrl: { type: 'string' } }, required: ['product', 'text', 'sourceUrl'] },
    },
  },
  required: ['findings', 'disclaimerExamples'],
}

function normUrl(u) { return String(u || '').trim().replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase() }
function joinNotes(...parts) { return parts.filter(Boolean).join(' | ') }
function dedupe(list) {
  const seen = new Set()
  return list.filter((r) => { const k = normUrl(r.url); if (!k || seen.has(k)) return false; seen.add(k); return true })
}

function applyVerdicts(resources, verdicts, onDrop) {
  const kept = []
  for (const r of resources || []) {
    const v = verdicts.get(normUrl(r.url))
    if (!v) { kept.push({ ...r, verification: r.fetched ? 'self_only' : 'unchecked' }); continue }
    if (v.status === 'ok') kept.push({ ...r, verification: 'ok' })
    else if (v.status === 'redirected_ok') kept.push({ ...r, url: v.finalUrl || r.url, verification: 'ok', notes: joinNotes(r.notes, v.finalUrl ? `redirected from ${r.url}` : '') })
    else if (v.status === 'blocked') kept.push({ ...r, verification: 'blocked', notes: joinNotes(r.notes, v.note) })
    else if (v.replacementUrl) kept.push({ ...r, url: v.replacementUrl, title: v.replacementTitle || r.title, verification: 'replaced', notes: joinNotes(`replaced (${v.status}) ${r.url}`, v.note) })
    else onDrop({ url: r.url, title: r.title, status: v.status, note: v.note || '' })
  }
  return dedupe(kept)
}

const CORE_CATS = ['statute', 'official_guide', 'court_self_help', 'legal_aid_directory', 'fair_housing']
const CORE_TOPICS = ['repairs_habitability', 'security_deposit', 'eviction', 'rent_increase']
function gapsFor(s) {
  const usable = (s.resources || []).filter((r) => r.verification !== 'unchecked')
  const cats = new Set(usable.map((r) => r.category))
  const topics = new Set(usable.flatMap((r) => r.topics || []))
  return [
    ...CORE_CATS.filter((c) => !cats.has(c)).map((c) => `category: ${c}`),
    ...CORE_TOPICS.filter((t) => !topics.has(t)).map((t) => `topic: ${t}`),
  ]
}

function mergeStates(research, verify) {
  const verdicts = new Map((verify?.results || []).map((v) => [normUrl(v.url), v]))
  const dropped = []
  const states = (research?.states || []).map((s) => {
    const resources = applyVerdicts(s.resources, verdicts, (d) => dropped.push({ code: s.code, ...d }))
    const rentRegulationCorrections = (verify?.rentRegulationCorrections || []).filter((c) => c.code === s.code)
    return { ...s, resources, rentRegulationCorrections }
  })
  return { states, dropped }
}

function statePrompt(batch) {
  return `${CONTEXT}

${TOOLS}

Your jurisdictions: ${batch.map((s) => `${s.name} (${s.code})`).join(', ')}.

For EACH jurisdiction, find and open (WebFetch) the best official resource in each category below. Aim for roughly 8-15 resources per jurisdiction; correctness beats volume.
1. statute - the residential landlord-tenant act/chapter on the OFFICIAL state legislature (or official code publisher) website, deep-linked to the chapter, with citation. ALSO separate deep links to the specific sections on: (a) landlord duty to repair / habitability and tenant remedies (repair-and-deduct, rent withholding or escrow), (b) security deposits, (c) eviction / unlawful detainer / forcible entry and detainer / summary process procedure, (d) rent increase notice, late fees, and retaliation where those exist as separate sections. If the official site cannot deep-link, use Justia or Cornell LII only as a fallback and say so in notes.
2. official_guide - the state's official tenant/landlord handbook or guide (attorney general, consumer affairs, housing/community-affairs agency, state bar, or a court-published guide). Give its revision date. Include landlord-oriented official guides when they exist.
3. hud_state_page - HUD's tenant-rights page for this state (HUD publishes per-state "Tenant Rights, Laws and Protections" pages; find the CURRENT URL by searching).
4. court_self_help - the state judiciary's self-help page(s) for landlord-tenant / eviction cases (process, forms).
5. legal_aid_directory - the statewide LawHelp.org-network site or statewide legal-aid finder; prefer its housing/landlord-tenant section.
6. fair_housing - the state civil-rights / human-rights / fair-housing agency page for housing-discrimination complaints.
7. complaint_filing - attorney-general / consumer-protection complaint page that accepts landlord-tenant complaints, if one exists.
8. rental_assistance - state housing-finance or human-services agency page for renter / emergency rental assistance, only if currently live.
9. rent_regulation - official source for rent-control status: a statewide cap statute or agency page, OR the preemption statute that bars local rent control; plus official rent-board pages of rent-controlled localities in the state, if any.
10. health_safety / code_enforcement - state-agency pages on lead disclosure, mold, bed bugs, carbon monoxide, or housing-code enforcement that tenants/landlords are pointed to, if they exist.

Rules:
- Every URL must be one you actually opened in this session; set fetched=true only then. Never invent or pattern-guess a URL. If a page refuses automated fetching but search results confirm it exists at that URL, include it with fetched=false and say so in notes.
- Prefer HTML over PDF when both exist; include a PDF handbook when it is the canonical version.
- description: one neutral sentence on what the page is (e.g. "Attorney General's handbook on tenant and landlord rights and duties, including repairs and deposits."). No advice, no interpretation.
- audience: tenant / landlord / both, based on who the page addresses.
- Make sure each jurisdiction has resources tagged with topics repairs_habitability, security_deposit, eviction and rent_increase (statute section deep links count).
- rentRegulation: factual status as of ${TODAY} with an official source URL; note any 2024-2026 changes you find (new statewide caps, new local ordinances, preemption changes).
- gaps: any category you could not source officially, with a short reason.
Return all jurisdictions.`
}

function verifyPrompt(items, includeRent) {
  const compact = items.map((s) => ({
    code: s.code,
    ...(includeRent ? { rentRegulation: s.rentRegulation } : {}),
    resources: (s.resources || []).map((r) => ({ url: r.url, title: r.title, publisher: r.publisher, category: r.category, topics: r.topics, description: r.description })),
  }))
  return `You are an independent link auditor. Another researcher compiled official landlord-tenant resources that will ship as links inside a property-management product. Your job is to catch broken, wrong, outdated, mislabeled, or non-official links. Be skeptical: default to flagging anything you cannot confirm.

${TOOLS}

For EVERY resource below, open the exact URL with WebFetch and assign a status:
- ok: loads and the content matches the title/description/category/topics/jurisdiction.
- redirected_ok: lands on a different URL that still has the right content (give finalUrl).
- blocked: the site refuses automated fetching (403, captcha, bot wall). Then use WebSearch to confirm the page exists at that URL and put the evidence in note.
- dead: 404/410, error page, empty page, or redirect to a generic homepage.
- wrong_content: loads but is not what is claimed (wrong state, wrong topic, a different publisher, a commercial site, a repealed statute, etc.).
- outdated: superseded (an older handbook edition when a newer official one exists, a closed COVID-era program, a repealed section).
For dead / wrong_content / outdated, search for the correct OFFICIAL replacement and give replacementUrl + replacementTitle ONLY if you opened it and confirmed it.
Always echo the url exactly as given, and the code field.
${includeRent ? `\nAlso check each jurisdiction's rentRegulation summary against its sourceUrl and current law as of ${TODAY}; report any factual error in rentRegulationCorrections (leave empty if accurate).\n` : ''}
Resources (JSON):
${JSON.stringify(compact)}`
}

function gapPrompt(needs) {
  return `${CONTEXT}

${TOOLS}

An earlier research + independent verification pass left these jurisdictions with missing items. For each, find OFFICIAL sources for exactly the missing items and open each one (fetched=true only if opened). "category: X" means no verified resource of that category exists yet; "topic: X" means no verified resource covers that topic - the best fix is usually a deep link to the specific statute section on the official legislature site, or the relevant chapter of the state's official guide. If the state genuinely has no such law or resource (e.g. no statute regulating rent increases, no state fair-housing agency, no statewide self-help page), list it in stillMissing with a one-line reason instead of padding with weak or commercial sources. Do not repeat URLs already listed in "have".

Category definitions: ${CATEGORY_DEFS}

${JSON.stringify(needs)}`
}

const FEDERAL_PROMPT = `${CONTEXT}

${TOOLS}

Task: catalogue FEDERAL and NATIONAL official resources relevant to rent violations, repairs/habitability, deposits, eviction, fair housing, and landlord obligations, for both tenants and landlords. Open every URL. Cover at least:
- HUD: renter/tenant-rights hub; the per-state "Tenant Rights, Laws and Protections" pages - determine the CURRENT URL pattern after the hud.gov redesign, confirm it on at least CA, TX, NY, FL, DC and WY, include those six as resources (scope "state", stateCode set) and state the pattern in notes; filing a housing-discrimination complaint (FHEO); complaints about HUD-assisted / multifamily housing (Multifamily Housing Clearinghouse / Resident Rights); Housing Choice Voucher info for landlords and tenants; HUD-approved housing-counseling agency finder; VAWA protections in HUD housing; HUD lead-safe housing rule; HUD NSPIRE inspection standards.
- CFPB renter resources (renting, tenant screening/background reports, eviction help).
- FTC: "Using consumer reports: what landlords need to know" (FCRA) and tenant-screening guidance for renters.
- EPA: lead-based-paint disclosure rule for rentals (landlord + tenant pages), Renovation Repair and Painting rule, mold, bed bugs, radon if relevant to rentals.
- DOJ Civil Rights: fair housing; Servicemembers Civil Relief Act lease termination; ADA/Section 504 as relevant.
- Legal Services Corporation "Find Legal Aid"; LawHelp.org national directory; 211.org; USA.gov renters' help; Consumer Advice pages.
- CARES Act section 4024 30-day notice-to-vacate for covered properties (official source).
- Military OneSource / Armed Forces legal assistance locator for servicemember tenants.
Use scope "federal" (or "national" for non-government national directories). In notes, list any federal resource you expected but found retired, moved, or changed in 2025-2026, and the HUD per-state URL pattern.`

const DATA_PROMPT = `${CONTEXT}

${TOOLS}

Task: identify sources we can PULL programmatically (APIs, bulk datasets, RSS/Atom feeds, structured directories) to populate and keep the resources section fresh, plus anything that helps us detect law changes per state. For each, open its docs/terms and report access method, auth/key, licence/terms (may we store, display, deep-link? attribution?), update frequency, what it gives us, and usefulness for this feature. Evaluate at least:
- LawAtlas / Center for Public Health Law Research (Temple) eviction and landlord-tenant law datasets; Eviction Lab (Princeton) data and any policy scorecard; NLIHC and Local Housing Solutions tenant-protection databases; Urban Institute; National Conference of State Legislatures (NCSL) housing/landlord-tenant legislation databases.
- Legislative-tracking APIs: Open States / Plural Policy API, LegiScan API, Congress.gov API, Federal Register API, GovInfo API - for detecting changes to landlord-tenant statutes.
- Statute-text sources: official state legislature sites (any with APIs or bulk XML/JSON?), Cornell LII, Justia - terms for deep-linking vs copying text; note Georgia v. Public.Resource.Org (2020) on copyright in official codes.
- HUD User APIs (Fair Market Rents, Income Limits) and Census ACS API - relevance only.
- Directory sources: LSC "Find Legal Aid" / LSC grantee data, LawHelp.org network, 211 (National 211 data/API), findhelp.org - whether there is an API and its terms.
- Whether any official open dataset of state attorney-general tenant guides or HUD state pages exists (say so plainly if none).
- Legality/etiquette of linking to and periodically fetching government pages (robots.txt, terms of use), and whether major sources allow iframe embedding (spot-check X-Frame-Options / CSP frame-ancestors on hud.gov, a state AG site, a LawHelp site, a state legislature site).
Return dataSources, plus any directly useful resources (category data_source), plus notes with the overall recommendation.`

function cityPrompt(list) {
  return `${CONTEXT}

${TOOLS}

Task: catalogue OFFICIAL local-government resources for these cities/counties: ${list.join('; ')}.
For each jurisdiction, open and list: (1) rent control / rent stabilization board or program page, if it has one (category rent_regulation); (2) local tenant-protection / tenant-rights office or tenant bill of rights (category official_guide or other); (3) the housing-code enforcement / repair or habitability complaint page - how a tenant reports a repair violation, e.g. 311 or code enforcement (category code_enforcement); (4) local rental registration / rental licensing requirement page if one exists (category other, topics general). Use scope "city" or "county", set jurisdiction to "City, ST" or "County Name, ST", and set stateCode. Skip a category the jurisdiction does not have and record that in notes (e.g. "Houston, TX: no rent control - Texas preempts").`
}

const CITIES = [
  ['Los Angeles, CA', 'Los Angeles County, CA (unincorporated areas)', 'San Francisco, CA', 'Oakland, CA', 'Berkeley, CA', 'San Jose, CA', 'San Diego, CA', 'Santa Monica, CA', 'Sacramento, CA', 'Seattle, WA', 'Portland, OR'],
  ['Denver, CO', 'Phoenix, AZ', 'Las Vegas / Clark County, NV', 'Houston, TX', 'Dallas, TX', 'Austin, TX', 'San Antonio, TX', 'Minneapolis, MN', 'St. Paul, MN', 'Chicago, IL', 'Cook County, IL'],
  ['New York City, NY', 'New York State Homes and Community Renewal (rent stabilization, statewide agency)', 'Boston, MA', 'Cambridge, MA', 'Philadelphia, PA', 'Pittsburgh, PA', 'Washington, DC', 'Baltimore, MD', 'Montgomery County, MD', 'Takoma Park, MD', 'Newark, NJ', 'Jersey City, NJ'],
  ['Hoboken, NJ', 'Atlanta, GA', 'Miami-Dade County, FL', 'Orlando, FL', 'Charlotte, NC', 'Nashville, TN', 'Detroit, MI', 'Columbus, OH', 'Cleveland, OH', 'Kansas City, MO', 'New Orleans, LA', 'Providence, RI', 'Portland, ME'],
]

const BENCH_PROMPT = `${CONTEXT}

${TOOLS}

Task: research how to present this section responsibly and what peers do. Open every source you cite.
1. peer_product: how property-management / landlord apps present state landlord-tenant law content (Avail, TurboTenant, Zillow Rental Manager, RentRedi, Buildium, AppFolio, DoorLoop, Apartments.com, Rentec Direct, Landlord Studio) - format (state pages, summaries, links to statutes), whether they link to official sources, how they keep it current, and their disclaimer wording (quote it in disclaimerExamples).
2. legal_framing: unauthorized-practice-of-law concerns for software that provides legal information vs. legal advice; what disclaimers typically say; state bar / ABA / court guidance on legal information vs advice; why linking to official resources without interpretation is the lower-risk pattern. Cite sources.
3. link_maintenance: best practice for link rot (periodic link checking, last-verified dates, archive fallbacks such as the Wayback Machine or perma.cc) and update cadence for legal content (legislative sessions, effective dates).
4. ux: patterns used by LawHelp.org sites, state court self-help centers, and HUD for resource directories (filters by topic, audience, plain-language labels, language access) worth mirroring.`

function natVerifyPrompt(res) {
  const compact = {
    resources: (res.resources || []).map((r) => ({ url: r.url, title: r.title, publisher: r.publisher, jurisdiction: r.jurisdiction, category: r.category, description: r.description })),
    dataSources: (res.dataSources || []).map((d) => ({ name: d.name, url: d.url, accessMethod: d.accessMethod, auth: d.auth, license: d.license, whatItGives: d.whatItGives })),
  }
  return `You are an independent link and claims auditor. Another researcher compiled official landlord-tenant resources and data sources for a property-management product. Catch broken, wrong, outdated, mislabeled, or non-official links, and wrong claims about data access or licence terms. Be skeptical: default to flagging anything you cannot confirm.

${TOOLS}

For EVERY resource and data source URL below, open it with WebFetch and add a results entry with status:
- ok / redirected_ok (give finalUrl) / blocked (bot wall - confirm existence via WebSearch, note the evidence) / dead / wrong_content / outdated.
For dead / wrong_content / outdated give replacementUrl + replacementTitle ONLY if you opened and confirmed an official replacement. Echo each url exactly as given (code may be empty).
For each data source, also check its access-method, auth and licence claims against its docs/terms page; report errors in dataSourceCorrections (by name).

JSON:
${JSON.stringify(compact)}`
}

function mergeNational(res, v) {
  const verdicts = new Map((v?.results || []).map((x) => [normUrl(x.url), x]))
  const dropped = []
  const resources = applyVerdicts(res.resources, verdicts, (d) => dropped.push(d))
  const dataSources = (res.dataSources || []).map((ds) => {
    const vd = verdicts.get(normUrl(ds.url))
    const corrections = (v?.dataSourceCorrections || []).filter((c) => c.name === ds.name).map((c) => c.correction)
    return { ...ds, verification: vd ? vd.status : 'unchecked', verificationNote: vd ? vd.note || '' : '', corrections }
  })
  return { resources, dataSources, notes: res.notes || [], dropped }
}

const nationalJobs = [
  { key: 'federal', prompt: FEDERAL_PROMPT },
  { key: 'data-sources', prompt: DATA_PROMPT },
  ...CITIES.map((list, i) => ({ key: `cities-${i + 1}`, prompt: cityPrompt(list) })),
]

const nationalP = pipeline(
  nationalJobs,
  (j) => agent(j.prompt, { label: `national:${j.key}`, phase: 'National', schema: NATIONAL_SCHEMA, agentType: 'general-purpose' }),
  (res, j) => {
    if (!res) return null
    return agent(natVerifyPrompt(res), { label: `verify:${j.key}`, phase: 'Verify', schema: VERIFY_SCHEMA, agentType: 'general-purpose' })
      .then((v) => ({ key: j.key, ...mergeNational(res, v) }))
  },
)

const benchmarkP = agent(BENCH_PROMPT, { label: 'national:benchmark', phase: 'National', schema: BENCH_SCHEMA, agentType: 'general-purpose' })

const statesP = pipeline(
  batches,
  (batch) => agent(statePrompt(batch), { label: `research:${codes(batch)}`, phase: 'States', schema: STATE_SCHEMA, agentType: 'general-purpose' }),
  (res, batch) => {
    if (!res) return null
    return agent(verifyPrompt(res.states || [], true), { label: `verify:${codes(batch)}`, phase: 'Verify', schema: VERIFY_SCHEMA, agentType: 'general-purpose' })
      .then((v) => mergeStates(res, v))
  },
  async (merged, batch) => {
    if (!merged) return null
    const needs = merged.states
      .map((s) => ({ code: s.code, name: s.name, missing: gapsFor(s), have: s.resources.map((r) => r.url) }))
      .filter((x) => x.missing.length)
    if (!needs.length) return { merged, gap: null }
    const gap = await agent(gapPrompt(needs), { label: `gapfill:${codes(batch)}`, phase: 'Gap fill', schema: GAP_SCHEMA, agentType: 'general-purpose' })
    return { merged, gap }
  },
  async (step, batch) => {
    if (!step) return null
    const { merged, gap } = step
    const added = (gap?.states || []).filter((g) => (g.resources || []).length)
    let verdicts = new Map()
    if (added.length) {
      const v = await agent(verifyPrompt(added, false), { label: `verify-gap:${codes(batch)}`, phase: 'Verify', schema: VERIFY_SCHEMA, agentType: 'general-purpose' })
      verdicts = new Map((v?.results || []).map((x) => [normUrl(x.url), x]))
    }
    const byCode = new Map((gap?.states || []).map((g) => [g.code, g]))
    const dropped = [...merged.dropped]
    const states = merged.states.map((s) => {
      const g = byCode.get(s.code)
      const extra = g ? applyVerdicts(g.resources, verdicts, (d) => dropped.push({ code: s.code, ...d })) : []
      const next = { ...s, resources: dedupe([...s.resources, ...extra]) }
      return { ...next, remainingGaps: gapsFor(next), gapNotes: g ? g.stillMissing || [] : [] }
    })
    return { states, dropped }
  },
)

const [national, benchmark, stateBatches] = await Promise.all([nationalP, benchmarkP, statesP])

const allStates = stateBatches.filter(Boolean).flatMap((b) => b.states)
const missingCodes = STATES.map((s) => s.code).filter((c) => !allStates.some((s) => s.code === c))
if (missingCodes.length) log(`No state results for: ${missingCodes.join(', ')}`)

const coverage = allStates.map((s) => ({
  code: s.code,
  total: s.resources.length,
  verified: s.resources.filter((r) => r.verification === 'ok' || r.verification === 'replaced').length,
  blocked: s.resources.filter((r) => r.verification === 'blocked').length,
  remainingGaps: s.remainingGaps || [],
}))
const totalLinks = coverage.reduce((n, c) => n + c.total, 0)
const totalVerified = coverage.reduce((n, c) => n + c.verified, 0)
log(`States: ${allStates.length}/51, ${totalLinks} links (${totalVerified} independently verified). National groups: ${national.filter(Boolean).length}/${nationalJobs.length}.`)

return {
  states: allStates,
  droppedStateLinks: stateBatches.filter(Boolean).flatMap((b) => b.dropped),
  national: national.filter(Boolean),
  benchmark,
  coverage,
  missingCodes,
}
