// Whether a listing is live on the public leasing site, and if not the first thing to fix (LEAS-01). The same rules
// the server applies in lib/leasing/public/site.js, phrased for the listing editor's "Public page" card.

// publicPageStatus({ site, listing, websiteOn, propertyPublishes }) → { live, reason, fix } (fix: settings | publish |
// syndication | property | address | null).
export function publicPageStatus({ site, listing, websiteOn, propertyPublishes = true }) {
  const no = (reason, fix) => ({ live: false, reason, fix });
  if (!site || site.error) return no(site?.error ? "Couldn't check your leasing website." : "Your leasing website isn't set up yet.", "settings");
  if (!site.enabled) return no("Your leasing website is switched off.", "settings");
  const status = listing?.status || "Draft";
  if (status === "Leased" || status === "Archived") {
    return no(`This listing is ${status.toLowerCase()}, so its page tells visitors the home is no longer available.`, null);
  }
  if (status !== "Active") return no(`This listing is ${status.toLowerCase()} — publish it to put it online.`, "publish");
  if (!websiteOn) return no("The Company website channel is off for this listing.", "syndication");
  if (!propertyPublishes) return no("Its property is set not to publish vacancies (Property → Marketing).", "property");
  if (!listing.slug) return no("It doesn't have a public address yet.", "address");
  return { live: true, reason: "", fix: null };
}
