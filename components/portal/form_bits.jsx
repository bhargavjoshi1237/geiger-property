"use client";

import React from "react";

import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { Switch } from "@geiger/ui/switch";

// Small form controls the portal dialogs share.

const asOptions = (options) => options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));

export function SelectField({ id, value, onChange, options, placeholder = "Select…" }) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full bg-surface-card">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {asOptions(options).map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Multi-select pill chips.
export function ChipGroup({ value = [], onChange, options }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="flex flex-wrap gap-2">
      {asOptions(options).map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(o.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              on ? "border-border-strong bg-surface-active text-foreground" : "border-border bg-surface-card text-text-secondary hover:bg-surface-hover",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function SwitchRow({ label, hint, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-card px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        {hint ? <span className="block text-xs text-text-tertiary">{hint}</span> : null}
      </span>
      <Switch checked={Boolean(checked)} onCheckedChange={onChange} />
    </label>
  );
}

// Segmented filter (Open / Closed / All …).
export function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex self-start rounded-lg border border-border bg-surface-card p-0.5">
      {asOptions(options).map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            value === o.value ? "bg-surface-active text-foreground" : "text-text-secondary hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
