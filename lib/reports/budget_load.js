import { forProject } from "@/lib/supabase/scope";
import { dayOf } from "./periods";

// Budget loader for report sources (CORE-44), shared by the browser and the server like ledger_load.js: the budgets and their monthly
// lines for the calendar years a range touches. Throws on failure; callers degrade.

const PAGE = 1000;

async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// budgets params → { from, to, years: [first, last] } (no range: the current year).
export function budgetParams(params = {}) {
  const from = dayOf(params.from) || null;
  const to = dayOf(params.to) || from;
  const year = (d) => Number(String(d || "").slice(0, 4)) || new Date().getFullYear();
  const a = year(from || to);
  const b = year(to || from);
  return { from, to, years: [Math.min(a, b), Math.max(a, b)] };
}

const budgetOf = (r) => ({ id: r.id, name: r.name || "", propertyId: r.property_id || "", propertyName: r.property_name || "", year: Number(r.year) || 0, status: r.status || "Draft", updatedAt: r.updated_at || r.created_at || "" });
const lineOf = (r) => ({ id: r.id, budgetId: r.budget_id || "", propertyId: r.property_id || "", glAccountId: r.gl_account_id || "", accountLabel: r.account_label || "", year: Number(r.year) || 0, month: Number(r.month) || 0, amount: Number(r.amount) || 0 });

// budgets source with params → { params, budgets, lines }: live budgets of those years and their live lines in those years.
export async function loadBudgets(sb, projectId, params = {}) {
  if (!projectId) throw new Error("A project is required for budgets.");
  const p = budgetParams(params);
  const [y1, y2] = p.years;
  const [budgets, lines] = await Promise.all([
    fetchAll(() => forProject(sb.from("budgets").select("*").is("deleted_at", null), projectId).gte("year", y1).lte("year", y2).order("id")),
    fetchAll(() => forProject(sb.from("budget_lines").select("*").is("deleted_at", null), projectId).gte("year", y1).lte("year", y2).order("id")),
  ]);
  const ids = new Set(budgets.map((b) => b.id));
  return { params: p, budgets: budgets.map(budgetOf), lines: lines.filter((l) => ids.has(l.budget_id)).map(lineOf) };
}
