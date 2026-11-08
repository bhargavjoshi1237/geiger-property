// Lead acknowledgement (LEAS-02, isomorphic, pure): the email a new inquiry gets back at once. It goes through
// sendPartyMessage as the `lead_ack` notification (geiger-dash template property.lead_ack); {{recipient_name}} and
// {{company_name}} are merged from the project's records.

export const LEAD_ACK_NOTIFICATION = "lead_ack";
// One acknowledgement per prospect per window, so repeat inquiries don't each get one.
export const ACK_WINDOW_HOURS = 24;

export function leadAckMessage({ listingName = "", officePhone = "" } = {}) {
  const about = listingName ? ` about ${listingName}` : "";
  const subject = listingName ? `Thanks for your interest in ${listingName}` : "Thanks for reaching out";
  const body = [
    "Hi {{recipient_name}},",
    `Thanks for your inquiry${about}. We've received your message, and someone from our leasing team will be in touch soon.`,
    officePhone ? `If you'd like to talk sooner, reply to this email or call us at ${officePhone}.` : "If you'd like to talk sooner, just reply to this email.",
    "{{company_name}}",
  ].join("\n\n");
  return { subject, body };
}

// Was the prospect acknowledged within the window before `now`?
export function ackedRecently(metadata, now = new Date(), hours = ACK_WINDOW_HOURS) {
  const at = Date.parse(metadata?.lastAckAt || "");
  return Number.isFinite(at) && now.getTime() - at < hours * 3600 * 1000;
}
