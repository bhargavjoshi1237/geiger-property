// Prospect pipeline stages (LEAS-02, isomorphic): one implementation for the browser screens (anon client, RLS) and
// the server (service role, scoped to the project). `db` is any Supabase client pinned to the property schema.

export const STAGE_RANK = { New: 0, Contacted: 1, Touring: 2, Toured: 3, Applied: 4, Converted: 5, Leased: 5, Lost: 6 };
const STAGE_LABELS = { Touring: "Showing scheduled" };

export const stageLabel = (s) => STAGE_LABELS[s] || s || "—";
export const stageChangeSummary = (from, to, note) => `Stage: ${stageLabel(from)} → ${stageLabel(to)}${note ? ` (${note})` : ""}`;

// Append a stage transition to a prospect's metadata.stageHistory.
export function nextStageHistory(prospect, to, note, at = new Date()) {
  const history = Array.isArray(prospect?.metadata?.stageHistory) ? prospect.metadata.stageHistory : [];
  return [...history, { id: crypto.randomUUID(), from: prospect?.status || "", to, note: note || "", at: new Date(at).toISOString() }];
}

// Should a prospect at `from` move to `to`? Only forward unless forced; never to where it already is.
export const shouldAdvance = (from, to, force = false) => from !== to && (force || (STAGE_RANK[from] ?? 0) < (STAGE_RANK[to] ?? 0));

// Move a prospect to a stage: status, stage history and an activity row. Skips backwards moves unless forced.
// → the prospect row (unchanged when skipped), or null when it can't be read or written. Never throws.
export async function advanceProspect(db, prospectId, to, note, { force = false, projectId = null, actor = null, at = new Date() } = {}) {
  if (!db || !prospectId || !to) return null;
  try {
    let q = db.from("prospects").select("*").eq("id", prospectId).is("deleted_at", null);
    if (projectId) q = q.eq("project_id", projectId);
    const { data: p, error } = await q.maybeSingle();
    if (error || !p) return null;
    if (!shouldAdvance(p.status, to, force)) return p;

    let w = db.from("prospects").update({ status: to }).eq("id", prospectId);
    if (projectId) w = w.eq("project_id", projectId);
    const { data: updated, error: writeError } = await w.select("*").maybeSingle();
    if (writeError || !updated) return null;

    const history = nextStageHistory(p, to, note, at);
    const { data: meta } = await db.rpc("merge_meta", { p_table: "prospects", p_id: prospectId, p_patch: { stageHistory: history } });
    await db.from("activity").insert({
      project_id: p.project_id,
      owner_type: "prospect",
      owner_id: prospectId,
      verb: "stage",
      summary: stageChangeSummary(p.status, to, note),
      actor_id: actor?.id || null,
      actor_name: actor?.name || "",
      occurred_at: new Date(at).toISOString(),
      metadata: { system: true },
    });
    return { ...updated, metadata: meta || { ...(updated.metadata || {}), stageHistory: history } };
  } catch (e) {
    console.error("[leads.stage]", e);
    return null;
  }
}
