// Active-project scope for every property.* data layer. ProjectProvider sets the
// id once the project resolves; lists filter to it and inserts stamp it. Rows
// created before scoping existed (project_id null) stay visible in every project.

let activeProjectId = null;

export function setActiveProjectId(id) {
  activeProjectId = id || null;
}

export function getActiveProjectId() {
  return activeProjectId;
}

// Narrow a PostgREST select builder to the active project (plus legacy rows).
export function scopeQuery(q) {
  if (!activeProjectId) return q;
  return q.or(`project_id.eq.${activeProjectId},project_id.is.null`);
}

// Stamp an insert payload with the active project unless the caller set one.
export function stampProject(payload) {
  if (!activeProjectId || payload.project_id) return payload;
  return { ...payload, project_id: activeProjectId };
}
