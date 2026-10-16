"use client";

import { toast } from "sonner";
import {
  LayoutDashboard,
  SquarePen,
  AlignLeft,
  ImagePlus,
  Share2,
  Clock,
  Megaphone,
  Wallet,
  CalendarRange,
  PawPrint,
  Sparkles,
  Sofa,
  Video,
  Contact,
  BarChart3,
  UserPlus,
  CalendarClock,
  ClipboardList,
  FileText,
  StickyNote,
  Send,
  PauseCircle,
  KeyRound,
  RotateCcw,
  Archive,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { DocumentsSection, ActivitySection, MediaSection } from "@/components/internal/screens/entity/shared_sections";
import { makeFieldsSection, makeNotesSection } from "@/components/internal/screens/entity/sections/factories";
import { listingsLayer } from "@/lib/supabase/listings";
import { listUnits } from "@/lib/supabase/units";
import { propertyOptions, unitOptions, leaseOptions } from "@/lib/supabase/options";
import { agentOptions } from "@/lib/supabase/marketing_options";
import {
  ListingOverviewSection,
  ListingPricingSection,
  SyndicationSection,
  LeadSourcesSection,
  channelState,
  publishChannels,
} from "./sections/listing_sections";
import {
  ListingApplicationsSection,
  ListingProspectsSection,
  ListingShowingsSection,
  makeAsyncFieldsSection,
} from "./sections/common";
import { loadFunnel } from "./flows";
import {
  COMMUNITY_AMENITY_OPTIONS,
  LAUNDRY_OPTIONS,
  LEASE_TERM_OPTIONS,
  LISTING_FEATURE_OPTIONS,
  LISTING_STATUS_MAP,
  PARKING_OPTIONS,
  PET_POLICY_OPTIONS,
  PET_TYPE_OPTIONS,
  SYNDICATION_CHANNELS,
  UTILITY_OPTIONS,
  currency,
  filterOptions,
  formatDate,
  pct,
  selectOptions,
  todayISO,
  toOptions,
} from "./shared";

// Listings — vacancy marketing listings (owns `property.listings`): pricing and
// specials, terms, pets, features, furnished/mid-term, media, internal
// per-channel syndication tracking, lead sources and the related funnel.

// Funnel counts loaded alongside the rows (rowsLoader) for the stats bar.
const funnel = { value: null };

// Unit options for the create dialog, with the unit's rent and layout prefilled.
async function listingUnitOptions() {
  const [options, units] = await Promise.all([unitOptions(), listUnits()]);
  const byId = new Map((units ?? []).map((u) => [u.id, u]));
  return options.map((o) => {
    const u = byId.get(o.value);
    return {
      ...o,
      patch: {
        ...o.patch,
        rent: u?.rent || 0,
        deposit: u?.deposit || 0,
        bedrooms: u?.bedrooms || 0,
        bathrooms: u?.bathrooms || 0,
        sqft: u?.sqft || 0,
      },
    };
  });
}

const isLive = (r) => r.status === "Active";
const notLeased = (r) => !["Leased", "Archived"].includes(r.status);

const DETAILS_FIELDS = [
  { key: "name", label: "Listing title", type: "text", full: true, required: true },
  { key: "headline", label: "Headline", type: "text", full: true, placeholder: "e.g. Sunny corner 2BR with in-unit laundry" },
  { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
  { key: "propertyId", label: "Property", type: "relation", load: propertyOptions, displayKey: "propertyName" },
  { key: "bedrooms", label: "Bedrooms", type: "number", min: 0 },
  { key: "bathrooms", label: "Bathrooms", type: "number", min: 0, step: 0.5 },
  { key: "sqft", label: "Square feet", type: "number", min: 0 },
  { key: "floor", label: "Floor", type: "text", meta: true },
  { key: "propertyType", label: "Property type", type: "select", meta: true, options: toOptions(["Apartment", "House", "Townhome", "Condo", "Duplex", "Room", "Studio"]) },
  { key: "status", label: "Status", type: "select", options: selectOptions(LISTING_STATUS_MAP) },
];

const DESCRIPTION_FIELDS = [
  { key: "description", label: "Description", type: "textarea", rows: 8, placeholder: "Describe the unit — layout, finishes, light, storage…" },
  { key: "highlights", label: "Highlights", type: "textarea", meta: true, placeholder: "One per line — shown as bullet points" },
  { key: "neighborhood", label: "Neighborhood", type: "textarea", meta: true, placeholder: "Transit, schools, parks, shopping nearby" },
  { key: "directions", label: "Directions & parking for tours", type: "textarea", meta: true },
  { key: "fairHousingAck", label: "Fair-housing language reviewed", type: "switch", meta: true, hint: "Confirm the copy avoids discriminatory preferences." },
];

const AVAILABILITY_FIELDS = [
  { key: "availableDate", label: "Available date", type: "date" },
  { key: "moveInFlexible", label: "Flexible move-in", type: "switch", meta: true },
  { key: "leaseTerms", label: "Lease terms offered", type: "multiselect", meta: true, options: LEASE_TERM_OPTIONS },
  { key: "minTermMonths", label: "Minimum term (months)", type: "number", meta: true, min: 0 },
  { key: "maxTermMonths", label: "Maximum term (months)", type: "number", meta: true, min: 0 },
  { key: "maxOccupants", label: "Max occupants", type: "number", meta: true, min: 1 },
  { key: "selfGuidedTours", label: "Self-guided tours allowed", type: "switch", meta: true },
  { key: "virtualTours", label: "Virtual tours offered", type: "switch", meta: true },
  { key: "showingInstructions", label: "Showing instructions", type: "textarea", meta: true, placeholder: "Lockbox location, pets in unit, notice to current resident…" },
];

const hasPets = (i) => (i.metadata?.petPolicy ?? i.petPolicy) && (i.metadata?.petPolicy ?? i.petPolicy) !== "No pets";

const PETS_FIELDS = [
  { key: "petPolicy", label: "Pet policy", type: "select", meta: true, options: PET_POLICY_OPTIONS },
  { key: "petTypes", label: "Allowed pets", type: "multiselect", meta: true, options: PET_TYPE_OPTIONS, showIf: hasPets },
  { key: "maxPets", label: "Max pets", type: "number", meta: true, min: 0, showIf: hasPets },
  { key: "petWeightLimit", label: "Weight limit (lbs)", type: "number", meta: true, min: 0, showIf: hasPets },
  { key: "petDeposit", label: "Pet deposit", type: "currency", meta: true, showIf: hasPets },
  { key: "petRent", label: "Monthly pet rent", type: "currency", meta: true, showIf: hasPets },
  { key: "petFee", label: "One-time pet fee", type: "currency", meta: true, showIf: hasPets },
  { key: "breedRestrictions", label: "Breed restrictions", type: "textarea", meta: true, showIf: hasPets },
  { key: "assistanceAnimalNote", label: "Assistance animals", type: "readonly", format: () => "Assistance animals are not pets — no pet fees apply." },
];

const FEATURES_FIELDS = [
  { key: "features", label: "Unit features", type: "multiselect", meta: true, options: LISTING_FEATURE_OPTIONS },
  { key: "communityAmenities", label: "Community amenities", type: "multiselect", meta: true, options: COMMUNITY_AMENITY_OPTIONS },
  { key: "parking", label: "Parking", type: "select", meta: true, options: PARKING_OPTIONS },
  { key: "parkingFee", label: "Parking fee (monthly)", type: "currency", meta: true },
  { key: "laundry", label: "Laundry", type: "select", meta: true, options: LAUNDRY_OPTIONS },
  { key: "heating", label: "Heating / cooling", type: "text", meta: true, placeholder: "e.g. Central air, radiant heat" },
  { key: "utilitiesIncluded", label: "Utilities included", type: "multiselect", meta: true, options: UTILITY_OPTIONS },
  { key: "otherFeatures", label: "Other features", type: "textarea", meta: true },
];

const midTermOn = (i) => Boolean(i.metadata?.midTerm ?? i.midTerm);
const furnishedOrMid = (i) => Boolean(i.metadata?.furnished ?? i.furnished) || midTermOn(i);

const MIDTERM_FIELDS = [
  { key: "furnished", label: "Furnished", type: "switch", meta: true },
  { key: "midTerm", label: "Mid-term rental (30+ days)", type: "switch", meta: true, hint: "Lists on mid-term channels like Furnished Finder." },
  { key: "minStayDays", label: "Minimum stay (days)", type: "number", meta: true, min: 1, showIf: midTermOn },
  { key: "maxStayMonths", label: "Maximum stay (months)", type: "number", meta: true, min: 1, showIf: midTermOn },
  { key: "furnishedMonthlyRate", label: "Furnished monthly rate", type: "currency", meta: true, showIf: furnishedOrMid },
  { key: "midTermUtilitiesIncluded", label: "Utilities included in rate", type: "switch", meta: true, showIf: furnishedOrMid },
  { key: "utilityCap", label: "Utility cap (monthly)", type: "currency", meta: true, showIf: furnishedOrMid },
  { key: "cleaningFee", label: "Cleaning fee", type: "currency", meta: true, showIf: furnishedOrMid },
  { key: "linensProvided", label: "Linens & kitchenware provided", type: "switch", meta: true, showIf: furnishedOrMid },
  { key: "wifiSpeed", label: "Wi-Fi speed (Mbps)", type: "number", meta: true, showIf: furnishedOrMid },
  { key: "furnishingsInventory", label: "Furnishings inventory", type: "textarea", meta: true, showIf: furnishedOrMid },
];

const TOUR_FIELDS = [
  { key: "virtualTourUrl", label: "3D / virtual tour URL", type: "url", full: true },
  { key: "tourProvider", label: "Tour provider", type: "select", meta: true, options: toOptions(["Matterport", "Zillow 3D Home", "YouTube", "Vimeo", "Other"]) },
  { key: "videoUrl", label: "Video walkthrough URL", type: "url", meta: true },
  { key: "floorPlanUrl", label: "Floor plan URL", type: "url", meta: true },
  { key: "photoCredits", label: "Photo credits / notes", type: "text", meta: true },
];

const CONTACT_FIELDS = [
  { key: "agent", label: "Leasing agent", optionsFrom: "agents", meta: true, placeholder: "Select a team member…" },
  { key: "contactName", label: "Contact name", type: "text" },
  { key: "contactEmail", label: "Contact email", type: "email" },
  { key: "contactPhone", label: "Contact phone", type: "phone" },
  { key: "officeHours", label: "Office hours", type: "text", meta: true, placeholder: "Mon–Fri 9–6, Sat 10–4" },
  { key: "responseGoalHours", label: "Lead response goal (hours)", type: "number", meta: true, min: 0 },
  { key: "bookingLink", label: "Tour booking link", type: "url", meta: true },
  { key: "contactNotes", label: "Notes for leads", type: "textarea", meta: true },
];

// Publish / unpublish write the listing status and every channel's internal state.
async function setPublished(ctx, publish) {
  const { item } = ctx;
  const ok = await ctx.commit({ status: publish ? "Active" : "Paused", syndicated: publish });
  if (!ok) return;
  await ctx.commitMeta({
    syndication: publishChannels(item, publish),
    ...(publish && !item.metadata?.publishedAt ? { publishedAt: new Date().toISOString() } : {}),
    ...(publish ? { lastPublishedAt: new Date().toISOString() } : { unpublishedAt: new Date().toISOString() }),
  });
  ctx.log(publish ? "Published listing (internal — no syndication provider connected)" : "Unpublished listing");
  toast.success(publish ? "Listing published. Channel status updated internally." : "Listing unpublished.");
}

const listingsConfig = {
  key: "listing",
  // Copies start unpublished on every channel.
  prepareDuplicate: (copy, source) => {
    const syndication = publishChannels(source, false);
    return { ...copy, syndication, metadata: { ...(copy.metadata || {}), syndication } };
  },
  singular: "Listing",
  plural: "Listings",
  title: "Listings",
  description:
    "Market your vacant units — pricing and specials, terms, photos and tours, and where each listing is published. Syndication is tracked internally.",
  icon: Megaphone,
  titleField: "name",
  searchFields: ["name", "headline", "unit", "propertyName"],
  data: listingsLayer.data,
  rowsLoader: async () => {
    const [rows, f] = await Promise.all([listingsLayer.list(), loadFunnel()]);
    funnel.value = f;
    return rows;
  },

  statusMap: LISTING_STATUS_MAP,
  statusFilterOptions: filterOptions(LISTING_STATUS_MAP),

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "active", label: "Live", filter: isLive },
    { value: "draft", label: "Draft", filter: (r) => r.status === "Draft", createDefaults: { status: "Draft" } },
    { value: "midterm", label: "Furnished / mid-term", filter: (r) => Boolean(r.metadata?.furnished || r.metadata?.midTerm) },
    { value: "leased", label: "Leased", filter: (r) => r.status === "Leased" },
  ],

  columns: [
    {
      key: "name",
      header: "Listing",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.unit || "No unit linked", r.bedrooms || r.bathrooms ? `${Number(r.bedrooms) || 0} bd · ${Number(r.bathrooms) || 0} ba` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={LISTING_STATUS_MAP} />,
    },
    {
      key: "channels",
      header: "Channels",
      render: (r) => {
        const s = channelState(r);
        const n = SYNDICATION_CHANNELS.filter((c) => s[c.key].status === "Published").length;
        return n ? <Badge variant="success">{n} published</Badge> : <span className="text-text-tertiary">—</span>;
      },
    },
    {
      key: "flags",
      header: "Type",
      render: (r) =>
        r.metadata?.midTerm ? (
          <Badge variant="purple">Mid-term</Badge>
        ) : r.metadata?.furnished ? (
          <Badge variant="info">Furnished</Badge>
        ) : (
          <span className="text-text-tertiary">Long-term</span>
        ),
    },
    {
      key: "rent",
      header: "Asking rent",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground",
      render: (r) => (r.rent ? `${currency(r.rent)}/mo` : "—"),
    },
    {
      key: "availableDate",
      header: "Available",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => (r.availableDate && String(r.availableDate).slice(0, 10) <= todayISO() ? "Now" : formatDate(r.availableDate)),
    },
  ],

  stats: (rows) => {
    const live = rows.filter(isLive);
    const priced = live.filter((r) => Number(r.rent) > 0);
    const avg = priced.length ? priced.reduce((s, r) => s + Number(r.rent), 0) / priced.length : 0;
    const dom = live
      .map((r) => r.metadata?.publishedAt)
      .filter(Boolean)
      .map((d) => (Date.now() - new Date(d).getTime()) / 86400000);
    const f = funnel.value;
    return [
      { label: "Live listings", value: String(live.length), footer: `${rows.filter(notLeased).length} open · ${rows.filter((r) => r.status === "Draft").length} drafts` },
      { label: "Avg asking rent", value: avg ? currency(avg) : "—", footer: "Across live listings" },
      { label: "Avg days on market", value: dom.length ? String(Math.round(dom.reduce((s, n) => s + n, 0) / dom.length)) : "—", footer: "Since first published" },
      { label: "Lead → lease", value: f ? pct(f.leases, f.leads) : "—", footer: f ? `${f.leads} leads · ${f.leases} leased` : "Leasing funnel" },
    ];
  },

  createDraft: { name: "", unitId: "", availableDate: "" },
  createFields: [
    { key: "name", label: "Listing title", type: "text", placeholder: "e.g. Sunny 2BR at Maple Court" },
    {
      key: "unitId",
      label: "Unit",
      type: "select",
      optionsFrom: "units",
      placeholder: "Select a unit…",
      emptyLabel: "No units yet",
    },
  ],
  loadCreateOptions: async () => ({ units: await listingUnitOptions() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    propertyId: draft.propertyId || "",
    propertyName: draft.propertyName || "",
    rent: Number(draft.rent) || 0,
    deposit: Number(draft.deposit) || 0,
    bedrooms: Number(draft.bedrooms) || 0,
    bathrooms: Number(draft.bathrooms) || 0,
    sqft: Number(draft.sqft) || 0,
    status: "Draft",
  }),

  headerMeta: (r) =>
    [r.unit || r.propertyName, r.rent ? `${currency(r.rent)}/mo` : null, r.availableDate ? `Available ${formatDate(r.availableDate)}` : null]
      .filter(Boolean)
      .join(" · "),

  actions: [
    { key: "publish", label: "Publish", icon: Send, showIf: (i) => !["Active", "Leased"].includes(i.status), run: (ctx) => setPublished(ctx, true) },
    { key: "unpublish", label: "Unpublish", icon: PauseCircle, showIf: (i) => i.status === "Active", run: (ctx) => setPublished(ctx, false) },
    {
      key: "markLeased",
      label: "Mark leased",
      icon: KeyRound,
      showIf: (i) => i.status !== "Leased",
      wizard: {
        title: "Mark listing leased",
        description: "Takes the listing off every channel and links the signed lease.",
        initial: () => ({ leasedOn: todayISO(), leaseId: "" }),
        steps: [
          {
            key: "lease",
            title: "Lease",
            fields: [
              { key: "leaseId", label: "Lease (optional)", type: "relation", load: leaseOptions, full: true },
              { key: "leasedOn", label: "Leased on", type: "date", required: true },
              { key: "leasedNote", label: "Note", type: "textarea" },
            ],
          },
        ],
        finishLabel: "Mark leased",
        logSummary: "Marked leased",
        finish: async (v, ctx) => {
          const ok = await ctx.commit({ status: "Leased", leaseId: v.leaseId || "", syndicated: false });
          if (!ok) return false;
          await ctx.commitMeta({ syndication: publishChannels(ctx.item, false), leasedOn: v.leasedOn, leasedNote: v.leasedNote || "" });
          toast.success("Listing marked leased.");
          return true;
        },
      },
    },
    {
      key: "relist",
      label: "Relist as draft",
      icon: RotateCcw,
      showIf: (i) => ["Leased", "Archived"].includes(i.status),
      run: async (ctx) => {
        if (await ctx.commit({ status: "Draft", leaseId: "" })) toast.success("Listing moved back to draft.");
      },
    },
    {
      key: "archive",
      label: "Archive",
      icon: Archive,
      separatorBefore: true,
      showIf: (i) => i.status !== "Archived",
      run: async (ctx) => {
        if (!(await ctx.commit({ status: "Archived", syndicated: false }))) return;
        await ctx.commitMeta({ syndication: publishChannels(ctx.item, false) });
        toast.success("Listing archived.");
      },
    },
  ],

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Pricing, availability, funnel and where it's published." }],
    },
    {
      group: "Listing",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Unit, property, layout and status." },
        { key: "description", label: "Description", icon: AlignLeft, desc: "The marketing copy for this listing." },
        { key: "pricing", label: "Pricing & specials", icon: Wallet, desc: "Rent, fees, and move-in specials with expiry." },
        { key: "availability", label: "Availability & terms", icon: CalendarRange, desc: "Move-in date, lease terms offered and tour options." },
        { key: "pets", label: "Pet policy", icon: PawPrint, desc: "Which pets are allowed and what they cost." },
        { key: "features", label: "Features & amenities", icon: Sparkles, desc: "Unit features, amenities, parking, laundry and utilities." },
        { key: "midterm", label: "Furnished & mid-term", icon: Sofa, desc: "Furnished rate, minimum stay and what's included." },
      ],
    },
    {
      group: "Media",
      items: [
        { key: "photos", label: "Photos", icon: ImagePlus, desc: "Photos shown with this listing — set a cover." },
        { key: "tour", label: "Virtual tour & video", icon: Video, desc: "3D tour, video walkthrough and floor plan links." },
      ],
    },
    {
      group: "Marketing",
      items: [
        { key: "syndication", label: "Syndication", icon: Share2, desc: "Per-channel publish state (internal — provider not connected)." },
        { key: "leadSources", label: "Lead sources", icon: BarChart3, desc: "Where this listing's leads come from and how they convert." },
        { key: "contact", label: "Contact & agent", icon: Contact, desc: "Who leads should reach and when." },
      ],
    },
    {
      group: "Pipeline",
      items: [
        { key: "prospects", label: "Prospects", icon: UserPlus, desc: "Leads interested in this listing." },
        { key: "showings", label: "Showings", icon: CalendarClock, desc: "Tours booked for this listing." },
        { key: "applications", label: "Applications", icon: ClipboardList, desc: "Applications received for this listing." },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Disclosures, brochures and attachments." },
        { key: "notes", label: "Notes", icon: StickyNote, desc: "Internal notes on this listing." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Changes, publishes and notes." },
      ],
    },
  ],
  sections: {
    overview: ListingOverviewSection,
    details: makeFieldsSection(DETAILS_FIELDS),
    description: makeFieldsSection(DESCRIPTION_FIELDS),
    pricing: ListingPricingSection,
    availability: makeFieldsSection(AVAILABILITY_FIELDS),
    pets: makeFieldsSection(PETS_FIELDS),
    features: makeFieldsSection(FEATURES_FIELDS),
    midterm: makeFieldsSection(MIDTERM_FIELDS),
    photos: MediaSection,
    tour: makeFieldsSection(TOUR_FIELDS),
    syndication: SyndicationSection,
    leadSources: LeadSourcesSection,
    contact: makeAsyncFieldsSection(CONTACT_FIELDS, { agents: agentOptions }),
    prospects: ListingProspectsSection,
    showings: ListingShowingsSection,
    applications: ListingApplicationsSection,
    documents: DocumentsSection,
    notes: makeNotesSection({ field: "notes", placeholder: "Internal notes on this listing…" }),
    activity: ActivitySection,
  },
};

export function ListingsScreen() {
  return <EntityListScreen config={listingsConfig} />;
}

export default ListingsScreen;
