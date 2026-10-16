"use client";

import { MessagesSquare } from "lucide-react";

import { ChildRecords } from "@/components/internal/screens/entity/sections/child_records";
import {
  listCommunications,
  createCommunication,
  updateCommunication,
  softDeleteCommunication,
} from "@/lib/supabase/tenant_communications";
import { COMMUNICATION_FIELDS, formatDate, todayISO } from "../shared";

const COLUMN_KEYS = ["channel", "direction", "subject", "body", "occurredAt"];
const META_KEYS = ["deliveryStatus"];

// Form values → tenant_communications row (extra keys into metadata). Date-only
// values are pinned to midday so the timestamp never shifts a day across zones.
function toCommunication(values, base = {}) {
  const out = { metadata: { ...(base.metadata || {}) } };
  for (const k of COLUMN_KEYS) if (k in values) out[k] = values[k];
  for (const k of META_KEYS) if (k in values) out.metadata[k] = values[k];
  if (/^\d{4}-\d{2}-\d{2}$/.test(out.occurredAt || "")) out.occurredAt = `${out.occurredAt}T12:00:00`;
  return out;
}

// Rows carry a date-only occurredAt so the date input can edit them.
const view = (r) => (r ? { ...r, occurredAt: String(r.occurredAt || "").slice(0, 10) } : r);

const adapter = {
  load: async (item) => ((await listCommunications(item.id)) ?? []).map(view),
  create: async (item, values) =>
    view(await createCommunication({ id: crypto.randomUUID(), tenantId: item.id, occurredAt: "", ...toCommunication(values) })),
  update: async (row, values) => view(await updateCommunication(row.id, toCommunication(values, row))),
  remove: (row) => softDeleteCommunication(row.id),
};

const BADGE = { Failed: "danger", Bounced: "danger", Delivered: "success", Opened: "success", Sent: "info" };

// Notifications log — every email, SMS, call, letter, and portal message to/from the tenant.
export function TenantCommunicationsSection({ item, config }) {
  return (
    <ChildRecords
      item={item}
      config={config}
      adapter={adapter}
      fields={COMMUNICATION_FIELDS}
      singular="Message"
      plural="Messages"
      icon={MessagesSquare}
      defaults={() => ({ channel: "email", direction: "outbound", occurredAt: todayISO(), deliveryStatus: "Sent" })}
      emptyDescription="Log emails, texts, calls, and letters. Automated notices will appear here too."
      summary={(r) => ({
        title: r.subject || "(no subject)",
        meta: [r.channel, r.direction, formatDate(r.occurredAt)].filter(Boolean).join(" · "),
        badge: r.deliveryStatus || undefined,
        badgeVariant: BADGE[r.deliveryStatus] || "neutral",
      })}
    />
  );
}

export default TenantCommunicationsSection;
