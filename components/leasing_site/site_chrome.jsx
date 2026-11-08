/* eslint-disable @next/next/no-img-element -- company logos are arbitrary remote URLs */
import Image from "next/image";
import Link from "next/link";
import { Mail, Phone } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { EHO_STATEMENT } from "@/lib/leasing/public/disclosures";
import { telHref } from "@/lib/leasing/public/ctas";
import { sitePath } from "@/lib/leasing/public/urls";

// Public leasing site chrome (LEAS-01): the landlord's brand on top, contact and the fair-housing statement below.

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const PAGE_WIDTH = "mx-auto w-full max-w-6xl px-4 sm:px-6";

// HUD's Equal Housing Opportunity logotype: a house carrying an equals sign.
export function EhoMark({ className = "h-10 w-10" }) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Equal Housing Opportunity" className={`shrink-0 text-foreground ${className}`}>
      <path d="M32 5 3 27h8v31h42V27h8L32 5Z" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinejoin="round" />
      <rect x="20" y="31" width="24" height="6" fill="currentColor" />
      <rect x="20" y="43" width="24" height="6" fill="currentColor" />
    </svg>
  );
}

export function BrandMark({ site }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {site.logoUrl ? (
        <img src={site.logoUrl} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded object-contain" />
      ) : (
        <Image src={`${basePath}/logo1.svg`} alt="" width={20} height={20} className="geiger-logo h-5 w-5 shrink-0" />
      )}
      <span className="truncate text-sm font-semibold text-foreground">{site.displayName}</span>
    </span>
  );
}

export function SiteHeader({ site }) {
  const phone = site.contact.phone;
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className={`${PAGE_WIDTH} flex h-14 items-center justify-between gap-3`}>
        <Link href={sitePath(site.handle)} className="min-w-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <BrandMark site={site} />
        </Link>
        <nav aria-label="Site" className="flex shrink-0 items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link href={sitePath(site.handle)}>All homes</Link>
          </Button>
          {phone ? (
            <Button asChild variant="outline" size="sm">
              <a href={telHref(phone)} aria-label={`Call ${phone}`}>
                <Phone /> <span className="hidden sm:inline">{phone}</span>
              </a>
            </Button>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter({ site }) {
  const { phone, email, officeHours } = site.contact;
  return (
    <footer className="mt-16 border-t border-border bg-surface-subtle">
      <div className={`${PAGE_WIDTH} grid gap-8 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]`}>
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-foreground">{site.displayName}</p>
          {phone ? (
            <a href={telHref(phone)} className="flex items-center gap-2 text-text-secondary hover:text-foreground">
              <Phone className="h-4 w-4" aria-hidden="true" /> {phone}
            </a>
          ) : null}
          {email ? (
            <a href={`mailto:${email}`} className="flex items-center gap-2 break-all text-text-secondary hover:text-foreground">
              <Mail className="h-4 w-4 shrink-0" aria-hidden="true" /> {email}
            </a>
          ) : null}
          {officeHours ? <p className="text-text-secondary">Office hours: {officeHours}</p> : null}
        </div>
        <div className="flex items-start gap-4">
          <EhoMark />
          <div className="space-y-1">
            <p className="text-sm font-semibold uppercase tracking-wide text-foreground">Equal Housing Opportunity</p>
            <p className="text-xs leading-relaxed text-text-secondary">{EHO_STATEMENT}</p>
          </div>
        </div>
      </div>
      <div className="border-t border-border">
        <p className={`${PAGE_WIDTH} py-4 text-xs text-text-secondary`}>
          © {new Date().getFullYear()} {site.displayName} · Listings powered by{" "}
          <a href="https://geiger.studio/property" className="underline-offset-4 hover:text-foreground hover:underline">
            Geiger Property
          </a>
        </p>
      </div>
    </footer>
  );
}
