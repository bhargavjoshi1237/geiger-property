"use client";

import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { scopeQuery } from "./project_scope";

// Data-access layer for the Impact page (reads `property.impact_daily`, written nightly by the `impact` job).
// Pages through every row since a date — a year of daily rows can pass PostgREST's 1,000-row limit.

const PAGE = 1000;

export const normalizeImpactRow = (row) => ({
  id: row.id,
  date: row.date,
  automationId: row.automation_id || null,
  playbookKey: row.playbook_key || null,
  metric: row.metric,
  value: Number(row.value) || 0,
});

// → rows since `fromDate` (YYYY-MM-DD), [] when there are none, null when unavailable.
export async function listImpactSince(fromDate) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await scopeQuery(
        sb.from("impact_daily").select("id, date, automation_id, playbook_key, metric, value").is("deleted_at", null).gte("date", fromDate).neq("value", 0),
      )
        .order("date")
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) {
        console.error("[impactDaily.list]", error.message);
        return null;
      }
      out.push(...(data || []).map(normalizeImpactRow));
      if (!data || data.length < PAGE) break;
    }
    return out;
  } catch (e) {
    console.error("[impactDaily.list]", e);
    return null;
  }
}
