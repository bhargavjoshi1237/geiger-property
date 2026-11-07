import { INTAKE_ACTIONS } from "./intake";

// Proposed-action handlers for "Run suggested" in the review queue (server-only). A review item's
// proposed_action is { type, ...inputs }; the handler executes it and reports back:
//   async (admin, item, { actor, input }) => { ok, message, links?: [{type,id,label}], resolve?: boolean }
// Run steps waiting on a suggestion are handled in review_actions.js; intake drafts come from intake.js.
export const PROPOSED_ACTIONS = {
  ...INTAKE_ACTIONS,
};

export function proposedActionHandler(type) {
  return PROPOSED_ACTIONS[type] || null;
}
