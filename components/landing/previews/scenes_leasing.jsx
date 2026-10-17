"use client";

import { CalendarCheck, Camera, Check, CircleCheck, FileSignature, Loader2, Plus, Send } from "lucide-react";
import { Button } from "@geiger/ui/button";
import { cn } from "@/lib/utils";
import { Avatar, Bar, Field, Notice, Part, Pill, Row, RowText, SceneCard, flow, money } from "./kit";

// Leasing and marketing scenes: units, portfolios, showings, screening, comps, e-sign, renewals, inspections and deposits.

const STATUS_TONE = { Occupied: "neutral", Vacant: "success", Notice: "warning" };
const UNITS = [
  { id: "3A", status: "Occupied", meta: "2 bed · Jordan Lee" },
  { id: "3B", status: "Vacant", meta: "1 bed · Ready 18 Nov" },
  { id: "4A", status: "Notice", meta: "2 bed · Moving out 30 Nov" },
  { id: "4B", status: "Occupied", meta: "2 bed · Maya Patel" },
  { id: "5C", status: "Vacant", meta: "Studio · Ready now" },
];
const UNIT_FILTERS = [["all", "All 48"], ["Vacant", "Vacant 3"], ["Notice", "On notice 2"]];

function UnitsScene({ view }) {
  const { state } = view;
  const shown = UNITS.filter((unit) => state.filter === "all" || unit.status === state.filter);
  return (
    <SceneCard title="Harbor Lofts" meta="120 Harbor St · 48 units">
      <div className="mb-3 flex gap-1.5">
        {UNIT_FILTERS.map(([value, label]) => (
          <Button key={value} data-part={`filter-${value}`} size="sm" variant={state.filter === value ? "default" : "outline"} className="h-7 rounded-full px-2.5 text-xs">{label}</Button>
        ))}
      </div>
      <div className="min-h-[240px] space-y-2">
        {shown.map((unit) => (
          <Row key={unit.id} part={`unit-${unit.id}`} view={view}>
            <RowText title={`Unit ${unit.id}`} meta={unit.meta} />
            <Pill tone={STATUS_TONE[unit.status]}>{unit.status}</Pill>
          </Row>
        ))}
      </div>
    </SceneCard>
  );
}

const PROPERTIES = [
  { id: "harbor", name: "Harbor Lofts", units: 48, occupancy: 94, income: 98400, detail: "45 of 48 leased · 2 on notice" },
  { id: "maple", name: "Maple Court Townhomes", units: 12, occupancy: 100, income: 30600, detail: "12 of 12 leased · 1 renewal due" },
  { id: "elm", name: "Elm Street Duplex", units: 2, occupancy: 50, income: 1950, detail: "1 of 2 leased · Unit B listed" },
];

function PortfoliosScene({ view }) {
  const { state } = view;
  return (
    <SceneCard title="Northgate Holdings" meta="Portfolio · 3 properties · 62 units">
      <div className="min-h-[268px] space-y-2">
        {PROPERTIES.map((property) => (
          <Row key={property.id} part={`prop-${property.id}`} view={view} className="flex-col items-stretch gap-2">
            <div className="flex items-center justify-between gap-3">
              <RowText title={property.name} meta={`${property.units} units · ${property.occupancy}% occupied`} />
              <span className="shrink-0 text-sm font-semibold tabular-nums">{money(property.income)}</span>
            </div>
            <Bar value={property.occupancy} />
            {state.open === property.id ? <div className="text-xs text-muted-foreground motion-safe:animate-in motion-safe:fade-in">{property.detail}</div> : null}
          </Row>
        ))}
        <Part id="totals" view={view} className="flex items-center justify-between bg-muted px-3 py-2.5 text-xs">
          <span className="text-muted-foreground">Monthly rent, all properties</span>
          <span className="font-semibold tabular-nums">{money(130950)} · 95%</span>
        </Part>
      </div>
    </SceneCard>
  );
}

const SLOTS = [
  { day: "Thu 20 Nov", times: [["1000", "10:00", true], ["1230", "12:30", false], ["1600", "16:00", false]] },
  { day: "Fri 21 Nov", times: [["1100", "11:00", false], ["1430", "14:30", true], ["1730", "17:30", false]] },
];

function ShowingsScene({ view }) {
  const { state } = view;
  return (
    <SceneCard title="Book a showing" meta="Harbor Lofts · Unit 3B · 1 bed · $1,875/mo">
      <div className="min-h-[248px]">
        {SLOTS.map(({ day, times }) => (
          <div key={day} className="mb-3">
            <div className="mb-1.5 text-xs text-muted-foreground">{day}</div>
            <div className="grid grid-cols-3 gap-2">
              {times.map(([id, label, taken]) => {
                const picked = state.picked === id;
                return (
                  <Button key={id} data-part={`slot-${id}`} size="sm" variant={picked ? "default" : "outline"} disabled={taken} className={cn(taken && "line-through")}>{label}</Button>
                );
              })}
            </div>
          </div>
        ))}
        <Button data-part="book" className="mt-1 w-full" disabled={!state.picked || state.booked}>
          {state.booked ? <><Check className="size-4" />Booked</> : <><CalendarCheck className="size-4" />Book showing</>}
        </Button>
        <Notice tone="success" icon={CircleCheck} show={state.booked} className="mt-3">Fri 21 Nov at 11:00. Confirmation sent to Leo Martins.</Notice>
      </div>
    </SceneCard>
  );
}

const CHECKS = [["credit", "Credit", "Score 742"], ["background", "Background", "No records found"], ["income", "Income", "3.1× monthly rent"]];

function ApplicationsScene({ view }) {
  const { state } = view;
  return (
    <SceneCard title="Priya Shah" meta="Application · Harbor Lofts · Unit 3B" aside={<Pill tone={state.approved ? "success" : "neutral"}>{state.approved ? "Approved" : "Screening"}</Pill>}>
      <div className="min-h-[236px]">
        <Part id="checks" view={view} className="space-y-2">
          {CHECKS.map(([id, label, result]) => {
            const passed = state[id] === "passed";
            return (
              <Row key={id}>
                <RowText title={label} meta={passed ? result : "Checking…"} />
                {passed ? <Pill tone="success"><Check className="size-3" />Passed</Pill> : <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              </Row>
            );
          })}
        </Part>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline">Decline</Button>
          <Button data-part="approve" disabled={state.approved}>{state.approved ? <><Check className="size-4" />Approved</> : "Approve"}</Button>
        </div>
        <Notice tone="success" icon={FileSignature} show={state.approved} className="mt-3">Lease for Unit 3B drafted and ready to send.</Notice>
      </div>
    </SceneCard>
  );
}

const COMPS = [
  { name: "The Wharf · 2 bed", meta: "0.3 mi · 940 sqft", rent: 2240 },
  { name: "Pier 9 Flats · 2 bed", meta: "0.5 mi · 880 sqft", rent: 2125 },
  { name: "Canal House · 2 bed", meta: "0.8 mi · 910 sqft", rent: 2190 },
];

function CompsScene({ view }) {
  return (
    <SceneCard title="Rent comparables" meta="Harbor Lofts · Unit 4A · 2 bed · 900 sqft">
      <div className="min-h-[260px]">
        <div className="space-y-2">
          {COMPS.map((comp) => (
            <Row key={comp.name}>
              <RowText title={comp.name} meta={comp.meta} />
              <span className="shrink-0 text-sm font-medium tabular-nums">${comp.rent.toLocaleString("en-US")}</span>
            </Row>
          ))}
        </div>
        <Part id="range" view={view} className="mt-3 flex items-center justify-between bg-muted px-3 py-2.5 text-xs">
          <span className="text-muted-foreground">Suggested range</span>
          <span className="font-semibold tabular-nums">$2,140 – $2,230</span>
        </Part>
        <Field id="asking" label="Your asking rent" view={view} className="mt-3" />
      </div>
    </SceneCard>
  );
}

const SIGN_TONE = { Sent: "neutral", Viewed: "warning", Signed: "success" };

function EsignScene({ view }) {
  const { state } = view;
  const signers = [["maya", "Maya Patel", "Tenant"], ["owner", "Northgate Holdings", "Owner"]];
  const signed = signers.filter(([id]) => state[id] === "Signed").length;
  return (
    <SceneCard title="Residential lease · Unit 4B" meta="Harbor Lofts · 12 months · $2,150/mo">
      <div className="min-h-[220px]">
        <div className="mb-1.5 flex justify-between text-xs text-muted-foreground"><span>Signatures</span><span className="tabular-nums">{signed} of 2</span></div>
        <Bar value={signed * 50} />
        <Part id="signers" view={view} className="mt-3 space-y-2">
          {signers.map(([id, name, role]) => (
            <Row key={id}>
              <div className="flex min-w-0 items-center gap-2.5"><Avatar name={name} /><RowText title={name} meta={role} /></div>
              <Pill tone={SIGN_TONE[state[id]]}>{state[id]}</Pill>
            </Row>
          ))}
        </Part>
        <Notice tone="success" icon={CircleCheck} show={state.active} className="mt-3"><span className="font-semibold">Fully signed.</span> Lease active from 1 Dec 2026.</Notice>
      </div>
    </SceneCard>
  );
}

function RenewalsScene({ view }) {
  const { state } = view;
  return (
    <SceneCard title="Renewals" meta="Leases expiring in the next 60 days">
      <div className="min-h-[256px] space-y-2">
        <Row part="lease-4B" view={view}>
          <RowText title="Unit 4B · Maya Patel" meta="Harbor Lofts · Ends 15 Jan · $2,150/mo" />
          <Pill tone={state.response ? "success" : state.sent ? "warning" : "neutral"}>{state.response ?? (state.sent ? "Offer sent" : "Not offered")}</Pill>
        </Row>
        <Row>
          <RowText title="Unit 2 · Sam Okafor" meta="Maple Court · Ends 31 Jan · $2,550/mo" />
          <Pill>Not offered</Pill>
        </Row>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Field id="term" label="Term" view={view} />
          <Field id="rent" label="New rent (+3%)" placeholder="$0" view={view} />
        </div>
        <Button data-part="send" className="w-full" disabled={state.sent}>{state.sent ? <><Check className="size-4" />Offer sent</> : <><Send className="size-4" />Send renewal offer</>}</Button>
      </div>
    </SceneCard>
  );
}

const ROOMS = {
  Kitchen: [["Cabinets", "Good"], ["Appliances", "Good"], ["Countertops", "Good"]],
  Bathroom: [["Tub & tile", "Good"], ["Vanity", "Good"], ["Fan", "Good"]],
  Bedroom: [["Carpet", "Good"], ["Closet doors", "Good"], ["Windows", "Good"]],
};

function InspectionsScene({ view }) {
  const { state } = view;
  const done = Object.keys(ROOMS).indexOf(state.room);
  return (
    <SceneCard title="Move-in inspection" meta="Harbor Lofts · Unit 4B · Maya Patel">
      <div className="mb-3 flex gap-1.5">
        {Object.keys(ROOMS).map((room, index) => (
          <Button key={room} data-part={`room-${room}`} size="sm" variant={state.room === room ? "default" : "outline"} className="h-7 flex-1 text-xs">{index < done ? <Check className="size-3" /> : null}{room}</Button>
        ))}
      </div>
      <div className="min-h-[226px]">
        <div className="space-y-2">
          {ROOMS[state.room].map(([item, condition]) => {
            const damaged = state.damaged && item === "Tub & tile";
            return (
              <Row key={item} part={`item-${item.split(" ")[0].toLowerCase()}`} view={view}>
                <RowText title={item} meta={damaged ? "Chipped tile by drain" : "No issues noted"} />
                <div className="flex items-center gap-1.5">
                  {damaged ? <Pill><Camera className="size-3" />2</Pill> : null}
                  <Pill tone={damaged ? "danger" : "success"}>{damaged ? "Damaged" : condition}</Pill>
                </div>
              </Row>
            );
          })}
        </div>
        <Part id="summary" view={view} className="mt-3 flex items-center justify-between bg-muted px-3 py-2.5 text-xs">
          <span className="text-muted-foreground">{done + 1} of 3 rooms checked</span>
          <span className="font-medium">{state.damaged ? "1 item damaged · 2 photos" : "No damage so far"}</span>
        </Part>
      </div>
    </SceneCard>
  );
}

const DEDUCTIONS = [["carpet", "Carpet cleaning", 180], ["wall", "Wall repair, bedroom", 95]];

function DepositsScene({ view }) {
  const { state } = view;
  const applied = DEDUCTIONS.filter(([id]) => state[id]);
  const refund = 2150 - applied.reduce((sum, [, , amount]) => sum + amount, 0);
  return (
    <SceneCard title="Deposit disposition" meta="Unit 4A · Move-out 30 Nov · Jordan Brooks">
      <div className="min-h-[268px]">
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Security deposit held</span><span className="font-medium tabular-nums">{money(2150)}</span></div>
        <div className="mt-3 space-y-2">
          {DEDUCTIONS.map(([id, label, amount]) => (
            <Row key={id}>
              <RowText title={label} meta={state[id] ? "Deducted · invoice attached" : "From move-out inspection"} />
              {state[id] ? <span className="text-sm font-medium tabular-nums">−{money(amount)}</span> : <Button data-part={`add-${id}`} size="sm" variant="outline"><Plus className="size-3.5" />Deduct</Button>}
            </Row>
          ))}
        </div>
        <Part id="refund" view={view} className="mt-3 flex items-center justify-between bg-muted px-3 py-2.5 text-sm">
          <span className="text-muted-foreground">Refund to tenant</span>
          <span className="font-semibold tabular-nums">{money(refund)}</span>
        </Part>
        <Button data-part="send" className="mt-3 w-full" disabled={state.refunded}>{state.refunded ? <><Check className="size-4" />Refund sent</> : "Send refund and itemized letter"}</Button>
        <Notice tone="success" icon={CircleCheck} show={state.refunded} className="mt-3">Refund of {money(refund)} sent by ACH, with the itemized letter.</Notice>
      </div>
    </SceneCard>
  );
}

export const LEASING_PREVIEWS = {
  units: {
    Scene: UnitsScene,
    script: flow({ filter: "all" }, [
      { caption: "Every unit at Harbor Lofts, with its status.", hold: 1300 },
      { cursor: "filter-Vacant", click: true, set: { filter: "Vacant" }, caption: "Filter to what needs attention.", hold: 700 },
      { highlight: "unit-3B", caption: "Unit 3B is vacant and ready on 18 Nov.", hold: 1800 },
      { cursor: "filter-Notice", click: true, set: { filter: "Notice" }, caption: "See who has given notice, too.", hold: 1600 },
    ]),
  },
  portfolios: {
    Scene: PortfoliosScene,
    script: flow({ open: null }, [
      { caption: "Group properties by owner.", hold: 1300 },
      { cursor: "prop-harbor", click: true, set: { open: "harbor" }, caption: "Compare occupancy and rent across them.", hold: 1300 },
      { cursor: "prop-elm", click: true, set: { open: "elm" }, caption: "Spot the property that's falling behind.", hold: 1400 },
      { highlight: "totals", caption: "And see the whole portfolio at once.", hold: 1800 },
    ]),
  },
  showings: {
    Scene: ShowingsScene,
    script: flow({ picked: null, booked: false }, [
      { caption: "Prospects see the open showing slots.", hold: 1200 },
      { cursor: "slot-1100", click: true, set: { picked: "1100" }, caption: "They pick a time that suits them.", hold: 700 },
      { cursor: "book", click: true, set: { booked: true }, caption: "The showing is booked and confirmed.", hold: 2000 },
    ]),
  },
  applications: {
    Scene: ApplicationsScene,
    script: flow({ credit: "pending", background: "pending", income: "pending", approved: false }, [
      { highlight: "checks", caption: "Screening runs as soon as Priya applies.", hold: 900 },
      { set: { credit: "passed" }, caption: "Credit comes back first.", hold: 700 },
      { set: { background: "passed" }, caption: "Then the background check.", hold: 700 },
      { set: { income: "passed" }, caption: "Income is verified at 3.1× the rent.", hold: 1000 },
      { cursor: "approve", click: true, set: { approved: true }, caption: "Approve, and the lease is drafted.", hold: 2000 },
    ]),
  },
  comps: {
    Scene: CompsScene,
    script: flow({ asking: "$2,100" }, [
      { caption: "See what similar units nearby rent for.", hold: 1300 },
      { highlight: "range", caption: "Geiger suggests a range from the comps.", hold: 1400 },
      { cursor: "asking", type: "asking", set: { asking: "$2,195" }, caption: "Set an asking rent that fits the market.", hold: 1800 },
    ]),
  },
  esign: {
    Scene: EsignScene,
    script: flow({ maya: "Sent", owner: "Sent", active: false }, [
      { highlight: "signers", caption: "The lease goes out for e-signature.", hold: 1200 },
      { set: { maya: "Viewed" }, caption: "See when each signer opens it.", hold: 900 },
      { set: { maya: "Signed" }, caption: "Maya signs from her phone.", hold: 1000 },
      { set: { owner: "Signed" }, caption: "Then the owner countersigns.", hold: 900 },
      { set: { active: true }, caption: "The lease is active, with a dated copy for everyone.", hold: 2000 },
    ]),
  },
  renewals: {
    Scene: RenewalsScene,
    script: flow({ term: "12 months", rent: "", sent: false, response: null }, [
      { highlight: "lease-4B", caption: "Leases ending soon are listed for you.", hold: 1200 },
      { cursor: "rent", type: "rent", set: { rent: "$2,215" }, caption: "Offer new terms with a 3% increase.", hold: 400 },
      { cursor: "send", click: true, set: { sent: true }, caption: "Send the offer to the tenant.", hold: 1000 },
      { set: { response: "Accepted" }, highlight: "lease-4B", caption: "Maya accepts, and the renewal is drafted.", hold: 2000 },
    ]),
  },
  inspections: {
    Scene: InspectionsScene,
    script: flow({ room: "Kitchen", damaged: false }, [
      { caption: "Walk the unit room by room.", hold: 1200 },
      { cursor: "room-Bathroom", click: true, set: { room: "Bathroom" }, caption: "Move on once a room is checked.", hold: 700 },
      { cursor: "item-tub", click: true, set: { damaged: true }, caption: "Mark damage and attach photos.", hold: 1200 },
      { highlight: "summary", caption: "The report is ready to compare at move-out.", hold: 1800 },
    ]),
  },
  deposits: {
    Scene: DepositsScene,
    script: flow({ carpet: false, wall: false, refunded: false }, [
      { caption: "At move-out, start from the deposit you hold.", hold: 1200 },
      { cursor: "add-carpet", click: true, set: { carpet: true }, caption: "Deduct items from the inspection.", hold: 600 },
      { cursor: "add-wall", click: true, set: { wall: true }, hold: 600 },
      { highlight: "refund", caption: "The refund is worked out for you.", hold: 1200 },
      { cursor: "send", click: true, set: { refunded: true }, caption: "Send it with an itemized letter.", hold: 2000 },
    ]),
  },
};
