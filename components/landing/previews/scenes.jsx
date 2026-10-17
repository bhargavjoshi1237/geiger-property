"use client";

import { Bath, BedDouble, Camera, Check, CircleCheck, CreditCard, Landmark, LayoutDashboard, Loader2, Ruler, Send, Wrench } from "lucide-react";
import { Button } from "@geiger/ui/button";
import { Switch } from "@geiger/ui/switch";
import { cn } from "@/lib/utils";
import { Field, Notice, Part, Pill, Row, RowText, SceneCard, flow, money } from "./kit";

// Front-of-house scenes: the listing and application, the tenant portal, a maintenance request and the owner statement.

const APPLY_START = { screen: "listing", name: "", email: "", income: "", card: "", paying: false };
const APPLY_STEPS = [["listing", "Unit"], ["details", "Details"], ["fee", "Fee"]];
const APPLICATION_FEE = 45;

function ListingScene({ view }) {
  const { state } = view;
  const stepIndex = APPLY_STEPS.findIndex(([screen]) => screen === state.screen);

  return (
    <SceneCard title="Harbor Lofts · Unit 4B" meta="120 Harbor St · Listed on your site" aside={state.screen !== "done" ? <span className="shrink-0 text-xs text-muted-foreground">Step {stepIndex + 1} of 3</span> : null}>
      {state.screen !== "done" ? (
        <div className="mb-4 flex gap-1.5">
          {APPLY_STEPS.map(([screen, label], index) => (
            <div key={screen} className="flex-1">
              <div className={cn("h-1 rounded-full transition-colors duration-300", index <= stepIndex ? "bg-foreground" : "bg-border")} />
              <div className={cn("mt-1.5 text-[11px]", index === stepIndex ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</div>
            </div>
          ))}
        </div>
      ) : null}

      {state.screen === "listing" ? (
        <div className="min-h-[252px]">
          <div className="relative h-28 overflow-hidden rounded-lg bg-foreground">
            {/* A window grid stands in for the listing photo */}
            <div className="absolute inset-x-6 bottom-0 top-5 grid grid-cols-6 gap-1.5 rounded-t-md border border-background/25 p-2">
              {Array.from({ length: 18 }, (_, i) => <span key={i} className={cn("rounded-[2px] border border-background/30", i % 4 === 1 && "bg-background/60")} />)}
            </div>
            <Pill className="absolute left-2 top-2 border-background/30 bg-background text-foreground">Available 1 Dec</Pill>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-lg font-semibold tabular-nums">$2,150<span className="text-sm font-normal text-muted-foreground"> / month</span></span>
            <span className="text-xs text-muted-foreground">12-month lease</span>
          </div>
          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><BedDouble className="size-3.5" />2 bed</span>
            <span className="flex items-center gap-1.5"><Bath className="size-3.5" />1 bath</span>
            <span className="flex items-center gap-1.5"><Ruler className="size-3.5" />880 sq ft</span>
          </div>
          <Button data-part="apply" className="mt-4 w-full">Apply now</Button>
        </div>
      ) : null}

      {state.screen === "details" ? (
        <div className="min-h-[252px] space-y-3">
          <Field id="name" label="Full name" placeholder="Your name" view={view} />
          <Field id="email" label="Email" placeholder="you@example.com" view={view} />
          <Field id="income" label="Monthly income" placeholder="$0" view={view} />
          <Button data-part="toFee" className="w-full">Continue</Button>
        </div>
      ) : null}

      {state.screen === "fee" ? (
        <div className="min-h-[252px] space-y-3">
          <Field id="card" label="Card number" placeholder="1234 1234 1234 1234" view={view} />
          <div className="space-y-1 pt-1 text-xs text-muted-foreground">
            <div className="flex justify-between"><span>Application fee</span><span className="tabular-nums">{money(APPLICATION_FEE)}</span></div>
            <div className="flex justify-between"><span>Includes</span><span>Credit, background and income checks</span></div>
          </div>
          <Button data-part="submit" className="w-full" disabled={state.paying}>
            {state.paying ? <><Loader2 className="size-4 animate-spin" />Submitting</> : <><CreditCard className="size-4" />Pay {money(APPLICATION_FEE)} and submit</>}
          </Button>
        </div>
      ) : null}

      {state.screen === "done" ? (
        <div className="min-h-[252px] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CircleCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
            Application sent{state.name ? `, ${state.name.split(" ")[0]}` : ""}
          </div>
          <Part id="application" view={view} className="mt-3 rounded-xl bg-foreground p-4 text-background">
            <div className="text-xs opacity-70">Application APP-1042</div>
            <div className="mt-1 text-base font-semibold">Unit 4B · Harbor Lofts</div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["Credit", "Background", "Income"].map((check) => <span key={check} className="rounded-md border border-background/30 px-1.5 py-0.5 text-[11px]">{check} · running</span>)}
            </div>
          </Part>
          <p className="mt-3 text-xs text-muted-foreground">We&apos;ll email {state.email || "you"} as soon as the property manager decides.</p>
          <Part id="pipeline" view={view} className="mt-4 flex items-center justify-between rounded-lg bg-muted px-3 py-2.5 text-xs">
            <span className="flex items-center gap-2 text-muted-foreground"><LayoutDashboard className="size-3.5" />Your applications</span>
            <span className="font-medium">+1 for Unit 4B · fee {money(APPLICATION_FEE)}</span>
          </Part>
        </div>
      ) : null}
    </SceneCard>
  );
}

// The tenant portal: a resident pays rent, turns on autopay, and the payment posts to the ledger.
function TenantPortalScene({ view }) {
  const { state } = view;
  return (
    <SceneCard className="max-w-[310px]" title="Harbor Lofts · Unit 4B" meta="Resident portal · Maya Patel">
      <Part id="balance" view={view} className="bg-foreground p-4 text-background">
        <div className="text-xs opacity-70">{state.paid ? "Balance" : "November rent · due 1 Nov"}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{money(state.paid ? 0 : 2150)}</div>
        <div className="mt-2 text-xs opacity-70">{state.paid ? "Paid 1 Nov · Receipt RC-30418" : "Rent $2,100.00 · Parking $50.00"}</div>
      </Part>
      <div className="mt-3 space-y-2">
        <Row part="bank" view={view}>
          <span className="flex items-center gap-2 text-sm"><Landmark className="size-4 text-muted-foreground" />Bank ••6021</span>
          <Pill tone="strong">Selected</Pill>
        </Row>
        <Row part="autopay" view={view}>
          <RowText title="Autopay" meta={state.autopay ? "On · the 1st of each month" : "Pay rent automatically"} />
          <Switch checked={state.autopay} />
        </Row>
      </div>
      <div className="mt-3 min-h-[44px]">
        {state.paid ? (
          <Notice tone="success" icon={Check} className="motion-safe:animate-in motion-safe:fade-in">
            <span className="font-semibold">Paid {money(2150)}</span> · Posted to the Harbor Lofts ledger
          </Notice>
        ) : (
          <Button data-part="pay" className="w-full" disabled={state.paying}>
            {state.paying ? <><Loader2 className="size-4 animate-spin" />Paying</> : <>Pay {money(2150)}</>}
          </Button>
        )}
      </div>
    </SceneCard>
  );
}

const WORK_STAGES = ["New", "Assigned", "Scheduled", "Done"];

// A maintenance request becomes a work order: assign a vendor, schedule, close, and the tenant hears at every step.
function WorkOrderScene({ view }) {
  const { state } = view;
  return (
    <SceneCard title="WO-1182 · Kitchen faucet leaking" meta="Harbor Lofts · Unit 4B · from Maya Patel" aside={<Pill tone={state.stage === 3 ? "success" : "neutral"}>{WORK_STAGES[state.stage]}</Pill>}>
      <div className="min-h-[268px]">
        <Part id="request" view={view} className="flex gap-3 rounded-lg border border-border p-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><Camera className="size-5" /></div>
          <div className="min-w-0 text-xs">
            <div className="text-muted-foreground">Reported 21 Nov · 2 photos</div>
            <div className="mt-1 text-sm">&ldquo;Dripping under the sink, there&apos;s water on the cabinet floor.&rdquo;</div>
          </div>
        </Part>
        <div className="mt-4 flex gap-1.5">
          {WORK_STAGES.map((stage, index) => (
            <div key={stage} className="flex-1">
              <div className={cn("h-1 rounded-full transition-colors duration-300", index <= state.stage ? "bg-foreground" : "bg-border")} />
              <div className={cn("mt-1.5 text-[11px]", index === state.stage ? "font-medium text-foreground" : "text-muted-foreground")}>{stage}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {state.stage === 0 ? (
            <Row>
              <RowText title="No vendor yet" meta="Plumbing · urgent" />
              <Button data-part="assign" size="sm"><Wrench className="size-3.5" />Assign</Button>
            </Row>
          ) : (
            <Row part="vendor" view={view}>
              <RowText title="Rivera Plumbing" meta={state.stage >= 2 ? "Tue 24 Nov · 10:00–12:00" : "Accepted · picking a time"} />
              {state.stage === 3 ? <Pill tone="success"><Check className="size-3" />Closed</Pill> : <Button data-part="complete" size="sm" variant="outline">Mark done</Button>}
            </Row>
          )}
        </div>
        <Notice tone={state.stage === 3 ? "success" : "neutral"} icon={state.stage === 3 ? CircleCheck : Send} show={state.stage > 0} className="mt-3">
          {state.stage === 3 ? <>Closed · {money(185)} billed to Northgate Holdings. Maya rated the repair 5/5.</> : <>Maya was notified: {state.stage === 2 ? "Rivera Plumbing arrives Tue 10:00." : "a plumber has been assigned."}</>}
        </Notice>
      </div>
    </SceneCard>
  );
}

const STATEMENT = [
  { id: "rent", label: "Rent collected", amount: 48600 },
  { id: "other", label: "Late fees and parking", amount: 1240 },
  { id: "repairs", label: "Repairs and maintenance", amount: -3180 },
  { id: "fee", label: "Management fee · 8% of rent", amount: -3888 },
];
const NET = STATEMENT.reduce((sum, line) => sum + line.amount, 0);

// The owner statement: income, expenses and fees roll up to the payout the owner sees in their portal.
function OwnerScene({ view }) {
  const { state } = view;
  return (
    <SceneCard title="Owner statement · Northgate Holdings" meta="November 2026 · 3 properties · 62 units">
      <div className="min-h-[264px]">
        <div className="divide-y divide-border rounded-lg border border-border">
          {STATEMENT.slice(0, state.shown).map((line) => (
            <Part key={line.id} id={line.id} view={view} className="flex items-center justify-between rounded-none px-3 py-2.5 text-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
              <span className="text-muted-foreground">{line.label}</span>
              <span className="tabular-nums">{line.amount < 0 ? `−${money(-line.amount)}` : money(line.amount)}</span>
            </Part>
          ))}
        </div>
        <Part id="net" view={view} className={cn("mt-3 flex items-center justify-between bg-foreground px-3 py-3 text-background transition-opacity duration-300", state.shown < STATEMENT.length && "opacity-0")}>
          <span className="text-sm font-medium">Net to owner</span>
          <span className="text-lg font-semibold tabular-nums">{money(NET)}</span>
        </Part>
        <div className="mt-3 min-h-[44px]">
          {state.sent ? (
            <Notice tone="success" icon={Check}>Payout of {money(NET)} sent by ACH. The statement is in Northgate&apos;s owner portal.</Notice>
          ) : (
            <Button data-part="payout" className="w-full" variant="outline" disabled={state.shown < STATEMENT.length}>Approve and send payout</Button>
          )}
        </div>
      </div>
    </SceneCard>
  );
}

export const FRONT_PREVIEWS = {
  listing: {
    Scene: ListingScene,
    script: flow(APPLY_START, [
      { chapter: "Listing", caption: "A prospect finds Unit 4B on your listing page.", hold: 1100 },
      { cursor: "apply", click: true, set: { screen: "details" }, caption: "They start an application from the listing.", hold: 200 },
      { chapter: "Details", cursor: "name", type: "name", set: { name: "Priya Shah" }, caption: "They fill in their details and income.", hold: 100 },
      { cursor: "email", type: "email", set: { email: "priya@example.com" }, hold: 100 },
      { cursor: "income", type: "income", set: { income: "$6,700" }, hold: 300 },
      { cursor: "toFee", click: true, set: { screen: "fee" }, hold: 200 },
      { chapter: "Fee", cursor: "card", type: "card", set: { card: "4242 4242 4242 4242" }, caption: "The application fee is paid on the same page.", hold: 300 },
      { cursor: "submit", click: true, set: { paying: true }, hold: 800 },
      { chapter: "Screening", set: { screen: "done", paying: false }, highlight: "application", caption: "Screening starts as soon as they submit.", hold: 1600 },
      { highlight: "pipeline", caption: "And the application lands in your leasing pipeline.", hold: 1800 },
    ]),
  },
  portal: {
    Scene: TenantPortalScene,
    script: flow({ autopay: false, paying: false, paid: false }, [
      { highlight: "balance", caption: "Residents see what they owe, line by line.", hold: 1300 },
      { cursor: "autopay", click: true, set: { autopay: true }, caption: "They can turn on autopay for every month after.", hold: 900 },
      { cursor: "pay", click: true, set: { paying: true }, caption: "Paying this month takes one tap.", hold: 700 },
      { set: { paying: false, paid: true }, highlight: "balance", caption: "The payment posts to the ledger and a receipt goes out.", hold: 2200 },
    ]),
  },
  workorder: {
    Scene: WorkOrderScene,
    script: flow({ stage: 0 }, [
      { highlight: "request", caption: "A resident reports a leak, with photos.", hold: 1400 },
      { cursor: "assign", click: true, set: { stage: 1 }, caption: "You assign a vendor and the tenant is told.", hold: 1100 },
      { set: { stage: 2 }, highlight: "vendor", caption: "The vendor books a visit window.", hold: 1300 },
      { cursor: "complete", click: true, set: { stage: 3 }, caption: "When it's closed, the cost is billed to the owner.", hold: 2000 },
    ]),
  },
  owner: {
    Scene: OwnerScene,
    script: flow({ shown: 0, sent: false }, [
      { set: { shown: 2 }, highlight: "rent", caption: "The month's income comes straight from the rent ledger.", hold: 1100 },
      { set: { shown: 3 }, highlight: "repairs", caption: "Repairs come from closed work orders.", hold: 1000 },
      { set: { shown: 4 }, highlight: "fee", caption: "Your management fee is calculated for you.", hold: 1100 },
      { highlight: "net", caption: "What's left is the owner's payout.", hold: 1000 },
      { cursor: "payout", click: true, set: { sent: true }, caption: "Approve it and the owner sees the statement in their portal.", hold: 2000 },
    ]),
  },
};
