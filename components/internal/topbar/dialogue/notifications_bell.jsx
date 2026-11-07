"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { NotificationBell, defaultNavigate } from "@geiger/notify/react";
import { Button } from "@geiger/ui";
import { createClient } from "@/lib/supabase/client";
import { isSandbox } from "@/lib/sandbox/sandbox_mode";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

function announce(notification) {
  toast(notification.title, { description: notification.body || undefined });
}

function reportError(error, scope) {
  if (scope !== "realtime") toast.error(error.message);
}

// Suite notification bell (all Geiger apps): briefings, review assignments and other apps' notices.
export function NotificationsBell() {
  const router = useRouter();
  const [sandbox] = useState(isSandbox);
  const [supabase] = useState(() => (sandbox ? null : createClient()));

  // Links inside Property stay client-side; other suite apps load through the shared origin.
  const navigate = (url) => {
    if (BASE_PATH && (url === BASE_PATH || url.startsWith(`${BASE_PATH}/`) || url.startsWith(`${BASE_PATH}?`))) {
      router.push(url.slice(BASE_PATH.length) || "/");
    } else if (!BASE_PATH && url.startsWith("/project/")) {
      router.push(url);
    } else {
      defaultNavigate(url);
    }
  };

  // The landing playground has no signed-in inbox; show an inert bell.
  if (!supabase) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Notifications"
        className="relative hidden h-8 w-8 items-center justify-center rounded-full border border-transparent text-muted-foreground hover:bg-surface-hover hover:text-foreground sm:flex"
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={2} />
      </Button>
    );
  }

  return (
    <NotificationBell
      supabase={supabase}
      app="property"
      className="hidden sm:inline-flex"
      onReceive={announce}
      onError={reportError}
      onNavigate={navigate}
    />
  );
}

export default NotificationsBell;
