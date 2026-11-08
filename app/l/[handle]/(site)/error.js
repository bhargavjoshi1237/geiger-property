"use client";

import { RotateCw } from "lucide-react";

import { Button } from "@geiger/ui/button";

// A failed read on the public leasing site (LEAS-01): say so and offer a retry, never a false "not found".
export default function LeasingSiteError({ retry, unstable_retry: unstableRetry, reset }) {
  const tryAgain = retry || unstableRetry || reset;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 px-4 py-24 text-center">
      <h1 className="text-xl font-semibold text-foreground">We couldn&apos;t load these homes</h1>
      <p className="text-sm text-text-secondary">Something went wrong on our side. Please try again in a moment.</p>
      <Button variant="outline" onClick={() => tryAgain?.()}>
        <RotateCw /> Try again
      </Button>
    </div>
  );
}
