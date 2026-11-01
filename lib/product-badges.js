"use client";

import { useEffect, useState } from "react";

// Live badges as { href: label }, or null if the read fails so SuiteHeader keeps its built-in ones.
// Plain REST on purpose: the table is public, and this must bypass the landing playground's fake client and each app's default schema.
export async function fetchProductBadges() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  try {
    const response = await fetch(`${url}/rest/v1/suite_product_badges?select=href,badge&deleted_at=is.null&badge=not.is.null`, {
      headers: { apikey: key, "Accept-Profile": "public" },
    });
    if (!response.ok) return null;
    const rows = await response.json();
    return Object.fromEntries(rows.map((row) => [row.href, row.badge]));
  } catch {
    return null;
  }
}

// The badges to hand SuiteHeader; null until the read lands.
export function useProductBadges() {
  const [badges, setBadges] = useState(null);

  useEffect(() => {
    let active = true;
    fetchProductBadges().then((next) => {
      if (active) setBadges(next);
    });
    return () => {
      active = false;
    };
  }, []);

  return badges;
}
