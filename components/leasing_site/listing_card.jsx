/* eslint-disable @next/next/no-img-element -- listing photos are arbitrary remote URLs */
import Link from "next/link";
import { House } from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { availabilityLabel, layoutLabel, money } from "@/lib/leasing/public/format";
import { listingPath } from "@/lib/leasing/public/urls";

// A vacancy card for the public site, the embed widget and "similar homes" (LEAS-01). Takes summarizeListing() output.

export function ListingCard({ handle, listing: l, headingLevel = "h3", target }) {
  const Heading = headingLevel;
  const effective = Number(l.effectiveRent) > 0 && Number(l.effectiveRent) < Number(l.rent) - 0.5;
  return (
    <Link
      href={listingPath(handle, l.slug)}
      target={target}
      rel={target === "_blank" ? "noopener" : undefined}
      className="group flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-subtle transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-card">
        {l.photo ? (
          <img src={l.photo.url} alt={l.photo.alt} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <House className="h-8 w-8" aria-hidden="true" />
          </div>
        )}
        {l.special ? (
          <Badge variant="success" className="absolute left-3 top-3 max-w-[85%] truncate bg-background/90 backdrop-blur">
            {l.special}
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <p className="text-lg font-semibold tabular-nums text-foreground">
          {money(l.rent)}
          <span className="text-sm font-normal text-muted-foreground">/mo</span>
        </p>
        {effective ? <p className="text-xs text-emerald-700 dark:text-emerald-400">{money(l.effectiveRent)}/mo effective with specials</p> : null}
        <Heading className="line-clamp-2 text-sm font-medium text-foreground">{l.title}</Heading>
        <p className="text-xs text-muted-foreground">{layoutLabel(l)}</p>
        <p className="mt-auto pt-1 text-xs text-muted-foreground">
          {[l.propertyName, l.city].filter(Boolean).join(", ")}
          {l.propertyName || l.city ? " · " : ""}
          {availabilityLabel(l)}
        </p>
      </div>
    </Link>
  );
}

export function ListingGrid({ handle, listings, headingLevel, target }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((l) => (
        <li key={l.slug} className="flex min-w-0">
          <ListingCard handle={handle} listing={l} headingLevel={headingLevel} target={target} />
        </li>
      ))}
    </ul>
  );
}

export function NoListings({ title = "No homes available right now", children }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-subtle px-6 py-12 text-center">
      <House className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      {children ? <div className="mt-1 text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}
