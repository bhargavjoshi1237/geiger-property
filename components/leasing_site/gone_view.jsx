import { Suspense } from "react";
import Link from "next/link";
import { House } from "lucide-react";

import { LogoLoading } from "@geiger/ui";
import { Button } from "@geiger/ui/button";
import { cachedListings } from "@/lib/leasing/public/cache";
import { similarListings } from "@/lib/leasing/public/filters";
import { summarizeListing } from "@/lib/leasing/public/serialize";
import { sitePath } from "@/lib/leasing/public/urls";
import { ListingGrid } from "./listing_card";
import { PAGE_WIDTH } from "./site_chrome";

// Live homes like `like` ({ slug, propertyId, bedrooms }), read separately so the page around them never waits.
export async function SimilarHomes({ site, like, title = "Similar homes" }) {
  const homes = similarListings(await cachedListings(site), like).map(summarizeListing);
  if (!homes.length) return null;
  return (
    <section aria-labelledby="similar" className="space-y-4">
      <h2 id="similar" className="text-lg font-semibold text-foreground">
        {title}
      </h2>
      <ListingGrid handle={site.handle} listings={homes} />
    </section>
  );
}

// "No longer available" (LEAS-01): the page a leased or archived listing answers with (HTTP 410 via proxy.js).
export function GoneView({ site, listing }) {
  return (
    <div className={`${PAGE_WIDTH} space-y-10 py-12`}>
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 text-center">
        <House className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-2xl font-semibold text-foreground">This home is no longer available</h1>
        <p className="text-sm text-text-secondary">{listing.title} has been leased or taken off the market.</p>
        <Button asChild>
          <Link href={sitePath(site.handle)}>See all available homes</Link>
        </Button>
      </div>
      <Suspense fallback={<LogoLoading size={48} className="mx-auto" />}>
        <SimilarHomes site={site} like={{ slug: null, propertyId: listing.propertyId, bedrooms: listing.bedrooms }} />
      </Suspense>
    </div>
  );
}
