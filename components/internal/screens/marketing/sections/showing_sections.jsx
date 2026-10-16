"use client";

import { toast } from "sonner";
import { KeyRound, RefreshCw, ShieldOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/internal/shared/screen_kit";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { makeRelatedSection } from "@/components/internal/screens/entity/sections/related_section";
import { listShowingsForProspect } from "@/lib/supabase/showings";
import { listApplicationsForProspect } from "@/lib/supabase/applications";
import { logSystemActivity } from "@/lib/supabase/activity_log";
import { APPLICATION_COLUMNS, KeyValues, ProviderNotice, SHOWING_COLUMNS } from "./common";
import { generateAccessCode } from "../flows";
import { formatDate, isPast, todayISO } from "../shared";

// Showing editor sections: self-guided access code and related records.

const pad = (n) => String(n).padStart(2, "0");

// "HH:MM" shifted by `minutes` (clamped to the same day).
function shiftTime(time, minutes) {
  const [h, m] = String(time || "09:00").split(":").map((x) => Number(x) || 0);
  const total = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + minutes));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

// Default code window: 15 minutes before the tour until 15 minutes after it ends.
export function accessWindow(item) {
  const start = /^\d{1,2}:\d{2}$/.test(item.showingTime || "") ? item.showingTime : "09:00";
  return {
    accessDate: item.showingDate || todayISO(),
    accessFrom: shiftTime(start, -15),
    accessUntil: shiftTime(start, (Number(item.durationMinutes) || 30) + 15),
  };
}

// Fresh access code + window patch (internal; no smart-lock provider connected).
export const newAccessPatch = (item) => ({
  ...accessWindow(item),
  accessCode: generateAccessCode(6),
  accessCodeStatus: "Active",
  accessIssuedAt: new Date().toISOString(),
});

const ACCESS_FIELDS = [
  { key: "lockDevice", label: "Lock / lockbox", type: "text", meta: true, placeholder: "e.g. Front door keypad" },
  { key: "accessDate", label: "Valid on", type: "date", meta: true },
  { key: "accessFrom", label: "Valid from", type: "time", meta: true },
  { key: "accessUntil", label: "Valid until", type: "time", meta: true },
  { key: "idVerified", label: "ID verified", type: "switch", meta: true },
  { key: "depositHoldPlaced", label: "Card hold placed", type: "switch", meta: true },
  { key: "arrivedAt", label: "Arrived at", type: "time", meta: true },
  { key: "exitedAt", label: "Left at", type: "time", meta: true },
  { key: "accessInstructions", label: "Access instructions", type: "textarea", meta: true, placeholder: "Parking, which door, lights, lock up on the way out…" },
];

export function AccessCodeSection({ item, config, onPatch, onCommit, onCommitMeta }) {
  const m = item.metadata || {};
  const status = m.accessCode
    ? m.accessCodeStatus === "Revoked"
      ? "Revoked"
      : m.accessDate && isPast(m.accessDate)
        ? "Expired"
        : "Active"
    : "None";

  const issue = async () => {
    const patch = newAccessPatch(item);
    if (await onCommitMeta(patch)) {
      logSystemActivity(config.key, item.id, "action", "Generated a self-guided access code");
      toast.success(`Access code ${patch.accessCode} generated.`);
    }
  };
  const revoke = async () => {
    if (await onCommitMeta({ accessCodeStatus: "Revoked" })) {
      logSystemActivity(config.key, item.id, "action", "Revoked the access code");
      toast.success("Access code revoked.");
    }
  };

  return (
    <div className="space-y-5">
      <ProviderNotice what="Smart-lock">
        Codes are generated and tracked here — nothing is programmed into a lock. Set the code on the
        keypad yourself and share it with the prospect.
      </ProviderNotice>
      <SectionCard
        title="Access code"
        action={
          <div className="flex gap-2">
            {m.accessCode && status === "Active" ? (
              <Button variant="ghost" className="text-red-600 hover:bg-red-500/10 dark:text-red-300" onClick={revoke}>
                <ShieldOff className="h-4 w-4" /> Revoke
              </Button>
            ) : null}
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={issue}>
              {m.accessCode ? <RefreshCw className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
              {m.accessCode ? "Regenerate" : "Generate code"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-mono text-3xl font-semibold tracking-[0.3em] text-foreground">
            {m.accessCode || "— — — — — —"}
          </span>
          <Badge variant={status === "Active" ? "success" : status === "None" ? "neutral" : "outline"}>{status}</Badge>
          {m.accessCode ? (
            <span className="text-sm text-text-secondary">
              {formatDate(m.accessDate)} · {m.accessFrom || "—"}–{m.accessUntil || "—"}
            </span>
          ) : null}
        </div>
      </SectionCard>
      <FieldsForm item={item} fields={ACCESS_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
    </div>
  );
}

export function ShowingOverviewSection({ item }) {
  const m = item.metadata || {};
  return (
    <div className="space-y-5">
      <KeyValues
        items={[
          { label: "Prospect", value: item.prospectName || "—" },
          { label: "Contact", value: item.prospectContact || "—" },
          { label: "Unit", value: item.unit || "—" },
          { label: "Listing", value: item.listingName || "—" },
          { label: "When", value: [formatDate(item.showingDate), item.showingTime].filter(Boolean).join(" · ") },
          { label: "Duration", value: item.durationMinutes ? `${item.durationMinutes} min` : "—" },
          { label: "Type", value: item.showingType || "—" },
          { label: "Agent", value: item.agent || (item.showingType === "Self-guided" ? "Self-guided" : "—") },
          { label: "Interest", value: m.interest || "—" },
          { label: "Outcome", value: m.outcome || "—" },
        ]}
      />
      {item.showingType === "Self-guided" ? (
        <KeyValues
          title="Self-guided access"
          columns={3}
          items={[
            { label: "Code", value: m.accessCode ? <span className="font-mono">{m.accessCode}</span> : "Not generated" },
            { label: "Window", value: m.accessCode ? `${m.accessFrom || "—"}–${m.accessUntil || "—"}` : "—" },
            { label: "Status", value: m.accessCodeStatus || "—" },
          ]}
        />
      ) : null}
      {item.feedback ? (
        <SectionCard title="Feedback">
          <p className="whitespace-pre-line text-sm text-text-secondary">{item.feedback}</p>
        </SectionCard>
      ) : null}
    </div>
  );
}

export const ShowingProspectHistorySection = makeRelatedSection({
  load: async (item) => ((await listShowingsForProspect(item.prospectId)) ?? []).filter((s) => s.id !== item.id),
  columns: SHOWING_COLUMNS,
  tab: "Showings",
  plural: "Other showings",
  emptyDescription: "No other tours for this prospect.",
});

export const ShowingApplicationsSection = makeRelatedSection({
  load: (item) => listApplicationsForProspect(item.prospectId),
  columns: APPLICATION_COLUMNS,
  tab: "Applications",
  plural: "Applications",
  emptyDescription: "Applications from this prospect show up here.",
});
