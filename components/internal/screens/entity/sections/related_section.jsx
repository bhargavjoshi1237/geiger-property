"use client";

import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";

import { DataTable, EmptyState, ListLoading } from "@/components/internal/shared/screen_kit";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";

// Read-only table of records linked to the open entity (a property's work
// orders, a tenant's leases…). Row click opens that record in its own tab.
// Options: { load(item) → rows, columns, tab?, plural, icon?, emptyDescription?, footer?(rows) }.
export function makeRelatedSection({ load, columns, tab, plural = "records", icon: Icon = Link2, emptyDescription, footer }) {
  function RelatedSection({ item }) {
    const [rows, setRows] = useState(null);
    const { openItemInTab } = useWorkspaceUrl();

    // Keyed on the record id so typing in other tabs doesn't refetch.
    useEffect(() => {
      let alive = true;
      Promise.resolve(load(item))
        .then((r) => alive && setRows(r ?? []))
        .catch(() => alive && setRows([]));
      return () => {
        alive = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item.id]);

    if (rows === null) return <ListLoading label={`Loading ${plural.toLowerCase()}`} className="py-10" />;

    if (!rows.length) {
      return (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={Icon}
            title={`No ${plural.toLowerCase()} yet`}
            description={emptyDescription || `Linked ${plural.toLowerCase()} show up here.`}
          />
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={rows}
            getRowKey={(r) => r.id}
            onRowClick={tab ? (r) => openItemInTab(r.id, tab) : undefined}
          />
        </div>
        {footer ? footer(rows) : null}
      </div>
    );
  }
  return RelatedSection;
}
