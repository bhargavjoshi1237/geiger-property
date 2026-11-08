import { notFound } from "next/navigation";

import { SiteFooter, SiteHeader } from "@/components/leasing_site/site_chrome";
import { cachedSite } from "@/lib/leasing/public/cache";

// One company's public leasing site (LEAS-01). A disabled or unknown site answers 404 here, before anything streams.

export async function generateMetadata({ params }) {
  const { handle } = await params;
  const site = await cachedSite(handle);
  if (!site) return {};
  return {
    title: { template: `%s · ${site.displayName}`, default: `Homes for rent · ${site.displayName}` },
    openGraph: { siteName: site.displayName },
  };
}

export default async function LeasingSiteLayout({ children, params }) {
  const { handle } = await params;
  const site = await cachedSite(handle);
  if (!site) notFound();
  return (
    <>
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm text-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <SiteHeader site={site} />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter site={site} />
    </>
  );
}
