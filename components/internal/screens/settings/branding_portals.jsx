"use client";

import { toast } from "sonner";
import { Check, Copy, HardHat, Home, ImageIcon, Briefcase } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@geiger/ui/button";
import { portalAddress } from "@/lib/portal/staff_api";
import { SectionCard, SettingRow, SettingsList } from "@/components/internal/shared/screen_kit";
import { SettingsPage, TextField, useSetting } from "./settings_kit";
import { ACCENT_PALETTE, BRANDING_DEFAULTS } from "./shared";

// Branding & Portals — display name, logo, accent, and which self-service
// portals are switched on (settings key `branding_portals`).

const PORTALS = [
  { key: "residentPortal", icon: Home, title: "Resident portal", description: "Tenants view balances, pay rent, and submit requests." },
  { key: "ownerPortal", icon: Briefcase, title: "Owner portal", description: "Owners see statements, reports, and documents." },
  { key: "vendorPortal", icon: HardHat, title: "Vendor portal", description: "Vendors view and update assigned work orders." },
];

export function BrandingPortalsScreen() {
  const setting = useSetting("branding_portals", BRANDING_DEFAULTS, {
    label: "Branding & portals",
  });
  const { value, set } = setting;
  const accent = ACCENT_PALETTE.find((a) => a.value === value.accent) || ACCENT_PALETTE[0];

  return (
    <SettingsPage
      title="Branding & Portals"
      description="How your company looks to residents, owners, and vendors — and which portals they can use."
      setting={setting}
    >
      <SectionCard title="Brand" description="Shown on portals, statements, and outgoing messages.">
        <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
          <div className="grid gap-4">
            <TextField
              id="bp-name"
              label="Display name"
              value={value.displayName}
              onChange={set("displayName")}
              placeholder="e.g. Maple Rentals"
            />
            <TextField
              id="bp-logo"
              label="Logo URL"
              hint="A square PNG or SVG works best."
              value={value.logoUrl}
              onChange={set("logoUrl")}
              placeholder="https://…"
            />
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Preview</span>
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-card">
              {value.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={value.logoUrl} alt="Logo preview" className="h-full w-full object-contain" />
              ) : (
                <ImageIcon className="h-6 w-6 text-text-tertiary" />
              )}
            </div>
            <span className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className={cn("h-2 w-2 rounded-full", accent.swatch)} />
              {value.displayName || "Your company"}
            </span>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Accent color" description="Pick from the suite palette so portals stay legible in light and dark.">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent color">
          {ACCENT_PALETTE.map((a) => {
            const active = a.value === value.accent;
            return (
              <button
                key={a.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => set("accent")(a.value)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                  active
                    ? "border-border-strong bg-surface-active text-foreground"
                    : "border-border bg-surface-card text-text-secondary hover:bg-surface-hover hover:text-foreground",
                )}
              >
                <span className={cn("flex h-4 w-4 items-center justify-center rounded-full", a.swatch)}>
                  {active ? <Check className="h-3 w-3 text-white" /> : null}
                </span>
                {a.label}
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="Portals"
        description="Switch a portal on to let invited residents, owners and vendors sign in. Invite people from their record's Portal tab."
      >
        <SettingsList>
          {PORTALS.map((p) => (
            <SettingRow
              key={p.key}
              icon={p.icon}
              title={p.title}
              description={p.description}
              checked={Boolean(value[p.key])}
              onCheckedChange={set(p.key)}
            />
          ))}
        </SettingsList>
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-border bg-surface-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0 truncate text-sm text-text-secondary">
            Portal sign-in: <span className="text-foreground">{portalAddress()}</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            className="border-border bg-surface-card hover:bg-surface-hover"
            onClick={() => navigator.clipboard?.writeText(portalAddress())?.then(() => toast.success("Portal link copied."))}
          >
            <Copy className="h-3.5 w-3.5" /> Copy Link
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Portal welcome & support" description="Shown to people signed in to your portals.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="bp-welcome"
            label="Welcome message"
            className="sm:col-span-2"
            value={value.portalWelcome}
            onChange={set("portalWelcome")}
            placeholder="e.g. Welcome home! Pay rent and request repairs any time."
          />
          <TextField id="bp-support-email" label="Support email" type="email" value={value.supportEmail} onChange={set("supportEmail")} placeholder="office@example.com" />
          <TextField id="bp-support-phone" label="Support phone" type="tel" value={value.supportPhone} onChange={set("supportPhone")} placeholder="(555) 123-4567" />
        </div>
      </SectionCard>
    </SettingsPage>
  );
}

export default BrandingPortalsScreen;
