import "server-only";
import { dayOf } from "@/lib/reports/periods";
import { loadServerSources } from "@/lib/reports/sources_server";
import { forProject } from "@/lib/supabase/scope";
import { SETTING_KEY, normalizeConfig, withHistory } from "./export_config";
import { FORMATS } from "./formats";
import { buildJournals, journalTotals, selectLines, totalsByAccount } from "./journal";

// Accounting export (INTL-07): read-only, posts nothing. Loads the ledger with the service role, narrows it and renders the file.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const exportError = (message, status = 400) => Object.assign(new Error(message), { status });

// The saved export settings for a project.
export async function loadExportConfig(admin, projectId) {
  const { data, error } = await forProject(admin.from("settings").select("value").eq("key", SETTING_KEY).is("deleted_at", null), projectId).maybeSingle();
  if (error) throw exportError(error.message, 500);
  return normalizeConfig(data?.value);
}

// Journals + file text for a date range. `opts` overrides the saved settings (profile, format, accountMap, classBy, granularity, dateFormat).
export async function runExport(admin, projectId, { from, to, ...opts } = {}) {
  if (!ISO.test(from || "") || !ISO.test(to || "") || from > to) throw exportError("Choose a valid date range.");
  const cfg = normalizeConfig(opts);
  const fmt = FORMATS[cfg.format];
  const { ledger, properties } = await loadServerSources(admin, projectId, ["ledger"]);
  const inRange = ledger.lines.filter((l) => {
    const d = dayOf(l.date);
    return d >= from && d <= to;
  });
  const lines = selectLines(inRange, ledger.accounts, { profile: cfg.profile });
  const propertyNames = Object.fromEntries((properties || []).map((p) => [p.id, p.name || p.title || "Property"]));
  const journals = buildJournals(lines, null, ledger.accounts, { granularity: cfg.granularity, classBy: cfg.classBy, accountMap: cfg.accountMap, defaultName: fmt.defaultName, propertyNames });
  const totals = journalTotals(journals);
  const content = fmt.build(journals, { dateFormat: cfg.dateFormat || fmt.dateFormat });
  const entries = new Set(lines.map((l) => l.entryId)).size;
  return {
    journals,
    totals,
    byAccount: totalsByAccount(journals),
    entries,
    content,
    mime: fmt.mime,
    filename: `geiger-${cfg.profile}-${from}-to-${to}.${fmt.ext}`,
    config: cfg,
  };
}

// Append an export to the project's history (settings key `accounting_export`), keeping the rest of the saved settings.
export async function recordExport(admin, projectId, { from, to, profile, format, entries, by }) {
  const { data: row, error } = await forProject(admin.from("settings").select("id, value, deleted_at").eq("key", SETTING_KEY), projectId).maybeSingle();
  if (error) throw exportError(error.message, 500);
  const stored = row?.value && typeof row.value === "object" ? row.value : {};
  const history = withHistory(normalizeConfig(stored).history, { from, to, profile, format, at: new Date().toISOString(), by: by || "", entries });
  const value = { ...stored, history };
  const res = row
    ? await admin.from("settings").update({ value, deleted_at: null }).eq("id", row.id)
    : await admin.from("settings").insert({ key: SETTING_KEY, value, project_id: projectId });
  if (res.error) throw exportError(res.error.message, 500);
  return history;
}
