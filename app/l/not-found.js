import { House } from "lucide-react";

// No enabled leasing site at this address (LEAS-01).
export default function LeasingSiteNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
      <House className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-xl font-semibold text-foreground">No homes are listed at this address</h1>
      <p className="text-sm text-text-secondary">The link may be out of date, or this company&apos;s leasing site is switched off.</p>
    </main>
  );
}
