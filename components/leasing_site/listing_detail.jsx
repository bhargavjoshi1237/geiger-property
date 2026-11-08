/* eslint-disable @next/next/no-img-element -- listing photos are arbitrary remote URLs */
import { CalendarCheck, CalendarDays, ExternalLink, FileText, House, Mail, MessageCircleQuestion, Phone, Video } from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { ASSISTANCE_ANIMAL_NOTE } from "@/lib/leasing/public/disclosures";
import { listingCtas, telHref } from "@/lib/leasing/public/ctas";
import { availabilityLabel, formatDate, layoutLabel, money, moneyExact } from "@/lib/leasing/public/format";

// Sections of a public listing page (LEAS-01), rendered on the server from serializePublicListing() output.

export function PublicSection({ id, title, children, description }) {
  return (
    <section aria-labelledby={id} className="scroll-mt-20 border-t border-border pt-6">
      <h2 id={id} className="text-lg font-semibold text-foreground">
        {title}
      </h2>
      {description ? <p className="mt-1 text-sm text-text-secondary">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Facts({ items }) {
  const shown = items.filter((i) => i.value !== null && i.value !== undefined && i.value !== "");
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {shown.map((i) => (
        <div key={i.label} className="flex justify-between gap-3 border-b border-border pb-2 sm:block sm:border-0 sm:pb-0">
          <dt className="text-text-secondary">{i.label}</dt>
          <dd className="text-right font-medium text-foreground sm:text-left">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const Chips = ({ items }) =>
  items.length ? (
    <ul className="flex flex-wrap gap-2">
      {items.map((x) => (
        <li key={x}>
          <Badge variant="neutral" className="text-xs">
            {x}
          </Badge>
        </li>
      ))}
    </ul>
  ) : null;

// Hero photo plus up to four more; the rest open under "Show all photos" (no script needed).
export function Gallery({ photos }) {
  if (!photos.length) {
    return (
      <div className="flex aspect-[16/7] w-full items-center justify-center rounded-xl border border-border bg-surface-card text-muted-foreground">
        <House className="h-10 w-10" aria-hidden="true" />
      </div>
    );
  }
  const [hero, ...rest] = photos;
  const thumbs = rest.slice(0, 4);
  const more = rest.slice(4);
  return (
    <div className="space-y-2">
      <div className={`grid gap-2 ${thumbs.length ? "sm:grid-cols-4 sm:grid-rows-2" : ""}`}>
        <img
          src={hero.url}
          alt={hero.alt}
          fetchPriority="high"
          className={`aspect-[4/3] w-full rounded-xl object-cover ${thumbs.length ? "sm:col-span-2 sm:row-span-2 sm:h-full" : "sm:aspect-[16/7]"}`}
        />
        {thumbs.map((p) => (
          <img key={p.url} src={p.url} alt={p.alt} loading="lazy" decoding="async" className="hidden aspect-[4/3] w-full rounded-xl object-cover sm:block" />
        ))}
      </div>
      {rest.length ? (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-foreground underline-offset-4 hover:underline">Show all {photos.length} photos</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[...thumbs, ...more].map((p) => (
              <img key={p.url} src={p.url} alt={p.alt} loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-xl object-cover" />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

const cadenceLabel = (f) => (f.cadence === "monthly" ? "Monthly" : f.refundable ? "One-time, refundable" : "One-time");

// Every fee, stated even when it's $0, plus the specials that lower the effective rent.
export function PricingSection({ listing: l }) {
  const effective = l.effectiveRent > 0 && l.effectiveRent < l.rent - 0.5;
  return (
    <PublicSection id="pricing" title="Rent, fees and specials" description="Every fee this home carries is listed here. Optional fees apply only when they say so.">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-subtle p-4">
          <p className="text-sm text-text-secondary">Monthly rent</p>
          <p className="text-2xl font-semibold tabular-nums text-foreground">{money(l.rent)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-subtle p-4">
          <p className="text-sm text-text-secondary">Effective rent over {l.pricingTermMonths} months</p>
          <p className="text-2xl font-semibold tabular-nums text-foreground">{moneyExact(l.effectiveRent)}</p>
          <p className="text-xs text-text-secondary">{effective ? "After the specials below" : "No specials lower the rent"}</p>
        </div>
      </div>
      {l.specials.length ? (
        <ul className="mt-4 space-y-2">
          {l.specials.map((s) => (
            <li key={`${s.name}-${s.endsOn}`} className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm">
              <p className="font-medium text-emerald-800 dark:text-emerald-300">{s.name}</p>
              <p className="text-xs text-emerald-800 dark:text-emerald-300">
                {[s.type, s.minTermMonths ? `${s.minTermMonths}+ month lease` : "", s.endsOn ? `Ends ${formatDate(s.endsOn)}` : "", s.conditions].filter(Boolean).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[420px] text-left text-sm">
          <caption className="sr-only">Fees for this home</caption>
          <thead className="bg-surface-subtle text-xs text-text-secondary">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Fee</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Amount</th>
              <th scope="col" className="px-4 py-2.5 font-medium">How often</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Who pays</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {l.fees.map((f) => (
              <tr key={f.key} data-fee={f.key}>
                <th scope="row" className="px-4 py-2.5 font-medium text-foreground">{f.label}</th>
                <td className="px-4 py-2.5 tabular-nums text-foreground">{f.note || moneyExact(f.amount)}</td>
                <td className="px-4 py-2.5 text-text-secondary">{cadenceLabel(f)}</td>
                <td className="px-4 py-2.5 text-text-secondary">{f.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PublicSection>
  );
}

export function TermsSection({ listing: l }) {
  const term = l.minTermMonths || l.maxTermMonths ? [l.minTermMonths ? `${l.minTermMonths} months minimum` : "", l.maxTermMonths ? `${l.maxTermMonths} months maximum` : ""].filter(Boolean).join(", ") : "";
  return (
    <PublicSection id="terms" title="Availability and lease terms">
      <Facts
        items={[
          { label: "Move-in", value: `${availabilityLabel(l)}${l.moveInFlexible ? " (flexible)" : ""}` },
          { label: "Lease lengths", value: l.leaseTerms.join(", ") },
          { label: "Term", value: term },
          { label: "Maximum occupants", value: l.maxOccupants },
          { label: "Self-guided tours", value: l.tours.selfGuided ? "Available" : "" },
          { label: "Virtual tours", value: l.tours.virtual ? "Available" : "" },
        ]}
      />
    </PublicSection>
  );
}

export function PetsSection({ listing: l }) {
  const p = l.pets;
  return (
    <PublicSection id="pets" title="Pet policy">
      <Facts
        items={[
          { label: "Policy", value: p.policy || "Ask us about pets" },
          { label: "Allowed pets", value: p.types.join(", ") },
          { label: "Maximum pets", value: p.maxPets },
          { label: "Weight limit", value: p.weightLimit ? `${p.weightLimit} lb` : "" },
          { label: "Breed restrictions", value: p.breedRestrictions },
        ]}
      />
      {p.note ? <p className="mt-3 text-sm text-text-secondary">{p.note}</p> : null}
      <p className="mt-3 text-sm text-text-secondary">{ASSISTANCE_ANIMAL_NOTE}</p>
    </PublicSection>
  );
}

export function FeaturesSection({ listing: l }) {
  const any = l.features.length || l.communityAmenities.length || l.parking || l.laundry || l.heating || l.utilitiesIncluded.length || l.otherFeatures;
  if (!any) return null;
  return (
    <PublicSection id="features" title="Features and amenities">
      <div className="space-y-4">
        {l.features.length ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">In the home</h3>
            <Chips items={l.features} />
          </div>
        ) : null}
        {l.communityAmenities.length ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">In the community</h3>
            <Chips items={l.communityAmenities} />
          </div>
        ) : null}
        <Facts
          items={[
            { label: "Parking", value: [l.parking, l.parkingInfo].filter(Boolean).join(" — ") },
            { label: "Laundry", value: l.laundry },
            { label: "Heating and cooling", value: l.heating },
            { label: "Utilities included", value: l.utilitiesIncluded.join(", ") },
          ]}
        />
        {l.otherFeatures ? <p className="text-sm text-text-secondary">{l.otherFeatures}</p> : null}
      </div>
    </PublicSection>
  );
}

export function FurnishedSection({ listing: l }) {
  const f = l.furnished;
  if (!f) return null;
  return (
    <PublicSection id="furnished" title={f.midTerm ? "Furnished and mid-term stays" : "Furnished"}>
      <Facts
        items={[
          { label: "Furnished", value: f.furnished ? "Yes" : "No" },
          { label: "Minimum stay", value: f.minStayDays ? `${f.minStayDays} days` : "" },
          { label: "Maximum stay", value: f.maxStayMonths ? `${f.maxStayMonths} months` : "" },
          { label: "Furnished monthly rate", value: f.monthlyRate ? `${money(f.monthlyRate)}/mo` : "" },
          { label: "Utilities in the rate", value: f.utilitiesIncluded ? `Included${f.utilityCap ? ` up to ${money(f.utilityCap)}/mo` : ""}` : "" },
          { label: "Linens and kitchenware", value: f.linensProvided ? "Provided" : "" },
          { label: "Wi-Fi", value: f.wifiSpeed ? `${f.wifiSpeed} Mbps` : "" },
        ]}
      />
    </PublicSection>
  );
}

export function ToursSection({ listing: l }) {
  const links = [
    l.tours.virtualTourUrl ? { href: l.tours.virtualTourUrl, label: "3D virtual tour", icon: ExternalLink } : null,
    l.tours.videoUrl ? { href: l.tours.videoUrl, label: "Video walkthrough", icon: Video } : null,
    l.tours.floorPlanUrl ? { href: l.tours.floorPlanUrl, label: "Floor plan", icon: FileText } : null,
  ].filter(Boolean);
  if (!links.length) return null;
  return (
    <PublicSection id="tours" title="Tours and floor plan">
      <div className="flex flex-wrap gap-2">
        {links.map((t) => (
          <Button key={t.href} asChild variant="outline">
            <a href={t.href} target="_blank" rel="noopener noreferrer">
              <t.icon aria-hidden="true" /> {t.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </Button>
        ))}
      </div>
    </PublicSection>
  );
}

export function CriteriaSection({ criteria }) {
  return (
    <PublicSection id="screening" title="Screening criteria" description="What we look at when you apply.">
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground marker:text-text-secondary">
        {criteria.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-text-secondary">{criteria.note}</p>
    </PublicSection>
  );
}

const ctaLink = (cta) => (cta.external ? { href: cta.href, target: "_blank", rel: "noopener noreferrer" } : { href: cta.href });

// The sticky price card: rent, move-in, and the Apply / Book a tour / Ask a question actions.
export function ContactCard({ listing: l }) {
  const ctas = listingCtas(l);
  const { name, phone, email, officeHours } = l.contact;
  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-subtle p-5">
      <div>
        <p className="text-3xl font-semibold tabular-nums text-foreground">
          {money(l.rent)}
          <span className="text-base font-normal text-text-secondary">/mo</span>
        </p>
        <p className="mt-1 text-sm text-text-secondary">{layoutLabel(l)}</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground">
          <CalendarDays className="h-4 w-4 text-text-secondary" aria-hidden="true" /> {availabilityLabel(l)}
        </p>
      </div>
      {ctas.apply || ctas.tour || ctas.ask ? (
        <div className="grid gap-2">
          {ctas.apply ? (
            <Button asChild size="lg">
              <a {...ctaLink(ctas.apply)}>Apply</a>
            </Button>
          ) : null}
          {ctas.tour ? (
            <Button asChild size="lg" variant="outline">
              <a {...ctaLink(ctas.tour)}>
                <CalendarCheck aria-hidden="true" /> Book a tour
              </a>
            </Button>
          ) : null}
          {ctas.ask ? (
            <Button asChild size="lg" variant="ghost">
              <a {...ctaLink(ctas.ask)}>
                <MessageCircleQuestion aria-hidden="true" /> Ask a question
              </a>
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-text-secondary">Contact details for this home aren&apos;t published yet.</p>
      )}
      {phone || email ? (
        <div className="space-y-1.5 border-t border-border pt-4 text-sm">
          {name ? <p className="font-medium text-foreground">{name}</p> : null}
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
      ) : null}
    </div>
  );
}
