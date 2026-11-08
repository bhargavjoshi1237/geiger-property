import { evaluate, matchesAny, permissionKeys, resolveGrants } from "@geiger/rbac";

// Pure, isomorphic RBAC helpers: permission keys, pre-01a key aliases, the fail-closed authorizer and role catalog sync.
// The catalog is geiger-rbac.config.js; functions that need it take it as an argument.

export const PRODUCT = "property";
const PREFIX = `${PRODUCT}.`;

export function normalizeRoleId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Key segment for a nav title; segments need a leading letter, so "1099 Summary" becomes "page_1099_summary".
export function navSlug(title) {
  const slug = normalizeRoleId(title);
  return /^[a-z]/.test(slug) ? slug : `page_${slug}`;
}

export const navPermissionKey = (title) => `${PREFIX}${navSlug(title)}.view`;

// Pre-01a short keys → catalog keys; mirrors property.rbac_migrate_key() in the adopt_rbac migration.
export const LEGACY_PERMISSION_KEYS = Object.freeze({
  "team.invite": "property.team.invite",
  "team.assign_roles": "property.team.assign",
  "roles.manage": "property.role.manage",
  "billing.manage": "property.billing.manage",
  "settings.manage": "property.settings.manage",
  "records.delete": "property.record.delete",
  "accounting.post": "property.accounting.post",
  "accounting.void": "property.accounting.void",
  "reports.export": "property.report.export",
  "reports.schedule": "property.report.schedule",
  "review.resolve": "property.review.resolve",
  "automations.manage": "property.automation.manage",
  "automations.run": "property.automation.run",
});

// Any key a caller passes (catalog key, legacy short key or legacy `view.<slug>`) → its catalog key.
export function toPermissionKey(key) {
  if (typeof key !== "string" || key === "*" || key.startsWith(PREFIX)) return key;
  if (LEGACY_PERMISSION_KEYS[key]) return LEGACY_PERMISSION_KEYS[key];
  if (key.startsWith("view.")) return navPermissionKey(key.slice("view.".length));
  return key;
}

const isWildcard = (p) => p === "*" || (typeof p === "string" && p.endsWith(".*"));

// Owner-grade: the role reaches every Property key through a wildcard.
export const isOwnerGrade = (permissions = []) => permissions.some((p) => p === "*" || p === `${PREFIX}*`);

// Does the role hold this key through a wildcard rather than by name (so the matrix can't toggle it)?
export const heldByWildcard = (permissions = [], key) =>
  !permissions.includes(key) && matchesAny(permissions.filter(isWildcard), key);

// Property keys a role names explicitly (wildcards and other products' keys left out).
export const productKeysOf = (permissions = []) => permissions.filter((p) => p.startsWith(PREFIX) && !isWildcard(p));

// A shared role's permissions with its Property part replaced by `keys`; other products' keys and wildcards survive.
export function withProductKeys(permissions = [], keys = []) {
  const kept = permissions.filter((p) => !p.startsWith(PREFIX) || isWildcard(p));
  return [...new Set([...kept, ...keys])];
}

// Fail-closed decisions for one user: evaluate() over their grants, accepting legacy keys at the door.
export function makeAuthorizer({ config, roles = [], grants = [], actorId = null }) {
  const resolved = resolveGrants({ config, roles, grants });
  const options = { config, roles, grants, actorId, resolved };
  const decide = (key, extra = {}) => evaluate(toPermissionKey(key), { ...options, ...extra });
  const live = grants.filter((g) => (g.status ?? "active") === "active" && !g.deletedAt);
  const held = roles.filter((r) => live.some((g) => String(g.roleId) === String(r.id)));
  return {
    resolved,
    decide,
    can: (key, extra) => decide(key, extra).allowed,
    roles: held,
    isOwner: held.some((r) => isOwnerGrade(r.permissions)),
  };
}

// Writes that bring a project's roles up to the catalog: insert missing system roles; top up keys a role never decided
// on (not in `propertyKnown`) from its system definition, else from the key's parent. Decided keys are never touched,
// except that an added page brings its nav section (a section only reveals the pages a role holds).
export function planRoleSync(roles = [], config, parentOf = () => null, sectionOf = () => null) {
  const keys = permissionKeys(config);
  const byKey = new Map(roles.filter((r) => r.key).map((r) => [r.key, r]));
  const inserts = config.systemRoles
    .filter((def) => !byKey.has(def.key))
    .map((def) => ({
      key: def.key,
      name: def.name,
      description: def.description,
      color: def.color,
      permissions: [...def.permissions],
      isSystem: true,
      sort: def.sort,
      propertyKnown: keys,
    }));

  const updates = [];
  for (const role of roles) {
    const known = new Set(Array.isArray(role.propertyKnown) ? role.propertyKnown : []);
    const fresh = keys.filter((k) => !known.has(k));
    if (!fresh.length) continue;
    const perms = Array.isArray(role.permissions) ? role.permissions : [];
    const def = config.systemRoles.find((d) => d.key === role.key);
    const added = new Set();
    const holds = (k) => added.has(k) || matchesAny(perms, k);
    // Catalog order puts sections before their pages and views before actions, so parents resolve first.
    for (const k of fresh) {
      if (holds(k)) continue;
      const parent = parentOf(k);
      if (!(def ? matchesAny(def.permissions, k) : parent && holds(parent))) continue;
      added.add(k);
      const section = sectionOf(k);
      if (section && !holds(section)) added.add(section);
    }
    if (!added.size && !def && !known.size) continue;
    updates.push({ id: role.id, permissions: [...perms, ...added], propertyKnown: keys });
  }
  return { inserts, updates };
}
