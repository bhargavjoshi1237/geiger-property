"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Filter, Zap } from "lucide-react";

import { CONDITION_FIELDS, CONDITION_OPS, getStepType, getTrigger, stepSummary } from "@/lib/automations/catalog";
import { STEP_ICONS } from "../sections";
import { NODE_W } from "./graph";

// Workflow canvas nodes (mirrors geiger-events' workflow nodes): one card per trigger, condition and step, using the
// suite's semantic tokens; the accent tells the kind apart at a glance.

const ACCENTS = {
  amber: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  violet: "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  sky: "border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  neutral: "border-border bg-surface-card text-muted-foreground",
};

function NodeCard({ accent, icon: Icon, kindLabel, title, summary, selected, showTarget = true }) {
  return (
    <div
      style={{ width: NODE_W }}
      className={`group rounded-xl border bg-surface-subtle p-3 shadow-md transition-colors ${
        selected ? "border-foreground" : "border-border hover:border-border-strong"
      }`}
    >
      {showTarget ? <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-text-tertiary" /> : null}
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${ACCENTS[accent]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">{kindLabel}</p>
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          {/* Two lines reserved either way, so every node card is the same height */}
          <p className="mt-0.5 line-clamp-2 min-h-8 text-xs text-text-secondary">{summary}</p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-foreground" />
    </div>
  );
}

export const TriggerNode = memo(function TriggerNode({ data, selected }) {
  const def = getTrigger(data.triggerEvent);
  return (
    <NodeCard
      accent="amber"
      icon={Zap}
      kindLabel="When this happens"
      title={def?.label || "Choose a trigger"}
      summary={data.summary || def?.desc || "Double-click to pick what starts this workflow."}
      selected={selected}
      showTarget={false}
    />
  );
});

export const ConditionNode = memo(function ConditionNode({ data, selected }) {
  const { rule, recordType } = data;
  const field = (CONDITION_FIELDS[recordType] || []).find((f) => f.key === rule.field);
  const op = CONDITION_OPS.find((o) => o.value === rule.op);
  const value = op?.needsValue === false ? "" : rule.value === "" || rule.value == null ? "…" : String(rule.value);
  return (
    <NodeCard
      accent="violet"
      icon={Filter}
      kindLabel="Only continue if"
      title={field?.label || rule.field || "Condition"}
      summary={`${field?.label || rule.field} ${op?.label || rule.op} ${value}`.trim()}
      selected={selected}
    />
  );
});

export const ActionNode = memo(function ActionNode({ data, selected }) {
  const { step } = data;
  const wait = step.type === "wait";
  return (
    <NodeCard
      accent={wait ? "neutral" : "sky"}
      icon={STEP_ICONS[step.type] || Zap}
      kindLabel={wait ? "Then wait" : "Then do this"}
      title={getStepType(step.type)?.label || "Step"}
      summary={stepSummary(step)}
      selected={selected}
    />
  );
});

// Keys match a node's `type`.
export const nodeTypes = { trigger: TriggerNode, condition: ConditionNode, action: ActionNode };
