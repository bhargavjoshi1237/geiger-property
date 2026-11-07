"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlarmClock, Check, ChevronDown, Inbox, Loader2, UserPlus } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { Checkbox } from "@geiger/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@geiger/ui/dropdown-menu";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { DataTable, EmptyState, ListLoading, ScreenHeader, SearchInput, StatsBar, StatusPill, Toolbar } from "@/components/internal/shared/screen_kit";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { usePermission, useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listReviewItems } from "@/lib/supabase/review_items";
import { teamMembersLayer } from "@/lib/supabase/team_members";
import { listProperties } from "@/lib/supabase/properties";
import { getSetting } from "@/lib/supabase/settings";
import { reviewBulkAction } from "@/lib/orchestration/api";
import { recordTypeLabel } from "@/lib/orchestration/records";
import { normalizeRoleId } from "@/lib/rbac";
import { ReviewDetailSheet, announceReviewChange } from "./review_detail";
import {
  REVIEW_KIND_MAP,
  REVIEW_KIND_TABS,
  SEVERITY_FILTER_OPTIONS,
  SEVERITY_MAP,
  SEVERITY_ORDER,
  SOURCE_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  timeAgo,
  usd,
} from "./constants";

// Review Queue (ORCH-04) — one inbox for everything that needs a person: workflow failures, approvals, suggested
// decisions, automation tasks and email intake. Each item says in plain language why it's here and offers the fixes
// as buttons; resolve, retry, approve, snooze and assign run server-side and are audited. Reads property.review_items.

const outline = "border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground";
const DAY = 86400000;

const matchesStatus = (item, status) =>
  status === "all" ? true : status === "closed" ? item.status === "resolved" || item.status === "dismissed" : item.status === status;

export function ReviewQueueScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [properties, setProperties] = useState([]);
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("open");
  const [severity, setSeverity] = useState("all");
  const [source, setSource] = useState("all");
  const [property, setProperty] = useState("all");
  const [assignee, setAssignee] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [openId, setOpenId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const { itemId, closeItem } = useWorkspaceUrl();
  const { member, role } = useRbac();
  const canResolve = usePermission("review.resolve");

  const load = () =>
    listReviewItems().then((rows) => {
      setItems(rows ?? []);
      setLoading(false);
    });

  useEffect(() => {
    let alive = true;
    listReviewItems().then((rows) => {
      if (!alive) return;
      setItems(rows ?? []);
      setLoading(false);
    });
    teamMembersLayer.list().then((rows) => alive && setMembers((rows ?? []).filter((m) => m.status !== "Disabled")));
    listProperties().then((rows) => alive && setProperties(rows ?? []));
    getSetting("roles", []).then((rows) => alive && setRoles((Array.isArray(rows) ? rows : []).map((r) => ({ id: r.id || normalizeRoleId(r.name), name: r.name || r.id }))));
    return () => {
      alive = false;
    };
  }, []);

  // A deep link (?item=<id>) opens that item — from a record banner, an email or a notification.
  const [linked, setLinked] = useState(null);
  if (itemId && itemId !== linked && items.length) {
    setLinked(itemId);
    const target = items.find((i) => i.id === itemId);
    if (target) {
      setOpenId(target.id);
      if (!matchesStatus(target, status)) setStatus("all");
    }
  }

  const myRole = role?.id || null;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => {
        if (kind !== "all" && i.kind !== kind) return false;
        if (!matchesStatus(i, status)) return false;
        if (severity !== "all" && i.severity !== severity) return false;
        if (source !== "all" && i.sourceType !== source) return false;
        if (property !== "all" && i.propertyId !== property) return false;
        if (assignee === "me" && !(i.assigneeId === member?.id || (myRole && i.assigneeRole === myRole))) return false;
        if (assignee === "unassigned" && (i.assigneeId || i.assigneeRole)) return false;
        if (!["all", "me", "unassigned"].includes(assignee) && i.assigneeId !== assignee) return false;
        if (q && !`${i.title} ${i.reasonText} ${i.recordLabel}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3) ||
          String(b.lastRaisedAt || "").localeCompare(String(a.lastRaisedAt || "")),
      );
  }, [items, kind, status, severity, source, property, assignee, search, member?.id, myRole]);

  const stats = useMemo(() => {
    const open = items.filter((i) => i.status === "open");
    const weekAgo = new Date(openedAt - 7 * DAY).toISOString();
    const resolvedWeek = items.filter((i) => i.status === "resolved" && String(i.resolvedAt || "") >= weekAgo).length;
    return [
      { label: "Open", value: String(open.length), footer: `${open.filter((i) => i.severity === "urgent").length} urgent` },
      { label: "Approvals waiting", value: String(open.filter((i) => i.kind === "approval").length), footer: "Workflows and bills" },
      { label: "At stake", value: usd(open.reduce((s, i) => s + (Number(i.amountAtStake) || 0), 0)), footer: "Money on open items" },
      { label: "Resolved this week", value: String(resolvedWeek), footer: `${items.filter((i) => i.status === "snoozed").length} snoozed` },
    ];
  }, [items, openedAt]);

  const counts = useMemo(() => {
    const open = items.filter((i) => matchesStatus(i, status));
    return Object.fromEntries(REVIEW_KIND_TABS.map((t) => [t.value, t.value === "all" ? open.length : open.filter((i) => i.kind === t.value).length]));
  }, [items, status]);

  const propertyOptions = useMemo(() => [{ value: "all", label: "All properties" }, ...properties.map((p) => ({ value: p.id, label: p.name }))], [properties]);
  const assigneeOptions = useMemo(
    () => [
      { value: "all", label: "Anyone" },
      { value: "me", label: "Assigned to me" },
      { value: "unassigned", label: "Unassigned" },
      ...members.map((m) => ({ value: m.id, label: m.name || m.email })),
    ],
    [members],
  );

  const openItem = openId ? items.find((i) => i.id === openId) || null : null;
  const updateItem = (next) => setItems((prev) => prev.map((i) => (i.id === next.id ? { ...i, ...next } : i)));

  const toggle = (id, on) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const visibleIds = filtered.filter((i) => i.status === "open" || i.status === "snoozed").map((i) => i.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const bulk = async (action, input, message) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBulkBusy(true);
    const res = await reviewBulkAction(ids, action, input);
    setBulkBusy(false);
    if (!res.ok && !res.results) return toast.error(res.error || "Couldn't update the items.");
    for (const r of res.results || []) if (r.ok && r.item) updateItem(r.item);
    const failed = (res.results || []).filter((r) => !r.ok).length;
    if (failed) toast.error(`${res.done} done, ${failed} couldn't be updated.`);
    else toast.success(message(res.done));
    setSelected(new Set());
    announceReviewChange();
  };

  const columns = [
    ...(canResolve
      ? [
          {
            key: "select",
            header: (
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => setSelected(v ? new Set(visibleIds) : new Set())}
                aria-label="Select all"
              />
            ),
            className: "w-10",
            render: (i) =>
              i.status === "open" || i.status === "snoozed" ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected.has(i.id)} onCheckedChange={(v) => toggle(i.id, Boolean(v))} aria-label={`Select ${i.title}`} />
                </div>
              ) : null,
          },
        ]
      : []),
    {
      key: "item",
      header: "Item",
      render: (i) => (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium text-foreground">{i.title}</span>
          <span className="line-clamp-1 text-xs text-text-secondary">{i.reasonText}</span>
        </div>
      ),
    },
    { key: "kind", header: "Kind", render: (i) => <StatusPill status={i.kind} map={REVIEW_KIND_MAP} /> },
    { key: "severity", header: "Severity", render: (i) => <StatusPill status={i.severity} map={SEVERITY_MAP} /> },
    {
      key: "record",
      header: "Record",
      className: "text-text-secondary",
      render: (i) => (i.recordLabel ? <span className="line-clamp-1">{i.recordLabel}</span> : i.recordType ? recordTypeLabel(i.recordType) : "—"),
    },
    {
      key: "amount",
      header: "At stake",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (i) => (i.amountAtStake ? usd(i.amountAtStake) : "—"),
    },
    {
      key: "raised",
      header: "Raised",
      align: "right",
      className: "text-right text-text-secondary",
      render: (i) => `${timeAgo(i.lastRaisedAt || i.createdAt)}${i.occurrences > 1 ? ` · ×${i.occurrences}` : ""}`,
    },
  ];

  const filtersActive = severity !== "all" || source !== "all" || property !== "all" || assignee !== "all" || search || kind !== "all";
  const clearFilters = () => {
    setKind("all");
    setSeverity("all");
    setSource("all");
    setProperty("all");
    setAssignee("all");
    setSearch("");
  };

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Review Queue"
        description="Everything that needs a person, in one list — workflow failures, approvals, suggested actions, tasks and email intake. Each item explains why it's here and what you can do about it."
      />

      <StatsBar stats={stats} />

      <SegmentedTabs tabs={REVIEW_KIND_TABS.map((t) => ({ ...t, label: counts[t.value] ? `${t.label} · ${counts[t.value]}` : t.label }))} value={kind} onChange={setKind} />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown value={status} onValueChange={setStatus} options={STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={assignee} onValueChange={setAssignee} options={assigneeOptions} height="h-9" />
          <FilterDropdown value={severity} onValueChange={setSeverity} options={SEVERITY_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={source} onValueChange={setSource} options={SOURCE_FILTER_OPTIONS} height="h-9" />
          {properties.length > 1 ? <FilterDropdown value={property} onValueChange={setProperty} options={propertyOptions} height="h-9" /> : null}
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search items…" />
      </Toolbar>

      {selected.size ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-subtle px-4 py-2.5">
          <span className="mr-2 text-sm text-foreground">{selected.size} selected</span>
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={bulkBusy} onClick={() => bulk("resolve", { note: "Resolved in bulk" }, (n) => `Resolved ${n}.`)}>
            {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Resolve
          </Button>
          <Button size="sm" variant="outline" className={outline} disabled={bulkBusy} onClick={() => bulk("dismiss", { note: "Dismissed in bulk" }, (n) => `Dismissed ${n}.`)}>
            Dismiss
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={outline}
            disabled={bulkBusy}
            onClick={() => bulk("snooze", { until: new Date(Date.now() + DAY).toISOString() }, (n) => `Snoozed ${n} until tomorrow.`)}
          >
            <AlarmClock className="h-3.5 w-3.5" /> Snooze a day
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className={outline} disabled={bulkBusy}>
                <UserPlus className="h-3.5 w-3.5" /> Assign <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto border-border bg-surface-subtle">
              <DropdownMenuItem onClick={() => bulk("reassign", { assigneeId: null, assigneeRole: null }, (n) => `Unassigned ${n}.`)}>Unassigned</DropdownMenuItem>
              {members.length ? <DropdownMenuSeparator /> : null}
              {members.length ? <DropdownMenuLabel>People</DropdownMenuLabel> : null}
              {members.map((m) => (
                <DropdownMenuItem key={m.id} onClick={() => bulk("reassign", { assigneeId: m.id, assigneeLabel: m.name }, (n) => `Assigned ${n} to ${m.name || m.email}.`)}>
                  {m.name || m.email}
                </DropdownMenuItem>
              ))}
              {roles.length ? <DropdownMenuSeparator /> : null}
              {roles.length ? <DropdownMenuLabel>Roles</DropdownMenuLabel> : null}
              {roles.map((r) => (
                <DropdownMenuItem key={r.id} onClick={() => bulk("reassign", { assigneeRole: r.id, assigneeLabel: r.name }, (n) => `Assigned ${n} to ${r.name}.`)}>
                  {r.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground hover:bg-surface-active" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      {loading ? (
        <ListLoading label="Loading the review queue" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowKey={(i) => i.id}
          onRowClick={(i) => setOpenId(i.id)}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={Inbox}
                title={filtersActive ? "Nothing matches your filters" : status === "open" ? "Nothing needs a person right now" : "No items here"}
                description={
                  filtersActive
                    ? "Try clearing the search or filters."
                    : "When a workflow fails, needs approval or only suggests, when a bill waits for approval, or when an email arrives for intake, it lands here."
                }
                action={
                  filtersActive ? (
                    <Button variant="outline" className={outline} onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : null
                }
              />
            </div>
          }
        />
      )}

      {openItem ? (
        <ReviewDetailSheet
          key={openItem.id}
          item={openItem}
          members={members}
          roles={roles}
          onClose={() => {
            setOpenId(null);
            if (itemId) closeItem();
            load();
          }}
          onChanged={updateItem}
        />
      ) : null}
    </MainScreenWrapper>
  );
}

export default ReviewQueueScreen;
