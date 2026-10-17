import { Check, KeyRound, Wrench } from "lucide-react";
import Logo from "@geiger/ui/logo";
import styles from "./landing.module.css";

const FLOORS = [6, 5, 4, 3, 2, 1];
const UNITS = ["A", "B", "C", "D", "E", "F", "G", "H"];

// November at Harbor Lofts, the same example building the previews below use; every unit not listed here has paid.
const VACANT = new Set(["1H", "3C", "6C"]);
const DUE = new Set(["2B", "3G", "5A", "6H"]);
const WORK = new Set(["2E", "5D"]);
const PINNED = new Set(["4B", "2E", "6C"]);

function unitState(code) {
  if (VACANT.has(code)) return "vacant";
  if (DUE.has(code)) return "due";
  if (WORK.has(code)) return "work";
  return "paid";
}

const LEGEND = [["paid", "Paid"], ["due", "Rent due"], ["vacant", "Vacant"], ["work", "Work order"]];

// Hero artwork: a stack plan of one building where every unit shows its month (paid, due, vacant, in repair), with callouts for the rent, maintenance and leasing jobs the headline names.
export default function HeroBuilding() {
  return (
    <div className={styles.buildingScene} aria-hidden="true">
      <div className={styles.stackCard}>
        <div className={styles.stackHeader}>
          <span><Logo size={18} />Harbor Lofts</span>
          <small>November</small>
        </div>

        <div className={styles.stackPlan}>
          <div className={styles.stackRoof} />
          {FLOORS.map((floor) => (
            <div key={floor} className={styles.stackFloor}>
              <span>{floor}</span>
              {UNITS.map((unit) => {
                const code = `${floor}${unit}`;
                return <i key={code} data-state={unitState(code)} data-pinned={PINNED.has(code) || undefined} />;
              })}
            </div>
          ))}
          <div className={styles.stackGround} />
        </div>

        <div className={styles.stackLegend}>
          {LEGEND.map(([state, label]) => <span key={state}><i data-state={state} />{label}</span>)}
        </div>

        <dl className={styles.stackTotals}>
          <div><dt>Collected</dt><dd>$88,150</dd></div>
          <div><dt>Occupied</dt><dd>45 / 48</dd></div>
          <div><dt>Open repairs</dt><dd>2</dd></div>
        </dl>

        {/* Each callout sits level with its unit's floor (4B on the left, 6C and 2E on the right) */}
        <div className={`${styles.stackCallout} ${styles.calloutPaid}`} style={{ "--delay": "0s" }}>
          <span><Check size={13} strokeWidth={2.5} />4B · Rent paid</span>
          <strong>$2,150.00</strong>
          <small>Maya Patel · Autopay</small>
        </div>
        <div className={`${styles.stackCallout} ${styles.calloutWork}`} style={{ "--delay": "-2s" }}>
          <span><Wrench size={13} />2E · Work order</span>
          <strong>Leaking kitchen tap</strong>
          <small>Vendor booked · Thu</small>
        </div>
        <div className={`${styles.stackCallout} ${styles.calloutLease}`} style={{ "--delay": "-4s" }}>
          <span><KeyRound size={13} />6C · Lease signed</span>
          <strong>Jonah Reyes</strong>
          <small>Moves in 1 Dec</small>
        </div>
      </div>
    </div>
  );
}
