// Lead email addresses (LEAS-02, isomorphic). Each listing gets leads+<listingId>@<domain> to give listing sites, and the
// project has leads+<projectId>@<domain> for sites that send every lead to one address; the inbound webhook resolves the
// id to a listing or a project, so the mail itself names where the lead belongs (never the sender or the body).

export const LEAD_LOCAL = "leads";

// The lead domain: NEXT_PUBLIC_LEADS_EMAIL_DOMAIN, else the inbound-email domain the intake addresses use.
export const leadDomain = () =>
  process.env.NEXT_PUBLIC_LEADS_EMAIL_DOMAIN || process.env.NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN || process.env.INBOUND_EMAIL_DOMAIN || "";

export function leadAddress(id, domain = leadDomain()) {
  const host = String(domain || "").trim().replace(/^@/, "");
  return id && host ? `${LEAD_LOCAL}+${id}@${host}` : "";
}

const LEAD_ADDRESS = /(?:^|[\s<,;"'])leads\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@[^\s<>"',;]+/i;
const REPLY_ADDRESS = /(?:^|[\s<,;"'])reply\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@[^\s<>"',;]+/i;

// Recipients (a string, a list, { email } or a mix) → flat address strings.
export function recipientList(...lists) {
  return lists
    .flat(2)
    .flatMap((r) => (r && typeof r === "object" ? [r.email || r.address || ""] : String(r || "").split(/[,;]/)))
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, 20);
}

// The first leads+<uuid>@ recipient → { id, address }, else null. The id is a listing's or a project's.
export function parseLeadAddress(...lists) {
  for (const raw of recipientList(...lists)) {
    const m = ` ${raw}`.match(LEAD_ADDRESS);
    if (m) return { id: m[1].toLowerCase(), address: m[0].trim().replace(/^[<,;"']/, "").toLowerCase() };
  }
  return null;
}

// The thread a reply+<threadId>@ recipient names, else null.
export function parseReplyAddress(...lists) {
  for (const raw of recipientList(...lists)) {
    const m = ` ${raw}`.match(REPLY_ADDRESS);
    if (m) return m[1].toLowerCase();
  }
  return null;
}
