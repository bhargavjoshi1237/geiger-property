"use client";

import { ArrowRight, FileUp } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { Card, CardContent } from "@geiger/ui/card";
import { usePermission } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { importLabel } from "@/lib/data_io/import_spec";
import { IMPORT_KEY, MIGRATION_STEPS } from "@/components/internal/screens/settings/import/constants";

// Overview empty state (PLAT-03): an empty portfolio is offered the migration, in the order the imports run, for roles that can import.

export function StartMigrationCard() {
  const { setTab } = useWorkspaceUrl();
  const canImport = usePermission(IMPORT_KEY);
  if (!canImport) return null;
  return (
    <Card className="gap-0 overflow-hidden rounded-xl border-border bg-surface-subtle py-0 text-foreground">
      <CardContent className="p-4">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
              <FileUp className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-foreground">Start migration</h3>
              <p className="text-sm text-muted-foreground">Bring your portfolio over from AppFolio, Buildium, Rent Manager, Yardi Breeze or a spreadsheet — each step checks every row first, and can be rolled back.</p>
            </div>
          </div>
          <Button size="sm" className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setTab("Import & Export")}>
            Start migration <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ol className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {MIGRATION_STEPS.map((s, i) => (
            <li key={s.entity} className="flex items-baseline gap-2 text-sm">
              <span className="w-4 shrink-0 text-xs font-semibold tabular-nums text-text-tertiary">{i + 1}</span>
              <span className="min-w-0">
                <span className="font-medium text-foreground">{importLabel(s.entity)}</span>
                <span className="text-text-secondary"> — {s.from}</span>
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export default StartMigrationCard;
