"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { getSetting } from "@/lib/supabase/settings";
import { glAccountsLayer } from "@/lib/supabase/gl_accounts";
import { money } from "@/components/internal/screens/accounting/shared";

// Work-order bill step footer: prefills the expense account from the work order and warns when the bill needs approval.
export function WoBillNote({ values, set }) {
  const [limit, setLimit] = useState(0);
  useEffect(() => {
    let live = true;
    (async () => {
      const [settings, accounts] = await Promise.all([getSetting("accounting_settings", {}), glAccountsLayer.list()]);
      if (!live) return;
      setLimit(Number(settings?.billApprovalLimit) || 0);
      const match = (accounts || []).find((a) => a.systemKey === values.glKey && a.status !== "Inactive");
      if (match && !values.glAccountId) set({ glAccountId: match.id, account: match.number ? `${match.number} · ${match.name}` : match.name });
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!limit || !(Number(values.amount) > limit)) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-surface-subtle px-3.5 py-3 text-sm text-text-secondary">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
      <span>Over {money(limit)} — needs approval before it posts.</span>
    </div>
  );
}
