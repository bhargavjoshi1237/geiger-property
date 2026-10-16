"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListLoading, SectionCard } from "@/components/internal/shared/screen_kit";
import { getSetting } from "@/lib/supabase/settings";
import { getProperty } from "@/lib/supabase/properties";
import { POLICY_GROUPS, overridesOf, policiesFor, resolvePolicies } from "@/lib/policies";
import { FieldsForm } from "../fields_form";

// Policy overrides for a property or lease. Each row shows the effective value
// with where it comes from (company → property → lease); "Override" copies the
// inherited value into metadata.policyOverrides, "Reset" drops it again.

const SOURCE_LABEL = { company: "Company default", property: "Property", lease: "This lease" };

export function makePolicySection({ scope, groups }) {
  function PolicySection({ item, onCommitMeta }) {
    const [layers, setLayers] = useState(null);
    // In-progress keystrokes for overridden text/number inputs (committed on blur).
    const [typing, setTyping] = useState({});

    // Load the company layer (and the parent property for a lease).
    useEffect(() => {
      let alive = true;
      Promise.all([
        getSetting("fees_policies", {}),
        scope === "lease" && item.propertyId ? getProperty(item.propertyId) : null,
      ]).then(([company, property]) => {
        if (alive) setLayers({ company: company || {}, property });
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
          <SectionCard key={g.key} title={g.label} description={g.description} bodyPadding={false}>
            <div className="divide-y divide-border">
              {g.policies
                .filter((p) => (p.showIf ? p.showIf(values) : true))
                .map((p) => {
                  const own = p.key in overrides;
                  const source = resolved[p.key].source;
                  return (
                    <div key={p.key} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_minmax(0,280px)] sm:items-center">
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
                            fields={[{ ...p, label: "", hint: "", showIf: undefined, disabled: !own }]}
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
