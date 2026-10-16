"use client";

import { useEffect, useState } from "react";
import { Braces } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { messageTemplatesLayer } from "@/lib/supabase/message_templates";
import {
  leaseOptions,
  ownerOptions,
  prospectOptions,
  tenantOptions,
  vendorOptions,
} from "@/lib/supabase/options";
import { MERGE_FIELD_GROUPS } from "./shared";

// Small shared controls for the Communications screens: record / template
// pickers, the merge-field picker, and cursor-aware token insertion.

export const RECORD_LOADERS = {
  tenant: tenantOptions,
  owner: ownerOptions,
  vendor: vendorOptions,
  prospect: prospectOptions,
  lease: leaseOptions,
};

// Options for one record type, reloaded when the type changes.
export function useRecordOptions(type) {
  const [state, setState] = useState({ type: null, options: [] });
  useEffect(() => {
    const load = RECORD_LOADERS[type];
    if (!load) return;
    let alive = true;
    load().then((options) => alive && setState({ type, options: options ?? [] }));
    return () => {
      alive = false;
    };
  }, [type]);
  return { options: state.type === type ? state.options : [], loading: Boolean(type) && state.type !== type };
}

export function RecordPicker({ type, value, onChange, placeholder, id, className = "w-full" }) {
  const { options, loading } = useRecordOptions(type);
  return (
    <Select value={value || ""} onValueChange={onChange} disabled={!type || loading}>
      <SelectTrigger id={id} className={`${className} bg-surface-card`}>
        <SelectValue placeholder={loading ? "Loading…" : options.length ? placeholder || "Select a record" : "No records yet"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Active message templates (optionally narrowed to a channel).
export function useTemplates() {
  const [templates, setTemplates] = useState(null);
  useEffect(() => {
    let alive = true;
    messageTemplatesLayer.list().then((rows) => {
      if (alive) setTemplates((rows ?? []).filter((t) => t.status !== "Archived"));
    });
    return () => {
      alive = false;
    };
  }, []);
  return templates;
}

export function TemplatePicker({ templates, value, onChange, channel, id }) {
  const list = (templates || []).filter(
    (t) => !channel || !t.channel || String(t.channel).toLowerCase() === String(channel).toLowerCase(),
  );
  return (
    <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
      <SelectTrigger id={id} className="w-full bg-surface-card">
        <SelectValue placeholder="No template" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No template — write it here</SelectItem>
        {list.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name || "Untitled template"}
            {t.category ? ` · ${t.category}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Grouped merge-field popover; `onInsert(token)` receives "{{token}}".
export function MergeFieldPicker({ onInsert, label = "Insert field", size = "sm" }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size={size} className="border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground">
          <Braces className="h-3.5 w-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 border-border bg-surface-subtle p-0">
        <div className="max-h-80 overflow-y-auto py-1">
          {MERGE_FIELD_GROUPS.map((g) => (
            <div key={g.key} className="py-1">
              <p className="px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{g.label}</p>
              {g.fields.map((f) => (
                <button
                  key={f.token}
                  type="button"
                  onClick={() => {
                    onInsert(`{{${f.token}}}`);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-surface-hover"
                >
                  <span className="truncate text-foreground">{f.label}</span>
                  <code className="shrink-0 font-mono text-[11px] text-text-tertiary">{`{{${f.token}}}`}</code>
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Insert text at a textarea/input's cursor; returns the new value.
export function insertAtCursor(el, current, text) {
  const value = String(current || "");
  if (!el || typeof el.selectionStart !== "number") return `${value}${text}`;
  const start = el.selectionStart;
  const end = el.selectionEnd ?? start;
  const next = value.slice(0, start) + text + value.slice(end);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + text.length, start + text.length);
  });
  return next;
}
