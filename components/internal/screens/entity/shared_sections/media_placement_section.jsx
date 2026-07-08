"use client";

import { useEffect, useState } from "react";

import { Field, SectionCard, SettingsList, SettingRow } from "@/components/internal/shared/screen_kit";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { loadEntityOptions } from "./entity_options";

// Media · Placement — assign this asset to a property/unit/building and toggle
// whether it's the owner's cover. Persists immediately via onCommit (the media
// data layer's update).
const OWNER_TYPES = [
  { value: "__none__", label: "Unassigned (library)" },
  { value: "property", label: "Property" },
  { value: "unit", label: "Unit" },
  { value: "building", label: "Building" },
];

export function MediaPlacementSection({ item, onCommit }) {
  const [options, setOptions] = useState([]);
  const ownerType = item.ownerType || "__none__";

  useEffect(() => {
    let alive = true;
    // loadEntityOptions(null) resolves to [] — no special-case setState needed.
    loadEntityOptions(ownerType === "__none__" ? null : ownerType).then((opts) => {
      if (alive) setOptions(opts);
    });
    return () => {
      alive = false;
    };
  }, [ownerType]);

  const setOwnerType = (v) =>
    onCommit({ ownerType: v === "__none__" ? null : v, ownerId: null });

  return (
    <div className="space-y-6">
      <SectionCard title="Attach to">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Owner type" htmlFor="media-owner-type">
            <Select value={ownerType} onValueChange={setOwnerType}>
              <SelectTrigger id="media-owner-type" className="bg-surface-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OWNER_TYPES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {ownerType !== "__none__" ? (
            <Field label="Owner" htmlFor="media-owner">
              <Select
                value={item.ownerId || ""}
                onValueChange={(v) => onCommit({ ownerId: v })}
              >
                <SelectTrigger id="media-owner" className="bg-surface-card">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {options.length === 0 ? (
                    <SelectItem value="__empty__" disabled>
                      Nothing to choose
                    </SelectItem>
                  ) : (
                    options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Display">
        <SettingsList>
          <SettingRow
            title="Set as cover"
            description="Use this image as the owner's cover photo."
            control={
              <Switch
                checked={Boolean(item.isCover)}
                onCheckedChange={(v) => onCommit({ isCover: v })}
                disabled={ownerType === "__none__" || !item.ownerId}
              />
            }
          />
        </SettingsList>
      </SectionCard>
    </div>
  );
}

export default MediaPlacementSection;
