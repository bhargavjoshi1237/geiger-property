// Contact consent gate (LEAS-40 slice, isomorphic, pure). Reads the contact preferences already stored on a party's
// metadata — doNotContact, emailOptIn, smsOptIn, quietHoursStart/End — and answers whether a message may go now:
// { ok, reason: "dnc" | "no_consent" | "opted_out" | "quiet_hours" | "no_address", retryAt? }.
// Rules: do-not-contact blocks everything except legal and emergency messages; email opt-out only blocks
// announcements and marketing (transactional mail still goes); SMS needs an opt-in; a party's own quiet hours
// defer SMS unless it's an emergency. The full consent ledger (message_consents) is LEAS-40 proper.

const MARKETING = ["announcement", "marketing"];
const BYPASS_DNC = ["legal", "emergency"];

// Minutes since local midnight for `now` in an IANA timezone (falls back to UTC).
export function localMinutes(now, tz) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz || "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value) || 0;
    const m = Number(parts.find((p) => p.type === "minute")?.value) || 0;
    return h * 60 + m;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

export function parseClock(v) {
  const m = String(v || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return mins >= 0 && mins < 1440 ? mins : null;
}

// When `now` falls inside the [start, end) window (which may cross midnight), the Date it ends; else null.
export function quietHoursEnd(now, { start, end, tz } = {}) {
  const s = parseClock(start);
  const e = parseClock(end);
  if (s === null || e === null || s === e) return null;
  const cur = localMinutes(now, tz);
  const inside = s < e ? cur >= s && cur < e : cur >= s || cur < e;
  if (!inside) return null;
  const wait = (e - cur + 1440) % 1440 || 1440;
  const until = new Date(now.getTime() + wait * 60000);
  until.setUTCSeconds(0, 0);
  return until;
}

export function canContact(party, { channel = "email", category = "message", now = new Date(), tz } = {}) {
  const meta = party?.metadata || {};
  if (meta.doNotContact && !BYPASS_DNC.includes(category)) return { ok: false, reason: "dnc" };
  if (channel === "sms") {
    if (!party?.phone) return { ok: false, reason: "no_address" };
    if (meta.smsOptIn !== true && category !== "emergency") return { ok: false, reason: "no_consent" };
    if (category !== "emergency") {
      const until = quietHoursEnd(now, { start: meta.quietHoursStart, end: meta.quietHoursEnd, tz });
      if (until) return { ok: false, reason: "quiet_hours", retryAt: until };
    }
    return { ok: true };
  }
  if (channel === "email") {
    if (!party?.email) return { ok: false, reason: "no_address" };
    if (meta.emailOptIn === false && MARKETING.includes(category)) return { ok: false, reason: "opted_out" };
  }
  return { ok: true };
}
