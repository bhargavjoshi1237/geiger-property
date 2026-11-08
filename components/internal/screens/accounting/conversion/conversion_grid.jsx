"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardPaste, Download, Plus, Trash2 } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { Checkbox } from "@geiger/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { Input } from "@geiger/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { Textarea } from "@geiger/ui/textarea";
import { SectionCard } from "@/components/internal/shared/screen_kit";
import { cn } from "@/lib/utils";
import { CONVERSION_CLEARING_KEY, accountLabel, round2 } from "@/lib/ledger/postings";
import { KIND_LABELS, defaultBankFor, linesFromPaste, parseMoney, templateCsv } from "@/lib/ledger/conversion";
import { blankLine, gridColumns } from "./columns";
import { money } from "../shared";

// Editable grid for one balance type in the opening-balances wizard: inline cells, row problems, paste from a spreadsheet and a CSV template.

const NONE = "__none__";
const SUBLEDGER = ["receivable", "subsidy_receivable", "payable", "deposits", "prepaid"];
const CELL = "h-8 bg-surface-card text-sm";

// A text or money input that commits on blur / Enter, so typing doesn't revalidate the whole batch per keystroke.
function CommitInput({ value, onCommit, money: isMoney = false, disabled, placeholder, className }) {
  const shown = value === "" || value === null || value === undefined ? "" : String(value);
  const [text, setText] = useState(shown);
  const [seen, setSeen] = useState(shown);
  if (shown !== seen) {
    setSeen(shown);
    setText(shown);
  }
  const commit = () => {
    if (!isMoney) {
      if (text !== shown) onCommit(text);
      return;
    }
    const n = text.trim() === "" ? "" : parseMoney(text);
    if (n !== "" && !Number.isFinite(n)) {
      setText(shown);
      toast.error("That isn't an amount.");
      return;
    }
    if (n !== value) onCommit(n);
  };
  return (
    <Input
      value={text}
      inputMode={isMoney ? "decimal" : undefined}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={cn(CELL, isMoney && "text-right tabular-nums", className)}
    />
  );
}

function SelectCell({ value, options, onChange, placeholder = "Select…", disabled }) {
  return (
    <Select value={value || NONE} disabled={disabled} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger className={cn(CELL, "w-full min-w-0")}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>
          <span className="text-text-secondary">{placeholder}</span>
        </SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Select options per lookup, built once per grid.
function useOptions(lookups) {
  return useMemo(() => {
    const props = new Map((lookups.properties || []).map((p) => [p.id, p.name]));
    const byName = (a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true });
    const accounts = lookups.accounts?.list || [];
    return {
      lease: (lookups.leases || [])
        .map((l) => ({ value: l.id, label: [l.unit || l.name, l.tenantName, props.get(l.propertyId)].filter(Boolean).join(" · ") }))
        .sort(byName),
      owner: (lookups.owners || []).map((o) => ({ value: o.id, label: o.name || "Owner" })).sort(byName),
      vendor: (lookups.vendors || []).map((v) => ({ value: v.id, label: v.name || "Vendor" })).sort(byName),
      property: (lookups.properties || []).map((p) => ({ value: p.id, label: p.name || "Property" })).sort(byName),
      bank: (lookups.banks || []).map((b) => ({ value: b.id, label: `${b.name}${b.accountType ? ` · ${b.accountType}` : ""}` })),
      income: accounts.filter((a) => a.accountType === "Income" && a.status !== "Inactive").map((a) => ({ value: a.id, label: accountLabel(a), number: a.number })),
      gl: accounts
        .filter((a) => !SUBLEDGER.includes(a.subtype) && a.systemKey !== CONVERSION_CLEARING_KEY && a.status !== "Inactive")
        .map((a) => ({ value: a.id, label: accountLabel(a), number: a.number }))
        .sort((x, y) => String(x.number).localeCompare(String(y.number), undefined, { numeric: true })),
    };
  }, [lookups]);
}

function Cell({ col, line, options, lookups, defaultBank, disabled, onPatch }) {
  const meta = line.metadata || {};
  const amount = Number(line.amount);
  switch (col.type) {
    case "lease":
      return (
        <SelectCell
          value={line.leaseId}
          options={options.lease}
          placeholder={meta.unmatched?.lease ? `Pick (pasted: ${meta.unmatched.lease})` : "Pick a lease"}
          disabled={disabled}
          onChange={(id) => {
            const l = (lookups.leases || []).find((x) => x.id === id);
            onPatch({ leaseId: id, tenantId: l?.tenantId || "", unitId: l?.unitId || "", propertyId: l?.propertyId || "" });
          }}
        />
      );
    case "owner":
    case "vendor":
    case "property":
      return <SelectCell value={line[col.key]} options={options[col.type]} placeholder={meta.unmatched?.[col.type] ? `Pick (pasted: ${meta.unmatched[col.type]})` : `Pick ${col.type === "owner" ? "an owner" : `a ${col.type}`}`} disabled={disabled} onChange={(v) => onPatch({ [col.key]: v })} />;
    case "bank":
      return <SelectCell value={line.bankAccountId} options={options.bank} placeholder={col.optional ? "None" : defaultBank ? `Default · ${defaultBank.name}` : "Pick a bank"} disabled={disabled} onChange={(v) => onPatch({ bankAccountId: v })} />;
    case "account":
      return <SelectCell value={line.glAccountId} options={options[col.accounts]} placeholder={meta.unmatched?.account ? `Pick (pasted: ${meta.unmatched.account})` : col.placeholder || "Pick an account"} disabled={disabled} onChange={(v) => onPatch({ glAccountId: v })} />;
    case "select":
      return <SelectCell value={col.meta ? meta[col.key] : line[col.key]} options={col.options} placeholder="Pick…" disabled={disabled} onChange={(v) => onPatch(col.meta ? { metadata: { ...meta, [col.key]: v } } : { [col.key]: v })} />;
    case "date":
      return <Input type="date" value={line.itemDate || ""} disabled={disabled} onChange={(e) => onPatch({ itemDate: e.target.value })} className={CELL} />;
    case "meta-date":
      return <Input type="date" value={meta[col.key] || ""} disabled={disabled} onChange={(e) => onPatch({ metadata: { ...meta, [col.key]: e.target.value } })} className={CELL} />;
    case "money":
    case "signed":
      return <CommitInput money value={line.amount} disabled={disabled} placeholder="0.00" onCommit={(v) => onPatch({ amount: v })} />;
    case "debit":
      return <CommitInput money value={amount > 0 ? amount : ""} disabled={disabled} placeholder="—" onCommit={(v) => onPatch({ amount: v === "" ? "" : Math.abs(Number(v)) })} />;
    case "credit":
      return <CommitInput money value={amount < 0 ? -amount : ""} disabled={disabled} placeholder="—" onCommit={(v) => onPatch({ amount: v === "" ? "" : -Math.abs(Number(v)) })} />;
    case "meta-money":
      return <CommitInput money value={meta[col.key] ?? ""} disabled={disabled} placeholder="0.00" onCommit={(v) => onPatch({ metadata: { ...meta, [col.key]: v === "" ? 0 : v } })} />;
    case "bool":
      return (
        <div className="flex h-8 items-center justify-center">
          <Checkbox checked={Boolean(meta[col.key])} disabled={disabled} onCheckedChange={(v) => onPatch({ metadata: { ...meta, [col.key]: Boolean(v) } })} aria-label={col.label} />
        </div>
      );
    default:
      return <CommitInput value={line[col.key] || ""} disabled={disabled} onCommit={(v) => onPatch({ [col.key]: v })} />;
  }
}

function PasteDialog({ open, kind, lookups, batchId, onClose, onAdd }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => (text.trim() ? linesFromPaste(text, kind, { ...lookups, accounts: lookups.accounts?.list || [] }, { batchId }) : null), [text, kind, lookups, batchId]);
  const close = () => {
    setText("");
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Paste {KIND_LABELS[kind]?.toLowerCase()}s from a spreadsheet</DialogTitle>
          <DialogDescription>Copy the rows (with their header row) from your old system&apos;s export or the template and paste them here. Names are matched to Geiger records; anything unmatched stays on the row for you to pick.</DialogDescription>
        </DialogHeader>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder={templateCsv(kind).split("\n")[0].replace(/,/g, "\t")} className="font-mono text-xs" aria-label="Pasted rows" />
        {parsed ? (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">
              {parsed.lines.length} row{parsed.lines.length === 1 ? "" : "s"} read{parsed.issues.length ? `, ${parsed.issues.length} to check` : ""}.
            </p>
            {parsed.issues.length ? (
              <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-amber-700 dark:text-amber-400">
                {parsed.issues.slice(0, 20).map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!parsed?.lines.length}
            onClick={() => {
              onAdd(parsed.lines);
              close();
            }}
          >
            Add {parsed?.lines.length || ""} rows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function downloadTemplate(kind) {
  const blob = new Blob([templateCsv(kind)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `opening-${kind.replace(/_/g, "-")}s.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// lines: this grid's lines; problems: Map lineId → { errors, warnings }.
export function ConversionGrid({ kind, title, description, lines, lookups, problems, readOnly, batchId, ytd, depositHeldIn, onPatch, onAdd, onRemove }) {
  const [pasting, setPasting] = useState(false);
  const cols = gridColumns(kind, { ytd });
  const options = useOptions(lookups);
  const defaultBank = useMemo(() => defaultBankFor(kind, lookups.banks, { depositHeldIn }), [kind, lookups.banks, depositHeldIn]);
  const total = round2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const debits = round2(lines.reduce((s, l) => s + Math.max(0, Number(l.amount) || 0), 0));
  const summary = kind === "gl_balance" ? `${lines.length} lines · Dr ${money(debits)} · Cr ${money(round2(debits - total))}` : `${lines.length} line${lines.length === 1 ? "" : "s"} · ${money(total)}`;

  return (
    <SectionCard
      title={title}
      description={description ? `${description} ${summary}.` : summary}
      bodyPadding={false}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => downloadTemplate(kind)}>
            <Download className="h-3.5 w-3.5" /> Template
          </Button>
          {!readOnly ? (
            <>
              <Button variant="outline" size="sm" className="border-border bg-surface-card" onClick={() => setPasting(true)}>
                <ClipboardPaste className="h-3.5 w-3.5" /> Paste from spreadsheet
              </Button>
              <Button variant="outline" size="sm" className="border-border bg-surface-card" onClick={() => onAdd([blankLine(kind, batchId)])}>
                <Plus className="h-3.5 w-3.5" /> Add row
              </Button>
            </>
          ) : null}
        </div>
      }
    >
      {lines.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-text-secondary">{readOnly ? "None in this batch." : "Nothing here yet — add rows or paste them from your old system's report."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-subtle text-left text-xs font-medium text-text-secondary">
                {cols.map((c) => (
                  <th key={c.key} className={cn("px-2 py-2 font-medium", c.width, ["money", "signed", "debit", "credit", "meta-money"].includes(c.type) && "text-right")}>
                    {c.label}
                  </th>
                ))}
                <th className="w-10 px-2 py-2" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const p = problems.get(line.id);
                const locked = readOnly || Boolean(line.postedEntryId);
                return [
                  <tr key={line.id} className={cn("border-b border-border/60 align-top", p?.errors.length && "bg-red-500/5")}>
                    {cols.map((c) => (
                      <td key={c.key} className={cn("px-2 py-1.5", c.width)}>
                        <Cell col={c} line={line} options={options} lookups={lookups} defaultBank={defaultBank} disabled={locked} onPatch={(patch) => onPatch(line.id, patch)} />
                      </td>
                    ))}
                    <td className="px-2 py-1.5">
                      {!locked ? (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-text-secondary hover:text-red-600 dark:hover:text-red-400" aria-label="Remove row" onClick={() => onRemove(line.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>,
                  p && (p.errors.length || p.warnings.length) ? (
                    <tr key={`${line.id}-msg`} className="border-b border-border/60">
                      <td colSpan={cols.length + 1} className="px-3 pb-2 pt-0 text-xs">
                        {p.errors.map((m) => (
                          <p key={m} className="text-red-600 dark:text-red-400">
                            {m}
                          </p>
                        ))}
                        {p.warnings.map((m) => (
                          <p key={m} className="text-amber-700 dark:text-amber-400">
                            {m}
                          </p>
                        ))}
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
      <PasteDialog open={pasting} kind={kind} lookups={lookups} batchId={batchId} onClose={() => setPasting(false)} onAdd={onAdd} />
    </SectionCard>
  );
}

export default ConversionGrid;
