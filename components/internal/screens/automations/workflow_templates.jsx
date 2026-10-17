"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  ArrowUpRight,
  CalendarClock,
  CircleDollarSign,
  FilePen,
  FileSignature,
  LayoutTemplate,
  Loader2,
  Wrench,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { EmptyState, ScreenHeader, SearchInput, Toolbar } from "@/components/internal/shared/screen_kit";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { automationsData } from "@/lib/supabase/automations";
import {
  BUILT_IN_WORKFLOWS,
  TRIGGER_GROUPS,
  builtInGroup,
  builtInWorkflowRow,
  stepSummary,
  triggerLabel,
} from "@/lib/automations/catalog";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";

// Workflow Templates — a gallery of the built-in starter workflows (lib/automations/catalog.js). "Use template" creates a
// disabled Draft in property.automations and hands off to its editor in All Workflows.

const GROUP_META = {
  Leases: { icon: FileSignature, variant: "info" },
  Applications: { icon: FilePen, variant: "purple" },
  Maintenance: { icon: Wrench, variant: "warning" },
  "Rent & payments": { icon: CircleDollarSign, variant: "success" },
  Moves: { icon: ArrowLeftRight, variant: "neutral" },
  Schedule: { icon: CalendarClock, variant: "outline" },
};

const CATEGORY_OPTIONS = [
  { value: "all", label: "All categories" },
  ...TRIGGER_GROUPS.filter((g) => BUILT_IN_WORKFLOWS.some((t) => builtInGroup(t) === g)).map((g) => ({ value: g, label: g })),
];

// The first few steps as a connected chain, so a card shows what the workflow actually does.
function StepChain({ steps }) {
  const shown = steps.slice(0, 3);
  const more = steps.length - shown.length;
  return (
    <ol className="mt-4 space-y-1.5 border-l border-border pl-3">
      {shown.map((s) => (
        <li key={s.id} className="truncate text-xs text-text-secondary">{stepSummary(s)}</li>
      ))}
      {more > 0 ? <li className="text-xs text-text-tertiary">+{more} more step{more === 1 ? "" : "s"}</li> : null}
    </ol>
  );
}

export function WorkflowTemplatesScreen() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [usingKey, setUsingKey] = useState(null);
  const [inUse, setInUse] = useState({});
  const { openItemInTab } = useWorkspaceUrl();

  // How many existing workflows came from each template, for the "In use" badge.
  useEffect(() => {
    let alive = true;
    automationsData.list().then((rows) => {
      if (!alive) return;
      const counts = {};
      for (const r of rows ?? []) {
        const key = r.metadata?.builtIn;
        if (key) counts[key] = (counts[key] || 0) + 1;
      }
      setInUse(counts);
    });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return BUILT_IN_WORKFLOWS.filter((t) => {
      if (category !== "all" && builtInGroup(t) !== category) return false;
      if (q && !`${t.name} ${t.desc} ${triggerLabel(t.triggerEvent)}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [search, category]);

  // Create the workflow, then open it in All Workflows; awaited so that screen's fetch already sees the row.
  const handleUse = async (tpl) => {
    if (usingKey) return;
    setUsingKey(tpl.key);
    const created = await automationsData.create(builtInWorkflowRow(tpl, crypto.randomUUID()));
    setUsingKey(null);
    if (!created) {
      toast.error("Couldn't create a workflow from this template.");
      return;
    }
    toast.success(`"${tpl.name}" created — review it, then switch it on.`);
    openItemInTab(created.id, "All Workflows");
  };

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Workflow Templates"
        description="Start from a proven automation. Pick a template to create a ready-made workflow, then adjust its trigger, conditions and steps before switching it on."
      />

      <Toolbar>
        <FilterDropdown value={category} onValueChange={setCategory} options={CATEGORY_OPTIONS} height="h-9" />
        <SearchInput value={search} onChange={setSearch} placeholder="Search templates…" />
      </Toolbar>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={LayoutTemplate}
            title="No templates match your filters"
            description="Try clearing the search or picking a different category."
            action={
              <Button
                variant="outline"
                className="border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const group = builtInGroup(t);
            const meta = GROUP_META[group] || { icon: Zap, variant: "neutral" };
            const Icon = meta.icon;
            const busy = usingKey === t.key;
            const used = inUse[t.key] || 0;
            return (
              <div
                key={t.key}
                className="flex flex-col rounded-xl border border-border bg-surface-subtle p-5 transition-colors hover:border-border-strong"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {used ? <Badge variant="outline">In use{used > 1 ? ` · ${used}` : ""}</Badge> : null}
                    <Badge variant={meta.variant}>{group}</Badge>
                  </div>
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{t.name}</h3>
                <p className="mt-1 text-sm text-text-secondary">{t.desc}</p>
                <div className="flex-1">
                  <StepChain steps={t.steps} />
                </div>
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
                  <span className="truncate text-xs text-text-tertiary">
                    When {triggerLabel(t.triggerEvent).toLowerCase()} · {t.steps.length} step{t.steps.length === 1 ? "" : "s"}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={Boolean(usingKey)}
                    className="shrink-0 text-muted-foreground hover:bg-surface-active hover:text-foreground"
                    onClick={() => handleUse(t)}
                  >
                    {busy ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…
                      </>
                    ) : (
                      <>
                        Use template <ArrowUpRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </MainScreenWrapper>
  );
}

export default WorkflowTemplatesScreen;
