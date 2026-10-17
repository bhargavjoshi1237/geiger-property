"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, Check, CircleDollarSign, FilePen, FileSignature, Home } from "lucide-react";
import styles from "./landing.module.css";

const steps = [
  { label: "List", icon: Home, title: "List the vacant unit", description: "Add photos, rent and a move-in date, publish the listing, and share one link wherever you advertise.", status: "Listing published", detail: "Unit 4B · 2 bed · $2,150/mo" },
  { label: "Apply", icon: FilePen, title: "A prospect applies", description: "The application, the fee and the screening results are saved to one record you can approve from.", status: "Application APP-1042", detail: "Maya Patel · screening passed" },
  { label: "Sign", icon: FileSignature, title: "Sign the lease and move them in", description: "Send the lease for e-signature, collect the deposit and record the move-in inspection on the same record.", status: "Lease signed", detail: "12 months from 1 Dec · $2,150 deposit" },
  { label: "Pay", icon: CircleDollarSign, title: "Collect rent every month", description: "Rent posts on the 1st, the resident pays from the portal, and the owner's statement updates by itself.", status: "Rent received", detail: "Nov · $2,150.00 · autopay" },
];

const STEP_MS = 3200;
const ENTER = "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-500";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const subscribeReducedMotion = (onChange) => {
  const media = window.matchMedia(reducedMotionQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
const usePrefersReducedMotion = () => useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(reducedMotionQuery).matches, () => false);

export default function ConnectedJourney() {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const diagramRef = useRef(null);
  const reduced = usePrefersReducedMotion();
  const playing = visible && !hovered && !reduced;
  const step = steps[active];
  const Icon = step.icon;

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.5 });
    if (diagramRef.current) observer.observe(diagramRef.current);
    return () => observer.disconnect();
  }, []);

  // Walks through the journey while it is on screen; hovering the diagram holds the current step.
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setTimeout(() => setActive((current) => (current + 1) % steps.length), STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, active]);

  return (
    <section className={styles.journeySection} aria-labelledby="journey-heading">
      <div className={styles.container}>
        <div className={styles.sectionHeading}>
          <h2 id="journey-heading" className={styles.sectionTitle}>One resident record, from the listing to the rent roll</h2>
          <p className={styles.sectionDescription}>Follow a single resident through Geiger Property. Leasing, maintenance and accounting see the same record at every step.</p>
        </div>
        <div className={styles.journeyLayout}>
          <div className={styles.journeyCopy} aria-live="polite">
            <span className={styles.journeyStep}>Step {active + 1} of {steps.length}</span>
            <div key={active} className={ENTER}>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </div>
            <a href="#playground" className={styles.textLink}>Try it in the playground<ArrowRight size={14} /></a>
          </div>
          <div ref={diagramRef} className={styles.journeyDiagram} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
            <div className={styles.journeySteps} aria-label="Resident journey steps">
              <span className={styles.journeyLine} style={{ "--journey-fill": active / (steps.length - 1) }} aria-hidden="true" />
              {steps.map(({ label, icon: StepIcon }, index) => (
                <button type="button" key={label} aria-pressed={active === index} onClick={() => setActive(index)}>
                  <span className={styles.journeyNode}>
                    {index < active ? <Check size={18} /> : <StepIcon size={18} strokeWidth={1.75} />}
                    {active === index && playing ? <svg key={active} className={styles.journeyTimer} viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="25" style={{ animationDuration: `${STEP_MS}ms` }} /></svg> : null}
                  </span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <div className={styles.journeyRecord}>
              <div className={styles.journeyRecordTop}><span>Resident record</span><span>Example data</span></div>
              <div key={active} className={`${styles.journeyRecordBody} ${ENTER}`}>
                <div className={styles.journeyRecordIcon}><Icon size={22} strokeWidth={1.5} /></div>
                <div><span>{step.status}</span><strong>{step.detail}</strong></div>
              </div>
              <div className={styles.journeyRecordBottom}><span>Updated in the workspace, tenant portal and owner portal</span><span>Harbor Lofts · 4B</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
