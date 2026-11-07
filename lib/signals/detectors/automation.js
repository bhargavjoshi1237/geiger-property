import { describeReason } from "@/lib/orchestration/reasons";
import { list } from "@/lib/reports/lookups";
import { tab } from "./shared";

// Automation detector: a workflow failing repeatedly for the same reason within the window. These
// need a person to fix the workflow or its data, so the engine also raises a review decision for them.

export const automationFailing = {
  key: "automation_failing",
  label: "Workflow failing repeatedly",
  area: "automation",
  category: "risk",
  description: "A workflow that failed several times in the last 7 days for the same reason.",
  sources: ["automationRuns"],
  needsDecision: true,
  detect(src, ctx) {
    const since = new Date(ctx.now.getTime() - ctx.config.automationWindowDays * 86400000).toISOString();
    const failed = list(src.automationRuns).filter((r) => r.status === "failed" && r.automationId && String(r.startedAt || "") >= since);
    const groups = new Map();
    for (const r of failed) {
      const code = r.metadata?.reasonCode || "unexpected_error";
      const k = `${r.automationId}|${code}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    const findings = [];
    for (const [k, runs] of groups) {
      if (runs.length < ctx.config.automationFailures) continue;
      const [automationId, code] = k.split("|");
      const name = runs[0].automationName || "A workflow";
      const reason = describeReason(code, { workflow: name });
      findings.push({
        key: `automation:${automationId}:${code}`,
        title: `"${name}" failed ${runs.length} times: ${reason.title.toLowerCase()}`,
        why: `${runs.length} runs in ${ctx.config.automationWindowDays} days stopped for the same reason. Latest: ${runs[runs.length - 1].error || reason.text}`,
        urgency: "urgent",
        impact: null,
        grain: "record",
        records: [{ type: "automation", id: automationId, label: name }, ...runs.slice(-5).map((r) => ({ type: "automation_run", id: r.id, label: r.recordLabel || "Run" }))],
        actions: [tab("Open workflow", "All Workflows", automationId), tab("Run history", "Run History")],
        metadata: { reasonCode: code, failures: runs.length },
      });
    }
    return { findings, examined: failed.length, skipped: 0, note: "" };
  },
};

export const AUTOMATION_DETECTORS = [automationFailing];
