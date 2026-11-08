import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Clock, Mail, MapPin, Phone } from "lucide-react";

import { ListingGrid, NoListings } from "@/components/leasing_site/listing_card";
import ListingMap from "@/components/leasing_site/listing_map";
import { PAGE_WIDTH } from "@/components/leasing_site/site_chrome";
import { cachedListings, cachedProperty, cachedSite } from "@/lib/leasing/public/cache";
import { telHref } from "@/lib/leasing/public/ctas";
import { addressLine, money } from "@/lib/leasing/public/format";
import { summarizeListing } from "@/lib/leasing/public/serialize";
import { absoluteUrl, propertyPath, sitePath } from "@/lib/leasing/public/urls";

// One property's availability (LEAS-01): its public details and every live listing there. ISR like listing pages.
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

async function load(params) {
  const { handle, propertyId } = await params;
  const site = await cachedSite(handle);
  const property = site ? await cachedProperty(site, propertyId) : null;
  const listings = property ? (await cachedListings(site)).filter((l) => l.property.id === property.id) : [];
  return { handle, site, property, listings };
}

export async function generateMetadata({ params }) {
  const { handle, property, listings } = await load(params);
  if (!property) return {};
  const where = [property.address.city, property.address.state].filter(Boolean).join(", ");
  return {
    title: `${property.name} availability`,
    description: `${listings.length} ${listings.length === 1 ? "home" : "homes"} available at ${property.name}${where ? ` in ${where}` : ""}. ${property.headline}`.trim(),
    alternates: { canonical: absoluteUrl(propertyPath(handle, property.id)) },
  };
}

export default async function PropertyAvailabilityPage({ params }) {
  const { handle, property, listings } = await load(params);
  if (!property) notFound();
  const address = addressLine(property.address);
  const rents = listings.map((l) => l.rent).filter((r) => r > 0);
  const details = [
    property.officeHours ? { icon: Clock, text: `Office hours: ${property.officeHours}` } : null,
    property.phone ? { icon: Phone, text: property.phone, href: telHref(property.phone) } : null,
    property.email ? { icon: Mail, text: property.email, href: `mailto:${property.email}` } : null,
  ].filter(Boolean);

  return (
    <div className={`${PAGE_WIDTH} space-y-8 py-6 sm:py-8`}>
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <li>
            <Link href={sitePath(handle)} className="hover:text-foreground">
              All homes
            </Link>
          </li>
          <li className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span aria-current="page" className="text-foreground">
              {property.name}
            </span>
          </li>
        </ol>
      </nav>

      <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start">
        <div className="min-w-0 space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{property.name}</h1>
          {address ? (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {address}
                {property.neighborhood ? ` · ${property.neighborhood}` : ""}
              </span>
            </p>
          ) : null}
          {property.headline ? <p className="text-base font-medium text-foreground">{property.headline}</p> : null}
          {property.description ? <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{property.description}</p> : null}
          {property.petPolicy || property.parking ? (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {property.petPolicy ? (
                <div>
                  <dt className="text-muted-foreground">Pets</dt>
                  <dd className="text-foreground">{property.petPolicy}</dd>
                </div>
              ) : null}
              {property.parking ? (
                <div>
                  <dt className="text-muted-foreground">Parking</dt>
                  <dd className="text-foreground">{property.parking}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {details.length ? (
            <ul className="space-y-1.5 text-sm">
              {details.map((d) => (
                <li key={d.text} className="flex items-center gap-2 text-muted-foreground">
                  <d.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {d.href ? (
                    <a href={d.href} className="break-all hover:text-foreground">
                      {d.text}
                    </a>
                  ) : (
                    d.text
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {property.geo ? <ListingMap lat={property.geo.lat} lng={property.geo.lng} label={property.name} /> : null}
      </header>

      <section aria-labelledby="available" className="space-y-4">
        <h2 id="available" className="text-lg font-semibold text-foreground">
          {listings.length ? `${listings.length} ${listings.length === 1 ? "home" : "homes"} available${rents.length ? ` from ${money(Math.min(...rents))}/mo` : ""}` : "Available homes"}
        </h2>
        {listings.length ? (
          <ListingGrid handle={handle} listings={listings.map(summarizeListing)} />
        ) : (
          <NoListings>Nothing is available here right now. Check back soon, or see every home we have.</NoListings>
        )}
      </section>
    </div>
  );
}
