import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getPortalSession } from "@/lib/portal/session";
import PortalShell from "@/components/portal/portal_shell";
import PortalNoAccess from "@/components/portal/portal_no_access";

export const metadata = { title: "Portal" };

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Self-service portal for residents, owners and vendors (magic-link sign-in).
export default async function PortalPage({ searchParams }) {
  const sp = await searchParams;
  const session = await getPortalSession();
  if (!session.user) redirect("/portal/login");
  const user = { id: session.user.id, email: session.user.email || "" };
  if (!session.members.length) {
    return <PortalNoAccess user={user} hidden={session.hidden} notConfigured={Boolean(session.notConfigured)} />;
  }
  const store = await cookies();
  return (
    <PortalShell
      user={user}
      members={session.members}
      initialMemberId={(typeof sp?.member === "string" && sp.member) || store.get("gp_portal_member")?.value || ""}
      initialTab={typeof sp?.tab === "string" ? sp.tab : "home"}
    />
  );
}
