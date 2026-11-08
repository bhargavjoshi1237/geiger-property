// Public addresses for the leasing site (LEAS-01): site handles and listing slugs.

// A site handle: /l/<handle>. Same rule as the leasing_sites_handle_format check.
export const HANDLE_PATTERN = /^[a-z0-9-]{3,40}$/;
export const isValidHandle = (h) => typeof h === "string" && HANDLE_PATTERN.test(h);

// Listing slugs that would collide with the site's own routes (/l/<handle>/embed).
const RESERVED_SLUGS = new Set(["embed", "gone"]);
const MAX_SLUG = 60;

// Lower-case words joined by dashes, at most `max` characters (the migration's backfill uses the same rule).
export function slugify(text, max = MAX_SLUG) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, max)
    .replace(/^-+|-+$/g, "");
}

// A handle suggestion from a company name (3–40 characters).
export function handleFrom(name) {
  const base = slugify(name, 40);
  return base.length >= 3 ? base : `${base || "homes"}-rentals`.slice(0, 40);
}

// The first free slug for `text`: the slugified title, then -2, -3… when `taken` (a Set) already holds it.
export function uniqueSlug(text, taken = new Set()) {
  let base = slugify(text) || "listing";
  if (base.length < 3 || RESERVED_SLUGS.has(base)) base = `${base}-home`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base.slice(0, MAX_SLUG - String(n).length - 1)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
