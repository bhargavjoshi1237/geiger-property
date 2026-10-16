import { signOutPortal } from "@/lib/portal/auth";
import { portalJson } from "@/lib/portal/http";

// POST — end the portal session on this device.
export async function POST() {
  await signOutPortal();
  return portalJson({ signedOut: true });
}
