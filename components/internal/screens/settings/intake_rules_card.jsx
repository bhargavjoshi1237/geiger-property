"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Textarea } from "@geiger/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { Field, SectionCard } from "@/components/internal/shared/screen_kit";
import { usePermission } from "@/context/rbac-context";
import { useProject } from "@/context/project-context";
import {
  INTAKE_MAILBOXES,
  INTAKE_RULES_KEY,
  INTAKE_RULE_DEFAULTS,
  classifyMaintenanceText,
  intakeAddress,
  intakeDomain,
} from "@/lib/orchestration/intake_rules";
import { useSetting } from "./settings_kit";

// Email intake (ORCH-10): the project's inbound addresses, the keyword rules that triage maintenance email, and whether
// known senders' requests are filed without review. Saves the `intake_rules` settings key on its own.

const AUTONOMY_OPTIONS = [
  { value: "suggest", label: "Ask first", hint: "Every email is filed as a draft and waits in the Review Queue for a person to confirm." },
  { value: "auto", label: "Create automatically for known senders", hint: "Requests from a known tenant, owner or vendor are filed without review. Unknown senders still wait." },
];

const splitWords = (text) => [...new Set(String(text || "").split(/[,\n]/).map((w) => w.trim().toLowerCase()).filter(Boolean))];

// Comma-separated keyword list that edits as text and commits the parsed list on blur.
function KeywordInput({ id, value, onChange, multiline = false, placeholder, disabled }) {
  const joined = (value || []).join(", ");
  const [text, setText] = useState(joined);
  const [seed, setSeed] = useState(joined);
  if (seed !== joined) {
    setSeed(joined);
    setText(joined);
  }
  const props = {
    id,
    value: text,
    placeholder,
    disabled,
    onChange: (e) => setText(e.target.value),
    onBlur: () => onChange(splitWords(text)),
  };
  return multiline ? <Textarea className="min-h-[88px]" {...props} /> : <Input {...props} />;
}

function AddressRow({ mailbox, address }) {
  const box = INTAKE_MAILBOXES[mailbox];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Address copied.");
    } catch {
      toast.error("Couldn't copy the address.");
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-card p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{box.label}</p>
        <p className="text-xs text-text-secondary">{box.description}</p>
        <p className="mt-1 truncate font-mono text-xs text-foreground">{address}</p>
      </div>
      <Button variant="outline" size="sm" className="shrink-0 border-border bg-surface-card hover:bg-surface-hover" onClick={copy}>
        <Copy className="h-3.5 w-3.5" /> Copy
      </Button>
    </div>
  );
}

export function IntakeRulesCard() {
  const setting = useSetting(INTAKE_RULES_KEY, INTAKE_RULE_DEFAULTS, { label: "Intake rules" });
  const { value, set, update, loading, saving, dirty, save } = setting;
  const allowed = usePermission("automations.manage");
  const { projectId } = useProject();
  const [sample, setSample] = useState("");

  const domain = intakeDomain();
  const categories = Array.isArray(value.categories) ? value.categories : [];
  const preview = useMemo(() => (sample.trim() ? classifyMaintenanceText(sample, value) : null), [sample, value]);
  const autonomy = AUTONOMY_OPTIONS.find((o) => o.value === value.autonomy) || AUTONOMY_OPTIONS[0];

  const patchCategory = (i, patch) => update((prev) => ({ ...prev, categories: categories.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const removeCategory = (i) => update((prev) => ({ ...prev, categories: categories.filter((_, j) => j !== i) }));
  const addCategory = () => update((prev) => ({ ...prev, categories: [...categories, { category: "", keywords: [] }] }));

  const saveRules = () =>
    save({
      ...value,
      categories: categories.filter((c) => String(c.category || "").trim()).map((c) => ({ category: c.category.trim(), keywords: c.keywords || [] })),
    });

  return (
    <SectionCard
      title="Email intake"
      description="Mail sent to these addresses is matched to the sender and filed as a maintenance request or a draft bill."
      action={
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={loading || saving || !dirty || !allowed}
          title={allowed ? undefined : "Your role can't change automation settings"}
          onClick={saveRules}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save Intake Rules
        </Button>
      }
    >
      {loading ? (
        <div className="flex justify-center py-10">
          <LogoLoading size={40} aria-label="Loading intake rules" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Inbound addresses</p>
            {domain && projectId ? (
              Object.keys(INTAKE_MAILBOXES).map((m) => <AddressRow key={m} mailbox={m} address={intakeAddress(m, projectId, domain)} />)
            ) : (
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                Inbound email isn&apos;t configured. Set NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN and point your mail provider&apos;s inbound webhook at
                /api/messages/inbound with the INBOUND_EMAIL_SECRET bearer token.
              </p>
            )}
          </div>

          <Field label="When an email arrives" htmlFor="intake-autonomy" hint={`${autonomy.hint} Bills always wait for a person, and nothing posts to the ledger from email.`}>
            <Select value={autonomy.value} onValueChange={set("autonomy")} disabled={!allowed}>
              <SelectTrigger id="intake-autonomy" className="w-full bg-surface-card sm:w-96">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTONOMY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Emergency words" htmlFor="intake-emergency" hint="Any of these makes the request Urgent. Separate words with commas.">
            <KeywordInput
              id="intake-emergency"
              multiline
              disabled={!allowed}
              value={value.emergencyKeywords}
              onChange={set("emergencyKeywords")}
              placeholder="flood, gas, no heat…"
            />
          </Field>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-foreground">Categories</p>
                <p className="text-xs text-text-secondary">The category with the most matching words wins; anything else is filed under the default.</p>
              </div>
              <Button variant="outline" size="sm" className="border-border bg-surface-card hover:bg-surface-hover" disabled={!allowed} onClick={addCategory}>
                <Plus className="h-3.5 w-3.5" /> Add Category
              </Button>
            </div>
            {categories.map((c, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-center">
                <Input
                  value={c.category || ""}
                  disabled={!allowed}
                  placeholder="Category"
                  aria-label="Category"
                  onChange={(e) => patchCategory(i, { category: e.target.value })}
                />
                <KeywordInput
                  id={`intake-cat-${i}`}
                  disabled={!allowed}
                  value={c.keywords}
                  onChange={(keywords) => patchCategory(i, { keywords })}
                  placeholder="Keywords, separated by commas"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={!allowed}
                  className="text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                  onClick={() => removeCategory(i)}
                  aria-label="Remove category"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Field label="Default category" htmlFor="intake-default" className="sm:w-64">
              <Input id="intake-default" value={value.defaultCategory || ""} disabled={!allowed} onChange={(e) => set("defaultCategory")(e.target.value)} />
            </Field>
          </div>

          <Field label="Try a message" htmlFor="intake-sample" hint="See how the rules would file an email. Nothing is saved.">
            <Input id="intake-sample" value={sample} onChange={(e) => setSample(e.target.value)} placeholder="e.g. Water is leaking under the kitchen sink" />
          </Field>
          {preview ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
              Filed as
              <Badge variant={preview.emergency ? "danger" : "neutral"}>{preview.priority}</Badge>
              <Badge variant="outline">{preview.category}</Badge>
              {preview.matched.emergency.length || preview.matched.category.length ? (
                <span className="text-xs text-text-tertiary">matched: {[...new Set([...preview.matched.emergency, ...preview.matched.category])].join(", ")}</span>
              ) : (
                <span className="text-xs text-text-tertiary">no keywords matched</span>
              )}
            </div>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}

export default IntakeRulesCard;
