"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { ListLoading, SectionCard } from "@/components/internal/shared/screen_kit";
import { useRbac } from "@/context/rbac-context";
import { getSetting } from "@/lib/supabase/settings";
import { getProperty } from "@/lib/supabase/properties";
import { glAccountIdOptions } from "@/lib/supabase/gl_accounts";
import { POLICY_GROUPS, overridesOf, policiesFor, resolvePolicies } from "@/lib/policies";
import { withLegacyScreening } from "@/lib/screening/criteria_policy";
import { FieldsForm } from "../fields_form";

// Policy overrides for a property or lease: each row's effective value and source; Override copies it into metadata.policyOverrides, Reset drops it.
// `permission` gates the edits; the screening group's company layer falls back to the old `screening_criteria` setting (RISK-04).

const SOURCE_LABEL = { company: "Company default", property: "Property", lease: "This lease" };

// A gl_account policy (CORE-19) is a picker over the chart's accounts of its types; one stable loader per type set, ids only.
const accountLoaders = new Map();
function accountLoader(types) {
  const key = types.join(",");
  if (!accountLoaders.has(key)) accountLoaders.set(key, async () => (await glAccountIdOptions({ types })).map((o) => ({ value: o.value, label: o.label })));
  return accountLoaders.get(key);
}

// A policy as a FieldsForm field.
export const policyField = (p) => (p.type === "gl_account" ? { ...p, type: "relation", load: accountLoader(p.accountTypes || ["Income"]) } : p);

export function makePolicySection({ scope, groups, permission }) {
  const screening = Boolean(groups?.includes("screening"));
  function PolicySection({ item, onCommitMeta }) {
    const [layers, setLayers] = useState(null);
    // In-progress keystrokes for overridden text/number inputs (committed on blur).
    const [typing, setTyping] = useState({});
    const { can } = useRbac();
    const allowed = !permission || can(permission);

    // Load the company layer (and the parent property for a lease).
    useEffect(() => {
      let alive = true;
      Promise.all([
        getSetting("fees_policies", {}),
        scope === "lease" && item.propertyId ? getProperty(item.propertyId) : null,
        screening ? getSetting("screening_criteria", {}) : null,
      ]).then(([company, property, legacy]) => {
        if (alive) setLayers({ company: screening ? withLegacyScreening(company, legacy) : company || {}, property });
      });
      return () => {
        alive = false;
      };
    }, [item.propertyId]);

    if (!layers) return <ListLoading label="Loading policies" className="py-10" />;

    const overrides = overridesOf(item);
    const resolved = resolvePolicies({
      company: layers.company,
      property: scope === "property" ? item : layers.property,
      lease: scope === "lease" ? item : null,
    });
    const values = {
      ...Object.fromEntries(Object.entries(resolved).map(([k, v]) => [k, v.value])),
      ...typing,
    };
    const inheritFrom = scope === "lease" && layers.property ? "property" : "company";

    const setOverride = (key, value) => {
      setTyping((t) => {
        const next = { ...t };
        delete next[key];
        return next;
      });
      onCommitMeta({ policyOverrides: { ...overrides, [key]: value } });
    };
    const reset = (key) => {
      const next = { ...overrides };
      delete next[key];
      onCommitMeta({ policyOverrides: next });
    };

    const shownGroups = POLICY_GROUPS.filter((g) => !groups || groups.includes(g.key))
      .map((g) => ({ ...g, policies: policiesFor(scope, g.key) }))
      .filter((g) => g.policies.length);

    return (
      <div className="space-y-5">
        {shownGroups.map((g) => (
          <SectionCard
            key={g.key}
            title={g.label}
            description={allowed ? g.description : `${g.description} Your role can't change these.`}
            bodyPadding={false}
          >
            <div className="divide-y divide-border">
              {g.policies
                .filter((p) => (p.showIf ? p.showIf(values) : true))
                .map((p) => {
                  const own = p.key in overrides;
                  const source = resolved[p.key].source;
                  const wide = p.type === "textarea";
                  return (
                    <div key={p.key} className={wide ? "grid gap-3 px-5 py-4" : "grid gap-3 px-5 py-4 sm:grid-cols-[1fr_minmax(0,280px)] sm:items-center"}>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{p.label}</p>
                          <Badge variant={own ? "info" : "outline"}>
                            {own ? "Overridden" : `Inherited · ${SOURCE_LABEL[source] || SOURCE_LABEL[inheritFrom]}`}
                          </Badge>
                        </div>
                        {p.hint ? <p className="mt-0.5 text-xs text-text-secondary">{p.hint}</p> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <FieldsForm
                            item={values}
                            fields={[{ ...policyField(p), label: "", hint: "", showIf: undefined, disabled: !own || !allowed }]}
                            onPatch={(partial) => setTyping((t) => ({ ...t, ...partial }))}
                            onCommit={(partial) => setOverride(p.key, partial[p.key])}
                            flat
                            columns={1}
                          />
                        </div>
                        {own ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-text-secondary hover:bg-surface-hover hover:text-foreground"
                            onClick={() => reset(p.key)}
                            disabled={!allowed}
                            aria-label={`Reset ${p.label}`}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-border bg-surface-card hover:bg-surface-hover"
                            onClick={() => setOverride(p.key, values[p.key])}
                            disabled={!allowed}
                          >
                            Override
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </SectionCard>
        ))}
      </div>
    );
  }
  return PolicySection;
}
