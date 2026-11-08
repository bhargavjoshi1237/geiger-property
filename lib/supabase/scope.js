// Project scope for every property.* query (PLAT-01b): each row belongs to one project and no read falls back to project-less rows.

// Matches no row: the browser's scope while no project is active.
const NO_PROJECT = "00000000-0000-0000-0000-000000000000";

// Narrow a query to one project. A missing id is a bug, so it throws instead of widening the read.
export function forProject(q, projectId) {
  if (!projectId) throw new Error("A project is required for this query.");
  return q.eq("project_id", projectId);
}

// Scheduled jobs: the one project of a staff "Run now", else every project (cron), never rows without a project.
export function forProjectOrAll(q, projectId) {
  return projectId ? q.eq("project_id", projectId) : q.not("project_id", "is", null);
}

// --- Browser: the active project ---------------------------------------------------

let activeProjectId = null;

export function setActiveProjectId(id) {
  activeProjectId = id || null;
}

export function getActiveProjectId() {
  return activeProjectId;
}

// Narrow a browser select to the active project; no active project reads no rows.
export function scopeQuery(q) {
  return q.eq("project_id", activeProjectId || NO_PROJECT);
}

// Shared reference tables (legal_*): global rows (no project) plus the active project's own rows.
export function scopeReference(q) {
  return activeProjectId ? q.or(`project_id.is.null,project_id.eq.${activeProjectId}`) : q.is("project_id", null);
}

// Stamp an insert payload with the active project unless the caller set one.
export function stampProject(payload) {
  if (!activeProjectId || payload.project_id) return payload;
  return { ...payload, project_id: activeProjectId };
}
