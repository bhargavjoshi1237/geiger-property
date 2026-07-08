import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";

// Generic CRUD data-layer factory for a `property.*` table. Each area's data
// file is a thin config over this, so the many structurally-identical Leasing
// tables don't repeat 100 lines of boilerplate each. Same contract as the
// hand-written layers: pure actions, return null / false / [], console.error on
// failure, snake_case DB ↔ camelCase UI mapped at the boundary, soft delete.
//
// `fields`: [{ key, col, type: "text"|"number"|"date"|"bool", default? }].
// `order`: { col, ascending } — default created_at desc.

export function makeEntityData({ table, tag = table, fields, order }) {
  const orderCol = order?.col || "created_at";
  const orderAsc = order?.ascending ?? false;

  // Tolerant of both DB rows (snake) and already-normalized view models (camel)
  // so the engine's post-create re-normalize is a no-op, not a corruption.
  function normalize(row) {
    if (!row) return null;
    const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const out = {
      id: row.id,
      createdBy: row.created_by ?? row.createdBy ?? null,
      createdAt: row.created_at ?? row.createdAt ?? null,
    };
    for (const f of fields) {
      const raw = row[f.col] ?? row[f.key];
      if (f.type === "number") out[f.key] = Number(raw ?? f.default ?? 0);
      else if (f.type === "bool") out[f.key] = Boolean(raw ?? f.default ?? false);
      else out[f.key] = raw ?? f.default ?? "";
    }
    out.metadata = meta;
    return { ...out, ...meta };
  }

  function toRow(input) {
    const row = {};
    for (const f of fields) {
      if (!(f.key in input)) continue;
      const v = input[f.key];
      if (f.type === "number") row[f.col] = Number(v) || 0;
      else if (f.type === "date") row[f.col] = v || null;
      else if (f.type === "bool") row[f.col] = Boolean(v);
      else row[f.col] = v;
    }
    if ("createdBy" in input) row.created_by = input.createdBy;
    if ("metadata" in input && input.metadata && typeof input.metadata === "object")
      row.metadata = input.metadata;
    return row;
  }

  // `where` maps camel field keys → values (e.g. { kind: "in" }).
  async function list(where) {
    if (!isSupabaseConfigured()) return null;
    try {
      const sb = createClient();
      let q = sb
        .from(table)
        .select("*")
        .is("deleted_at", null)
        .order(orderCol, { ascending: orderAsc });
      if (where) {
        for (const [k, v] of Object.entries(where)) {
          const f = fields.find((x) => x.key === k);
          q = q.eq(f ? f.col : k, v);
        }
      }
      const { data, error } = await q;
      if (error) {
        console.error(`[${tag}.list]`, error.message);
        return null;
      }
      return (data || []).map(normalize);
    } catch (e) {
      console.error(`[${tag}.list]`, e);
      return null;
    }
  }

  async function get(id) {
    if (!id || !isSupabaseConfigured()) return null;
    try {
      const sb = createClient();
      const { data, error } = await sb
        .from(table)
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) {
        console.error(`[${tag}.get]`, error.message);
        return null;
      }
      return normalize(data);
    } catch (e) {
      console.error(`[${tag}.get]`, e);
      return null;
    }
  }

  async function create(input) {
    if (!isSupabaseConfigured()) return null;
    try {
      const sb = createClient();
      const payload = toRow(input);
      if (input.id) payload.id = input.id;
      const { data, error } = await sb.from(table).insert(payload).select("*").single();
      if (error) {
        console.error(`[${tag}.create]`, error.message);
        return null;
      }
      return normalize(data);
    } catch (e) {
      console.error(`[${tag}.create]`, e);
      return null;
    }
  }

  async function update(id, patch) {
    if (!id || !isSupabaseConfigured()) return null;
    try {
      const sb = createClient();
      const { data, error } = await sb
        .from(table)
        .update(toRow(patch))
        .eq("id", id)
        .select("*")
        .single();
      if (error) {
        console.error(`[${tag}.update]`, error.message);
        return null;
      }
      return normalize(data);
    } catch (e) {
      console.error(`[${tag}.update]`, e);
      return null;
    }
  }

  async function softDelete(id) {
    if (!id || !isSupabaseConfigured()) return false;
    try {
      const sb = createClient();
      const { error } = await sb
        .from(table)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        console.error(`[${tag}.delete]`, error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.error(`[${tag}.delete]`, e);
      return false;
    }
  }

  return {
    normalize,
    toRow,
    list,
    get,
    create,
    update,
    softDelete,
    // The contract the Entity engine binds to (list() = all rows).
    data: {
      list: () => list(),
      create,
      update,
      softDelete,
      normalize,
    },
  };
}

// Build a lens `data` object that binds a base filter + create defaults onto an
// existing entity-data layer (e.g. Move-in = moves where kind="in").
export function lensData(base, { where, defaults = {} }) {
  return {
    list: () => base.list(where),
    create: (input) => base.create({ ...defaults, ...input }),
    update: base.update,
    softDelete: base.softDelete,
    normalize: base.normalize,
  };
}
