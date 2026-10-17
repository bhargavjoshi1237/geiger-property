"use client";

import { BellRing, CalendarCheck, Check, CircleCheck, ClipboardPen, Download, Droplets, Mail, MessageSquare, Send, Users } from "lucide-react";
import { Button } from "@geiger/ui/button";
import { cn } from "@/lib/utils";
import { Bar, Field, Notice, Part, Pill, Row, RowText, SceneCard, flow, money } from "./kit";

// Operations scenes: maintenance schedules, unit turns, payables, reconciliation, utilities, announcements and reports.

// A display-only checkbox the cursor can aim at.
function Tick({ part, checked }) {
  return (
    <span data-part={part} className={cn("grid size-4 shrink-0 place-items-center rounded border transition-colors duration-200", checked ? "border-foreground bg-foreground text-background" : "border-border-strong bg-background")}>
      {checked ? <Check className="size-3" strokeWidth={3} /> : null}
    </span>
  );
}

const JOBS = [
  { id: "hvac", name: "HVAC filter swap", every: "Every 90 days", next: "14 Nov" },
  { id: "gutters", name: "Gutter cleaning", every: "Every 6 months", next: "2 Dec" },
  { id: "extinguisher", name: "Fire extinguisher check", every: "Yearly", next: "9 Jan" },
];

// Preventive maintenance: a due job turns itself into an assigned work order.
function PreventiveScene({ view }) {
  const { state } = view;
  return (
    <SceneCard title="Preventive & recurring" meta="Harbor Lofts · 120 Harbor St">
      <div className="min-h-[248px]">
        <Part id="jobs" view={view} className="space-y-2">
          {JOBS.map((job) => {
            const due = state.due && job.id === "hvac";
            return (
              <Row key={job.id} part={`job-${job.id}`} view={view}>
                <RowText title={job.name} meta={`${job.every} · Next ${job.next}`} />
                {due ? <Pill tone="warning">Due today</Pill> : <Pill><CalendarCheck className="size-3" />Scheduled</Pill>}
              </Row>
            );
          })}
        </Part>
        {state.wo ? (
          <Part id="workorder" view={view} className="mt-3 flex items-center gap-3 bg-foreground p-3 text-background motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-500">
            <ClipboardPen className="size-5 shrink-0" strokeWidth={1.5} />
            <div className="min-w-0">
              <div className="text-sm font-semibold">WO-1187 · HVAC filter swap</div>
              <div className="text-xs opacity-70">Created automatically · Assigned to Brightline HVAC</div>
            </div>
          </Part>
        ) : null}
      </div>
    </SceneCard>
  );
}

const TURN_TASKS = [
  { id: "paint", name: "Paint", vendor: "In-house crew" },
  { id: "clean", name: "Deep clean", vendor: "Coastline Cleaning" },
  { id: "carpet", name: "Carpet replacement", vendor: "Floorworks Co." },
  { id: "inspect", name: "Final inspection", vendor: "Jordan Lee" },
];

// Unit turn: tasks complete one by one until the vacant unit is rent-ready.
function TurnsScene({ view }) {
  const { state } = view;
  return (
    <SceneCard title="Unit turn · 7C" meta="Harbor Lofts · Vacant since 31 Oct">
      <div className="min-h-[268px]">
        <Part id="progress" view={view}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Tasks complete</span>
            <span className="font-semibold tabular-nums">{state.done} <span className="font-normal text-muted-foreground">/ {TURN_TASKS.length}</span></span>
          </div>
          <Bar value={(state.done / TURN_TASKS.length) * 100} className="mt-2" />
        </Part>
        <div className="mt-3 space-y-2">
          {TURN_TASKS.map((task, index) => {
            const done = index < state.done;
            return (
              <Row key={task.id}>
                <div className="flex min-w-0 items-center gap-3">
                  <Tick part={`task-${task.id}`} checked={done} />
                  <RowText title={task.name} meta={task.vendor} />
                </div>
                {done ? <Pill tone="success">Done</Pill> : <Pill>Open</Pill>}
              </Row>
            );
          })}
        </div>
        <Part id="ready" view={view} className="mt-3">
          <Notice tone="success" icon={CircleCheck} show={state.done === TURN_TASKS.length}><span className="font-semibold">Rent-ready 18 Nov</span> · Unit 7C can be listed</Notice>
        </Part>
      </div>
    </SceneCard>
  );
}

const BILLS = [
  { id: "rivera", vendor: "Rivera Plumbing", ref: "WO-1179 · Harbor Lofts", amount: 640, due: "12 Nov" },
  { id: "brightline", vendor: "Brightline HVAC", ref: "WO-1181 · Maple Court", amount: 1280, due: "15 Nov" },
  { id: "coastline", vendor: "Coastline Cleaning", ref: "Turn 7C · Harbor Lofts", amount: 420, due: "18 Nov" },
  { id: "water", vendor: "City Water", ref: "Harbor Lofts · October", amount: 3840, due: "30 Nov" },
];

// Bills & payables: pick approved bills and pay them as one batch.
function BillsScene({ view }) {
  const { state } = view;
  const total = BILLS.filter((bill) => state.selected.includes(bill.id)).reduce((sum, bill) => sum + bill.amount, 0);
  const count = state.selected.length;
  return (
    <SceneCard title="Bills & payables" meta="Operating account · November 2026">
      <div className="min-h-[268px]">
        <div className="space-y-2">
          {BILLS.map((bill) => (
            <Row key={bill.id}>
              <div className="flex min-w-0 items-center gap-3">
                <Tick part={`bill-${bill.id}`} checked={state.selected.includes(bill.id)} />
                <RowText title={bill.vendor} meta={`${bill.ref} · Due ${bill.due}`} />
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums">{money(bill.amount)}</span>
            </Row>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">{count ? `${count} selected · ${money(total)}` : "No bills selected"}</span>
          <Button data-part="pay" size="sm" disabled={!count || state.scheduled}>{state.scheduled ? <><Check className="size-3.5" />Scheduled</> : count ? `Pay ${count} ${count === 1 ? "bill" : "bills"}` : "Pay bills"}</Button>
        </div>
        <Part id="notice" view={view} className="mt-3">
          <Notice tone="success" icon={CircleCheck} show={state.scheduled}><span className="font-semibold">Payments scheduled</span> · {count} bills · {money(total)} from Operating</Notice>
        </Part>
      </div>
    </SceneCard>
  );
}

const STATEMENT = 48215.4;
const BANK_LINES = [
  { id: "a", name: "Deposit · Maya Patel", match: "Rent · Unit 4B", amount: 2150 },
  { id: "b", name: "Deposit · Jordan Reyes", match: "Rent · Unit 4C", amount: 1875 },
  { id: "c", name: "Deposit · Laundry card", match: "Laundry income", amount: 312.5 },
];

// Bank reconciliation: matching each bank line brings the difference to zero.
function ReconcileScene({ view }) {
  const { state } = view;
  const difference = BANK_LINES.filter((line) => !state.matched.includes(line.id)).reduce((sum, line) => sum + line.amount, 0);
  const done = difference === 0;
  return (
    <SceneCard title="Bank reconciliation" meta="Operating · ending 31 Oct" aside={done ? <Pill tone="success"><Check className="size-3" />Reconciled</Pill> : <Pill>In progress</Pill>}>
      <div className="min-h-[248px]">
        <Part id="balances" view={view} className="grid grid-cols-3 gap-2 text-center">
          {[["Statement", money(STATEMENT)], ["Ledger", money(STATEMENT - difference)], ["Difference", money(difference)]].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-muted px-2 py-2.5">
              <div className="text-[11px] text-muted-foreground">{label}</div>
              <div className={cn("mt-1 text-xs font-semibold tabular-nums", label === "Difference" && !done && "text-amber-700 dark:text-amber-300")}>{value}</div>
            </div>
          ))}
        </Part>
        <div className="mt-3 space-y-2">
          {BANK_LINES.map((line) => {
            const matched = state.matched.includes(line.id);
            return (
              <Row key={line.id}>
                <RowText title={line.name} meta={matched ? `Matched to ${line.match}` : money(line.amount)} />
                <Button data-part={`match-${line.id}`} size="sm" variant={matched ? "outline" : "default"}>{matched ? <><Check className="size-3.5" />Matched</> : "Match"}</Button>
              </Row>
            );
          })}
        </div>
      </div>
    </SceneCard>
  );
}

const SPLITS = {
  occupancy: [["4B", "Maya Patel · 2 occupants", 86.4], ["4C", "Jordan Reyes · 1 occupant", 43.2], ["5A", "Priya Shah · 3 occupants", 129.6]],
  sqft: [["4B", "Maya Patel · 920 sq ft", 92.1], ["4C", "Jordan Reyes · 610 sq ft", 61.4], ["5A", "Priya Shah · 1,050 sq ft", 104.75]],
};

// Utility billing: a building's bill is split across units and posted to tenant ledgers.
function UtilitiesScene({ view }) {
  const { state } = view;
  return (
    <SceneCard title="Utility billing" meta="Harbor Lofts · 46 occupied units">
      <div className="min-h-[276px]">
        <Part id="bill" view={view} className="flex items-center gap-3 bg-foreground p-3 text-background">
          <Droplets className="size-5 shrink-0" strokeWidth={1.5} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Water & sewer · October</div>
            <div className="text-xs opacity-70">City Water · building meter</div>
          </div>
          <span className="text-sm font-semibold tabular-nums">{money(3840)}</span>
        </Part>
        <div className="mt-3 flex gap-1 rounded-lg bg-muted p-1">
          {[["occupancy", "By occupants"], ["sqft", "By square footage"]].map(([id, label]) => (
            <span key={id} data-part={`method-${id}`} className={cn("flex-1 rounded-md py-1.5 text-center text-xs transition-colors duration-200", state.method === id ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground")}>{label}</span>
          ))}
        </div>
        <Part id="charges" view={view} className="mt-3 divide-y divide-border rounded-lg border border-border">
          {SPLITS[state.method].map(([unit, meta, amount]) => (
            <div key={unit} className="flex items-center justify-between gap-3 px-3 py-2">
              <RowText title={`Unit ${unit}`} meta={meta} />
              <span className="text-sm font-medium tabular-nums">{money(amount)}</span>
            </div>
          ))}
          <div className="px-3 py-2 text-xs text-muted-foreground">+ 43 more units</div>
        </Part>
        <Button data-part="post" className="mt-3 w-full" disabled={state.posted}>{state.posted ? <><Check className="size-4" />Posted</> : "Post charges"}</Button>
        <Part id="notice" view={view} className="mt-3">
          <Notice tone="success" icon={CircleCheck} show={state.posted}>Charges posted to 46 tenant ledgers · due 1 Dec</Notice>
        </Part>
      </div>
    </SceneCard>
  );
}

// Announcements: one message to a whole building by email and text, with delivery stats.
function AnnouncementsScene({ view }) {
  const { state } = view;
  const channels = [["email", "Email", Mail], ["sms", "SMS", MessageSquare]];
  return (
    <SceneCard title="New announcement" meta="Communications">
      <div className="min-h-[268px] space-y-3">
        <Row part="audience" view={view}>
          <div className="flex min-w-0 items-center gap-3"><Users className="size-4 shrink-0 text-muted-foreground" /><RowText title="Harbor Lofts" meta="All residents (46)" /></div>
          <Pill>Audience</Pill>
        </Row>
        <div className="flex gap-2">
          {channels.map(([id, label, Icon]) => (
            <span key={id} data-part={`ch-${id}`} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors duration-200", state[id] ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground")}><Icon className="size-3.5" />{label}</span>
          ))}
        </div>
        <Field id="subject" label="Subject" placeholder="What's happening?" view={view} />
        {state.sent ? (
          <Part id="stats" view={view} className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[["Sent", "46"], ["Opened", "41"], ["Texts", "46"]].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-muted py-2"><div className="text-sm font-semibold tabular-nums">{value}</div><div className="text-[11px] text-muted-foreground">{label}</div></div>
              ))}
            </div>
            <Bar value={(41 / 46) * 100} className="mt-2" />
          </Part>
        ) : (
          <Button data-part="send" className="w-full"><Send className="size-4" />Send to 46 residents</Button>
        )}
      </div>
    </SceneCard>
  );
}

const ROLL = [
  { unit: "4B", property: "Harbor Lofts", tenant: "Maya Patel", rent: 2150, balance: 0 },
  { unit: "4C", property: "Harbor Lofts", tenant: "Jordan Reyes", rent: 1875, balance: 0 },
  { unit: "5A", property: "Harbor Lofts", tenant: "Priya Shah", rent: 2400, balance: 2400 },
  { unit: "3", property: "Maple Court", tenant: "Leo Grant", rent: 1150, balance: 1150 },
  { unit: "B", property: "Elm Street", tenant: "Sam Ortiz", rent: 1800, balance: 3600 },
];

// Rent roll: filter the report, read the totals, export it.
function RentRollScene({ view }) {
  const { state } = view;
  const rows = ROLL.filter((row) => state.property === "All properties" || row.property === state.property);
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  return (
    <SceneCard title="Rent roll" meta="November 2026" aside={<Button data-part="export" variant="outline" size="sm"><Download className="size-3.5" />Export CSV</Button>}>
      <div className="min-h-[264px]">
        <span data-part="filter" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs">Property: <span className="font-medium">{state.property}</span></span>
        <Part id="table" view={view} className="mt-3 overflow-hidden rounded-lg border border-border text-xs">
          <div className="grid grid-cols-[2.6fr_1fr_1fr] gap-2 bg-muted px-3 py-2 text-muted-foreground"><span>Unit · Tenant</span><span className="text-right">Rent</span><span className="text-right">Balance</span></div>
          {rows.map((row) => (
            <div key={row.unit} className="grid grid-cols-[2.6fr_1fr_1fr] gap-2 border-t border-border px-3 py-2">
              <span className="truncate"><span className="font-medium">{row.unit}</span> · {row.tenant}</span>
              <span className="text-right tabular-nums">{money(row.rent)}</span>
              <span className={cn("text-right tabular-nums", row.balance ? "font-medium" : "text-muted-foreground")}>{money(row.balance)}</span>
            </div>
          ))}
        </Part>
        <Part id="totals" view={view} className="mt-2 grid grid-cols-[2.6fr_1fr_1fr] gap-2 px-3 py-2 text-xs font-semibold">
          <span>{rows.length} units shown</span>
          <span className="text-right tabular-nums">{money(sum("rent"))}</span>
          <span className="text-right tabular-nums">{money(sum("balance"))}</span>
        </Part>
        <Notice icon={Download} show={state.exported} className="mt-2">rent_roll_harbor_lofts_nov_2026.csv downloaded</Notice>
      </div>
    </SceneCard>
  );
}

const DEBTORS = [
  { id: "priya", name: "Priya Shah", unit: "Harbor Lofts 5A", amount: 2400, bucket: 0 },
  { id: "leo", name: "Leo Grant", unit: "Maple Court 3", amount: 1150, bucket: 1 },
  { id: "sam", name: "Sam Ortiz", unit: "Elm Street B", amount: 3600, bucket: 2 },
];
const BUCKETS = ["0–30 days", "31–60 days", "60+ days"];

// Delinquency: aged balances, bulk reminders, and the total dropping as payments land.
function DelinquencyScene({ view }) {
  const { state } = view;
  const open = DEBTORS.filter((debtor) => !(state.paid && debtor.id === "priya"));
  const total = open.reduce((sum, debtor) => sum + debtor.amount, 0);
  return (
    <SceneCard title="Delinquency" meta="All properties · November 2026">
      <div className="min-h-[276px]">
        <Part id="aging" view={view} className="grid grid-cols-3 gap-2 text-center">
          {BUCKETS.map((label, index) => (
            <div key={label} className="rounded-lg bg-muted px-2 py-2.5">
              <div className="text-[11px] text-muted-foreground">{label}</div>
              <div className="mt-1 text-xs font-semibold tabular-nums">{money(open.filter((debtor) => debtor.bucket === index).reduce((sum, debtor) => sum + debtor.amount, 0))}</div>
            </div>
          ))}
        </Part>
        <div className="mt-3 space-y-2">
          {DEBTORS.map((debtor) => {
            const paid = state.paid && debtor.id === "priya";
            const picked = state.selected.includes(debtor.id);
            return (
              <Row key={debtor.id}>
                <div className="flex min-w-0 items-center gap-3">
                  <Tick part={`pick-${debtor.id}`} checked={picked} />
                  <RowText title={debtor.name} meta={`${debtor.unit} · ${BUCKETS[debtor.bucket]}`} />
                </div>
                {paid ? <Pill tone="success">Paid</Pill> : state.sent && picked ? <Pill tone="warning"><BellRing className="size-3" />Reminded</Pill> : <span className="text-sm font-medium tabular-nums">{money(debtor.amount)}</span>}
              </Row>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <Part id="total" view={view} className="px-1 text-sm"><span className="text-muted-foreground">Outstanding </span><span className="font-semibold tabular-nums">{money(total)}</span></Part>
          <Button data-part="send" size="sm" disabled={!state.selected.length || state.sent}>{state.sent ? <><Check className="size-3.5" />Sent</> : "Send reminders"}</Button>
        </div>
      </div>
    </SceneCard>
  );
}

export const OPERATIONS_PREVIEWS = {
  preventive: {
    Scene: PreventiveScene,
    script: flow({ due: false, wo: false }, [
      { highlight: "jobs", caption: "Recurring jobs for every property sit on one schedule.", hold: 1500 },
      { set: { due: true }, highlight: "job-hvac", caption: "When a job comes due, it's flagged.", hold: 1100 },
      { set: { wo: true }, highlight: "workorder", caption: "A work order is created and assigned to the vendor on its own.", hold: 2200 },
    ]),
  },
  turns: {
    Scene: TurnsScene,
    script: flow({ done: 1 }, [
      { highlight: "progress", caption: "Every task to turn Unit 7C sits on one board.", hold: 1300 },
      { cursor: "task-clean", click: true, set: { done: 2 }, caption: "Each vendor's task is checked off as it's finished.", hold: 600 },
      { cursor: "task-carpet", click: true, set: { done: 3 }, hold: 600 },
      { cursor: "task-inspect", click: true, set: { done: 4 }, caption: "The final inspection clears the unit.", hold: 500 },
      { highlight: "ready", caption: "It's marked rent-ready, with the date it can be listed.", hold: 1900 },
    ]),
  },
  bills: {
    Scene: BillsScene,
    script: flow({ selected: [], scheduled: false }, [
      { caption: "Approved vendor bills wait in one list.", hold: 1100 },
      { cursor: "bill-rivera", click: true, set: { selected: ["rivera"] }, caption: "Pick the ones to pay now.", hold: 250 },
      { cursor: "bill-brightline", click: true, set: { selected: ["rivera", "brightline"] }, hold: 250 },
      { cursor: "bill-coastline", click: true, set: { selected: ["rivera", "brightline", "coastline"] }, hold: 500 },
      { cursor: "pay", click: true, set: { scheduled: true }, highlight: "notice", caption: "They're paid together as one batch.", hold: 2000 },
    ]),
  },
  reconcile: {
    Scene: ReconcileScene,
    script: flow({ matched: [] }, [
      { highlight: "balances", caption: "The bank statement and the ledger are $4,337.50 apart.", hold: 1500 },
      { cursor: "match-a", click: true, set: { matched: ["a"] }, caption: "Match each bank line to its transaction.", hold: 500 },
      { cursor: "match-b", click: true, set: { matched: ["a", "b"] }, hold: 500 },
      { cursor: "match-c", click: true, set: { matched: ["a", "b", "c"] }, hold: 300 },
      { highlight: "balances", caption: "The difference reaches zero and the month is reconciled.", hold: 2000 },
    ]),
  },
  utilities: {
    Scene: UtilitiesScene,
    script: flow({ method: "occupancy", posted: false }, [
      { highlight: "bill", caption: "The building's water bill comes in.", hold: 1100 },
      { highlight: "charges", caption: "It's split across units by number of occupants.", hold: 1300 },
      { cursor: "method-sqft", click: true, set: { method: "sqft" }, highlight: "charges", caption: "Or switch the split to square footage.", hold: 1200 },
      { cursor: "post", click: true, set: { posted: true }, highlight: "notice", caption: "Each tenant's share posts to their ledger.", hold: 2000 },
    ]),
  },
  announcements: {
    Scene: AnnouncementsScene,
    script: flow({ email: true, sms: false, subject: "", sent: false }, [
      { highlight: "audience", caption: "Pick a building, and every resident is on the list.", hold: 1200 },
      { cursor: "ch-sms", click: true, set: { sms: true }, caption: "Send it by email and text at once.", hold: 600 },
      { cursor: "subject", type: "subject", set: { subject: "Water shut-off Thursday 9–11am" }, caption: "Write the message once.", hold: 400 },
      { cursor: "send", click: true, set: { sent: true }, highlight: "stats", caption: "See who received it and who opened it.", hold: 2200 },
    ]),
  },
  rentroll: {
    Scene: RentRollScene,
    script: flow({ property: "All properties", exported: false }, [
      { highlight: "table", caption: "Every unit, tenant, rent and balance in one report.", hold: 1400 },
      { cursor: "filter", click: true, set: { property: "Harbor Lofts" }, caption: "Filter it to a single property.", hold: 700 },
      { highlight: "totals", caption: "The totals follow the filter.", hold: 1200 },
      { cursor: "export", click: true, set: { exported: true }, caption: "Export it for the owner or your accountant.", hold: 1800 },
    ]),
  },
  delinquency: {
    Scene: DelinquencyScene,
    script: flow({ selected: [], sent: false, paid: false }, [
      { highlight: "aging", caption: "Balances are grouped by how long they've been owed.", hold: 1400 },
      { cursor: "pick-leo", click: true, set: { selected: ["leo"] }, caption: "Select the tenants who are overdue.", hold: 250 },
      { cursor: "pick-sam", click: true, set: { selected: ["leo", "sam"] }, hold: 400 },
      { cursor: "send", click: true, set: { sent: true }, caption: "Reminders go out by email and text.", hold: 1100 },
      { set: { paid: true }, highlight: "total", caption: "When a payment lands, the total drops on its own.", hold: 2000 },
    ]),
  },
};
