"use client";

import React from "react";
import { ArrowRight, Bell, CalendarClock, MapPin, Receipt, ShieldAlert, Wallet, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatsBar, StatusPill } from "@/components/internal/shared/screen_kit";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { REQUEST_STATUS_MAP } from "@/lib/portal/constants";
import { AUTOPAY_STATUS_MAP } from "@/lib/payments/constants";
import { DataGate, Panel, Row, Rows, fmtDate, firstName, greeting, money, money0, Notice, usePortalData } from "../portal_kit";

const daysUntil = (iso) => {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  const t = new Date();
  return Math.round((d - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000);
};

function SeeAll({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-xs text-text-secondary transition-colors hover:text-foreground">
      View all <ArrowRight className="h-3.5 w-3.5" />
    </button>
  );
}

function BalanceHero({ data, onNavigate }) {
  const { ledger, permissions, autopay, home } = data;
  const due = ledger.balance > 0.004;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-subtle">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">{due ? "Balance due" : "Your balance"}</p>
          <p className="mt-2 text-4xl font-bold tabular-nums tracking-tight text-foreground">{money(Math.max(0, ledger.balance))}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            {ledger.credit > 0 ? <Badge variant="success">{money(ledger.credit)} credit on account</Badge> : null}
            {!due && ledger.credit <= 0 ? <span>You&apos;re all paid up.</span> : null}
            {home.lease?.rent ? <span>Monthly rent {money(home.lease.rent)}</span> : null}
            {autopay ? <StatusPill status={autopay.status} map={AUTOPAY_STATUS_MAP} /> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {permissions.payments ? (
            <Button onClick={() => onNavigate("payments")} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Wallet className="h-4 w-4" /> {due ? "Pay Now" : "Make a Payment"}
            </Button>
          ) : null}
          {permissions.requests ? (
            <Button variant="outline" onClick={() => onNavigate("requests")} className="border-border bg-surface-card hover:bg-surface-hover">
              <Wrench className="h-4 w-4" /> Request Maintenance
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ResidentHome({ member, onNavigate }) {
  const state = usePortalData("/api/portal/resident/overview");
  return (
    <MainScreenWrapper>
      <DataGate state={state} size={72}>
        {(data) => {
          const { home, ledger, requests, announcements, insurance, permissions } = data;
          const leaseDays = daysUntil(home.lease?.termEnd);
          const stats = [
            { label: "Balance", value: money0(Math.max(0, ledger.balance)), footer: ledger.openCharges ? `${ledger.openCharges} open charge${ledger.openCharges === 1 ? "" : "s"}` : "Nothing open" },
            { label: "Open requests", value: String(requests.open), footer: "Maintenance in progress" },
            { label: "Lease ends", value: home.lease?.termEnd ? fmtDate(home.lease.termEnd) : "—", footer: leaseDays !== null && leaseDays >= 0 ? `In ${leaseDays} days` : home.lease?.status || "No active lease" },
            { label: "Insurance", value: insurance.current ? "On file" : insurance.required ? "Needed" : "Optional", footer: insurance.current ? `Expires ${fmtDate(insurance.current.endsOn)}` : "Renters insurance" },
          ];
          return (
            <>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  {greeting()}, {firstName(member.name)}
                </h1>
                {home.property ? (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-text-secondary">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {[home.property.name, home.unit?.label ? `Unit ${home.unit.label}` : null].filter(Boolean).join(" · ")}
                      {home.property.address ? ` — ${home.property.address}` : ""}
                    </span>
                  </p>
                ) : null}
                {member.brand?.welcome ? <p className="mt-2 max-w-2xl text-sm text-text-secondary">{member.brand.welcome}</p> : null}
              </div>

              <BalanceHero data={data} onNavigate={onNavigate} />

              {insurance.required && !insurance.current ? (
                <Notice icon={ShieldAlert} tone="warning">
                  Your lease requires renters insurance and we don&apos;t have a current policy on file.{" "}
                  <button type="button" onClick={() => onNavigate("insurance")} className="font-medium underline underline-offset-2">
                    Upload your policy
                  </button>
                </Notice>
              ) : null}

              <StatsBar stats={stats} />

              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title="Recent activity" action={permissions.ledger ? <SeeAll onClick={() => onNavigate("payments")} /> : null} flush>
                  {ledger.recent.length ? (
                    <Rows>
                      {ledger.recent.map((r) => (
                        <Row
                          key={r.id}
                          title={r.memo}
                          meta={`${fmtDate(r.date)} · ${r.type}`}
                          aside={
                            <span className={r.payment > 0 ? "text-sm tabular-nums text-emerald-600 dark:text-emerald-400" : "text-sm tabular-nums text-foreground"}>
                              {r.payment > 0 ? `−${money(r.payment)}` : money(r.charge)}
                            </span>
                          }
                        />
                      ))}
                    </Rows>
                  ) : (
                    <div className="flex items-center gap-3 px-5 py-8 text-sm text-text-secondary">
                      <Receipt className="h-4 w-4 shrink-0" /> No charges or payments yet.
                    </div>
                  )}
                </Panel>

                <Panel title="Maintenance" action={<SeeAll onClick={() => onNavigate("requests")} />} flush>
                  {requests.recent.length ? (
                    <Rows>
                      {requests.recent.map((r) => (
                        <Row key={r.id} title={r.name} meta={`${fmtDate(r.createdAt)}${r.category ? ` · ${r.category}` : ""}`} aside={<StatusPill status={r.status} map={REQUEST_STATUS_MAP} />} onClick={() => onNavigate("requests")} />
                      ))}
                    </Rows>
                  ) : (
                    <div className="flex items-center gap-3 px-5 py-8 text-sm text-text-secondary">
                      <Wrench className="h-4 w-4 shrink-0" /> No maintenance requests.
                    </div>
                  )}
                </Panel>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title="Announcements" action={<SeeAll onClick={() => onNavigate("announcements")} />} flush>
                  {announcements.length ? (
                    <Rows>
                      {announcements.map((a) => (
                        <div key={a.id} className="px-4 py-3 sm:px-5">
                          <p className="text-sm font-medium text-foreground">{a.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{a.body}</p>
                          <p className="mt-1 text-[11px] text-text-tertiary">{fmtDate(a.date)}</p>
                        </div>
                      ))}
                    </Rows>
                  ) : (
                    <div className="flex items-center gap-3 px-5 py-8 text-sm text-text-secondary">
                      <Bell className="h-4 w-4 shrink-0" /> No announcements right now.
                    </div>
                  )}
                </Panel>

                <Panel title="Your lease" action={<SeeAll onClick={() => onNavigate("lease")} />}>
                  {home.lease ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Rent</p>
                        <p className="mt-1 text-sm tabular-nums text-foreground">{money(home.lease.rent)} / month</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Status</p>
                        <p className="mt-1 text-sm text-foreground">{home.lease.status || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Starts</p>
                        <p className="mt-1 text-sm text-foreground">{fmtDate(home.lease.termStart)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Ends</p>
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground">
                          <CalendarClock className="h-3.5 w-3.5 text-text-tertiary" />
                          {fmtDate(home.lease.termEnd)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-text-secondary">No lease is linked to your account yet.</p>
                  )}
                </Panel>
              </div>
            </>
          );
        }}
      </DataGate>
    </MainScreenWrapper>
  );
}

export default ResidentHome;
