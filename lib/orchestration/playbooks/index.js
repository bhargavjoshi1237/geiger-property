import { collectionsLadder } from "./collections_ladder";
import { autopayFailureRecovery, paymentPlanFollowup } from "./collections_more";
import { applicationToMoveIn, moveOutDeposit, renewalPipeline, vacancyTurn } from "./leases";
import { maintenanceIntake, vendorComplianceChase, workOrderSla } from "./maintenance";
import { monthEndClose, ownerStatementsPayouts, weeklyOwnerDigest } from "./accounting";
import { AREAS, blockingPrerequisites, prerequisiteStatus } from "./shared";

// Playbook catalog (ORCH-07): versioned bundles of workflows for the real jobs, installed through a setup wizard
// (lib/orchestration/playbooks/install.js) and kept editable on the canvas. Definitions are grouped by area file.

export const PLAYBOOKS = [
  collectionsLadder,
  paymentPlanFollowup,
  autopayFailureRecovery,
  renewalPipeline,
  applicationToMoveIn,
  moveOutDeposit,
  vacancyTurn,
  maintenanceIntake,
  workOrderSla,
  vendorComplianceChase,
  monthEndClose,
  ownerStatementsPayouts,
  weeklyOwnerDigest,
];

export const PLAYBOOK_AREAS = AREAS;

export const getPlaybook = (key) => PLAYBOOKS.find((p) => p.key === key) || null;

// Every change note after `fromVersion` up to the current version, newest last.
export function changesSince(playbook, fromVersion = 0) {
  const out = [];
  for (let v = Number(fromVersion) + 1; v <= playbook.version; v += 1) for (const note of playbook.changes?.[v] || []) out.push({ version: v, note });
  return out;
}

// The setup answers merged over the playbook's defaults.
export const playbookConfig = (playbook, answers = {}, ctx = {}) => ({ ...(playbook.defaults?.(ctx) || {}), ...answers });

export { blockingPrerequisites, prerequisiteStatus };
