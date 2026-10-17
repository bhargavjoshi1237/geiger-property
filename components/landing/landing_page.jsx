import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import Footer from "@geiger/ui/footer";
import { Header } from "@/components/header";
import HeroBuilding from "./hero_building";
import ProductExplorer from "./product_explorer";
import ConnectedJourney from "./connected_journey";
import PropertyPlaygroundShowcase from "./property_playground_showcase";
import PosterFieldCta from "./poster_field_cta";
import styles from "./landing.module.css";

const faqs = [
  {
    question: "Can I try it before creating an account?",
    answer: "Yes. The previews on this page and the playground use example data, and the playground opens the full workspace without signing in. Changes you make there aren't saved.",
  },
  {
    question: "Who is Geiger Property for?",
    answer: "Independent landlords, growing property managers and small-to-mid portfolios who want the depth of an enterprise suite without the enterprise price tag.",
  },
  {
    question: "How is pricing structured?",
    answer: "A simple per-unit monthly price, with online payments, screening, portals and maintenance included rather than locked behind higher tiers.",
  },
  {
    question: "Can my team, owners and residents all use it?",
    answer: "Yes. Invite teammates to the project and give each one a role. Residents and owners get their own portals, and only see what belongs to them.",
  },
  {
    question: "Does it work with the rest of Geiger Studio?",
    answer: "Yes. Geiger Property shares the same design system, workspace and account model as the rest of the suite, so it sits naturally alongside Flow, Notes and Events.",
  },
];

// The hero strip's index of the page, in page order.
const sections = [["Portals & maintenance", "#platform"], ["Automation", "#workflow"], ["Portfolios", "#formats"], ["Every feature", "#capabilities"], ["Playground", "#playground"], ["Questions", "#faq"]];

function SectionHeading({ title, description }) {
  return (
    <div className={styles.sectionHeading}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {description && <p className={styles.sectionDescription}>{description}</p>}
    </div>
  );
}

// A street of homes on a ground line: leased homes are solid, the vacant one is dashed and tagged.
const STREET = [{ w: 54 }, { tree: true }, { w: 66, vacant: true }, { w: 48 }, { tree: true }, { w: 58 }];

function House({ vacant }) {
  return (
    <svg viewBox="0 0 60 64" className={styles.house} data-vacant={vacant || undefined}>
      <rect className={styles.houseBody} x="39" y="9" width="6" height="14" />
      <rect className={styles.houseBody} x="9" y="27" width="42" height="36" />
      <path className={styles.houseBody} d="M3 29 30 6l27 23z" />
      <rect className={styles.houseDetail} x="14" y="34" width="8" height="8" rx="1" />
      <rect className={styles.houseDetail} x="38" y="34" width="8" height="8" rx="1" />
      <rect className={styles.houseDetail} x="25" y="45" width="10" height="18" rx="1" />
    </svg>
  );
}

function HousesArt() {
  return (
    <div className={`${styles.formatArt} ${styles.housesArt}`} aria-hidden="true">
      <span>Elm St · 4 homes · 3 leased</span>
      <div className={styles.street}>
        {STREET.map((lot, i) => lot.tree ? (
          <svg key={i} viewBox="0 0 20 40" className={styles.tree}><circle cx="10" cy="11" r="9" /><rect x="9" y="18" width="2" height="22" /></svg>
        ) : (
          <div key={i} className={styles.lot} style={{ flexBasis: lot.w }}>
            {lot.vacant ? <small className={styles.houseTag}>For rent · 1 Dec</small> : null}
            <House vacant={lot.vacant} />
          </div>
        ))}
      </div>
    </div>
  );
}

const formats = [
  {
    title: "Single-family and small landlords",
    description: "Track every house, its owner and its lease from one list, with rent and repairs per door.",
    link: "See properties and owners",
    art: <HousesArt />,
  },
  {
    title: "Multifamily buildings",
    description: "Run buildings with hundreds of units, floor plans, waitlists and unit turns.",
    link: "See units and leasing",
    art: <div className={`${styles.formatArt} ${styles.buildingArt}`} aria-hidden="true"><span>Harbor Lofts · 48 units</span><div>{Array.from({ length: 48 }, (_, i) => <i key={i} />)}</div></div>,
  },
  {
    title: "Commercial and mixed-use",
    description: "Bill CAM charges, track tenant insurance and reconcile shared costs at year end.",
    link: "See accounting",
    art: <div className={`${styles.formatArt} ${styles.suitesArt}`} aria-hidden="true">{[["Suite 100", "Retail", "1,800 sf"], ["Suite 200", "Office", "2,400 sf"], ["Suite 300", "Studio", "950 sf"]].map(([suite, use, size], i) => <div key={suite} style={{ "--i": i }}><span>{suite}</span><strong>{use}</strong><span>{size} · NNN</span></div>)}</div>,
  },
];

export default function PropertyLandingPage() {
  return (
    <div className={styles.page}>
      <a href="#main-content" className={styles.skipLink}>Skip to content</a>
      <Header dashboardHref="/org" />
      <main id="main-content" className={styles.main}>
        {/* The hero is one building at a glance; the strip below indexes the page */}
        <div className={styles.heroPanel}>
          {/* Suite grid wash, the same one geiger-dash uses (GridBackdrop "default") */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] bg-[linear-gradient(to_right,#80808030_1px,transparent_1px),linear-gradient(to_bottom,#80808030_1px,transparent_1px)] bg-[size:24px_24px] [mask-composite:intersect] [mask-image:linear-gradient(to_bottom,transparent,#000_120px),radial-gradient(ellipse_60%_55%_at_50%_0%,#000_70%,transparent_100%)]" />
          <section className={`${styles.container} ${styles.hero}`}>
            <div>
              <h1 className={styles.heroTitle}>Collect the rent & run the buildings from one workspace.</h1>
              <p className={styles.heroDescription}>Geiger Property covers listings, leasing, the tenant portal, maintenance and accounting. Units, residents and ledgers stay in one project your team shares.</p>
              <div className={styles.actions}>
                <Link href="/org" className={styles.primaryButton}>Open Property<ArrowRight size={16} /></Link>
                <a href="#playground" className={styles.secondaryButton}>Try Playground</a>
              </div>
            </div>
            <HeroBuilding />
          </section>
          <div className={styles.heroDivider} aria-hidden="true" />
          <nav className={`${styles.container} ${styles.heroStub}`} aria-label="On this page">
            <span>Inside</span>
            {sections.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
            <ArrowDown size={16} className={styles.heroStubArrow} aria-hidden="true" />
          </nav>
        </div>

        <section id="platform" className={`${styles.container} ${styles.section}`}>
          <SectionHeading
            title="Residents, owners and your team work from the same ledger"
            description="The listing, the tenant portal, the maintenance queue and the owner portal all read the same units, leases and transactions." />
          <ProductExplorer variant="surfaces" />
        </section>

        <section id="workflow" className={`${styles.container} ${styles.section}`}>
          <SectionHeading
            title="Let the routine work run on its own"
            description="Post recurring charges, follow up on late rent and send owners their reports on a schedule. Every run is logged." />
          <ProductExplorer variant="automation" />
        </section>

        <ConnectedJourney />

        <section id="formats" className={`${styles.container} ${styles.section}`}>
          <SectionHeading
            title="Built for the portfolio you actually run"
            description="A few houses need a rent roll and a repair log. Turn on floor plans, waitlists and CAM billing when your buildings call for them." />
          <div className={styles.formatCards}>
            {formats.map(({ title, description, link, art }) => (
              <article key={title} className={styles.formatCard}>
                {art}
                <h3>{title}</h3>
                <p>{description}</p>
                <a href="#capabilities" className={styles.textLink}>{link}<ArrowRight size={14} /></a>
              </article>
            ))}
          </div>
        </section>

        <section id="capabilities" className={`${styles.container} ${styles.section}`}>
          <SectionHeading
            title="Browse every feature"
            description="Everything in Geiger Property at a glance. The preview plays through each feature in turn, or pick one to jump straight to it." />
          <ProductExplorer variant="capabilities" />
        </section>

        {/* The playground breaks out of the content column so the workspace has room */}
        <section id="playground" className={styles.section}>
          <div className={styles.container}>
            <SectionHeading
              title="Try the real workspace"
              description="The playground opens the Property workspace with a sample portfolio. Click anywhere you like; nothing you change is saved." />
          </div>
          <PropertyPlaygroundShowcase />
        </section>

        <section id="faq" className={`${styles.container} ${styles.section} ${styles.faqSection}`}>
          <div>
            <h2 className={styles.sectionTitle}>Questions</h2>
            <a href="mailto:help@geiger.studio" className={styles.textLink}>Email help@geiger.studio<ArrowUpRight size={14} /></a>
          </div>
          <div>
            {faqs.map(({ question, answer }) => (
              <details className={styles.faq} key={question}>
                <summary>{question}<Plus size={18} aria-hidden="true" /></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <PosterFieldCta dashboardHref="/org" />
      </main>
      <Footer />
    </div>
  );
}
