"use client";

import { useEffect, useState } from "react";

import { countOpenReviewItems } from "@/lib/supabase/review_items";
import { getActiveProjectId } from "@/lib/supabase/scope";
import { REVIEW_CHANGED_EVENT } from "@/components/internal/screens/orchestration/constants";

// Live counts shown next to sidebar entries: open review items on "Review Queue". Refreshes after review actions,
// when the window regains focus, and every two minutes.
export function useNavBadges() {
  const [reviewCount, setReviewCount] = useState(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (!getActiveProjectId()) return;
      countOpenReviewItems().then((n) => alive && setReviewCount(n));
    };
    refresh();
    const timer = setInterval(refresh, 120000);
    window.addEventListener(REVIEW_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener(REVIEW_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return { "Review Queue": reviewCount ? (reviewCount > 99 ? "99+" : String(reviewCount)) : null };
}
