"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { House } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { sitePath } from "@/lib/leasing/public/urls";

// A listing or property this site doesn't show (LEAS-01): never published, paused, or not on the website channel.
export default function LeasingPageNotFound() {
  const { handle } = useParams();
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 px-4 py-24 text-center">
      <House className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-xl font-semibold text-foreground">This home isn&apos;t listed</h1>
      <p className="text-sm text-text-secondary">It may not be available yet, or the link is out of date.</p>
      {handle ? (
        <Button asChild variant="outline">
          <Link href={sitePath(handle)}>See all available homes</Link>
        </Button>
      ) : null}
    </div>
  );
}
