"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";

// Landing CTAs ("Continue to Property" / "Open Property") point here. The
// workspace is project-scoped (/project/<id>/<tab>), so this forwards to the
// resolver, which opens the last-used project (or prompts to create one).
export default function OrgRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/project");
  }, [router]);
  return <div className="flex h-[100dvh] w-full items-center justify-center bg-background" />;
}
