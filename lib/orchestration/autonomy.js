import { SIDE_EFFECT_CATEGORIES, isSideEffectStep, stepCategory } from "@/lib/automations/catalog";
import { canContact, quietHoursEnd } from "@/lib/messaging/consent";

// Autonomy levels and guardrails (ORCH-05). The runner calls gate() before every step with a side effect; it answers
//   allow | review (raise a decision / approval and wait) | skip (log why, carry on) | defer (resume later).
// Guardrails apply in every mode: quiet hours defer messages, do-not-contact and the weekly message cap skip them,
// the per-run and per-day charge caps send charges for approval, and pauseAll stops the runner before any step.

export const GUARDRAILS_KEY = "automation_guardrails";

export const AUTONOMY_MODES = [
  { value: "suggest", label: "Suggest only", desc: "Never acts on its own — each step it would take becomes a decision in the Review Queue." },
  { value: "approve", label: "Ask first", desc: "Runs on its own but asks before the kinds of step you pick — charges and legal notices by default." },
  { value: "approve_over", label: "Ask above a limit", desc: "Charges at or above the limit wait for approval; smaller charges and messages go straight through." },
  { value: "auto", label: "Run automatically", desc: "Runs every step on its own. Guardrails still cap money and messages and respect quiet hours." },
];

export const autonomyLabel = (mode) => AUTONOMY_MODES.find((m) => m.value === mode)?.label || "Run automatically";

export const GUARDRAIL_DEFAULTS = {
  maxChargePerRun: 500,
  maxChargesPerDay: 100,
  maxMessagesPerRecordPerWeek: 5,
  quietHours: { enabled: true, start: "21:00", end: "08:00" },
  respectDoNotContact: true,
  pauseAll: false,
};

const num = (v, fallback) => (v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? fallback : Number(v));

// Company guardrails (settings) cascade to a property's metadata.guardrailOverrides, like resolvePolicies.
export function resolveGuardrails({ company, property } = {}) {
  const c = company && typeof company === "object" ? company : {};
  const o = property?.metadata?.guardrailOverrides || property?.guardrailOverrides || {};
  const merged = { ...GUARDRAIL_DEFAULTS, ...c, ...o };
  return {
    maxChargePerRun: num(merged.maxChargePerRun, GUARDRAIL_DEFAULTS.maxChargePerRun),
    maxChargesPerDay: num(merged.maxChargesPerDay, GUARDRAIL_DEFAULTS.maxChargesPerDay),
    maxMessagesPerRecordPerWeek: num(merged.maxMessagesPerRecordPerWeek, GUARDRAIL_DEFAULTS.maxMessagesPerRecordPerWeek),
    quietHours: { ...GUARDRAIL_DEFAULTS.quietHours, ...(c.quietHours || {}), ...(o.quietHours || {}) },
    respectDoNotContact: merged.respectDoNotContact !== false,
    pauseAll: Boolean(c.pauseAll),
  };
}

// A workflow's autonomy: { mode, appliesTo, threshold, approverRole } (appliesTo = gated step categories).
export function autonomyOf(automation) {
  const mode = ["suggest", "approve", "approve_over", "auto"].includes(automation?.autonomy) ? automation.autonomy : "auto";
  const cfg = automation?.autonomyConfig || automation?.metadata?.autonomyConfig || {};
  const fallback = mode === "suggest" ? SIDE_EFFECT_CATEGORIES : ["money", "legal"];
  const appliesTo = Array.isArray(cfg.appliesTo) && cfg.appliesTo.length ? cfg.appliesTo : fallback;
  return { mode, appliesTo, threshold: Number(cfg.threshold) || 0, approverRole: cfg.approverRole || "" };
}

// Pure mode decision for one step: null (go) or { kind, reasonCode }.
export function decideAutonomy(autonomy, { category, amount = 0 }) {
  const { mode, appliesTo, threshold } = autonomy;
  if (!SIDE_EFFECT_CATEGORIES.includes(category)) return null;
  if (mode === "suggest" && appliesTo.includes(category)) return { kind: "decision", reasonCode: "suggested_action" };
  if (mode === "approve" && appliesTo.includes(category)) return { kind: "approval", reasonCode: "approval_required" };
  if (mode === "approve_over" && category === "money" && Number(amount) >= threshold) return { kind: "approval", reasonCode: "approval_required" };
  return null;
}

// Pure charge-cap decision: null (go) or { kind, reasonCode, context }.
export function decideMoneyGuardrails(guardrails, { amount = 0, chargedThisRun = 0, chargesToday = 0 }) {
  const cap = guardrails.maxChargePerRun;
  if (cap > 0 && chargedThisRun + Number(amount) > cap) {
    return { kind: "approval", reasonCode: "guardrail_money_cap", context: { amount, cap } };
  }
  const daily = guardrails.maxChargesPerDay;
  if (daily > 0 && chargesToday >= daily) {
    return { kind: "approval", reasonCode: "guardrail_daily_charges", context: { amount, cap: daily, count: chargesToday } };
  }
  return null;
}

const isMessage = (category) => category === "message" || category === "legal";

// Charges this run already posted (from its step log).
export const chargedInRun = (log = []) =>
  log.filter((l) => l?.type === "post_charge" && l.status === "ok").reduce((s, l) => s + (Number(l.output?.amount) || 0), 0);

async function chargesPostedToday(admin, projectId, now) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  let q = admin
    .from("ledger_entries")
    .select("id", { count: "exact", head: true })
    .gte("created_at", start.toISOString())
    .not("metadata->>automationId", "is", null);
  q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
  const { count } = await q;
  return count || 0;
}

async function messagesThisWeek(admin, partyId, now) {
  if (!partyId) return 0;
  const { count } = await admin
    .from("notification_sends")
    .select("id", { count: "exact", head: true })
    .eq("job_key", "automations")
    .eq("record_id", partyId)
    .eq("status", "sent")
    .gte("created_at", new Date(now.getTime() - 7 * 86400000).toISOString());
  return count || 0;
}

// gate(admin, step, ctx, prepared) — ctx: { automation, run, log, guardrails, tz, now, approved }; prepared:
// { amount?, recipients?, channel? }. Returns { result, reasonCode?, kind?, context?, until?, recipients?, notes[] }.
export async function gate(admin, step, ctx, prepared = {}) {
  const category = stepCategory(step);
  const notes = [];
  if (!isSideEffectStep(step)) return { result: "allow", notes };
  const { guardrails, now } = ctx;
  const urgent = step.config?.category === "emergency";
  let recipients = prepared.recipients;

  if (isMessage(category) || prepared.recipients) {
    if (guardrails.quietHours?.enabled && !urgent) {
      const until = quietHoursEnd(now, { ...guardrails.quietHours, tz: ctx.tz });
      if (until) return { result: "defer", reasonCode: "quiet_hours", until, notes };
    }
    if (Array.isArray(recipients) && recipients.length) {
      const channel = prepared.channel || step.config?.channel || "email";
      const msgCategory = step.config?.category || "message";
      const kept = [];
      let retryAt = null;
      for (const p of recipients) {
        if (p.type === "team" || p.type === "other") {
          kept.push(p);
          continue;
        }
        const verdict = canContact(p, { channel, category: msgCategory, now, tz: ctx.tz });
        if (!verdict.ok && verdict.reason === "dnc" && guardrails.respectDoNotContact) {
          notes.push(`${p.name || "A recipient"} is marked do-not-contact — skipped`);
          continue;
        }
        if (!verdict.ok && verdict.reason === "quiet_hours") {
          retryAt = verdict.retryAt;
          kept.push(p);
          continue;
        }
        const cap = guardrails.maxMessagesPerRecordPerWeek;
        if (cap > 0 && !urgent && category !== "legal" && (await messagesThisWeek(admin, p.id, now)) >= cap) {
          notes.push(`${p.name || "A recipient"} already got ${cap} automated messages this week — skipped (guardrail)`);
          continue;
        }
        kept.push(p);
      }
      if (retryAt && kept.length) return { result: "defer", reasonCode: "quiet_hours", until: retryAt, notes };
      if (!kept.length) return { result: "skip", reasonCode: notes.some((n) => /do-not-contact/.test(n)) ? "do_not_contact" : "message_cap", notes };
      recipients = kept;
    }
  }

  if (ctx.approved) return { result: "allow", recipients, notes };

  if (category === "money") {
    const chargesToday = ctx.dryRun ? 0 : await chargesPostedToday(admin, ctx.projectId, now);
    const money = decideMoneyGuardrails(guardrails, { amount: prepared.amount, chargedThisRun: chargedInRun(ctx.log), chargesToday });
    if (money) return { result: "review", ...money, recipients, notes };
  }

  const mode = decideAutonomy(autonomyOf(ctx.automation), { category, amount: prepared.amount });
  if (mode) return { result: "review", ...mode, recipients, notes };
  return { result: "allow", recipients, notes };
}
