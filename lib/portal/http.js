// Server-only response helpers shared by every /api/portal route.

export const portalJson = (data = {}, status = 200) => Response.json({ ok: true, ...data }, { status });

export const portalError = (status, error) => Response.json({ ok: false, error }, { status });

export async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

// Trimmed string (capped) from untrusted input.
export const str = (v, max = 2000) => String(v ?? "").trim().slice(0, max);

// Positive money amount rounded to cents, or 0.
export const amountOf = (v) => {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  return n > 0 ? n : 0;
};

// "YYYY-MM-DD" when the input is a valid date string, else "".
export const dateOf = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "");

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const meta = (row) => (row?.metadata && typeof row.metadata === "object" ? row.metadata : {});

// Run a PostgREST builder → rows ([] on error, logged under `tag`).
export async function rowsOf(builder, tag) {
  try {
    const { data, error } = await builder;
    if (error) {
      console.error(`[portal.${tag}]`, error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error(`[portal.${tag}]`, e);
    return [];
  }
}

// Single row or null.
export async function rowOf(builder, tag) {
  try {
    const { data, error } = await builder;
    if (error) {
      console.error(`[portal.${tag}]`, error.message);
      return null;
    }
    return data || null;
  } catch (e) {
    console.error(`[portal.${tag}]`, e);
    return null;
  }
}

// `.in()` over a long id list in chunks.
export async function rowsIn(admin, table, column, ids, tag, { select = "*", live = true } = {}) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  const out = [];
  for (let i = 0; i < unique.length; i += 150) {
    let q = admin.from(table).select(select).in(column, unique.slice(i, i + 150));
    if (live) q = q.is("deleted_at", null);
    out.push(...(await rowsOf(q, tag)));
  }
  return out;
}

// Shallow-merge a metadata patch through property.merge_meta (one writer never clobbers another).
export async function mergeMeta(admin, table, id, patch) {
  try {
    const { error } = await admin.rpc("merge_meta", { p_table: table, p_id: id, p_patch: patch });
    if (error) {
      console.error("[portal.merge_meta]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[portal.merge_meta]", e);
    return false;
  }
}
