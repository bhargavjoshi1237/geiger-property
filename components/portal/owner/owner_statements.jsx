"use client";

import React, { useMemo, useState } from "react";
import { Banknote, Printer, Receipt } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScreenHeader } from "@/components/internal/shared/screen_kit";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { SelectField } from "../form_bits";
import { DataGate, Panel, PortalEmpty, Row, Rows, fmtDate, money, monthLabel, usePortalData } from "../portal_kit";

const KIND_LABEL = { income: "Income", expense: "Expenses", distribution: "Distributions", contribution: "Contributions" };

const lastMonths = (n) => {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i += 1) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
};

function Figure({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-border bg-surface-subtle p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">{label}</p>
      <p className={cn("mt-1 text-xl font-bold tabular-nums", tone === "down" ? "text-red-600 dark:text-red-400" : "text-foreground")}>{value}</p>
    </div>
  );
}

export function OwnerStatements() {
  const [month, setMonth] = useState(lastMonths(1)[0]);
  const state = usePortalData(`/api/portal/owner/statements?month=${month}`);
  const options = useMemo(() => {
    const set = new Set([...lastMonths(12), ...(state.data?.months || []).map((m) => m.month)]);
    return [...set].sort().reverse().map((m) => ({ value: m, label: monthLabel(m) }));
  }, [state.data]);

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Statements"
        description="Income, expenses and distributions for your share of each property."
        actions={
          <>
            <div className="w-48">
              <SelectField value={month} onChange={setMonth} options={options} />
            </div>
            <Button variant="outline" onClick={() => window.print()} className="border-border bg-surface-card hover:bg-surface-hover">
              <Printer className="h-4 w-4" /> Print
            </Button>
          </>
        }
      />
      <DataGate state={state}>
        {(data) => {
          const s = data.statement;
          return (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Figure label="Income" value={money(s.income)} />
                <Figure label="Expenses" value={money(s.expense)} />
                <Figure label="Net operating" value={money(s.net)} tone={s.net < 0 ? "down" : "up"} />
                <Figure label="Distributed to you" value={money(s.distributions)} />
              </div>

              <Panel title={`${monthLabel(data.month)} statement`} description={data.payout.method ? `Payouts by ${data.payout.method}` : undefined} flush>
                {data.groups.length ? (
                  <div className="divide-y divide-border">
                    {data.groups.map((g) => (
                      <details key={g.key} className="group">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-surface-hover sm:px-5">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">{g.account}</span>
                            <span className="text-xs text-text-tertiary">
                              {KIND_LABEL[g.kind]} · {g.lines.length} line{g.lines.length === 1 ? "" : "s"}
                            </span>
                          </span>
                          <span className={cn("shrink-0 text-sm tabular-nums", g.kind === "expense" ? "text-text-secondary" : "text-foreground")}>
                            {g.kind === "expense" ? `−${money(g.total)}` : money(g.total)}
                          </span>
                        </summary>
                        <div className="bg-surface-card/40 pb-2">
                          {g.lines.map((l) => (
                            <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-1.5 text-xs sm:px-8">
                              <span className="min-w-0 truncate text-text-secondary">
                                {fmtDate(l.date)} · {l.memo || "—"}
                                {l.propertyName ? ` · ${l.propertyName}` : ""}
                              </span>
                              <span className="shrink-0 tabular-nums text-text-secondary">{money(l.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-5 py-8 text-sm text-text-secondary">
                    <Receipt className="h-4 w-4 shrink-0" /> No activity posted for {monthLabel(data.month)}.
                  </div>
                )}
              </Panel>

              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title="Monthly history" flush>
                  {data.months.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-[11px] uppercase tracking-wider text-text-tertiary">
                            <th className="px-4 py-2 text-left font-medium sm:px-5">Month</th>
                            <th className="px-2 py-2 text-right font-medium">Income</th>
                            <th className="px-2 py-2 text-right font-medium">Expenses</th>
                            <th className="px-4 py-2 text-right font-medium sm:px-5">Net</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {data.months.slice(0, 12).map((m) => (
                            <tr key={m.month} onClick={() => setMonth(m.month)} className={cn("cursor-pointer hover:bg-surface-hover", m.month === data.month && "bg-surface-active")}>
                              <td className="px-4 py-2 text-foreground sm:px-5">{monthLabel(m.month)}</td>
                              <td className="px-2 py-2 text-right tabular-nums text-text-secondary">{money(m.income)}</td>
                              <td className="px-2 py-2 text-right tabular-nums text-text-secondary">{money(m.expense)}</td>
                              <td className={cn("px-4 py-2 text-right tabular-nums sm:px-5", m.net < 0 ? "text-red-600 dark:text-red-400" : "text-foreground")}>{money(m.net)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="px-5 py-8 text-sm text-text-secondary">No ledger activity on your properties yet.</div>
                  )}
                </Panel>

                <Panel title="Distributions" description="Owner draws paid out to you." flush>
                  {data.distributions.length ? (
                    <Rows>
                      {data.distributions.map((d) => (
                        <Row key={d.id} title={d.memo} meta={[fmtDate(d.date), d.propertyName].filter(Boolean).join(" · ")} aside={<span className="text-sm tabular-nums text-foreground">{money(d.amount)}</span>} />
                      ))}
                    </Rows>
                  ) : (
                    <PortalEmpty icon={Banknote} title="No distributions yet" description="Payouts to you will be listed here." className="border-0" />
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

export default OwnerStatements;
