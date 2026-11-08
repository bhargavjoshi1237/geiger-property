"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { closeOutLeaseApi, previewCloseOutApi } from "@/lib/billing/api";
import { usePermission } from "@/context/rbac-context";
import { formatDate, money2 } from "./shared";

// Move-out close-out in the lease-ending wizards (CORE-02): a preview of the final rent and credits, and the close-out call on finish.

// "Final rent $X through <date>; credit $Y will post" for a lease ending on `through` (debounced while the date is edited).
export function CloseOutPreview({ leaseId, through }) {
  const [state, setState] = useState({ key: "", data: null, error: "" });
  const canPost = usePermission("property.accounting.post");
  const key = leaseId && through ? `${leaseId}|${through}` : "";
  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    const timer = setTimeout(async () => {
      const res = await previewCloseOutApi(leaseId, through);
      if (alive) setState({ key, data: res.ok ? res : null, error: res.ok ? "" : res.error || "Couldn't preview the final rent." });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [key, leaseId, through]);
  if (!key) return null;
  if (state.key !== key) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" /> Working out the final rent…
      </p>
    );
  }
  if (state.error) return <p className="text-sm text-text-secondary">Final rent preview unavailable: {state.error}</p>;
  const d = state.data;
  if (!d.billing) return <p className="rounded-xl border border-border bg-surface-subtle p-4 text-sm text-text-secondary">{d.message || "This lease isn't billing, so nothing posts."}</p>;
  const moves = [d.credit > 0 ? `credit ${money2(d.credit)}` : "", d.charge > 0 ? `charge ${money2(d.charge)}` : ""].filter(Boolean).join(" and ");
  return (
    <div className="rounded-xl border border-border bg-surface-subtle p-4 text-sm">
      <p className="font-medium text-foreground">
        {d.final ? `Final rent ${money2(d.final.amount)} through ${formatDate(d.through)}${d.final.prorated ? " (prorated)" : ""}` : `Billing ends ${formatDate(d.through)}`}
        {moves ? `; ${moves} will post.` : "; nothing else to post."}
      </p>
      {d.lines?.length ? (
        <ul className="mt-2 space-y-0.5 text-xs text-text-secondary">
          {d.lines.map((l, i) => (
            <li key={`${l.label}-${i}`} className="flex justify-between gap-4">
              <span className="truncate">{l.label}</span>
              <span className="tabular-nums">{l.amount < 0 ? `−${money2(-l.amount)}` : money2(l.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-xs text-text-secondary">
        {canPost ? "Posts when you finish" : "The next billing run posts it"}; rent and charges stop after this date.
      </p>
    </div>
  );
}

// After a wizard ends the lease: post the close-out now (accounting.post); otherwise the next billing run does it. Never throws.
export async function closeOutOnFinish(leaseId, through) {
  if (!leaseId) return;
  const res = await closeOutLeaseApi(leaseId, through);
  if (!res.ok) {
    if (res.status !== 403) toast.warning(`The final rent wasn't posted yet: ${res.error} The next billing run posts it.`);
    return;
  }
  if (res.credit > 0 || res.charge > 0) {
    const parts = [res.credit > 0 ? `credited ${money2(res.credit)}` : "", res.charge > 0 ? `billed ${money2(res.charge)}` : ""].filter(Boolean).join(" and ");
    toast.success(`Final rent through ${formatDate(res.through)}: ${parts}.`);
  }
}
