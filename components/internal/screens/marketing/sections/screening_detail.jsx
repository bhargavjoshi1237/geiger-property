"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Lock, ShieldAlert } from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { Badge } from "@geiger/ui/badge";
import { SectionCard } from "@/components/internal/shared/screen_kit";
import { RoleNote } from "@/components/internal/shared/role_gate";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { usePermission } from "@/context/rbac-context";
import { SCREENING_PERMISSIONS } from "@/lib/screening/permissions";
import { FINDINGS_KEY, PRIMARY } from "@/lib/screening/sensitive";
import { saveScreeningDetailApi, screeningDetailApi } from "@/lib/screening/api";
import { listRecordItems } from "@/lib/supabase/record_items";
import { Note, useLoad } from "./common";
import { toOptions } from "../shared";

// Protected screening detail (RISK-02): read through /api/screening (screening.view_reports, every read access-logged) and saved
// through the same route; nothing here is in applications.metadata any more.

const IDENTITY_FIELDS = [
  { key: "dateOfBirth", label: "Date of birth", type: "date" },
  { key: "idType", label: "ID type", type: "select", options: toOptions(["Driver's license", "State ID", "Passport", "Other"]) },
  { key: "idLast4", label: "ID last 4", type: "text", placeholder: "1234", hint: "Only the last 4 characters. Never a full ID or SSN." },
  { key: "evictedBefore", label: "Disclosed a prior eviction", type: "switch" },
  { key: "felonyDisclosed", label: "Disclosed a conviction", type: "switch" },
  { key: "disclosureNotes", label: "Disclosure notes", type: "textarea" },
];

const partyOf = (detail, partyRef) => (partyRef === PRIMARY ? detail?.primary : detail?.parties?.[partyRef]) || {};

// A loaded detail with a patch applied to one party (findings merge per check).
function withPatch(detail, partyRef, patch) {
  if (!detail) return detail;
  const cur = partyOf(detail, partyRef);
  const next = { ...cur, ...patch, ...(patch[FINDINGS_KEY] ? { [FINDINGS_KEY]: { ...(cur[FINDINGS_KEY] || {}), ...patch[FINDINGS_KEY] } } : {}) };
  return partyRef === PRIMARY ? { ...detail, primary: next } : { ...detail, parties: { ...detail.parties, [partyRef]: next } };
}

// The patch that puts a party's previous values back.
function undoOf(prev, patch) {
  return Object.fromEntries(
    Object.keys(patch).map((k) => [k, k === FINDINGS_KEY ? Object.fromEntries(Object.keys(patch[k]).map((c) => [c, prev[k]?.[c] ?? ""])) : prev[k] ?? ""]),
  );
}

// One scope of an application's protected detail → { detail (undefined while loading, null on failure), error, save(partyRef, patch) }.
export function useScreeningDetail(applicationId, scope, enabled) {
  const key = enabled && applicationId ? `${applicationId}:${scope}` : null;
  const [state, setState] = useState({ key: null, detail: undefined, error: "" });
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    screeningDetailApi(applicationId, scope).then((res) => {
      if (!alive) return;
      const error = res.ok ? "" : res.status === 403 ? "Your role can't open these details." : res.error || "Couldn't load these details.";
      setState({ key, detail: res.ok ? res.detail : null, error });
    });
    return () => {
      alive = false;
    };
  }, [key, applicationId, scope]);

  // Optimistic: apply locally, save, and put the previous values back if the server refuses.
  const save = useCallback(
    async (partyRef, patch) => {
      const undo = undoOf(partyOf(latest.current.detail, partyRef), patch);
      const apply = (p) => setState((s) => (s.key === key && s.detail ? { ...s, detail: withPatch(s.detail, partyRef, p) } : s));
      apply(patch);
      const res = await saveScreeningDetailApi(applicationId, partyRef, patch);
      if (res.ok) return true;
      apply(undo);
      toast.error(res.error || "Couldn't save that change.");
      return false;
    },
    [applicationId, key],
  );

  const loaded = state.key === key;
  return { detail: loaded ? state.detail : undefined, error: loaded ? state.error : "", save };
}

// FieldsForm over a party's protected values: typing stays local, a committed change is saved through the route (reverted if refused).
export function DetailForm({ fields, values, onSave, columns }) {
  const [draft, setDraft] = useState(() => ({ ...(values || {}) }));
  const commit = async (partial) => {
    setDraft((d) => ({ ...d, ...partial }));
    const changed = Object.fromEntries(Object.entries(partial).filter(([k, v]) => (values?.[k] ?? "") !== v));
    if (!Object.keys(changed).length) return true;
    const ok = await onSave(changed);
    if (!ok) setDraft((d) => ({ ...d, ...Object.fromEntries(Object.keys(changed).map((k) => [k, values?.[k] ?? ""])) }));
    return ok;
  };
  return <FieldsForm flat item={draft} fields={fields} columns={columns} onPatch={(p) => setDraft((d) => ({ ...d, ...p }))} onCommit={commit} />;
}

export function DetailLoading({ label }) {
  return (
    <div className="flex justify-center py-6">
      <LogoLoading size={40} aria-label={label} />
    </div>
  );
}

export const ProtectedBadge = () => (
  <Badge variant="neutral" className="gap-1">
    <Lock className="h-3 w-3" /> Protected
  </Badge>
);

// Applicant tab: date of birth, ID and disclosures for the applicant and each co-applicant's date of birth.
export function IdentityDetailCard({ item, config }) {
  const canView = usePermission(SCREENING_PERMISSIONS.viewReports);
  if (!canView) {
    return <RoleNote>Date of birth, ID details and disclosures are protected. Opening them needs report access.</RoleNote>;
  }
  return <IdentityDetail item={item} config={config} />;
}

function IdentityDetail({ item, config }) {
  const { detail, error, save } = useScreeningDetail(item.id, "identity", true);
  const parties = useLoad(() => listRecordItems(config.key, item.id, "co_applicant"), [item.id]);
  return (
    <SectionCard
      title="Identity & disclosures"
      description="Only roles with report access see these details, and every view is logged."
      action={<ProtectedBadge />}
    >
      {detail === undefined ? (
        <DetailLoading label="Loading identity details" />
      ) : detail === null ? (
        <Note icon={ShieldAlert}>{error}</Note>
      ) : (
        <div className="space-y-5">
          <DetailForm key={item.id} fields={IDENTITY_FIELDS} values={detail.primary} onSave={(p) => save(PRIMARY, p)} />
          {(parties || []).map((p) => (
            <DetailForm
              key={p.id}
              fields={[{ key: "dateOfBirth", label: `${p.name || "Co-applicant"} · date of birth`, type: "date" }]}
              values={detail.parties[p.id]}
              onSave={(patch) => save(p.id, patch)}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
