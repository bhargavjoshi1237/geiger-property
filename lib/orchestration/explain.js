import { triggerLabel } from "@/lib/automations/catalog";

// Plain-language "why this ran" for a workflow run (ORCH-02, isomorphic, pure). Reads the explanation the runner
// stores on automation_runs.metadata.explanation: trigger (type, context, actor), condition results, record and its
// key values. Used by Run History, record editors, the review queue, exports and emails.

const usd = (n) => `$${(Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const fmtDate = (v) => {
  if (!v) return "";
  const d = new Date(String(v).length === 10 ? `${v}T00:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};
const possessive = (name) => (name ? `${name}'${/s$/i.test(name) ? "" : "s"}` : "The record's");
const plural = (n, word) => `${n} ${word}${Number(n) === 1 ? "" : "s"}`;

// One sentence for what fired the trigger.
export function triggerSentence(explanation = {}) {
  const t = explanation.trigger || {};
  const c = t.context || {};
  const who = explanation.record?.label || "";
  switch (t.type) {
    case "rent.overdue":
      return `${possessive(who)} balance (${usd(c.balance)}) is over ${usd(c.minBalance)} and rent is ${plural(c.daysLate, "day")} late (rule: at least ${c.daysOverdue})`;
    case "lease.ending":
      return `${possessive(who)} lease ends ${fmtDate(c.termEnd)}, ${plural(c.daysUntilEnd, "day")} away (rule: within ${c.daysBefore})`;
    case "work_order.overdue":
      return c.reason === "past_due"
        ? `${who || "The work order"} is past its due date (${fmtDate(c.dueDate)})`
        : `${who || "The work order"} has had no vendor for ${plural(c.hoursOpen, "hour")} (rule: ${c.unassignedHours})`;
    case "vendor.compliance_expiring":
      return `${possessive(who)} ${c.document || "document"} ${c.state === "expired" ? "expired" : "expires"} on ${fmtDate(c.expiresOn)}`;
    case "schedule":
      return `it's the ${c.frequency || "scheduled"} run for ${c.period || "this period"}`;
    case "manual":
      return `${c.launchedBy || t.actor?.name || "A teammate"} ran it by hand${c.signalId ? " from a signal" : c.reviewItemId ? " from the review queue" : ""}${who ? ` on ${who}` : ""}`;
    default:
      return `${triggerLabel(t.type)}${who ? ` — ${who}` : ""}${t.payload?.convertedFromRequest ? " (converted from a resident request)" : ""}`;
  }
}

// "Balance is greater than 100 — it's 412" (+ pass/fail), flattening nested groups.
export function conditionSentences(conditions) {
  const out = [];
  const walk = (group, depth = 0) => {
    for (const r of group?.results || []) {
      if (r.group) {
        out.push({ depth, group: true, op: r.op, passed: r.matched, text: `${r.op === "or" ? "Any" : "All"} of:` });
        walk(r, depth + 1);
      } else {
        const expected = r.expected === null || r.expected === undefined ? "" : ` ${r.expected}`;
        out.push({ depth, passed: r.passed, text: `${r.label} ${r.opLabel}${expected} — it's ${r.actual === "" ? "empty" : r.actual}` });
      }
    }
  };
  walk(conditions);
  return out;
}

// { headline, trigger, conditions: [{ text, passed, depth }], values: [{ label, value }], skipped }
export function explainRun(run) {
  const ex = run?.metadata?.explanation || run?.explanation || null;
  if (!ex) return { headline: "This run was recorded before explanations existed.", trigger: "", conditions: [], values: [], skipped: run?.status === "skipped" };
  const trigger = triggerSentence(ex);
  const conditions = conditionSentences(ex.conditions);
  const skipped = run?.status === "skipped" || ex.conditions?.matched === false;
  const held = conditions.filter((c) => !c.group && c.passed).length;
  const failed = conditions.find((c) => !c.group && !c.passed);
  const headline = skipped
    ? `Didn't run: ${failed ? failed.text.replace(" — it's", ", but it's") : "its conditions didn't hold"}.`
    : `Ran because ${trigger}${held ? ` and ${plural(held, "condition")} held` : ""}.`;
  return { headline: headline.charAt(0).toUpperCase() + headline.slice(1), trigger, conditions, values: ex.values || [], skipped };
}
