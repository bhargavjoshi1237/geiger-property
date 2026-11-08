import { notFound } from "next/navigation";

import { GoneView } from "@/components/leasing_site/gone_view";
import { cachedListing, cachedSite } from "@/lib/leasing/public/cache";

// Where proxy.js sends a leased or archived listing, with HTTP 410 (LEAS-01). Anything else here is a 404.
export const revalidate = 60;

export const metadata = {
  title: "No longer available",
  robots: { index: false, follow: true },
};

export async function generateStaticParams() {
  return [];
}

export default async function ListingGonePage({ params }) {
  const { handle, slug } = await params;
  const site = await cachedSite(handle);
  const res = site ? await cachedListing(site, slug) : null;
  if (res?.state !== "gone") notFound();
  return <GoneView site={site} listing={res.listing} />;
}
