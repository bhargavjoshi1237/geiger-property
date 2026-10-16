import { redirect } from "next/navigation";

import { getPortalSession } from "@/lib/portal/session";
import LoginScreen from "@/components/portal/login_screen";

export const metadata = { title: "Sign in · Portal" };

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-visual",
};

export default async function PortalLoginPage({ searchParams }) {
  const sp = await searchParams;
  const session = await getPortalSession();
  if (session.user && session.members.length) redirect("/portal");
  const email = typeof sp?.email === "string" ? sp.email : "";
  const error = typeof sp?.error === "string" ? sp.error : "";
  return <LoginScreen initialEmail={email} initialError={error} />;
}
