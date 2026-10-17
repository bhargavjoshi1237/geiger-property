"use client";

import { BellRing, Check, CircleDollarSign, Clock, FileSpreadsheet, Mail, Plus, Receipt, Repeat, Zap } from "lucide-react";
import { Button } from "@geiger/ui/button";
import { Switch } from "@geiger/ui/switch";
import { cn } from "@/lib/utils";
import { Bar, Field, Notice, Part, Pill, Row, RowText, SceneCard, flow, money } from "./kit";

// Automation scenes: a late-rent workflow, the monthly rent collection run and scheduled owner reports.

function Step({ icon: Icon, label, title, part, view, className }) {
  return (
    <Part id={part} view={view} className={cn("flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5", className)}>
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><Icon className="size-4" /></span>
      <RowText title={title} meta={label} />
    </Part>
  );
}

// The connector between two steps, centred under the step icons; dashed when it leads to a step that isn't there yet.
function Connector({ dashed }) {
  return <div aria-hidden="true" className={cn("ml-7 h-3 w-0 border-l border-border-strong", dashed && "border-dashed")} />;
}

const RUNS = [
  { unit: "Unit 9A · Leo Martins", result: "Late fee $75.00 posted · reminder sent", tone: "warning", label: "Charged" },
  { unit: "Unit 4B · Maya Patel", result: "Paid on autopay · skipped", tone: "success", label: "Skipped" },
];

// A workflow: trigger, condition and actions, then the log of what it actually did.
function WorkflowScene({ view }) {
  const { state } = view;
  return (
    <SceneCard title="Late rent follow-up" meta="Harbor Lofts · Maple Court" aside={<Part id="active" view={view} className="flex items-center gap-2 text-xs text-muted-foreground">{state.active ? "Active" : "Draft"}<Switch checked={state.active} /></Part>}>
      <div className="min-h-[300px]">
        <div className="flex flex-col">
          <Step part="trigger" view={view} icon={Zap} label="Trigger" title="Rent unpaid 5 days after due" />
          <Connector />
          <Step part="condition" view={view} icon={CircleDollarSign} label="Only if" title="Balance is over $50.00" />
          <Connector />
          <Step part="fee" view={view} icon={Receipt} label="Then" title="Post a $75.00 late fee" />
          {state.actions > 1 ? (
            <>
              <Connector />
              <Step part="remind" view={view} icon={BellRing} label="And" title="Email and text the resident" className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1" />
            </>
          ) : (
            <>
              <Connector dashed />
              <div data-part="addAction" className="flex items-center gap-3 rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm text-muted-foreground">
                <span className="grid size-8 shrink-0 place-items-center rounded-md border border-dashed border-border-strong"><Plus className="size-4" /></span>
                Add action
              </div>
            </>
          )}
        </div>
        <Part id="log" view={view} className={cn("mt-4 transition-opacity duration-300", state.runs ? "opacity-100" : "opacity-0")}>
          <div className="mb-2 text-xs text-muted-foreground">Run log · 6 Nov, 09:00</div>
          <div className="space-y-2">
            {RUNS.slice(0, state.runs).map((run) => (
              <Row key={run.unit} className="motion-safe:animate-in motion-safe:fade-in">
                <RowText title={run.unit} meta={run.result} />
                <Pill tone={run.tone}>{run.label}</Pill>
              </Row>
            ))}
          </div>
        </Part>
      </div>
    </SceneCard>
  );
}

const DUE = 98400;
const RESIDENTS = [
  { id: "4B", name: "Maya Patel", method: "Autopay", at: 1 },
  { id: "2C", name: "Sam Okafor", method: "Card", at: 2 },
  { id: "9A", name: "Leo Martins", method: "Bank", at: 3 },
];

// The monthly run: recurring charges post on the 1st, payments land, and the open balance shrinks with them.
function CollectionScene({ view }) {
  const { state } = view;
  const collected = [0, 61200, 89950, 96250][state.stage];
  const open = [46, 17, 5, 2][state.stage];
  return (
    <SceneCard title="Rent collection · November" meta="Harbor Lofts · 46 occupied units">
      <div className="min-h-[268px]">
        <Part id="charges" view={view} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
          <Repeat className="size-4 shrink-0 text-muted-foreground" />
          <RowText title={state.posted ? "46 rent charges posted · 1 Nov" : "Recurring charges scheduled"} meta={state.posted ? `${money(DUE)} due this month` : "Posts on the 1st of each month"} />
          {state.posted ? <Pill tone="success" className="ml-auto"><Check className="size-3" />Posted</Pill> : <Pill className="ml-auto"><Clock className="size-3" />1 Nov</Pill>}
        </Part>
        <Part id="collected" view={view} className="mt-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Collected</span>
            <span className="font-semibold tabular-nums">{money(collected)} <span className="font-normal text-muted-foreground">/ {money(DUE)}</span></span>
          </div>
          <Bar value={(collected / DUE) * 100} className="mt-2" />
          <div className="mt-2 text-xs text-muted-foreground">{open} {open === 1 ? "resident" : "residents"} with an open balance</div>
        </Part>
        <div className="mt-4 space-y-2">
          {RESIDENTS.map((resident) => {
            const paid = state.stage >= resident.at;
            return (
              <Row key={resident.id}>
                <RowText title={`Unit ${resident.id} · ${resident.name}`} meta={resident.method} />
                <Pill tone={paid ? "success" : "neutral"}>{paid ? "Paid" : "Due"}</Pill>
              </Row>
            );
          })}
        </div>
      </div>
    </SceneCard>
  );
}

const REPORTS = [
  { id: "statement", label: "Owner statement" },
  { id: "rentroll", label: "Rent roll" },
  { id: "delinquency", label: "Delinquency" },
];
const CADENCES = ["Weekly", "Monthly", "Quarterly"];

// Scheduled reports: pick a report, recipients and a cadence, and it goes out on its own.
function ReportsScene({ view }) {
  const { state } = view;
  return (
    <SceneCard title="Schedule a report" meta="Reports · Northgate Holdings">
      <div className="min-h-[286px]">
        <div className="flex flex-wrap gap-1.5">
          {REPORTS.map((report) => (
            <Button key={report.id} data-part={`report-${report.id}`} size="sm" variant={state.report === report.id ? "default" : "outline"}><FileSpreadsheet className="size-3.5" />{report.label}</Button>
          ))}
        </div>
        <Field id="to" label="Send to" placeholder="Email addresses" view={view} className="mt-3" />
        <div className="mt-3">
          <div className="mb-1.5 text-xs text-muted-foreground">Every</div>
          <div className="flex gap-1.5">
            {CADENCES.map((cadence) => <Button key={cadence} data-part={`cadence-${cadence}`} size="sm" variant={state.cadence === cadence ? "secondary" : "ghost"}>{cadence}</Button>)}
          </div>
        </div>
        {state.scheduled ? (
          <Part id="schedule" view={view} className="mt-4 motion-safe:animate-in motion-safe:fade-in">
            <Row>
              <RowText title="Owner statement · monthly on the 3rd" meta={`PDF and CSV to ${state.to}`} />
              <Pill tone="success">Scheduled</Pill>
            </Row>
            <Notice tone="neutral" icon={Mail} className="mt-2">Next run 3 Dec, 08:00. Last sent 3 Nov to 2 recipients.</Notice>
          </Part>
        ) : (
          <Button data-part="save" className="mt-4 w-full">Schedule report</Button>
        )}
      </div>
    </SceneCard>
  );
}

export const AUTOMATION_PREVIEWS = {
  workflows: {
    Scene: WorkflowScene,
    script: flow({ actions: 1, active: false, runs: 0 }, [
      { chapter: "Build", highlight: "trigger", caption: "Pick what starts the workflow: rent still unpaid five days in.", hold: 1300 },
      { highlight: "condition", caption: "Add a condition so small balances are left alone.", hold: 1000 },
      { cursor: "addAction", click: true, set: { actions: 2 }, caption: "Then add what happens: a late fee and a reminder.", hold: 1000 },
      { chapter: "Run", cursor: "active", click: true, set: { active: true }, caption: "Turn it on.", hold: 700 },
      { set: { runs: 2 }, highlight: "log", caption: "Each run is logged, including the residents it skipped.", hold: 2200 },
    ]),
  },
  collection: {
    Scene: CollectionScene,
    script: flow({ posted: false, stage: 0 }, [
      { highlight: "charges", caption: "Rent and recurring fees are set once per lease.", hold: 1200 },
      { set: { posted: true }, highlight: "charges", caption: "On the 1st, every charge posts on its own.", hold: 1300 },
      { set: { stage: 1 }, highlight: "collected", caption: "Autopay collects most of the month straight away.", hold: 1300 },
      { set: { stage: 2 }, caption: "Card and bank payments land as residents pay.", hold: 1200 },
      { set: { stage: 3 }, highlight: "collected", caption: "The open balances are what's left to follow up.", hold: 1900 },
    ]),
  },
  reports: {
    Scene: ReportsScene,
    script: flow({ report: "rentroll", to: "", cadence: "Weekly", scheduled: false }, [
      { cursor: "report-statement", click: true, set: { report: "statement" }, caption: "Choose the report an owner asks for every month.", hold: 600 },
      { cursor: "to", type: "to", set: { to: "owners@northgate.co" }, caption: "Add who should get it.", hold: 300 },
      { cursor: "cadence-Monthly", click: true, set: { cadence: "Monthly" }, caption: "Pick how often it goes out.", hold: 500 },
      { cursor: "save", click: true, set: { scheduled: true }, highlight: "schedule", caption: "From now on it's sent on schedule, without anyone running it.", hold: 2200 },
    ]),
  },
};
