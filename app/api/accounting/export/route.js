import { readJson } from "@/lib/auth/staff";
import { billingAccess, billingError } from "@/lib/billing/http";
import { loadExportConfig, recordExport, runExport } from "@/lib/accounting/export_server";

// POST — accounting export file (INTL-07), read-only. Body { projectId, from, to, record?, ...settings overrides }; settings default to the saved ones. Returns { filename, mime, content, summary, history? }.

export async function POST(request) {
  const body = await readJson(request);
  const gate = await billingAccess(request, body.projectId, "property.report.export", "Your role can't export reports.");
  if (gate.response) return gate.response;
  try {
    const saved = await loadExportConfig(gate.admin, body.projectId);
    const { projectId, record, ...rest } = body;
    const res = await runExport(gate.admin, projectId, { ...saved, ...rest, accountMap: rest.accountMap ?? saved.accountMap });
    const summary = { ...res.totals, entries: res.entries, from: rest.from, to: rest.to, profile: res.config.profile, format: res.config.format, byAccount: res.byAccount };
    let history;
    if (record && res.entries) {
      history = await recordExport(gate.admin, projectId, { from: rest.from, to: rest.to, profile: res.config.profile, format: res.config.format, entries: res.entries, by: gate.auth.user?.email || gate.auth.user?.id });
    }
    return Response.json({ ok: true, filename: res.filename, mime: res.mime, content: res.content, summary, history });
  } catch (e) {
    return billingError(e, "Couldn't build the export.");
  }
}
