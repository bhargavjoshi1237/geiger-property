"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Car, PawPrint, UserCheck, Users } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { SectionCard } from "@/components/internal/shared/screen_kit";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { ChildRecords, recordItemsAdapter } from "@/components/internal/screens/entity/sections/child_records";
import { leasePartiesLayer, listLeaseParties } from "@/lib/supabase/lease_parties";
import { listTenants } from "@/lib/supabase/tenants";
import { tenantOptions } from "@/lib/supabase/options";
import { layerAdapter } from "../adapters";
import { Callout } from "./gated";
import { PARTY_ROLE_OPTIONS, currency, formatDate, partyRoleLabel, toOptions } from "../shared";

// People tabs of the lease editor: primary tenant + lease parties (co-tenants,
// co-signers, guarantors, occupants), then pets and vehicles on the lease.

const PRIMARY_FIELDS = [
  { key: "tenantId", label: "Primary tenant", type: "relation", load: tenantOptions, displayKey: "tenantName" },
  { key: "landlord", label: "Landlord / managing agent", type: "text", meta: true, placeholder: "Defaults to your company profile" },
  { key: "leasingAgent", label: "Leasing agent", type: "text", meta: true },
  { key: "managerEmail", label: "Manager email", type: "email", meta: true },
  { key: "managerPhone", label: "Manager phone", type: "phone", meta: true },
  { key: "occupantLimit", label: "Maximum occupants", type: "number", meta: true, min: 0 },
];

// Tenant picker that also fills the party's name and contact details.
async function partyTenantOptions() {
  const rows = (await listTenants()) ?? [];
  return rows.map((t) => ({
    value: t.id,
    label: t.unit ? `${t.name} · ${t.unit}` : t.name || "Tenant",
    patch: { name: t.name || "", email: t.email || "", phone: t.phone || "" },
  }));
}

const PARTY_FIELDS = [
  { key: "role", label: "Role", type: "select", options: PARTY_ROLE_OPTIONS, required: true },
  { key: "tenantId", label: "Tenant record", type: "relation", load: partyTenantOptions, hint: "Pick a tenant, or leave blank and type a name." },
  { key: "name", label: "Name", type: "text", required: true },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "phone" },
  { key: "responsibilityPct", label: "Rent responsibility", type: "percent", min: 0, max: 100, showIf: (v) => v.role === "tenant" || v.role === "cosigner" },
  { key: "isPrimary", label: "Primary tenant", type: "switch", showIf: (v) => v.role === "tenant" },
  { key: "relationship", label: "Relationship", type: "text", placeholder: "e.g. Spouse, Parent", showIf: (v) => v.role !== "tenant" },
  { key: "dateOfBirth", label: "Date of birth", type: "date", showIf: (v) => v.role === "occupant" },
  { key: "guaranteeLimit", label: "Guarantee limit", type: "currency", showIf: (v) => v.role === "guarantor" || v.role === "cosigner" },
  { key: "portalAccess", label: "Resident portal access", type: "switch", showIf: (v) => v.role === "tenant" },
  { key: "signs", label: "Signs the lease", type: "switch" },
];

const partyAdapter = layerAdapter(leasePartiesLayer, "leaseId");

export function PeopleSection({ item, config, onPatch, onCommit, onCommitMeta }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    listLeaseParties(item.id).then((r) => alive && setRows(r ?? []));
    return () => {
      alive = false;
    };
  }, [item.id]);

  const parties = rows || [];
  const payers = parties.filter((p) => (p.role === "tenant" || p.role === "cosigner") && Number(p.responsibilityPct) > 0);
  const pctTotal = payers.reduce((s, p) => s + Number(p.responsibilityPct), 0);
  const primary = parties.find((p) => p.role === "tenant" && p.isPrimary && p.tenantId);
  const primaryMismatch = primary && primary.tenantId !== item.tenantId;

  return (
    <div className="space-y-6">
      <SectionCard title="Primary contacts">
        <FieldsForm item={item} fields={PRIMARY_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </SectionCard>

      {payers.length && Math.round(pctTotal) !== 100 ? (
        <Callout tone="warning">Rent responsibility adds up to {Math.round(pctTotal)}% — it should total 100%.</Callout>
      ) : null}
      {primaryMismatch ? (
        <Callout
          tone="info"
          action={
            <Button
              size="sm"
              variant="outline"
              className="border-border bg-surface-card"
              onClick={async () => {
                if (await onCommit({ tenantId: primary.tenantId, tenantName: primary.name })) toast.success("Primary tenant updated.");
              }}
            >
              <UserCheck className="h-4 w-4" /> Use {primary.name}
            </Button>
          }
        >
          {primary.name} is marked primary but the lease lists {item.tenantName || "no tenant"}.
        </Callout>
      ) : null}

      <SectionCard title="Lease parties" description="Everyone on the lease — co-tenants, co-signers, guarantors, and occupants.">
        <ChildRecords
          item={item}
          config={config}
          adapter={partyAdapter}
          fields={PARTY_FIELDS}
          singular="Person"
          plural="People"
          icon={Users}
          onChange={setRows}
          defaults={() => ({ role: "tenant", signs: true, isPrimary: parties.length === 0 })}
          emptyDescription="Add the tenants, co-signers, guarantors, and occupants on this lease."
          summary={(p) => ({
            title: p.name || "Unnamed",
            meta: [partyRoleLabel(p.role), p.metadata?.relationship, p.email, p.phone].filter(Boolean).join(" · "),
            badge: p.isPrimary ? "Primary" : partyRoleLabel(p.role),
            badgeVariant: p.isPrimary ? "success" : p.role === "tenant" ? "info" : "neutral",
            aside: Number(p.responsibilityPct) ? `${Number(p.responsibilityPct)}%` : null,
          })}
        />
      </SectionCard>
    </div>
  );
}

// --- Pets & vehicles ---------------------------------------------------------------

const PET_FIELDS = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "species", label: "Type", type: "select", options: toOptions(["Dog", "Cat", "Bird", "Fish", "Reptile", "Small animal", "Other"]), required: true },
  { key: "breed", label: "Breed", type: "text" },
  { key: "weightLbs", label: "Weight (lbs)", type: "number", min: 0 },
  { key: "age", label: "Age (years)", type: "number", min: 0 },
  { key: "color", label: "Color", type: "text" },
  { key: "amount", label: "Monthly pet rent", type: "currency" },
  { key: "petFee", label: "Pet deposit / fee", type: "currency" },
  { key: "endsOn", label: "Vaccinations expire", type: "date" },
  { key: "licenseNumber", label: "License #", type: "text" },
  { key: "serviceAnimal", label: "Service / assistance animal", type: "switch", hint: "No pet rent or deposit may be charged." },
  { key: "spayedNeutered", label: "Spayed / neutered", type: "switch" },
];

const VEHICLE_FIELDS = [
  { key: "name", label: "Make & model", type: "text", required: true, placeholder: "e.g. Toyota Corolla" },
  { key: "year", label: "Year", type: "number" },
  { key: "color", label: "Color", type: "text" },
  { key: "plate", label: "Plate", type: "text" },
  { key: "plateState", label: "Plate state", type: "text", placeholder: "e.g. TX" },
  { key: "parkingSpace", label: "Parking space", type: "text" },
  { key: "permitNumber", label: "Permit #", type: "text" },
  { key: "endsOn", label: "Permit expires", type: "date" },
  { key: "amount", label: "Monthly parking fee", type: "currency" },
];

const petAdapter = recordItemsAdapter("pet");
const vehicleAdapter = recordItemsAdapter("vehicle");

export function PetsSection({ item, config }) {
  return (
    <ChildRecords
      item={item}
      config={config}
      adapter={petAdapter}
      fields={PET_FIELDS}
      singular="Pet"
      icon={PawPrint}
      defaults={() => ({ species: "Dog" })}
      emptyDescription="Record the pets allowed on this lease. Add pet rent as a recurring charge in Charges."
      summary={(r) => ({
        title: r.name,
        meta: [r.metadata?.species, r.metadata?.breed, r.metadata?.weightLbs ? `${r.metadata.weightLbs} lbs` : null, r.endsOn ? `Vaccines to ${formatDate(r.endsOn)}` : null]
          .filter(Boolean)
          .join(" · "),
        badge: r.metadata?.serviceAnimal ? "Assistance animal" : null,
        badgeVariant: "purple",
        aside: Number(r.amount) ? `${currency(r.amount)}/mo` : null,
      })}
    />
  );
}

export function VehiclesSection({ item, config }) {
  return (
    <ChildRecords
      item={item}
      config={config}
      adapter={vehicleAdapter}
      fields={VEHICLE_FIELDS}
      singular="Vehicle"
      icon={Car}
      emptyDescription="Record vehicles and parking assignments for this lease."
      summary={(r) => ({
        title: [r.metadata?.year, r.name].filter(Boolean).join(" "),
        meta: [
          r.metadata?.plate ? `${r.metadata.plate}${r.metadata.plateState ? ` (${r.metadata.plateState})` : ""}` : null,
          r.metadata?.parkingSpace ? `Space ${r.metadata.parkingSpace}` : null,
          r.metadata?.permitNumber ? `Permit ${r.metadata.permitNumber}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        aside: Number(r.amount) ? `${currency(r.amount)}/mo` : null,
      })}
    />
  );
}
