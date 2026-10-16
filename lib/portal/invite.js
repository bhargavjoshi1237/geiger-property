import { sendSuiteEmail } from "@/lib/email/client";
import { logActivity } from "@/lib/messaging/threads";
import { PORTAL_ROLES, ROLE_FOR_PARTY } from "./constants";
import { meta, rowOf, rowsOf } from "./http";
import { loadPortalSettings, roleEnabled, settingsFor } from "./session";
import { isEmail, normalizeEmail } from "./auth";

// Server-only staff side of portal access: invite (create / re-send the member
// row + email the invite through geiger-dash) and disable. Mirrors the access
// state onto the staff record (tenant portal_enabled / owner portal_access /
// vendor metadata) so the existing Portal tabs show it.

const fail = (status, error) => ({ ok: false, status, error });

async function loadParty(db, role, partyId, projectId) {
  const cfg = PORTAL_ROLES[role];
  const row = await rowOf(db.from(cfg.partyTable).select("*").eq("id", partyId).is("deleted_at", null).maybeSingle(), "invite.party");
  if (!row) return null;
  if (projectId && row.project_id && row.project_id !== projectId) return null;
  return row;
}

async function findMember(db, role, partyId) {
  const cfg = PORTAL_ROLES[role];
  const rows = await rowsOf(
    db.from("portal_members").select("*").eq("role", role).eq(cfg.partyColumn, partyId).is("deleted_at", null).limit(1),
    "invite.member",
  );
  return rows[0] || null;
}

// Party columns + metadata that mirror the portal state on the staff record.
async function mirrorOnParty(db, role, party, { enabled, portalStatus, extraMeta = {} }) {
  const cfg = PORTAL_ROLES[role];
  const cols = role === "resident" ? { portal_enabled: enabled } : role === "owner" ? { portal_access: enabled } : {};
  const patch = { portalStatus, ...extraMeta, ...(role === "vendor" ? { vendorPortalAccess: enabled } : {}) };
  if (Object.keys(cols).length) {
    const { error } = await db.from(cfg.partyTable).update(cols).eq("id", party.id);
    if (error) console.error("[portal.invite.party]", error.message);
  }
  const { error } = await db.rpc("merge_meta", { p_table: cfg.partyTable, p_id: party.id, p_patch: patch });
  if (error) console.error("[portal.invite.meta]", error.message);
}

const memberStaffView = (m) => ({
  id: m.id,
  role: m.role,
  email: m.email,
  status: m.status,
  invitedAt: m.invited_at,
  activatedAt: m.activated_at,
  lastSeenAt: m.last_seen_at,
  inviteCount: m.invite_count,
});

// invite({ db, projectId, actor, partyType, partyId, email?, baseUrl })
export async function invitePortalMember({ db, projectId, actor, partyType, partyId, email, baseUrl }) {
  const role = ROLE_FOR_PARTY[partyType];
  if (!role || !partyId) return fail(400, "Pick a tenant, owner or vendor to invite.");
  const cfg = PORTAL_ROLES[role];
  const party = await loadParty(db, role, partyId, projectId);
  if (!party) return fail(404, "That record isn't available.");
  const to = normalizeEmail(email || meta(party).portalInviteEmail || party.email);
  if (!isEmail(to)) return fail(400, `Add an email for this ${cfg.partyType} first.`);

  const now = new Date().toISOString();
  const pid = projectId || party.project_id || null;
  const existing = await findMember(db, role, partyId);
  const emailChanged = existing && existing.email !== to;
  const fields = {
    project_id: pid,
    email: to,
    name: party.name || "",
    role,
    [cfg.partyColumn]: partyId,
    invited_at: now,
    invited_by: actor?.id || null,
    invite_count: Number(existing?.invite_count || 0) + 1,
    ...(existing
      ? {
          status: existing.status === "active" && !emailChanged ? "active" : "invited",
          ...(emailChanged ? { auth_user_id: null, activated_at: null } : {}),
        }
      : { status: "invited", created_by: actor?.id || null }),
  };
  const res = existing
    ? await db.from("portal_members").update(fields).eq("id", existing.id).select("*").single()
    : await db.from("portal_members").insert(fields).select("*").single();
  if (res.error) {
    console.error("[portal.invite]", res.error.message);
    return fail(500, "Couldn't save the portal invite.");
  }
  const member = res.data;

  const settings = await loadPortalSettings(db, [pid]);
  const brand = settingsFor(settings, pid);
  const enabled = roleEnabled(settings, pid, role);
  const company = brand.displayName || "your property manager";
  const loginUrl = `${String(baseUrl || "").replace(/\/+$/, "")}/portal/login?email=${encodeURIComponent(to)}`;

  const sent = await sendSuiteEmail({
    template: "property.portal_invite",
    to,
    subject: `You're invited to the ${company} ${cfg.title.toLowerCase()}`,
    data: {
      name: party.name || "",
      email: to,
      role,
      roleLabel: cfg.label,
      portalTitle: cfg.title,
      companyName: brand.displayName || "",
      logoUrl: brand.logoUrl || "",
      loginUrl,
      supportEmail: brand.supportEmail || "",
      supportPhone: brand.supportPhone || "",
      invitedBy: actor?.name || "",
    },
  });

  await mirrorOnParty(db, role, party, {
    enabled: true,
    portalStatus: member.status === "active" ? "Active" : "Invited",
    extraMeta: { portalInvitedAt: now, portalInviteEmail: to },
  });
  await logActivity(db, {
    projectId: pid,
    ownerType: cfg.partyType,
    ownerId: partyId,
    verb: "portal",
    summary: sent.ok ? `Portal invite emailed to ${to}` : `Portal invite recorded for ${to} (email not sent)`,
    actorId: actor?.id,
    actorName: actor?.name,
  });

  return {
    ok: true,
    member: memberStaffView(member),
    emailed: Boolean(sent.ok),
    emailError: sent.ok ? "" : sent.error || "",
    portalEnabled: enabled,
    loginUrl,
  };
}

export async function disablePortalMember({ db, projectId, actor, partyType, partyId }) {
  const role = ROLE_FOR_PARTY[partyType];
  if (!role || !partyId) return fail(400, "Pick a tenant, owner or vendor.");
  const cfg = PORTAL_ROLES[role];
  const party = await loadParty(db, role, partyId, projectId);
  if (!party) return fail(404, "That record isn't available.");
  const member = await findMember(db, role, partyId);
  if (member) {
    const { error } = await db.from("portal_members").update({ status: "disabled" }).eq("id", member.id);
    if (error) {
      console.error("[portal.disable]", error.message);
      return fail(500, "Couldn't disable portal access.");
    }
  }
  await mirrorOnParty(db, role, party, { enabled: false, portalStatus: "Disabled" });
  await logActivity(db, {
    projectId: projectId || party.project_id || null,
    ownerType: cfg.partyType,
    ownerId: partyId,
    verb: "portal",
    summary: "Portal access disabled",
    actorId: actor?.id,
    actorName: actor?.name,
  });
  return { ok: true, member: member ? memberStaffView({ ...member, status: "disabled" }) : null };
}
