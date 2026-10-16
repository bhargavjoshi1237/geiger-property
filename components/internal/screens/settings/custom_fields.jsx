"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Tags, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, SectionCard } from "@/components/internal/shared/screen_kit";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import { InlineSelect, SettingsPage, useSetting } from "./settings_kit";
import {
  CUSTOM_FIELDS_DEFAULTS,
  CUSTOM_FIELD_ENTITIES,
  CUSTOM_FIELD_TYPES,
} from "./shared";

// Custom Fields — extra fields per entity (settings key `custom_fields` =
// { properties, units, tenants, leases: [{ id, label, type }] }). Editors render
// them through makeCustomFieldsSection; values live in each record's metadata.

export function CustomFieldsScreen() {
  const base = useSetting("custom_fields", CUSTOM_FIELDS_DEFAULTS, { label: "Custom fields" });
  const { value, update } = base;
  // Block saving a field whose label was cleared.
  const setting = {
    ...base,
    save: () => {
      const blank = CUSTOM_FIELD_ENTITIES.some((e) =>
        (value[e.value] || []).some((d) => !String(d.label || "").trim()),
      );
      if (blank) {
        toast.error("Every custom field needs a label.");
        return false;
      }
      return base.save();
    },
  };
  const [entity, setEntity] = useState(CUSTOM_FIELD_ENTITIES[0].value);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");

  const defs = Array.isArray(value[entity]) ? value[entity] : [];
  const entityLabel = CUSTOM_FIELD_ENTITIES.find((e) => e.value === entity)?.label || entity;
  const setDefs = (next) => update((prev) => ({ ...prev, [entity]: next }));
  const patchDef = (id, patch) => setDefs(defs.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const add = () => {
    const v = label.trim();
    if (!v) {
      toast.error("Give the field a label.");
      return;
    }
    if (defs.some((d) => d.label.trim().toLowerCase() === v.toLowerCase())) {
      toast.error(`${entityLabel} already has a "${v}" field.`);
      return;
    }
    setDefs([...defs, { id: crypto.randomUUID(), label: v, type }]);
    setLabel("");
    setType("text");
  };

  const tabs = CUSTOM_FIELD_ENTITIES.map((e) => {
    const n = Array.isArray(value[e.value]) ? value[e.value].length : 0;
    return { value: e.value, label: n ? `${e.label} (${n})` : e.label };
  });

  return (
    <SettingsPage
      title="Custom Fields"
      description="Track details specific to your business on properties, units, tenants, and leases."
      setting={setting}
    >
      <SegmentedTabs tabs={tabs} value={entity} onChange={setEntity} />

      <SectionCard
        title={`${entityLabel} fields`}
        description={`Shown in the Custom Fields tab of every ${entityLabel.toLowerCase().replace(/s$/, "")} editor.`}
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="e.g. Parking spot"
              className="bg-surface-card"
              aria-label="New field label"
            />
            <InlineSelect value={type} onChange={setType} options={CUSTOM_FIELD_TYPES} className="w-full sm:w-36" />
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={add}>
              <Plus className="h-4 w-4" /> Add field
            </Button>
          </div>

          {defs.length === 0 ? (
            <div className="rounded-lg border border-border">
              <EmptyState
                icon={Tags}
                title={`No ${entityLabel.toLowerCase()} fields yet`}
                description="Add a field above, then save to make it available in the editor."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {defs.map((d) => (
                <li key={d.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                  <Input
                    value={d.label}
                    onChange={(e) => patchDef(d.id, { label: e.target.value })}
                    className="bg-surface-card"
                    aria-label="Field label"
                  />
                  <div className="flex items-center gap-2">
                    <InlineSelect
                      value={d.type}
                      onChange={(t) => patchDef(d.id, { type: t })}
                      options={CUSTOM_FIELD_TYPES}
                      className="w-full sm:w-36"
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-red-600 dark:text-red-300 hover:bg-red-500/10"
                      onClick={() => setDefs(defs.filter((x) => x.id !== d.id))}
                      aria-label={`Remove ${d.label || "field"}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-text-secondary">
            Removing a field hides it from editors; values already entered stay on the record.
          </p>
        </div>
      </SectionCard>
    </SettingsPage>
  );
}

export default CustomFieldsScreen;
