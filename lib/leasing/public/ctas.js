// Calls to action on a public listing (LEAS-01). Until LEAS-02 (inquiry form), LEAS-05 (online application) and LEAS-14
// (self-scheduled tours) ship, each opens the listing's own contact: its tour booking link, else an email or a call.

export const telHref = (phone) => (phone ? `tel:${String(phone).replace(/[^\d+]/g, "")}` : "");
const mailto = (email, subject) => `mailto:${email}?subject=${encodeURIComponent(subject)}`;

// listingCtas(listing) → { ask, tour, apply } — each { href, external } or null when the listing has no contact.
export function listingCtas(l) {
  const { email, phone } = l.contact || {};
  const reach = (subject) => (email ? { href: mailto(email, subject), external: false } : phone ? { href: telHref(phone), external: false } : null);
  return {
    ask: reach(`Question about ${l.title}`),
    tour: l.tours?.bookingUrl ? { href: l.tours.bookingUrl, external: true } : reach(`Tour request: ${l.title}`),
    apply: reach(`Application: ${l.title}`),
  };
}
