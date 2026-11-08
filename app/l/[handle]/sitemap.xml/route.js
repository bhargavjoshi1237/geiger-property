import { cachedListings, cachedSite } from "@/lib/leasing/public/cache";
import { absoluteUrl, listingPath, propertyPath, sitePath } from "@/lib/leasing/public/urls";

// GET /l/<handle>/sitemap.xml — the site's live pages (LEAS-01). A route handler rather than sitemap.js, because
// Next's sitemap convention doesn't pass the parent [handle] to the sitemap function.

const escapeXml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);
const day = (iso) => (iso ? String(iso).slice(0, 10) : null);
const latest = (dates) => dates.filter(Boolean).sort().at(-1) || null;

export async function GET(_request, { params }) {
  const { handle } = await params;
  const site = await cachedSite(handle);
  if (!site) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  const listings = await cachedListings(site);
  const byProperty = new Map();
  for (const l of listings) if (l.property.id) byProperty.set(l.property.id, [...(byProperty.get(l.property.id) || []), day(l.updatedAt)]);
  const urls = [
    { loc: absoluteUrl(sitePath(handle)), lastmod: latest(listings.map((l) => day(l.updatedAt))) },
    ...[...byProperty].map(([id, dates]) => ({ loc: absoluteUrl(propertyPath(handle, id)), lastmod: latest(dates) })),
    ...listings.map((l) => ({ loc: absoluteUrl(listingPath(handle, l.slug)), lastmod: day(l.updatedAt) })),
  ];
  const body = urls.map((u) => `  <url><loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
