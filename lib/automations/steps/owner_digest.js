import { computeMetrics } from "@/lib/metrics/server";
import { sendPartyMessage } from "@/lib/messaging/send";
import { loadParty } from "@/lib/messaging/threads";
import { link } from "@/lib/orchestration/records";
import { forProject } from "@/lib/supabase/scope";

// owner_digest (Weekly owner digest playbook): one KPI email per owner for the properties they own, computed with the
// shared metrics layer so the numbers match the Overview. Recipients pass the gate as a message step (do-not-contact,
// weekly cap, quiet hours); each owner is claimed in notification_sends first, so a retry never emails twice.

export const DIGEST_METRICS = ["occupancy", "rent_collected", "collection_rate", "delinquent_balance", "open_work_orders"];
const LABELS = {
  occupancy: "Occupancy",
  rent_collected: "Rent collected this month",
  collection_rate: "Collection rate",
  delinquent_balance: "Delinquent balance",
  open_work_orders: "Open work orders",
};
const AUTOMATION_ACTOR = { id: null, name: "Automation", email: "" };

// Active owner → property links for the project.
async function ownerProperties(admin, projectId, today) {
  const { data } = await forProject(admin.from("property_owners").select("owner_id, property_id, property_name, ends_on").is("deleted_at", null), projectId);
  const map = new Map();
  for (const r of data || []) {
    if (!r.owner_id || !r.property_id || (r.ends_on && r.ends_on < today)) continue;
    if (!map.has(r.owner_id)) map.set(r.owner_id, []);
    map.get(r.owner_id).push({ id: r.property_id, name: r.property_name || "Property" });
  }
  return map;
}

export const ownerDigestStep = {
  async prepare(admin, step, ctx) {
    const props = await ownerProperties(admin, ctx.projectId, ctx.now.toISOString().slice(0, 10));
    const recipients = (await Promise.all([...props.keys()].map((id) => loadParty(admin, "owner", id)))).filter(Boolean);
    return {
      recipients,
      channel: "email",
      input: { owners: recipients.map((p) => ({ id: p.id, name: p.name, address: p.email })), metrics: DIGEST_METRICS },
    };
  },

  async perform(admin, step, ctx, prepared) {
    const today = ctx.now.toISOString().slice(0, 10);
    const props = await ownerProperties(admin, ctx.projectId, today);
    const cache = new Map();
    const sent = [];
    const skipped = [];
    for (const owner of prepared.recipients || []) {
      if (!owner.email) {
        skipped.push(`${owner.name || "An owner"} has no email`);
        continue;
      }
      const properties = props.get(owner.id) || [];
      const dedupeKey = `digest:${ctx.run.id}:${owner.id}`;
      const { data: inserted } = await admin
        .from("notification_sends")
        .insert({
          project_id: ctx.projectId,
          dedupe_key: dedupeKey,
          job_key: "automations",
          notification: "owner_digest",
          channel: "email",
          recipient: owner.email,
          record_type: "owner",
          record_id: owner.id,
          status: "sending",
          metadata: { automationId: ctx.automation.id, runId: ctx.run.id },
        })
        .select("id")
        .maybeSingle();
      // On a retry, only an owner whose earlier send went out is skipped; a failed send is tried again.
      let claim = inserted;
      if (!claim) {
        const { data: existing } = await admin.from("notification_sends").select("id, status").eq("dedupe_key", dedupeKey).maybeSingle();
        if (existing?.status === "sent") {
          sent.push({ owner, status: "already_sent" });
          continue;
        }
        claim = existing;
      }
      const metrics = await computeMetrics(admin, ctx.projectId, DIGEST_METRICS, { now: ctx.now, params: { propertyIds: properties.map((p) => p.id) }, cache });
      const lines = DIGEST_METRICS.filter((k) => metrics[k]).map((k) => `• ${LABELS[k]}: ${metrics[k].display ?? "—"}`);
      const body = [
        `Hi ${owner.name || "there"},`,
        "",
        `Here's this week's update for ${properties.map((p) => p.name).join(", ") || "your properties"}:`,
        "",
        ...lines,
        ...(step.config?.note ? ["", step.config.note] : []),
        "",
        ctx.values?.company_name || "",
      ].join("\n");
      const res = await sendPartyMessage({
        db: admin,
        projectId: ctx.projectId,
        actor: AUTOMATION_ACTOR,
        party: owner,
        channel: "email",
        subject: step.config?.subject || "Your weekly property update",
        body,
        refs: { projectId: ctx.projectId, ownerId: owner.id },
        notification: "owner_statement",
        metadata: { automationId: ctx.automation.id, runId: ctx.run.id },
      });
      if (claim?.id) {
        await admin
          .from("notification_sends")
          .update({ status: res.ok && res.status === "sent" ? "sent" : res.status || "failed", error: res.error || null })
          .eq("id", claim.id);
      }
      if (res.ok) sent.push({ owner, status: res.status });
      else skipped.push(`${owner.name}: ${res.error || "send failed"}`);
    }
    if (!sent.length && skipped.length && (prepared.recipients || []).length) throw new Error(skipped[0]);
    return {
      status: skipped.length || sent.some((s) => s.status !== "sent") ? "warning" : "ok",
      message: `${sent.length} owner digest${sent.length === 1 ? "" : "s"} — ${[...new Set(sent.map((s) => s.status))].join(", ") || "none sent"}${skipped.length ? ` · ${skipped.join("; ")}` : ""}`,
      input: prepared.input,
      output: { sent: sent.length, skipped: skipped.length },
      links: sent.map((s) => link("owner", s.owner.id, s.owner.name)),
    };
  },
};
