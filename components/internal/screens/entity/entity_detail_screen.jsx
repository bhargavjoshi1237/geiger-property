"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";

// Generic, config-driven editor shell — the reusable port of geiger-events'
// event_detail.jsx. It knows nothing about Properties vs Tenants; the `config`
// supplies labels, the status map, the right-hand nav groups, and the key →
// section-component map. The active section lives in the URL (?section=<key>).
export function EntityDetailScreen({ item, config, onBack, onUpdate }) {
  const { section: active, setSection: setActive } = useWorkspaceUrl();

  // Editable working copy. Sections read from and patch this; the header
  // reflects edits live, and Save lifts it back to the list.
  const [form, setForm] = useState(item);
  // Re-seed when a different item is opened (render-phase reset).
  const [seedId, setSeedId] = useState(item?.id);
  if (item && item.id !== seedId) {
    setSeedId(item.id);
    setForm(item);
  }

  const activeItem = useMemo(
    () =>
      config.navGroups.flatMap((g) => g.items).find((i) => i.key === active) ||
      config.navGroups[0].items[0],
    [active, config.navGroups],
  );

  if (!item) return null;

  const titleField = config.titleField || "name";
  const patch = (partial) => setForm((f) => ({ ...f, ...partial }));
  // Commit = patch + persist immediately (used by controls that shouldn't wait
  // for a separate Save, e.g. a status toggle in Overview).
  const commit = (partial) => {
    const next = { ...form, ...partial };
    setForm(next);
    onUpdate?.(next);
  };
  const save = () => {
    onUpdate?.(form);
    toast.success("Changes saved.");
  };

  const ActiveSection = config.sections[active] || config.sections.overview;
  const backLabel = config.title || `All ${config.plural}`;
  const headerMeta = config.headerMeta ? config.headerMeta(form) : null;

  return (
    <MainScreenWrapper className="lg:flex lg:h-full lg:flex-col lg:gap-6 lg:space-y-0 lg:overflow-hidden lg:py-0">
      {/* Editor header */}
      <div className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-center md:justify-between lg:shrink-0">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {backLabel}
          </button>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {form[titleField]}
            </h1>
            {form.status ? (
              <StatusPill status={form.status} map={config.statusMap} />
            ) : null}
          </div>
          {headerMeta ? (
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {headerMeta}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={save}
          >
            Save changes
          </Button>
        </div>
      </div>

      {/* Content (left) + section nav (right). */}
      <div className="grid grid-cols-1 gap-8 lg:min-h-0 lg:flex-1 lg:grid-rows-1 lg:grid-cols-[1fr_260px]">
        <div className="scrollbar-subtle order-2 min-w-0 lg:order-1 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
          {activeItem.ownHeader ? null : (
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold capitalize text-white">
                  {activeItem.label}
                </h2>
                <p className="mt-0.5 text-sm text-text-secondary">
                  {activeItem.desc}
                </p>
              </div>
            </div>
          )}
          <ActiveSection
            item={form}
            config={config}
            headerItem={activeItem}
            onPatch={patch}
            onCommit={commit}
            onNavigate={setActive}
          />
        </div>

        <aside className="order-1 lg:order-2 lg:min-h-0">
          <nav className="space-y-5 lg:h-full lg:overflow-y-auto lg:pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {config.navGroups.map((group, gi) => (
              <div key={group.group || `g${gi}`}>
                {group.group ? (
                  <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                    {group.group}
                  </p>
                ) : null}
                <div className="space-y-0.5">
                  {group.items.map((navItem) => {
                    const Icon = navItem.icon;
                    const isActive = active === navItem.key;
                    return (
                      <button
                        key={navItem.key}
                        type="button"
                        onClick={() => setActive(navItem.key)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                          isActive
                            ? "bg-surface-card font-medium text-white"
                            : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            isActive ? "text-white" : "text-text-secondary",
                          )}
                        />
                        <span className="truncate capitalize">
                          {navItem.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>
      </div>
    </MainScreenWrapper>
  );
}

export default EntityDetailScreen;
