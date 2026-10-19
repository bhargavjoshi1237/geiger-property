"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { Field, ListLoading, ScreenHeader } from "@/components/internal/shared/screen_kit";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui/select";
import { getSetting, saveSetting } from "@/lib/supabase/settings";
import { usePermission } from "@/context/rbac-context";

// Shared plumbing for the Settings pages: a load/edit/save hook over one
// settings key, the page frame (header + Save + loading), and small form fields.

// Overlay a stored value onto the defaults (objects merge shallowly; arrays replace).
function withDefaults(defaults, stored) {
  if (stored === null || stored === undefined) return defaults;
  if (Array.isArray(defaults)) return Array.isArray(stored) ? stored : defaults;
  if (defaults && typeof defaults === "object" && typeof stored === "object") {
    return { ...defaults, ...stored };
  }
  return stored;
}

// Load `key` on mount, edit locally, persist with save(). `defaults` must be a
// stable (module-level) value; `seedDirty` marks unsaved defaults as needing a save.
export function useSetting(key, defaults, { label = "Settings", seedDirty = false } = {}) {
  const [value, setValue] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    let alive = true;
    getSetting(key, defaults).then((stored) => {
      if (!alive) return;
      setUnavailable(stored === null);
      setValue(withDefaults(defaults, stored));
      // getSetting hands back `defaults` itself when the key was never saved.
      setSeeded(stored === defaults);
      setDirty(seedDirty && stored === defaults);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [key, defaults, seedDirty]);

  // Replace the whole value (or pass an updater fn) and mark unsaved.
  const update = (next) => {
    setValue((prev) => (typeof next === "function" ? next(prev) : next));
    setDirty(true);
  };
  // Curried single-field updater for object values.
  const set = (field) => (v) => update((prev) => ({ ...prev, [field]: v }));

  const save = async (override) => {
    const toSave = override === undefined ? value : override;
    setSaving(true);
    const ok = await saveSetting(key, toSave);
    setSaving(false);
    if (ok) {
      setDirty(false);
      setSeeded(false);
      setUnavailable(false);
      toast.success(`${label} saved.`);
    } else {
      toast.error(`Couldn't save ${label.toLowerCase()}.`);
    }
    return ok;
  };

  return { value, update, set, loading, unavailable, seeded, saving, dirty, save };
}

// Page frame: header with a Save button, an in-place loader while the value loads; same width as the other workspace screens.
// Saving needs `permission` (advisory RBAC; settings.manage by default).
export function SettingsPage({ title, description, setting, actions, children, permission = "settings.manage" }) {
  const { loading, saving, dirty, save, unavailable } = setting;
  const allowed = usePermission(permission);
  return (
    <MainScreenWrapper>
      <ScreenHeader
        title={title}
        description={description}
        actions={
          loading ? null : (
            <div className="flex flex-wrap items-center gap-2">
              {actions}
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={saving || !dirty || !allowed}
                title={allowed ? undefined : "Your role can't change these settings"}
                onClick={() => save()}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Changes
              </Button>
            </div>
          )
        }
      />
      {loading ? (
        <ListLoading label="Loading settings" />
      ) : (
        <>
          {!allowed ? (
            <p className="rounded-lg border border-border bg-surface-card px-4 py-3 text-sm text-text-secondary">
              View only — your role can&apos;t save changes here.
            </p>
          ) : null}
          {unavailable ? (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              Saved settings couldn&apos;t be loaded — showing defaults.
            </p>
          ) : null}
          {children}
        </>
      )}
    </MainScreenWrapper>
  );
}

// Text/number/email input bound to obj[field].
export function TextField({ id, label, hint, value, onChange, type = "text", placeholder, className }) {
  return (
    <Field label={label} hint={hint} htmlFor={id} className={className}>
      <Input
        id={id}
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

// shadcn Select bound to a value; options [{ value, label }].
export function SelectField({ id, label, hint, value, onChange, options, placeholder, className }) {
  return (
    <Field label={label} hint={hint} htmlFor={id} className={className}>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full bg-surface-card">
          <SelectValue placeholder={placeholder || "Select…"} />
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

// Compact select used as a SettingRow control.
export function InlineSelect({ value, onChange, options, className = "w-40" }) {
  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger className={`${className} bg-surface-card`}>
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
  );
}
