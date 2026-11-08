"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";

import { getLockedThrough } from "@/lib/supabase/accounting_periods";
import { closedThroughLabel, firstOpenDate, shortDate } from "@/lib/ledger/periods";

// Period close in the posting dialogs (CORE-40): the lock date, the default posting date and the "Books closed through …" note.

// The active project's lock date while `open` ("" when nothing is closed, null until loaded).
export function useLockedThrough(open = true, reloadKey = 0) {
  const [lockedThrough, setLockedThrough] = useState(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    getLockedThrough({ fresh: reloadKey > 0 }).then((d) => alive && setLockedThrough(d ?? ""));
    return () => {
      alive = false;
    };
  }, [open, reloadKey]);
  return lockedThrough;
}

// A dialog's date until the user picks one: today, or the first open day when today sits in a closed period.
export function defaultPostingDate(lockedThrough, today) {
  const open = firstOpenDate(lockedThrough);
  return open && today < open ? open : today;
}

// "Books closed through Mar 31, 2026" under a date field (nothing when no period is closed).
export function BooksClosedNote({ lockedThrough, className = "" }) {
  if (!lockedThrough) return null;
  return (
    <p className={`flex items-center gap-1.5 text-xs text-text-secondary ${className}`}>
      <Lock className="h-3.5 w-3.5 shrink-0" />
      {closedThroughLabel(lockedThrough)} — use {shortDate(firstOpenDate(lockedThrough))} or later.
    </p>
  );
}
