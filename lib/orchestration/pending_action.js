"use client";

import { createClient } from "@/lib/supabase/client";

// Hand-off from a signal, review item or case sheet to a record editor's action wizard (ORCH-08): the launcher
// stores what to open and with which values, navigates to the record, and the editor takes it on mount. Finishing
// the wizard resolves the review item / actions the signal it came from. Kept for one minute, one at a time.

let pending = null;

// { recordId, actionKey, initial?, reviewItemId?, signalId?, label? }
export function setPendingAction(action) {
  pending = action?.recordId && action?.actionKey ? { ...action, at: Date.now() } : null;
}

export function takePendingAction(recordId) {
  if (!pending || pending.recordId !== recordId || Date.now() - pending.at > 60000) return null;
  const out = pending;
  pending = null;
  return out;
}

// Mark the signal a hand-off came from as actioned (best effort).
export async function markSignalActioned(signalId) {
  if (!signalId) return;
  try {
    await createClient().from("signals").update({ status: "actioned", actioned_at: new Date().toISOString() }).eq("id", signalId);
  } catch (e) {
    console.error("[signals.actioned]", e);
  }
}
