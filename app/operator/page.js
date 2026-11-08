import { notFound } from "next/navigation";

import { currentOperator } from "@/lib/auth/operator";
import { adminClient } from "@/lib/supabase/admin";
import { listOperatorEvents, listOperatorRuns } from "@/lib/operator/events";
import { OperatorScreen } from "@/components/internal/operator/operator_screen";

// Operator view (PLAT-01h): unattributed inbound mail and scheduler failures outside any project. Anyone not listed in
// PROPERTY_OPERATOR_EMAILS gets a 404, so the page doesn't reveal that it exists.

export const metadata = { title: "Operator · Geiger Property", robots: { index: false, follow: false } };

async function loadOperatorData(admin) {
  if (!admin) return { events: [], runs: [], error: "SUPABASE_SERVICE_ROLE_KEY isn't configured." };
  try {
    const [events, runs] = await Promise.all([listOperatorEvents(admin), listOperatorRuns(admin)]);
    return { events, runs, error: null };
  } catch (e) {
    console.error("[operator]", e);
    return { events: [], runs: [], error: "Couldn't load operator events." };
  }
}

export default async function OperatorPage() {
  const operator = await currentOperator();
  if (!operator) notFound();
  const { events, runs, error } = await loadOperatorData(adminClient({ source: "operator", actor: operator }));
  return <OperatorScreen operator={operator} events={events} runs={runs} error={error} />;
}
