"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Code, Copy, ExternalLink, Globe, Loader2 } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Field, ListLoading, SectionCard, SettingRow, SettingsList } from "@/components/internal/shared/screen_kit";
import { usePermission } from "@/context/rbac-context";
import { useProject } from "@/context/project-context";
import { getLeasingSite, saveLeasingSite } from "@/lib/supabase/leasing_sites";
import { handleFrom, isValidHandle } from "@/lib/leasing/slug";
import { publicUrl, refreshPublicSite } from "@/lib/leasing/public/api";
import { embedPath, sitePath } from "@/lib/leasing/public/urls";
import { TextField } from "./settings_kit";

// Leasing website (LEAS-01): the project's public vacancy site at /l/<handle> — address, on/off, name and contact.
// Saves property.leasing_sites on its own; the brand (logo) comes from the Branding card above.

const EMPTY_CONTACT = { phone: "", email: "", officeHours: "" };

async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("Couldn't copy.");
  }
}

export function LeasingSiteCard({ brandName = "" }) {
  const { project } = useProject();
  const canEdit = usePermission("property.settings.manage");
  const [loaded, setLoaded] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    getLeasingSite().then((site) => {
      if (!alive) return;
      setLoaded(site);
      if (!site?.error) setDraft(site || { id: null, handle: "", enabled: false, displayName: "", contact: EMPTY_CONTACT });
    });
    return () => {
      alive = false;
    };
  }, []);

  if (loaded === null && draft === null) {
    return (
      <SectionCard title="Leasing website">
        <ListLoading label="Loading the leasing website" className="py-8" />
      </SectionCard>
    );
  }
  if (loaded?.error) {
    return (
      <SectionCard title="Leasing website">
        <p className="text-sm text-text-secondary">The leasing website couldn&apos;t be loaded. Refresh to try again.</p>
      </SectionCard>
    );
  }

  const suggested = handleFrom(brandName || project?.name || "");
  const handle = draft.handle || "";
  const handleOk = isValidHandle(handle);
  const saved = loaded || null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved || { id: null, handle: "", enabled: false, displayName: "", contact: EMPTY_CONTACT });
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const setContact = (key) => (value) => setDraft((d) => ({ ...d, contact: { ...d.contact, [key]: value } }));
  const liveUrl = saved?.enabled && saved.handle ? publicUrl(sitePath(saved.handle)) : "";
  const embedCode = saved?.handle ? `<iframe src="${publicUrl(embedPath(saved.handle))}" title="Available homes" style="width:100%;min-height:640px;border:0" loading="lazy"></iframe>` : "";

  const save = async () => {
    const next = { ...draft, handle: handle || suggested };
    if (!isValidHandle(next.handle)) {
      toast.error("Use 3–40 lowercase letters, numbers or dashes for the address.");
      return;
    }
    setSaving(true);
    const res = await saveLeasingSite(next);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.code === "23505" ? "That address is taken. Try another." : "Couldn't save the leasing website.");
      return;
    }
    const moved = saved?.handle && saved.handle !== res.site.handle ? [saved.handle] : [];
    setLoaded(res.site);
    setDraft(res.site);
    refreshPublicSite(moved);
    toast.success(res.site.enabled ? "Leasing website saved. It's live." : "Leasing website saved.");
  };

  return (
    <SectionCard
      title="Leasing website"
      description="A public page of your available homes that anyone can open without signing in. Listings appear when they're Active with the Company website channel on."
      action={
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" size="sm" disabled={!canEdit || saving || !dirty} onClick={save}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save Website
        </Button>
      }
    >
      <div className="space-y-5">
        <SettingsList>
          <SettingRow
            icon={Globe}
            title="Publish the leasing website"
            description="Off keeps every page private; the address answers “not found” until you switch it on."
            checked={Boolean(draft.enabled)}
            onCheckedChange={canEdit ? set("enabled") : undefined}
          />
        </SettingsList>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Address" htmlFor="ls-handle" hint={handle && !handleOk ? "3–40 lowercase letters, numbers or dashes." : `${publicUrl("/l/")}${handle || suggested || "your-company"}`}>
            <Input
              id="ls-handle"
              value={handle}
              placeholder={suggested || "your-company"}
              disabled={!canEdit}
              aria-invalid={handle && !handleOk ? true : undefined}
              onChange={(e) => set("handle")(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40))}
            />
          </Field>
          <TextField id="ls-name" label="Display name" value={draft.displayName} onChange={set("displayName")} placeholder={brandName || "Your company"} />
          <TextField id="ls-phone" label="Leasing phone" type="tel" value={draft.contact.phone} onChange={setContact("phone")} placeholder="(555) 123-4567" />
          <TextField id="ls-email" label="Leasing email" type="email" value={draft.contact.email} onChange={setContact("email")} placeholder="leasing@example.com" />
          <TextField
            id="ls-hours"
            label="Office hours"
            className="sm:col-span-2"
            value={draft.contact.officeHours}
            onChange={setContact("officeHours")}
            placeholder="Mon–Fri 9–6, Sat 10–4"
          />
        </div>
        {saved?.handle ? (
          <div className="space-y-2">
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0 truncate text-sm text-text-secondary">
                {liveUrl ? (
                  <>
                    Live at <span className="text-foreground">{liveUrl}</span>
                  </>
                ) : (
                  "Switch the website on and save to preview it."
                )}
              </span>
              {liveUrl ? (
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => copyText(liveUrl, "Link copied.")}>
                    <Copy className="h-3.5 w-3.5" /> Copy Link
                  </Button>
                  <Button asChild variant="outline" size="sm" className="border-border bg-surface-card hover:bg-surface-hover">
                    <a href={liveUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" /> Preview
                    </a>
                  </Button>
                </div>
              ) : null}
            </div>
            {liveUrl ? (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 text-sm text-text-secondary">Show your vacancies on your own website with this embed code.</span>
                <Button variant="outline" size="sm" className="shrink-0 border-border bg-surface-card hover:bg-surface-hover" onClick={() => copyText(embedCode, "Embed code copied.")}>
                  <Code className="h-3.5 w-3.5" /> Copy Embed Code
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

export default LeasingSiteCard;
