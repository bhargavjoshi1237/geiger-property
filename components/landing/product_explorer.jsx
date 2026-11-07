"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, BarChart3, Building2, Check, ChevronRight, FileSignature, Megaphone, MessagesSquare, Wallet, Wrench } from "lucide-react";
import { LogoLoading } from "@geiger/ui/logo-loading";
import styles from "./landing.module.css";

// The scenes are display-only, so one lazily loaded player covers every preview.
const AutoplayPreview = dynamic(() => import("./previews/autoplay"), {
  ssr: false,
  loading: () => <div className={styles.demoLoading}><LogoLoading size={40} /></div>,
});

const surfaces = [
  // claim: public listing page and online application are LEAS; screening is RISK-12
  { label: "The listing", title: "Track every listing, application and fee in one place", description: "Record a unit with photos, rent and move-in date, then keep each application and its fee on the same record.", points: ["Listings with photos and rent", "Applications and fees tracked", "Screening results recorded"], demo: "listing" },
  { label: "Tenant portal", title: "Let residents pay rent in a couple of taps", description: "Residents see their balance, pay by bank or card, and turn on autopay. Every payment posts to the ledger.", points: ["Balance and charge history", "Bank, card and autopay", "Receipts sent automatically"], demo: "portal" },
  // claim: resident update emails are COMM work-order notifications; billing costs to the owner is CORE 0.9
  { label: "Maintenance", title: "Turn a repair request into a closed work order", description: "Residents report an issue with photos. You assign a vendor, and residents track status in the portal.", points: ["Requests with photos", "Vendor assignment and visits", "Costs tracked per job"], demo: "workorder" },
  { label: "Owner portal", title: "Send owners statements they can read", description: "Each owner sees income, expenses and your fees for their properties, followed by the payout.", points: ["Monthly owner statements", "Management fees calculated", "Payouts recorded"], demo: "owner" },
];

const automation = [
  // claim: a post-charge step is PLAT-13 and texts are COMM SMS
  { label: "Workflows", title: "Follow up on late rent without lifting a finger", description: "Choose a trigger, add conditions, then send emails, create work orders or update a status. Every run is logged.", points: ["Triggers, conditions and actions", "Emails, work orders and status changes", "Run history and logs"], demo: "workflows" },
  // claim: scheduled posting needs CORE-10 (crons) and billing following rent changes (CORE 0.1)
  { label: "Rent collection", title: "Post rent in one click and watch it come in", description: "Recurring charges post when you run them, autopay collects them, and open balances update as payments land.", points: ["Recurring charges per lease", "Autopay, bank and card", "Live open balances"], demo: "collection" },
  // claim: PDF and CSV attachments are CORE-57; the cadence needs CORE-10 (crons)
  { label: "Scheduled reports", title: "Send owners their reports on a schedule", description: "Pick a report, the recipients and a cadence. Rent rolls, delinquency and statements go out on their own.", points: ["Any report, any cadence", "A summary and a link to the full report", "Delivery history"], demo: "reports" },
];

const categories = [
  { label: "Properties & units", icon: Building2, items: [
    { label: "Units board", demo: "units", description: "See every unit's status, occupied, vacant or on notice, and filter to what needs attention." },
    { label: "Portfolios", demo: "portfolios", description: "Group properties by owner and compare occupancy and income side by side." },
  ] },
  { label: "Marketing & leads", icon: Megaphone, items: [
    { label: "Showings", demo: "showings", description: "Schedule showings and track each prospect's tour." }, // claim: self-scheduled tours are LEAS
    { label: "Applications", demo: "applications", description: "Record credit, background and income results, then approve or decline." }, // claim: screening checks are RISK-12
    { label: "Rent comparables", demo: "comps", description: "Compare your asking rent with nearby units before you list." },
  ] },
  { label: "Leasing", icon: FileSignature, items: [
    { label: "E-signature", demo: "esign", description: "Track signatures on every lease." }, // claim: sending for e-signature is the LEAS e-signature adapter
    { label: "Renewals", demo: "renewals", description: "Offer renewal terms before a lease ends and track each resident's answer." },
    { label: "Inspections", demo: "inspections", description: "Room-by-room move-in and move-out checklists with photos." },
    { label: "Security deposits", demo: "deposits", description: "Itemize deductions at move-out and send the disposition letter." }, // claim: refunding through the ledger is CORE 0.4
  ] },
  { label: "Maintenance", icon: Wrench, items: [
    { label: "Preventive", demo: "preventive", description: "Schedule recurring jobs and let work orders open themselves when they come due." },
    { label: "Unit turns", demo: "turns", description: "Track every task that gets a vacant unit rent-ready." },
  ] },
  { label: "Accounting", icon: Wallet, items: [
    { label: "Bills & payables", demo: "bills", description: "Approve vendor bills and record payments." }, // claim: batch bill pay is CORE
    { label: "Bank reconciliation", demo: "reconcile", description: "Match bank lines to the ledger until the difference is zero." },
    { label: "Utility billing", demo: "utilities", description: "Split a building's utility bill across units and charge residents." },
  ] },
  { label: "Communications", icon: MessagesSquare, items: [
    { label: "Announcements", demo: "announcements", description: "Coming soon: email every resident of a building at once." }, // claim: composer, SMS and open tracking are COMM
  ] },
  { label: "Reports", icon: BarChart3, items: [
    { label: "Rent roll", demo: "rentroll", description: "Units, residents, rent and balances in one table you can export." },
    { label: "Delinquency", demo: "delinquency", description: "See who owes what by age." }, // claim: bulk reminders are COMM/CORE collections and PLAT-07
  ] },
];

function TabList({ items, selected, onChange, id }) {
  const handleKey = (event, index) => {
    let next;
    if (["ArrowRight", "ArrowDown"].includes(event.key)) next = (index + 1) % items.length;
    if (["ArrowLeft", "ArrowUp"].includes(event.key)) next = (index - 1 + items.length) % items.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    onChange(next);
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus();
  };
  return <div className={styles.explorerTabs} role="tablist" aria-label={`${id} previews`}>
    {items.map((item, index) => <button key={item.label} type="button" id={`${id}-tab-${index}`} role="tab" aria-selected={selected === index} aria-controls={`${id}-panel`} tabIndex={selected === index ? 0 : -1} onClick={() => onChange(index)} onKeyDown={(event) => handleKey(event, index)}>{item.label}</button>)}
  </div>;
}

// Every feature in one flat, page-ordered list so the tour can walk through all of them.
const features = categories.flatMap((category) => category.items.map((item) => ({ ...item, category: category.label })));

// All features stay visible at once; the preview tours through them on its own, and any one can be picked to jump there.
function CapabilityExplorer() {
  const [selected, setSelected] = useState(0);
  const indexRef = useRef(null);
  const item = features[selected];
  const next = () => setSelected((current) => (current + 1) % features.length);

  // When the index scrolls sideways (narrow screens), keep the playing feature in view without moving the page.
  useEffect(() => {
    const index = indexRef.current;
    const active = index?.querySelector('[aria-pressed="true"]');
    if (index && active && index.scrollWidth > index.clientWidth) index.scrollTo({ left: active.offsetLeft - 12, behavior: "smooth" });
  }, [selected]);

  return (
    <div className={`${styles.explorer} ${styles.capabilityExplorer}`}>
      {/* Sidebar-style index: only the playing category is expanded; its header jumps to that category's first feature */}
      <nav ref={indexRef} className={styles.featureIndex} aria-label="All features">
        {categories.map(({ label, icon: Icon, items }) => {
          const open = item.category === label;
          const first = features.findIndex((feature) => feature.category === label);
          return (
            <div key={label} className={styles.featureGroup} data-open={open}>
              <button type="button" className={styles.featureGroupHeader} aria-expanded={open} onClick={() => setSelected(first)}>
                <Icon size={15} strokeWidth={1.75} />
                <span>{label}</span>
                <small>{open ? `${selected - first + 1} / ${items.length}` : items.length}</small>
                <ChevronRight size={14} className={styles.featureGroupChevron} />
              </button>
              <div className={styles.featureGroupItems}>
                <div>
                  <div className={styles.featureList}>
                    {items.map((entry) => {
                      const index = features.findIndex((feature) => feature.demo === entry.demo);
                      return <button key={entry.demo} type="button" className={styles.featureItem} aria-pressed={selected === index} onClick={() => setSelected(index)}>{entry.label}</button>;
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {/* Pinned to the bottom of the index: where the tour is overall, and a way into the real workspace */}
        <div className={styles.featureIndexFooter}>
          <div className={styles.featureTourMeta}><span>Feature tour</span><span>{selected + 1} of {features.length}</span></div>
          <div className={styles.featureTicks} aria-hidden="true">
            {features.map((feature, index) => <i key={feature.demo} data-state={index === selected ? "active" : index < selected ? "done" : undefined} />)}
          </div>
          <p>Every feature runs on the same units, leases and ledger.</p>
          <a href="#playground" className={styles.textLink}>Open the playground<ArrowRight size={14} /></a>
        </div>
      </nav>
      <div className={styles.capabilityStage}>
        <div className={styles.capabilityCopy} aria-live="polite">
          <span className={styles.explorerCategory}>{item.category} · {selected + 1} of {features.length}</span>
          <h3>{item.label}</h3>
          <p>{item.description}</p>
        </div>
        <AutoplayPreview key={item.demo} demo={item.demo} onComplete={next} />
      </div>
    </div>
  );
}

// Tabbed explorer for the surfaces and automation sections; it moves to the next tab after each preview plays through.
export default function ProductExplorer({ variant = "surfaces" }) {
  const [selected, setSelected] = useState(0);
  if (variant === "capabilities") return <CapabilityExplorer />;
  const items = variant === "automation" ? automation : surfaces;
  const item = items[selected];
  const next = () => setSelected((current) => (current + 1) % items.length);

  return (
    <div className={styles.explorer}>
      <TabList items={items} selected={selected} onChange={setSelected} id={variant} />
      <div role="tabpanel" id={`${variant}-panel`} aria-labelledby={`${variant}-tab-${selected}`} tabIndex={0} className={styles.explorerPanel}>
        <div className={`${styles.explorerContent} ${variant === "automation" ? styles.automationContent : ""}`}>
          <div className={styles.explorerCopy}>
            <h3>{item.title}</h3><p>{item.description}</p>
            <ul>{item.points.map((point) => <li key={point}><Check size={14} />{point}</li>)}</ul>
            <Link href="/org" className={styles.textLink}>Add a property<ArrowRight size={14} /></Link>
          </div>
          <div className={styles.demoStage}>
            <AutoplayPreview key={item.demo} demo={item.demo} onComplete={next} />
          </div>
        </div>
      </div>
    </div>
  );
}
