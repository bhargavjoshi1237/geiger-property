"use client";

import { useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { Field, SectionCard } from "@/components/internal/shared/screen_kit";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { usePermission } from "@/context/rbac-context";
import { useSetting } from "@/components/internal/screens/settings/settings_kit";
import { getLockedThrough } from "@/lib/supabase/accounting_periods";
import { MONTH_OPTIONS, closedThroughLabel, normalizeStartMonth } from "@/lib/ledger/periods";

// Company Profile → Accounting (CORE-40): the company-wide fiscal-year start (accounting_settings.fiscalYearStartMonth) and where the books stand.
// The balance sheet splits retained earnings from current year earnings at this month; closing its last month closes the year.

const DEFAULTS = { fiscalYearStartMonth: "1" };

export function AccountingYearCard() {
  const setting = useSetting("accounting_settings", DEFAULTS, { label: "Fiscal year" });
  const allowed = usePermission("settings.manage");
  const [lockedThrough, setLockedThrough] = useState(null);
  useEffect(() => {
    let alive = true;
    getLockedThrough().then((d) => alive && setLockedThrough(d ?? ""));
    return () => {
      alive = false;
    };
  }, []);
  const month = String(normalizeStartMonth(setting.value?.fiscalYearStartMonth));

  return (
    <SectionCard
      title="Accounting"
      description="One fiscal year for the whole company. Statements roll earlier fiscal years into retained earnings; closing the year's last month closes the year."
      action={
        <Button
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={!allowed || !setting.dirty || setting.saving}
          onClick={() => setting.save({ ...setting.value, fiscalYearStartMonth: month })}
        >
          {setting.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fiscal year starts" htmlFor="fy-start" hint="Most property managers use January.">
          <Select value={month} onValueChange={(v) => setting.update((prev) => ({ ...prev, fiscalYearStartMonth: v }))} disabled={!allowed || setting.loading}>
            <SelectTrigger id="fy-start" className="bg-surface-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Period close" hint="Close and reopen months in General Ledger → Close periods.">
          <p className="flex h-9 items-center gap-1.5 text-sm text-text-secondary">
            <Lock className="h-3.5 w-3.5" />
            {lockedThrough === null ? "Loading…" : closedThroughLabel(lockedThrough) || "No periods closed yet"}
          </p>
        </Field>
      </div>
    </SectionCard>
  );
}

export default AccountingYearCard;
