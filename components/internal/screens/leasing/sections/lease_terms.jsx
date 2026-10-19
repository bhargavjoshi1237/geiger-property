"use client";

import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";

import { Input } from "@geiger/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui/select";
import { SectionCard } from "@/components/internal/shared/screen_kit";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { ChildRecords, recordItemsAdapter } from "@/components/internal/screens/entity/sections/child_records";
import { listRecordItems } from "@/lib/supabase/record_items";
import { Callout } from "./gated";
import {
  ACCESS_STATUS_OPTIONS,
  ACCESS_STATUS_VARIANT,
  ACCESS_TYPE_OPTIONS,
  UTILITIES,
  UTILITY_BILLING_OPTIONS,
  UTILITY_RESPONSIBILITY_OPTIONS,
  currency,
  daysUntil,
  formatDate,
  generateAccessCode,
  todayISO,
} from "../shared";

// Coverage & access tabs of the lease editor: renters insurance (requirement +
// policies on file), the utilities responsibility matrix, and access codes.

// --- Renters insurance -----------------------------------------------------------

const REQUIREMENT_FIELDS = [
  { key: "insuranceRequired", label: "Renters insurance required", type: "switch", meta: true },
  { key: "insuranceMinLiability", label: "Minimum liability coverage", type: "currency", meta: true, showIf: (i) => i.insuranceRequired },
  {
    key: "insuranceProgram",
    label: "How it's met",
    type: "select",
    meta: true,
    options: [
      { value: "resident", label: "Resident-purchased policy" },
      { value: "master", label: "Master policy (benefits package)" },
      { value: "waived", label: "Waived" },
    ],
    showIf: (i) => i.insuranceRequired,
  },
  { key: "insuranceInterestedParty", label: "Landlord listed as interested party", type: "switch", meta: true, showIf: (i) => i.insuranceRequired },
  { key: "insuranceProofReceived", label: "Proof received", type: "switch", meta: true, showIf: (i) => i.insuranceRequired },
  { key: "insuranceProofReceivedOn", label: "Proof received on", type: "date", meta: true, showIf: (i) => i.insuranceRequired && i.insuranceProofReceived },
];

const POLICY_FIELDS = [
  { key: "name", label: "Carrier", type: "text", required: true, placeholder: "e.g. Lemonade" },
  { key: "policyNumber", label: "Policy #", type: "text", required: true },
  { key: "amount", label: "Liability coverage", type: "currency" },
  { key: "personalProperty", label: "Personal property coverage", type: "currency" },
  { key: "startsOn", label: "Effective", type: "date" },
  { key: "endsOn", label: "Expires", type: "date" },
  { key: "status", label: "Status", type: "select", options: [{ value: "Active", label: "Active" }, { value: "Expired", label: "Expired" }, { value: "Cancelled", label: "Cancelled" }] },
  { key: "interestedParty", label: "Landlord named as interested party", type: "switch" },
  { key: "agentContact", label: "Agent contact", type: "text", full: true },
];

const policyAdapter = recordItemsAdapter("insurance_policy");

const coversToday = (p) =>
  p.status !== "Cancelled" && p.status !== "Expired" && (!p.startsOn || p.startsOn <= todayISO()) && (!p.endsOn || p.endsOn >= todayISO());

export function InsuranceSection({ item, config, onPatch, onCommit, onCommitMeta }) {
  const [policies, setPolicies] = useState(null);
  const m = item.metadata || {};

  useEffect(() => {
    let alive = true;
    listRecordItems("lease", item.id, "insurance_policy").then((r) => alive && setPolicies(r ?? []));
    return () => {
      alive = false;
    };
  }, [item.id]);

  const active = (policies || []).filter(coversToday);
  const min = Number(m.insuranceMinLiability) || 0;
  const meets = active.some((p) => !min || Number(p.amount) >= min);
  const expiring = active.find((p) => {
    const d = daysUntil(p.endsOn);
    return d !== null && d <= 30;
  });

  return (
    <div className="space-y-6">
      {m.insuranceRequired && m.insuranceProgram !== "waived" && policies !== null ? (
        !active.length ? (
          <Callout tone="danger">No active renters insurance policy on file — this lease requires one.</Callout>
        ) : !meets ? (
          <Callout tone="warning">Active coverage is below the {currency(min)} liability minimum.</Callout>
        ) : expiring ? (
          <Callout tone="warning">
            {expiring.name} policy expires {formatDate(expiring.endsOn)} — ask the resident for renewed proof.
          </Callout>
        ) : (
          <Callout tone="success">Insurance requirement met.</Callout>
        )
      ) : null}

      <SectionCard title="Requirement">
        <FieldsForm item={item} fields={REQUIREMENT_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </SectionCard>

      <SectionCard title="Policies on file">
        <ChildRecords
          item={item}
          config={config}
          adapter={policyAdapter}
          fields={POLICY_FIELDS}
          singular="Policy"
          plural="Policies"
          icon={ShieldCheck}
          onChange={setPolicies}
          defaults={() => ({ status: "Active", startsOn: item.termStart || todayISO(), interestedParty: true })}
          emptyDescription="Record the resident's renters insurance policy and its expiry."
          summary={(p) => ({
            title: `${p.name}${p.metadata?.policyNumber ? ` · ${p.metadata.policyNumber}` : ""}`,
            meta: [p.startsOn || p.endsOn ? `${formatDate(p.startsOn)} – ${formatDate(p.endsOn)}` : null, p.metadata?.interestedParty ? "Landlord named" : null]
              .filter(Boolean)
              .join(" · "),
            badge: coversToday(p) ? "Active" : p.status || "Expired",
            badgeVariant: coversToday(p) ? "success" : "neutral",
            aside: Number(p.amount) ? currency(p.amount) : null,
          })}
        />
      </SectionCard>
    </div>
  );
}

// --- Utilities responsibility matrix ---------------------------------------------

export function UtilitiesSection({ item, onCommitMeta }) {
  const saved = item.metadata?.utilities || {};
  const [typing, setTyping] = useState({});
  const row = (key) => ({ ...(saved[key] || {}), ...(typing[key] || {}) });

  const write = (u, patch) =>
    onCommitMeta({ utilities: { ...saved, [u.key]: { ...(saved[u.key] || {}), label: u.label, ...patch } } });
  const type = (key, patch) => setTyping((t) => ({ ...t, [key]: { ...(t[key] || {}), ...patch } }));
  const blur = (u, field, value) => {
    setTyping((t) => {
      const next = { ...t, [u.key]: { ...(t[u.key] || {}) } };
      delete next[u.key][field];
      return next;
    });
    if ((saved[u.key]?.[field] ?? "") !== value) write(u, { [field]: value });
  };

  const tenantCount = UTILITIES.filter((u) => saved[u.key]?.responsibility === "tenant").length;

  return (
    <SectionCard
      title="Who pays for what"
      description={`${tenantCount} of ${UTILITIES.length} utilities are the tenant's responsibility. Merged into the lease as {{lease.utilities}}.`}
      bodyPadding={false}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-text-tertiary">
              <th className="px-5 py-2.5 font-medium">Utility</th>
              <th className="px-2 py-2.5 font-medium">Responsible</th>
              <th className="px-2 py-2.5 font-medium">Billing</th>
              <th className="px-2 py-2.5 font-medium">Provider</th>
              <th className="px-2 py-2.5 font-medium">Account #</th>
              <th className="px-5 py-2.5 pl-2 font-medium">Monthly fee</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {UTILITIES.map((u) => {
              const r = row(u.key);
              return (
                <tr key={u.key}>
                  <td className="px-5 py-2 font-medium text-foreground">{u.label}</td>
                  <td className="px-2 py-2">
                    <Select value={r.responsibility || ""} onValueChange={(v) => write(u, { responsibility: v })}>
                      <SelectTrigger className="h-8 w-36 bg-surface-card" aria-label={`${u.label} responsibility`}>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {UTILITY_RESPONSIBILITY_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-2">
                    <Select value={r.billing || ""} onValueChange={(v) => write(u, { billing: v })}>
                      <SelectTrigger className="h-8 w-44 bg-surface-card" aria-label={`${u.label} billing`}>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {UTILITY_BILLING_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      value={r.provider ?? ""}
                      onChange={(e) => type(u.key, { provider: e.target.value })}
                      onBlur={(e) => blur(u, "provider", e.target.value)}
                      className="h-8"
                      aria-label={`${u.label} provider`}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      value={r.account ?? ""}
                      onChange={(e) => type(u.key, { account: e.target.value })}
                      onBlur={(e) => blur(u, "account", e.target.value)}
                      className="h-8"
                      aria-label={`${u.label} account number`}
                    />
                  </td>
                  <td className="px-5 py-2 pl-2">
                    <Input
                      type="number"
                      step="0.01"
                      disabled={!["flat", "rubs", "submeter"].includes(r.billing)}
                      value={r.amount ?? ""}
                      onChange={(e) => type(u.key, { amount: e.target.value })}
                      onBlur={(e) => blur(u, "amount", e.target.value === "" ? "" : Number(e.target.value))}
                      className="h-8 w-28 text-right tabular-nums"
                      aria-label={`${u.label} monthly fee`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// --- Access codes ----------------------------------------------------------------

const ACCESS_FIELDS = [
  { key: "accessType", label: "Type", type: "select", options: ACCESS_TYPE_OPTIONS, required: true },
  { key: "name", label: "Door / area", type: "text", required: true, placeholder: "e.g. Front door" },
  { key: "code", label: "Code / key #", type: "text", hint: "Auto-generated — edit if the lock needs a specific code." },
  { key: "startsOn", label: "Valid from", type: "date" },
  { key: "endsOn", label: "Valid until", type: "date" },
  { key: "status", label: "Status", type: "select", options: ACCESS_STATUS_OPTIONS },
  { key: "issuedTo", label: "Issued to", type: "text" },
  { key: "notes", label: "Notes", type: "text", full: true },
];

const accessAdapter = recordItemsAdapter("access_code");

// Status shown for a code: scheduled before its window, expired after it.
function accessStatus(r) {
  if (r.status === "Revoked") return "Revoked";
  if (r.startsOn && r.startsOn > todayISO()) return "Scheduled";
  if (r.endsOn && r.endsOn < todayISO()) return "Expired";
  return r.status || "Active";
}

export function AccessCodesSection({ item, config }) {
  return (
    <ChildRecords
      item={item}
      config={config}
      adapter={accessAdapter}
      fields={ACCESS_FIELDS}
      singular="Access code"
      icon={KeyRound}
      defaults={(l) => ({
        accessType: "Door keypad",
        name: "Front door",
        code: generateAccessCode(6),
        startsOn: l.moveInDate || l.termStart || todayISO(),
        endsOn: l.moveOutDate || l.termEnd || "",
        status: "Active",
        issuedTo: l.tenantName || "",
      })}
      emptyDescription="Issue keypad, gate, and smart-lock codes (or log physical keys) with a valid window."
      summary={(r) => {
        const status = accessStatus(r);
        return {
          title: `${r.name}${r.metadata?.code ? ` · ${r.metadata.code}` : ""}`,
          meta: [r.metadata?.accessType, r.startsOn || r.endsOn ? `${formatDate(r.startsOn)} – ${formatDate(r.endsOn)}` : null, r.metadata?.issuedTo]
            .filter(Boolean)
            .join(" · "),
          badge: status,
          badgeVariant: ACCESS_STATUS_VARIANT[status] || "neutral",
        };
      }}
    />
  );
}
