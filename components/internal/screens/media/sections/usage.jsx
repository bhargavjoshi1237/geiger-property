"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

import { ListLoading, SectionCard } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listAllMedia } from "@/lib/supabase/media";
import { loadEntityOptions, OWNER_TYPE_LABEL } from "@/components/internal/screens/entity/shared_sections/entity_options";

// Media · Usage — where this asset appears: its placement owner, cover status,
// publishing channels, and other library assets pointing at the same file.

const TABS = { property: "Properties", unit: "Units", building: "Buildings", unittype: "Unit Types", floorplan: "Floor Plans", amenity: "Amenities" };
const ENTITY = { unittype: "unittype", floorplan: "floorplan", property: "property", unit: "unit", building: "building", amenity: "amenity" };

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <span className="text-sm text-text-secondary">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 text-sm text-foreground">{children}</div>
    </div>
  );
}

export function MediaUsageSection({ item, onNavigate }) {
  const { openItemInTab } = useWorkspaceUrl();
  const [state, setState] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listAllMedia(), item.ownerType ? loadEntityOptions(ENTITY[item.ownerType]) : Promise.resolve([])])
      .then(([all, owners]) => {
        if (!alive) return;
        const owner = (owners || []).find((o) => o.value === item.ownerId);
        const dupes = item.url ? (all || []).filter((m) => m.id !== item.id && m.url === item.url) : [];
        setState({ ownerName: owner?.label || "", dupes });
      })
      .catch(() => alive && setState({ ownerName: "", dupes: [] }));
    return () => {
      alive = false;
    };
  }, [item.id, item.url, item.ownerType, item.ownerId]);

  if (!state) return <ListLoading label="Loading usage" className="py-10" />;

  const tab = TABS[item.ownerType];
  const channels = Array.isArray(item.channels) ? item.channels : [];

  return (
    <div className="space-y-5">
      <SectionCard title="Where it's used">
        <div className="divide-y divide-border">
          <Row label="Placed on">
            {item.ownerType && item.ownerId ? (
              <>
                <Badge variant="neutral">{OWNER_TYPE_LABEL[item.ownerType] || item.ownerType}</Badge>
                <span className="truncate">{state.ownerName || "Unknown record"}</span>
                {tab ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-text-secondary hover:bg-surface-hover"
                    onClick={() => openItemInTab(item.ownerId, tab)}
                    aria-label="Open record"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                ) : null}
              </>
            ) : (
              <Button variant="outline" size="sm" className="border-border bg-surface-card" onClick={() => onNavigate("placement")}>
                Unassigned — place it
              </Button>
            )}
          </Row>
          <Row label="Cover image">{item.isCover ? <Badge variant="success">Cover</Badge> : "No"}</Row>
          <Row label="Hero / featured">{item.featured ? <Badge variant="purple">Featured</Badge> : "No"}</Row>
          <Row label="Channels">
            {channels.length ? channels.map((c) => <Badge key={c} variant="info">{c}</Badge>) : <span className="text-text-tertiary">None selected</span>}
          </Row>
          <Row label="Alt text">{item.altText ? <Badge variant="success">Set</Badge> : <Badge variant="warning">Missing</Badge>}</Row>
        </div>
      </SectionCard>

      <SectionCard title="Same file elsewhere" description="Other library assets that point at this exact file." bodyPadding={false}>
        {state.dupes.length ? (
          <ul className="divide-y divide-border">
            {state.dupes.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="truncate text-sm text-foreground">{m.name}</span>
                <Badge variant="neutral">{OWNER_TYPE_LABEL[m.ownerType] || "Library"}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-text-secondary">This file isn&apos;t reused by other assets.</p>
        )}
      </SectionCard>
    </div>
  );
}

export default MediaUsageSection;
