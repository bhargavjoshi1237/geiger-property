"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpCircle,
  BarChart3,
  Briefcase,
  Calculator,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  FileSignature,
  LibraryBig,
  Lightbulb,
  Pencil,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@geiger/ui/dropdown-menu";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { EmptyState, ListLoading, ScreenHeader, SearchInput, SectionCard, Toolbar } from "@/components/internal/shared/screen_kit";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { WorkflowTemplatesBody } from "@/components/internal/screens/automations/workflow_templates";
import { usePermission } from "@/context/rbac-context";
import { useModules } from "@/context/modules-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useMetrics } from "@/lib/metrics/client";
import { getPaymentsStatus } from "@/lib/payments/api";
import { effectivePolicies } from "@/lib/policies";
import { getSetting } from "@/lib/supabase/settings";
import { automationsData } from "@/lib/supabase/automations";
import { listPlaybookInstalls } from "@/lib/supabase/playbook_installs";
import { bankAccountsLayer } from "@/lib/supabase/bank_accounts";
import { ownersLayer } from "@/lib/supabase/owners";
import { vendorsLayer } from "@/lib/supabase/vendors";
import { listProperties } from "@/lib/supabase/properties";
import { teamMembersLayer } from "@/lib/supabase/team_members";
import { listTenants } from "@/lib/supabase/tenants";
import { withTenantBalances } from "@/lib/supabase/receivables";
import { leasesLayer } from "@/lib/supabase/leases";
import { renewalsLayer } from "@/lib/supabase/renewals";
import { workOrdersLayer } from "@/lib/supabase/work_orders";
import { listOnlinePayments } from "@/lib/supabase/online_payments";
import { listSignals } from "@/lib/supabase/signals";
import { PLAYBOOKS, PLAYBOOK_AREAS, getPlaybook, prerequisiteStatus } from "@/lib/orchestration/playbooks";
import { planUpdate, playbookMetaOf } from "@/lib/orchestration/playbooks/install";
import { recommendPlaybooks } from "@/lib/orchestration/playbooks/recommend";
import { InstallPlaybookDialog, UninstallPlaybookDialog, UpdatePlaybookDialog } from "./playbook_dialogs";

// Playbooks (ORCH-07): ready-made automations for the real jobs. Each card shows the outcome, prerequisites (with
// links to set them up), install state, an update notice and live KPIs once installed. Installing runs a setup
// wizard that previews the workflows it generates; they stay editable in All Workflows. Recommendations at the top
// come from open signals and project data. The plain starter templates live in the "Single workflows" tab.

const AREA_ICONS = {
  Collections: CircleDollarSign,
  Leases: FileSignature,
  Maintenance: Wrench,
  Compliance: ShieldCheck,
  Accounting: Calculator,
  "Managing agents": Briefcase,
  Analytics: BarChart3,
};

const AREA_OPTIONS = [{ value: "all", label: "All areas" }, ...PLAYBOOK_AREAS.map((a) => ({ value: a, label: a }))];
const OUTLINE = "border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground";
const TABS = [
  { value: "playbooks", label: "Playbooks" },
  { value: "single", label: "Single workflows" },
];

// Everything the cards, prerequisite checks, setup questions and recommendations read.
async function loadPlaybookContext() {
  const [installs, automations, status, banks, owners, vendors, properties, members, fees, tenants, leases, renewals, workOrders, payments, signals] = await Promise.all([
    listPlaybookInstalls(),
    automationsData.list(),
    getPaymentsStatus(),
    bankAccountsLayer.list(),
    ownersLayer.list(),
    vendorsLayer.list(),
    listProperties(),
    teamMembersLayer.list(),
    getSetting("fees_policies", {}),
    listTenants().then(withTenantBalances),
    leasesLayer.list(),
    renewalsLayer.list(),
    workOrdersLayer.list(),
    listOnlinePayments(),
    listSignals(),
  ]);
  const ok = status?.ok !== false;
  return {
    installs: installs ?? [],
    automations: automations ?? [],
    ctx: {
      status: ok ? { email: Boolean(status?.email), stripe: status?.stripe || {} } : { email: false, stripe: {} },
      statusUnknown: !ok,
      counts: { bankAccounts: (banks ?? []).length, owners: (owners ?? []).length, vendors: (vendors ?? []).length },
      properties: properties ?? [],
      members: (members ?? []).filter((m) => m.status !== "Disabled"),
      policies: effectivePolicies({ company: fees || {} }),
    },
    rec: { tenants: tenants ?? [], leases: leases ?? [], renewals: renewals ?? [], workOrders: workOrders ?? [], onlinePayments: payments ?? [], signals: signals ?? [] },
  };
}

function KpiChips({ keys, metrics }) {
  const shown = keys.map((k) => metrics[k]).filter((m) => m && m.display && m.display !== "—").slice(0, 3);
  if (!shown.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {shown.map((m) => (
        <span key={m.key} className="rounded-md border border-border bg-surface-card px-2 py-1 text-xs text-text-secondary">
          {m.label} <span className="font-medium tabular-nums text-foreground">{m.display}</span>
        </span>
      ))}
    </div>
  );
}

function PrerequisiteList({ items, onOpen }) {
  const { offModuleOf } = useModules();
  if (!items.length) return null;
  return (
    <ul className="mt-3 space-y-1.5">
      {items.map((p) => (
        <li key={p.key} className="flex items-start gap-2 text-xs">
          {p.ok ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : p.required ? (
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
          ) : (
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          )}
          <span className="min-w-0 text-text-secondary">
            <span className="text-foreground">{p.label}</span>
            {p.ok ? null : (
              <>
                {" — "}
                {p.missing}{" "}
                {p.tab && !offModuleOf(p.tab) ? (
                  <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => onOpen(p.tab)}>
                    Open {p.tab}
                  </button>
                ) : null}
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PlaybookCard({ playbook, install, automations, ctx, metrics, canManage, onInstall, onUpdate, onUninstall }) {
  const { setTab, openItemInTab } = useWorkspaceUrl();
  const Icon = AREA_ICONS[playbook.area] || LibraryBig;
  const prereqs = prerequisiteStatus(playbook, ctx);
  const blocked = prereqs.filter((p) => p.required && !p.ok);
  const owned = install ? automations.filter((a) => playbookMetaOf(a)?.installId === install.id) : [];
  const plan = install ? planUpdate(playbook, install, automations) : null;
  const active = owned.filter((a) => a.enabled).length;

  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface-subtle p-5 transition-colors hover:border-border-strong">
      <div className="flex items-center justify-between gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {install ? <Badge variant="success">Installed · v{install.version}</Badge> : blocked.length ? <Badge variant="outline">Needs setup</Badge> : null}
          {plan && !plan.upToDate ? <Badge variant="info">Update available</Badge> : null}
        </div>
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">{playbook.title}</h3>
      <p className="mt-1 text-sm text-foreground/90">{playbook.outcome}</p>
      <p className="mt-1 text-xs text-text-secondary">{playbook.description}</p>
      <div className="flex-1">
        <PrerequisiteList items={prereqs} onOpen={setTab} />
        {install ? <KpiChips keys={playbook.kpis || []} metrics={metrics} /> : null}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-xs text-text-tertiary">
          {install ? `${owned.length} workflow${owned.length === 1 ? "" : "s"} · ${active} on` : `${playbook.workflows(playbook.defaults?.(ctx) || {}).length} workflows`}
        </span>
        <div className="flex items-center gap-1.5">
          {install ? (
            <>
              {plan && !plan.upToDate ? (
                <Button size="sm" variant="outline" className={OUTLINE} disabled={!canManage} onClick={() => onUpdate(playbook, install, plan)}>
                  <ArrowUpCircle className="h-3.5 w-3.5" /> Update
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:bg-surface-active hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" /> Customize <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 border-border bg-surface-subtle">
                  {owned.map((a) => (
                    <DropdownMenuItem key={a.id} onClick={() => openItemInTab(a.id, "All Workflows")}>
                      <span className="truncate">{a.name}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem
                    disabled={!canManage}
                    className="text-red-600 focus:bg-red-500/10 dark:text-red-400"
                    onClick={() => onUninstall(playbook, install)}
                  >
                    <Trash2 className="h-4 w-4" /> Remove playbook
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!canManage || blocked.length > 0}
              title={!canManage ? "Your role can't install playbooks" : blocked.length ? `Set up ${blocked.map((b) => b.label.toLowerCase()).join(" and ")} first` : undefined}
              onClick={() => onInstall(playbook)}
            >
              Set up
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Recommendations({ items, installsBlocked, onSetUp }) {
  if (!items.length) return null;
  return (
    <SectionCard title="Recommended for you" description="Based on what's happening in your portfolio right now." bodyPadding={false}>
      <div className="divide-y divide-border">
        {items.map((r) => (
          <div key={r.playbookKey} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{r.title}</p>
                <p className="text-xs text-text-secondary">{r.reason}</p>
              </div>
            </div>
            <Button size="sm" variant="outline" className={OUTLINE} disabled={installsBlocked(r.playbookKey)} onClick={() => onSetUp(getPlaybook(r.playbookKey))}>
              Set up
            </Button>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function PlaybookCatalog() {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("all");
  const [installing, setInstalling] = useState(null);
  const [updating, setUpdating] = useState(null);
  const [removing, setRemoving] = useState(null);
  const canManage = usePermission("automations.manage");

  const reload = useCallback(() => loadPlaybookContext().then(setData), []);
  useEffect(() => {
    let alive = true;
    loadPlaybookContext().then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, []);

  const installByKey = useMemo(() => new Map((data?.installs || []).map((i) => [i.playbookKey, i])), [data]);
  const kpiKeys = useMemo(() => [...new Set(PLAYBOOKS.filter((p) => installByKey.has(p.key)).flatMap((p) => p.kpis || []))], [installByKey]);
  const { metrics } = useMetrics(kpiKeys.length ? kpiKeys : ["occupancy"]);

  const recommendations = useMemo(() => (data ? recommendPlaybooks({ ...data.rec, installs: data.installs, now: new Date() }) : []), [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return PLAYBOOKS.filter((p) => (area === "all" || p.area === area) && (!q || `${p.title} ${p.outcome} ${p.description}`.toLowerCase().includes(q)));
  }, [search, area]);

  const grouped = useMemo(() => PLAYBOOK_AREAS.map((a) => ({ area: a, items: filtered.filter((p) => p.area === a) })).filter((g) => g.items.length), [filtered]);

  if (!data) return <ListLoading label="Loading playbooks" />;

  const blockedFor = (key) => {
    const p = getPlaybook(key);
    return !canManage || !p || prerequisiteStatus(p, data.ctx).some((x) => x.required && !x.ok);
  };

  return (
    <div className="space-y-6">
      {data.ctx.statusUnknown ? (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          Couldn&apos;t check the email and payments connections, so playbooks that need them show as not ready.
        </p>
      ) : null}

      <Recommendations items={recommendations} installsBlocked={blockedFor} onSetUp={setInstalling} />

      <Toolbar>
        <FilterDropdown value={area} onValueChange={setArea} options={AREA_OPTIONS} height="h-9" />
        <SearchInput value={search} onChange={setSearch} placeholder="Search playbooks…" />
      </Toolbar>

      {grouped.length ? (
        grouped.map((g) => (
          <section key={g.area} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">{g.area}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((p) => (
                <PlaybookCard
                  key={p.key}
                  playbook={p}
                  install={installByKey.get(p.key) || null}
                  automations={data.automations}
                  ctx={data.ctx}
                  metrics={metrics}
                  canManage={canManage}
                  onInstall={setInstalling}
                  onUpdate={(playbook, install, plan) => setUpdating({ playbook, install, plan })}
                  onUninstall={(playbook, install) => setRemoving({ playbook, install })}
                />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={LibraryBig}
            title="No playbooks match your filters"
            description="Try clearing the search or picking a different area."
            action={
              <Button
                variant="outline"
                className={OUTLINE}
                onClick={() => {
                  setSearch("");
                  setArea("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        </div>
      )}

      <InstallPlaybookDialog playbook={installing} ctx={data.ctx} open={Boolean(installing)} onOpenChange={(o) => !o && setInstalling(null)} onInstalled={reload} />
      <UpdatePlaybookDialog
        playbook={updating?.playbook}
        install={updating?.install}
        plan={updating?.plan}
        open={Boolean(updating)}
        onOpenChange={(o) => !o && setUpdating(null)}
        onUpdated={reload}
      />
      <UninstallPlaybookDialog
        playbook={removing?.playbook}
        install={removing?.install}
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        onRemoved={reload}
      />
    </div>
  );
}

export function PlaybooksScreen() {
  const [tab, setTab] = useState("playbooks");
  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Playbooks"
        description="Ready-made automations for the real jobs — collections, renewals, maintenance, month-end and owners. Switch one on, answer a few setup questions, then tune it on the canvas."
        actions={<SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />}
      />
      {tab === "playbooks" ? <PlaybookCatalog /> : <WorkflowTemplatesBody />}
    </MainScreenWrapper>
  );
}

export default PlaybooksScreen;
