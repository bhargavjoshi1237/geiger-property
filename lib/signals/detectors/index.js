import { COLLECTIONS_DETECTORS } from "./collections";
import { LEASING_DETECTORS } from "./leasing";
import { MAINTENANCE_DETECTORS } from "./maintenance";
import { ACCOUNTING_DETECTORS } from "./accounting";
import { AUTOMATION_DETECTORS } from "./automation";

// Every rule detector (ORCH-06). The six old Needs Attention rules live on as summaries inside
// rent_delinquency, work_order_attention, bills_attention, lease_expiring_no_offer, upcoming_moves
// and application_pending.
export const DETECTORS = [
  ...COLLECTIONS_DETECTORS,
  ...LEASING_DETECTORS,
  ...MAINTENANCE_DETECTORS,
  ...ACCOUNTING_DETECTORS,
  ...AUTOMATION_DETECTORS,
];

export const getDetector = (key) => DETECTORS.find((d) => d.key === key) || null;

export const detectorSources = (detectors = DETECTORS) => [...new Set(["properties", ...detectors.flatMap((d) => d.sources || [])])];
