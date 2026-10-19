"use client";

import React, { useMemo, useState } from "react";
import { Bell } from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { ScreenHeader, SearchInput } from "@/components/internal/shared/screen_kit";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { DataGate, PortalEmpty, fmtDate, usePortalData } from "../portal_kit";

// Announcements sent to this member's audience (tenants of their property, owners, vendors).
export function PortalAnnouncements() {
  const state = usePortalData("/api/portal/announcements");
  const [search, setSearch] = useState("");
  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (state.data?.items || []).filter((a) => !q || `${a.title} ${a.body}`.toLowerCase().includes(q));
  }, [state.data, search]);

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Announcements"
        description="Notices and updates from your property manager."
        actions={<SearchInput value={search} onChange={setSearch} placeholder="Search…" className="w-full sm:w-64" />}
      />
      <DataGate state={state}>
        {(data) =>
          !data.items.length ? (
            <PortalEmpty icon={Bell} title="No announcements" description="When the office posts an update, it'll show here." />
          ) : !items.length ? (
            <PortalEmpty icon={Bell} title="Nothing matches" description="Try a different search." />
          ) : (
            <div className="space-y-3">
              {items.map((a) => (
                <article key={a.id} className="rounded-xl border border-border bg-surface-subtle p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">{a.title}</h2>
                    {/high|urgent/i.test(a.priority) ? <Badge variant="warning">{a.priority}</Badge> : null}
                  </div>
                  <p className="mt-1 text-[11px] text-text-tertiary">
                    {fmtDate(a.date)}
                    {a.propertyName ? ` · ${a.propertyName}` : ""}
                  </p>
                  {a.body ? <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{a.body}</p> : null}
                </article>
              ))}
            </div>
          )
        }
      </DataGate>
    </MainScreenWrapper>
  );
}

export default PortalAnnouncements;
