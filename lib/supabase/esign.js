import { makeEntityData } from "./entity_factory";

// Data-access layer for E-signature (owns `property.esign_requests`). Tracking
// only — no provider is connected, so `provider` stays empty and statuses are
// updated by hand.
export const esignLayer = makeEntityData({
  table: "esign_requests",
  tag: "esign",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "signer", col: "signer", type: "text" },
    { key: "leaseId", col: "lease_id", type: "uuid" },
    { key: "provider", col: "provider", type: "text" },
    { key: "providerEnvelopeId", col: "provider_envelope_id", type: "text" },
    { key: "sentAt", col: "sent_at", type: "date" },
    { key: "signedAt", col: "signed_at", type: "date" },
    { key: "status", col: "status", type: "text", default: "Draft" },
  ],
});

export const esignData = esignLayer.data;

export const listLeaseEsignRequests = (leaseId) => esignLayer.list({ leaseId });
