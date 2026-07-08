"use client";

import { Trash2 } from "lucide-react";

import { SectionCard, SettingsList, SettingRow } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Generic Settings — the status control (persisted immediately via onCommit) and
// a danger-zone delete (soft-delete through the list's onDelete). Status options
// come from config.statusFilterOptions (dropping the "all" sentinel).
export function SettingsSection({ item, config, onCommit, onDelete }) {
  const statusOptions = (config.statusFilterOptions || []).filter(
    (o) => o.value !== "all",
  );
  const singular = (config.singular || "record").toLowerCase();

  return (
    <div className="space-y-6">
      <SectionCard title="Status" description={`Control this ${singular}'s lifecycle state.`}>
        <SettingsList>
          <SettingRow
            title="Current status"
            description="Changes save immediately."
            control={
              <Select
                value={item.status || ""}
                onValueChange={(v) => onCommit({ status: v })}
              >
                <SelectTrigger className="w-44 bg-surface-card">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        </SettingsList>
      </SectionCard>

      <SectionCard
        title="Danger zone"
        description={`Deleting removes this ${singular} from lists. This can't be undone.`}
      >
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-text-secondary">
            Delete this {singular} permanently.
          </p>
          <Button
            className="bg-red-500/90 text-white hover:bg-red-500"
            onClick={() => onDelete?.(item)}
            disabled={!onDelete}
          >
            <Trash2 className="h-4 w-4" /> Delete {singular}
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

export default SettingsSection;
