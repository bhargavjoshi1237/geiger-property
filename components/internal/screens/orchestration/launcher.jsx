"use client";

import { ArrowUpRight } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { recordTab } from "@/lib/orchestration/records";

// Insight-to-action launcher (ORCH-08). A suggested action is
//   { type: "playbook" | "workflow" | "wizard" | "report" | "tab" | "case", label, key?, recordType?, recordIds?,
//     tab?, itemId?, section?, initial? }
// carried by signals (suggested_actions) and review items. SuggestedActionButton runs one: workflows and playbooks
// open a preview (dry run) to refine, then run on the selected records; wizards open the record's action wizard
// pre-filled; reports and tabs navigate; "case" opens the guided case sheet. Placeholder: navigates only.

export function SuggestedActionButton({ action, size = "sm", variant = "outline", className = "" }) {
  const { setTab, openItemInTab } = useWorkspaceUrl();
  if (!action) return null;
  const go = () => {
    const id = action.itemId || action.recordIds?.[0];
    const tab = action.tab || recordTab(action.recordType);
    if (id && tab) openItemInTab(id, tab);
    else if (tab) setTab(tab);
  };
  return (
    <Button size={size} variant={variant} className={className} onClick={go}>
      {action.label || "Open"} <ArrowUpRight className="h-3.5 w-3.5" />
    </Button>
  );
}

// Guided case sheet: why, record context, and a checklist of fixes. Placeholder.
export function CaseSheet() {
  return null;
}

export default SuggestedActionButton;
