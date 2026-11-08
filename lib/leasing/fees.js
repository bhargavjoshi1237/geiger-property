// Applicant-facing fees for one listing. LEAS-07 replaces this stub with the real resolver (fee rules, state caps);
// until then every amount comes from the listing itself (Pricing, Pet policy, Features, Furnished tabs).

const amount = (v) => Math.max(0, Number(v) || 0);
const meta = (listing) => (listing?.metadata && typeof listing.metadata === "object" ? listing.metadata : {});

export const petPolicyOf = (listing) => String(meta(listing).petPolicy ?? listing?.petPolicy ?? "").trim();

// Pets are allowed once a policy other than "No pets" is set; no policy says nothing either way.
export const petsAllowed = (listing) => {
  const policy = petPolicyOf(listing);
  return Boolean(policy) && policy !== "No pets";
};

// Every fee a listing can carry, in disclosure order. `always` rows are shown even at $0 so "no fee" is stated outright.
const FEES = [
  { key: "applicationFee", label: "Application fee", cadence: "one-time", when: "Each adult applicant, when applying", always: true },
  { key: "adminFee", label: "Admin / move-in fee", cadence: "one-time", when: "At move-in", always: true },
  { key: "holdingDeposit", label: "Holding deposit", cadence: "one-time", when: "To hold the home once approved", always: true },
  { key: "deposit", label: "Security deposit", cadence: "one-time", when: "At move-in", refundable: true, always: true, column: true },
  { key: "petDeposit", label: "Pet deposit", cadence: "one-time", when: "Only with a pet", refundable: true, always: true, pets: true },
  { key: "petFee", label: "One-time pet fee", cadence: "one-time", when: "Only with a pet", pets: true },
  { key: "petRent", label: "Pet rent", cadence: "monthly", when: "Only with a pet", always: true, pets: true },
  { key: "parkingFee", label: "Parking", cadence: "monthly", when: "If you rent parking", always: true },
  { key: "cleaningFee", label: "Cleaning fee", cadence: "one-time", when: "Furnished stays" },
];

// resolveApplicantFees(listing) → [{ key, label, amount, cadence, when, refundable, note }]. Accepts a DB row or a view model.
export function resolveApplicantFees(listing) {
  const m = meta(listing);
  const noPets = petPolicyOf(listing) === "No pets";
  const rows = [];
  for (const f of FEES) {
    const value = amount(f.column ? listing?.[f.key] : (m[f.key] ?? listing?.[f.key]));
    if (!f.always && !value) continue;
    const note = f.pets && noPets ? "Pets aren't allowed" : value ? "" : "None";
    rows.push({ key: f.key, label: f.label, amount: f.pets && noPets ? 0 : value, cadence: f.cadence, when: f.when, refundable: Boolean(f.refundable), note });
  }
  return rows;
}
