import { NextResponse } from "next/server";

import { completeEmailLink } from "@/lib/portal/auth";

// GET — magic-link landing: exchange the code / token for a session, then open the portal.
export async function GET(request) {
  const ok = await completeEmailLink(request.nextUrl.searchParams);
  const url = request.nextUrl.clone();
  url.pathname = ok ? "/portal" : "/portal/login";
  url.search = ok ? "" : "?error=link";
  return NextResponse.redirect(url);
}
