import { triggerDefaults } from "@/lib/automations/catalog";
import { changesSince, playbookConfig } from "./index";

// Playbook install / update / uninstall (ORCH-07). The planning functions are pure (unit-tested); the apply
// functions take the data layers as arguments so this module stays isomorphic and the screen owns the client.
// Each generated automation carries metadata.playbook = { key, version, installId, workflowKey, customized }.

export const isCustomized = (automation) => Boolean(automation?.metadata?.playbook?.customized);
export const playbookMetaOf = (automation) => automation?.metadata?.playbook || null;

// The automations rows a playbook generates for a config (camelCase, ready for automationsData.create).
export function generatedRows(playbook, answers, { installId, activate = false, ids = null } = {}) {
  const config = playbookConfig(playbook, answers);
  return playbook.workflows(config).map((w, i) => ({
    id: ids?.[w.key] || ids?.[i] || crypto.randomUUID(),
    name: w.name,
    triggerEvent: w.triggerEvent,
    actionType: "workflow",
    enabled: Boolean(activate),
    status: activate ? "Active" : "Draft",
    autonomy: w.autonomy,
    metadata: {
      description: w.description || "",
      trigger: { ...triggerDefaults(w.triggerEvent), ...(w.trigger || {}) },
      conditionRules: w.conditionRules || [],
      ...(w.conditions ? { conditions: w.conditions } : {}),
      steps: w.steps,
      autonomyConfig: w.autonomyConfig,
      playbook: { key: playbook.key, version: playbook.version, installId, workflowKey: w.key, customized: false },
    },
  }));
}

// What an update would do for one install: regenerate non-customized workflows, add workflows new in this version,
// pause ones the new version dropped, and leave customized ones alone (with a notice).
export function planUpdate(playbook, install, automations) {
  const owned = (automations || []).filter((a) => playbookMetaOf(a)?.installId === install.id && !a.deletedAt);
  const fromVersion = Number(install.version) || 1;
  const upToDate = fromVersion >= playbook.version;
  const config = playbookConfig(playbook, install.config || {});
  const next = playbook.workflows(config);
  const byKey = new Map(owned.map((a) => [playbookMetaOf(a)?.workflowKey, a]));
  const regenerate = [];
  const keepCustomized = [];
  const create = [];
  for (const w of next) {
    const current = byKey.get(w.key);
    if (!current) create.push(w);
    else if (isCustomized(current)) keepCustomized.push(current);
    else regenerate.push({ automation: current, workflow: w });
  }
  const nextKeys = new Set(next.map((w) => w.key));
  const retire = owned.filter((a) => !nextKeys.has(playbookMetaOf(a)?.workflowKey) && !isCustomized(a));
  return { upToDate, fromVersion, toVersion: playbook.version, changes: changesSince(playbook, fromVersion), regenerate, keepCustomized, create, retire };
}

// Install: one playbook_installs row, then its workflows; undone if any workflow fails to save.
export async function installPlaybook({ playbook, answers, activate, installs, automations, installedBy = null }) {
  const installId = crypto.randomUUID();
  const config = playbookConfig(playbook, answers);
  const install = await installs.create({
    id: installId,
    playbookKey: playbook.key,
    version: playbook.version,
    config,
    status: "active",
    automationIds: [],
    installedBy,
    installedAt: new Date().toISOString(),
  });
  if (!install) return { ok: false, error: "Couldn't save the install." };
  const rows = generatedRows(playbook, config, { installId, activate });
  const created = [];
  for (const row of rows) {
    const saved = await automations.create(row);
    if (!saved) {
      for (const c of created) await automations.softDelete(c.id);
      await installs.update(installId, { status: "removed" });
      return { ok: false, error: `Couldn't create "${row.name}".` };
    }
    created.push(saved);
  }
  const updated = await installs.update(installId, { automationIds: created.map((c) => c.id) });
  return { ok: true, install: updated || { ...install, automationIds: created.map((c) => c.id) }, automations: created };
}

// Apply a planned update; customized workflows keep their steps and simply stay as they are.
export async function applyUpdate({ playbook, install, plan, installs, automations }) {
  const touched = [];
  for (const { automation, workflow } of plan.regenerate) {
    const [row] = generatedRows({ ...playbook, workflows: () => [workflow] }, install.config || {}, { installId: install.id, ids: [automation.id] });
    const saved = await automations.update(automation.id, {
      name: row.name,
      triggerEvent: row.triggerEvent,
      autonomy: row.autonomy,
      metadata: { ...(automation.metadata || {}), ...row.metadata, canvas: automation.metadata?.canvas },
    });
    if (!saved) return { ok: false, error: `Couldn't update "${automation.name}".` };
    touched.push(saved.id);
  }
  const added = [];
  for (const w of plan.create) {
    const [row] = generatedRows({ ...playbook, workflows: () => [w] }, install.config || {}, { installId: install.id });
    const saved = await automations.create(row);
    if (!saved) return { ok: false, error: `Couldn't add "${row.name}".` };
    added.push(saved.id);
  }
  for (const a of plan.retire) await automations.update(a.id, { enabled: false, status: "Paused" });
  const ids = [...new Set([...(install.automationIds || []), ...added])].filter((id) => !plan.retire.some((a) => a.id === id));
  const updated = await installs.update(install.id, { version: playbook.version, automationIds: ids });
  if (!updated) return { ok: false, error: "Couldn't record the new version." };
  for (const a of plan.keepCustomized) {
    await automations.mergeMeta?.(a.id, { playbook: { ...(a.metadata?.playbook || {}), skippedVersion: playbook.version } });
  }
  return { ok: true, install: updated, regenerated: touched.length, added: added.length, kept: plan.keepCustomized.length, retired: plan.retire.length };
}

// Uninstall: pause every workflow the install owns (history stays in Run History) and mark it removed.
export async function uninstallPlaybook({ install, installs, automations }) {
  for (const id of install.automationIds || []) await automations.update(id, { enabled: false, status: "Paused" });
  const updated = await installs.update(install.id, { status: "removed" });
  return updated ? { ok: true } : { ok: false, error: "Couldn't remove the playbook." };
}
