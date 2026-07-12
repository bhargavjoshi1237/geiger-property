import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Users,
  Wrench,
  Wallet,
  FileText,
  BarChart3,
} from "lucide-react";
import Footer from "@/components/ui/footer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Header } from "@/components/header";
import PropertyPlaygroundShowcase from "@/components/PropertyPlaygroundShowcase";

const showcaseBackgroundImages = [
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-00a586c62c8782e65c0a.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/internal-brand-023-3291bb4c.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-0ec1f3ba625f482c9dc3.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-85923e7fafe00c9c0d1f.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-8e2e88cff7f33224ddd7.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-0a66efa21dd4b7e6c526.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-cc24ca462279ca23250c.jpg",
];

function pickRandomShowcaseBackground() {
  return showcaseBackgroundImages[Math.floor(Math.random() * showcaseBackgroundImages.length)];
}

export const metadata = {
  title: "Property - Geiger Studio",
  description:
    "Manage your entire rental portfolio — leasing, tenants, maintenance, and accounting — in one modern, fairly-priced platform. Geiger Property.",
};

const utilityCards = [
  {
    title: "Properties & units",
    description:
      "One home for every building, unit, and owner — with the details that keep operations tidy.",
    icon: Building2,
  },
  {
    title: "Leasing & applications",
    description:
      "List vacancies, take online applications, screen applicants, and sign leases digitally.",
    icon: FileText,
  },
  {
    title: "Tenant portal",
    description:
      "Residents pay rent, submit requests, and message you from a portal that feels modern.",
    icon: Users,
  },
  {
    title: "Maintenance & vendors",
    description:
      "Turn requests into work orders, dispatch vendors, and track everything to completion.",
    icon: Wrench,
  },
  {
    title: "Accounting & payments",
    description:
      "Automated rent collection, full ledgers, owner payouts, and clean books.",
    icon: Wallet,
  },
  {
    title: "Owner reporting",
    description:
      "Occupancy, delinquency, and financial statements owners actually understand.",
    icon: BarChart3,
  },
];

const faqs = [
  {
    value: "item-1",
    question: "Who is Geiger Property for?",
    answer:
      "Independent landlords, growing property managers, and small-to-mid portfolios who want the depth of an enterprise suite without the enterprise price tag.",
  },
  {
    value: "item-2",
    question: "How is pricing structured?",
    answer:
      "A simple per-unit monthly price with the modern features — online payments, screening, portals, and maintenance — included rather than locked behind top tiers.",
  },
  {
    value: "item-3",
    question: "Does it work with the rest of Geiger Studio?",
    answer:
      "Yes. Geiger Property shares the same design system, workspace, and account model as the rest of the Geiger suite, so it feels native alongside Flow, Notes, and Events.",
  },
];

export default function PropertyLandingPage() {
  const dashboardHref = "/org";
  const showcaseBg = pickRandomShowcaseBackground();

  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground selection:bg-indigo-500/30 font-sans">
      <div className="fixed inset-0 z-0 bg-[linear-gradient(to_right,#80808030_1px,transparent_1px),linear-gradient(to_bottom,#80808030_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      <Header dashboardHref={dashboardHref} />

      <main className="relative z-10 flex flex-1 flex-col pt-16 sm:pt-20">
        <section className="mx-auto mb-10 mt-10 flex w-full max-w-6xl items-start justify-start px-4 sm:mt-16 sm:px-6">
          <div className="max-w-3xl">
            <h1 className="mb-4 text-2xl font-semibold text-white sm:text-3xl">
              Run your rental portfolio, all in one place.
            </h1>
            <p className="mb-6 max-w-xl text-sm text-muted-foreground sm:text-base">
              Leasing, tenants, maintenance, and accounting — the depth of the
              big platforms, at a price that makes sense for real portfolios.
              Build your rent roll, keep owners in the loop, and run day-to-day
              operations from one workspace.
            </p>
            <Link
              href={dashboardHref}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-zinc-100 px-6 text-sm font-medium text-zinc-950 transition-colors hover:bg-white sm:text-base"
            >
              Go to Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="mx-auto my-10 w-[100%] sm:my-20 md:w-[100%]">
          <PropertyPlaygroundShowcase backgroundImage={showcaseBg} />
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-3">
          {utilityCards.map(({ title, description, icon: Icon }) => (
            <article
              key={title}
              className="rounded-sm border border-border bg-[#191919] p-5"
            >
              <Icon className="mb-3 h-5 w-5 text-muted-foreground" />
              <h2 className="font-medium text-foreground">{title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            </article>
          ))}
        </section>

        <section className="mx-auto mt-10 flex w-full max-w-6xl flex-col gap-6 px-4 sm:px-6 md:mt-16 md:flex-row">
          <div className="md:w-[35%]">
            <h2 className="text-3xl font-semibold text-white">Questions & Answers</h2>
          </div>
          <div className="md:w-[65%]">
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq) => (
                <AccordionItem
                  key={faq.value}
                  value={faq.value}
                  className="border-border"
                >
                  <AccordionTrigger className="text-foreground hover:text-foreground hover:no-underline">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        <section className="relative z-20 overflow-hidden px-4 py-16 sm:px-6 sm:py-24 lg:py-32">
          <div className="container mx-auto relative z-10 flex flex-col items-center text-center">
            <h3 className="mb-4 text-xs font-semibold tracking-widest text-foreground0 uppercase sm:text-sm">
              Open source from day one
            </h3>
            <h2 className="mb-8 bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-3xl font-black tracking-tighter text-transparent drop-shadow-lg sm:mb-10 sm:text-5xl lg:text-6xl">
              TRY GEIGER NOW
            </h2>
            <div className="flex w-full max-w-md flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Link
                href={dashboardHref}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-zinc-100 px-6 text-sm font-medium text-zinc-950 transition-colors hover:bg-white sm:w-auto"
              >
                Studio
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-zinc-100 px-6 text-sm font-medium text-zinc-950 transition-colors hover:bg-white sm:w-auto"
              >
                Contact Sales
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
