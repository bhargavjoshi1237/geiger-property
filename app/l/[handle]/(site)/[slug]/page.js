import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, MapPin } from "lucide-react";

import { LogoLoading } from "@geiger/ui";
import { GoneView, SimilarHomes } from "@/components/leasing_site/gone_view";
import {
  ContactCard,
  CriteriaSection,
  FeaturesSection,
  FurnishedSection,
  Gallery,
  PetsSection,
  PricingSection,
  PublicSection,
  TermsSection,
  ToursSection,
} from "@/components/leasing_site/listing_detail";
import ListingMap from "@/components/leasing_site/listing_map";
import { PAGE_WIDTH } from "@/components/leasing_site/site_chrome";
import { cachedCriteria, cachedListing, cachedSite } from "@/lib/leasing/public/cache";
import { addressLine, layoutLabel, listingSummary } from "@/lib/leasing/public/format";
import { jsonLdScript, listingJsonLd } from "@/lib/leasing/public/serialize";
import { absoluteUrl, listingPath, propertyPath, sitePath } from "@/lib/leasing/public/urls";

// A public listing (LEAS-01): ISR — rendered on first visit, then served from cache and refreshed every 60s or when
// the listing changes. Draft, Paused or website-off listings 404; Leased and Archived ones 410 (proxy.js → ./gone).
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

async function load(params) {
  const { handle, slug } = await params;
  const site = await cachedSite(handle);
  return { handle, slug, site, res: site ? await cachedListing(site, slug) : null };
}

export async function generateMetadata({ params }) {
  const { handle, slug, site, res } = await load(params);
  if (!site || !res) return {};
  if (res.state !== "live") return { title: "No longer available", robots: { index: false, follow: true } };
  const l = res.listing;
  const url = absoluteUrl(listingPath(handle, slug));
  const description = [l.headline, listingSummary(l)].filter(Boolean).join(" — ").slice(0, 300);
  const image = l.photos[0];
  return {
    title: l.title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title: l.title, description, siteName: site.displayName, images: image ? [{ url: image.url, alt: image.alt }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title: l.title, description },
  };
}

const osmUrl = (geo) => `https://www.openstreetmap.org/?mlat=${geo.lat}&mlon=${geo.lng}#map=16/${geo.lat}/${geo.lng}`;

export default async function PublicListingPage({ params }) {
  const { handle, slug, site, res } = await load(params);
  if (!site || !res) notFound();
  if (res.state === "gone") return <GoneView site={site} listing={res.listing} />;
  const l = res.listing;
  const criteria = await cachedCriteria(site);
  const address = addressLine(l.property.address);
  const jsonLd = listingJsonLd(l, { url: absoluteUrl(listingPath(handle, slug)), siteName: site.displayName });

  return (
    <article className={`${PAGE_WIDTH} space-y-8 py-6 sm:py-8`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-text-secondary">
          <li>
            <Link href={sitePath(handle)} className="hover:text-foreground">
              All homes
            </Link>
          </li>
          {l.property.id && l.property.name ? (
            <li className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              <Link href={propertyPath(handle, l.property.id)} className="hover:text-foreground">
                {l.property.name}
              </Link>
            </li>
          ) : null}
          <li className="flex min-w-0 items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span aria-current="page" className="truncate text-foreground">
              {l.unitLabel || l.title}
            </span>
          </li>
        </ol>
      </nav>

      <Gallery photos={l.photos} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <header className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{l.title}</h1>
            {address ? (
              <p className="flex items-start gap-1.5 text-sm text-text-secondary">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {address}
                  {l.unitLabel ? ` · ${l.unitLabel}` : ""}
                </span>
              </p>
            ) : null}
            <p className="text-sm text-foreground">{layoutLabel(l)}</p>
          </header>

          {l.headline || l.description || l.highlights.length ? (
            <section aria-label="About this home" className="space-y-4">
              {l.headline ? <p className="text-base font-medium text-foreground">{l.headline}</p> : null}
              {l.description ? <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{l.description}</p> : null}
              {l.highlights.length ? (
                <ul className="list-disc space-y-1 pl-5 text-sm text-foreground marker:text-text-secondary">
                  {l.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          <div className="lg:hidden">
            <ContactCard listing={l} />
          </div>

          <PricingSection listing={l} />
          <TermsSection listing={l} />
          <PetsSection listing={l} />
          <FeaturesSection listing={l} />
          <FurnishedSection listing={l} />
          <ToursSection listing={l} />
          {l.property.geo || l.neighborhood ? (
            <PublicSection id="location" title="Location">
              {l.neighborhood ? <p className="mb-4 whitespace-pre-line text-sm text-foreground">{l.neighborhood}</p> : null}
              {l.property.geo ? (
                <div className="space-y-2">
                  <ListingMap lat={l.property.geo.lat} lng={l.property.geo.lng} label={l.property.name || l.title} />
                  <a
                    href={osmUrl(l.property.geo)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-text-secondary underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Open in OpenStreetMap<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </div>
              ) : null}
            </PublicSection>
          ) : null}
          <CriteriaSection criteria={criteria} />
        </div>

        <aside aria-label="Rent and contact" className="hidden lg:block">
          <div className="sticky top-20">
            <ContactCard listing={l} />
          </div>
        </aside>
      </div>

      <Suspense fallback={<LogoLoading size={48} className="mx-auto" />}>
        <SimilarHomes site={site} like={{ slug: l.slug, propertyId: l.property.id, bedrooms: l.bedrooms }} title="More homes like this" />
      </Suspense>
    </article>
  );
}
