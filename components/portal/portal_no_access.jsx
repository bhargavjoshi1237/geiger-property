"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Loader2, LogOut, ShieldOff } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import { portalApi } from "@/lib/portal/portal_fetch";

// Signed in, but no portal to open: not configured, switched off, or no invite.
export function PortalNoAccess({ user, hidden = [], notConfigured = false }) {
  const [busy, setBusy] = useState(false);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  const signOut = async () => {
    setBusy(true);
    await portalApi("/api/portal/auth/logout", { method: "POST" });
    window.location.href = `${basePath}/portal/login`;
  };

  const description = notConfigured
    ? "The portal isn't configured on this server yet (missing SUPABASE_SERVICE_ROLE_KEY). Please contact your property manager."
    : hidden.length
      ? `Your property manager hasn't switched the ${hidden.map((h) => h.title.toLowerCase()).join(" / ")} on yet. You'll be able to sign in once it's live.`
      : `There's no portal access for ${user.email}. Ask your property manager to send an invite to this email.`;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4">
      <Image src={`${basePath}/logo1.svg`} alt="Geiger Property" width={28} height={28} className="geiger-logo mb-6" />
      <div className="w-full max-w-md rounded-xl border border-border bg-surface-subtle">
        <EmptyState
          icon={ShieldOff}
          title="No portal access yet"
          description={description}
          action={
            <Button variant="outline" onClick={signOut} disabled={busy} className="border-border bg-surface-card hover:bg-surface-hover">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Sign Out
            </Button>
          }
        />
      </div>
    </div>
  );
}

export default PortalNoAccess;
