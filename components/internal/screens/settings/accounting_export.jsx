"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, Loader2 } from "lucide-react";

import { LogoLoading } from "@geiger/ui";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { Field } from "@/components/internal/shared/screen_kit";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { useLedgerAccounts } from "@/components/internal/screens/accounting/ledger_dialogs";
import { usePermission } from "@/context/rbac-context";
import { requestAccountingExport, saveTextFile } from "@/lib/accounting/export_api";
import { EXPORT_DEFAULTS, SETTING_KEY, normalizeConfig, overlappingExports } from "@/lib/accounting/export_config";
import { FORMAT_LIST, FORMATS } from "@/lib/accounting/formats";
import { DATE_FORMATS } from "@/lib/accounting/formats/util";
import { CLEARING_KEY, CLEARING_NAME, PROFILES } from "@/lib/accounting/journal";
import { RANGE_PRESETS, presetRange } from "@/lib/reports/periods";
import { getSetting, saveSetting } from "@/lib/supabase/settings";

// Accounting export (INTL-07) — pick the books, format and dates, map accounts to the target tool, then download. Read-only: nothing is posted.

const DEFAULT_DATES = () => ({ preset: "last_month", ...presetRange("last_month") });
const money = (n) => (Number(n) || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
const byNumber = (a, b) => String(a.number || "").localeCompare(String(b.number || ""), undefined, { numeric: true });

function Choice({ id, label, value, onChange, options }) {
  return (
    <Field label={label} htmlFor={id}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="bg-surface-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function AccountingExportDialog({ open, onOpenChange }) {
  const canExport = usePermission("reports.export");
  const accounts = useLedgerAccounts(open);
  const [cfg, setCfg] = useState(null);
  const [dates, setDates] = useState(DEFAULT_DATES);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    getSetting(SETTING_KEY, null).then((stored) => alive && setCfg(normalizeConfig(stored ?? EXPORT_DEFAULTS)));
    return () => {
      alive = false;
    };
  }, [open]);

  const fmt = FORMATS[cfg?.format] || FORMATS.qbo_csv;
  const rows = useMemo(() => [...(accounts?.list || [])].filter((a) => a.status !== "Inactive").sort(byNumber), [accounts]);
  const overlaps = cfg ? overlappingExports(cfg.history, { ...dates, profile: cfg.profile }) : [];
  const set = (field) => (v) => setCfg((prev) => ({ ...prev, [field]: v }));
  const setMap = (id, v) => setCfg((prev) => ({ ...prev, accountMap: { ...prev.accountMap, [id]: v } }));
  const validRange = dates.from && dates.to && dates.from <= dates.to;

  const save = async () => {
    setSaving(true);
    const ok = await saveSetting(SETTING_KEY, normalizeConfig(cfg));
    setSaving(false);
    if (ok) toast.success("Export settings saved.");
    else toast.error("Couldn't save the export settings.");
  };

  const download = async () => {
    setBusy(true);
    const res = await requestAccountingExport({ ...cfg, ...dates, record: true });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't build the export.");
      return;
    }
    setResult(res.summary);
    if (res.history) setCfg((prev) => ({ ...prev, history: res.history }));
    if (!res.summary.entries) {
      toast.info("Nothing to export in that range.");
      return;
    }
    saveTextFile(res.filename, res.content, res.mime);
    toast.success(`Exported ${res.summary.journals} journals.`);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setResult(null); onOpenChange(v); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Export to accounting</DialogTitle>
          <DialogDescription>Journal entries for your accountant, ready to import. Exporting never changes your ledger.</DialogDescription>
        </DialogHeader>
        {!cfg ? (
          <div className="flex justify-center py-10">
            <LogoLoading size={40} aria-label="Loading export settings" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Choice id="ax-profile" label="Books" value={cfg.profile} onChange={set("profile")} options={PROFILES} />
              <Choice id="ax-format" label="Format" value={cfg.format} onChange={set("format")} options={FORMAT_LIST} />
              <Choice id="ax-gran" label="Detail" value={cfg.granularity} onChange={set("granularity")} options={[{ value: "entry", label: "One journal per entry" }, { value: "day", label: "One journal per day per property" }]} />
              <Choice id="ax-class" label="Class / tracking" value={cfg.classBy} onChange={set("classBy")} options={[{ value: "none", label: "None" }, { value: "property", label: "By property" }]} />
              <Choice id="ax-date" label="Date style in the file" value={cfg.dateFormat || fmt.dateFormat} onChange={set("dateFormat")} options={DATE_FORMATS} />
            </div>
            <p className="text-xs text-text-secondary">{PROFILES.find((p) => p.value === cfg.profile)?.hint}</p>

            <div className="grid gap-3 sm:grid-cols-3">
              <Choice
                id="ax-preset"
                label="Period"
                value={RANGE_PRESETS.some((p) => p.value === dates.preset) ? dates.preset : "custom"}
                onChange={(v) => setDates(v === "custom" ? { ...dates, preset: v } : { preset: v, ...presetRange(v) })}
                options={RANGE_PRESETS}
              />
              <Field label="From" htmlFor="ax-from">
                <Input id="ax-from" type="date" value={dates.from} onChange={(e) => setDates({ preset: "custom", from: e.target.value, to: dates.to })} className="bg-surface-card" />
              </Field>
              <Field label="To" htmlFor="ax-to">
                <Input id="ax-to" type="date" value={dates.to} onChange={(e) => setDates({ preset: "custom", from: dates.from, to: e.target.value })} className="bg-surface-card" />
              </Field>
            </div>

            {overlaps.length ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  This range overlaps an earlier export ({overlaps.map((h) => `${h.from} to ${h.to}`).join("; ")}). Importing both would double-count those entries.
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Account mapping</p>
              <p className="text-xs text-text-secondary">{fmt.accountHint}. Leave a row blank to use the default shown.</p>
              <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {!accounts ? (
                  <li className="px-3 py-4 text-xs text-text-tertiary">Loading accounts…</li>
                ) : (
                  <>
                    {rows.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="min-w-0 truncate text-sm text-foreground">{[a.number, a.name].filter(Boolean).join(" · ")}</span>
                        <Input aria-label={`Map ${a.name}`} className="h-8 w-56 bg-surface-card" value={cfg.accountMap[a.id] || ""} placeholder={fmt.defaultName(a)} onChange={(e) => setMap(a.id, e.target.value)} />
                      </li>
                    ))}
                    {cfg.profile === "company" ? (
                      <li className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="min-w-0 truncate text-sm text-foreground">Trust side kept out of the export</span>
                        <Input aria-label="Map trust clearing" className="h-8 w-56 bg-surface-card" value={cfg.accountMap[CLEARING_KEY] || ""} placeholder={CLEARING_NAME} onChange={(e) => setMap(CLEARING_KEY, e.target.value)} />
                      </li>
                    ) : null}
                  </>
                )}
              </ul>
            </div>

            {result ? (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-text-secondary">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <p>
                  {result.entries} entries as {result.journals} journals, {result.lines} lines. Debits {money(result.debit)}, credits {money(result.credit)}
                  {result.balanced ? ", balanced." : ", NOT balanced, do not import."}
                </p>
              </div>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" className="border-border bg-surface-card" disabled={!cfg || saving} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save Settings
          </Button>
          <RoleGate allowed={canExport} reason="Your role can't export reports.">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!cfg || !canExport || !validRange || busy} onClick={download}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download
            </Button>
          </RoleGate>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AccountingExportDialog;
