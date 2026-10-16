import { portalError, portalJson } from "@/lib/portal/http";
import { ownerPermissions, ownerStatements } from "@/lib/portal/owner";
import { withPortal } from "@/lib/portal/session";

// GET ?month=YYYY-MM — monthly owner statement, 12-month history and distributions.
export const GET = withPortal(
  async (ctx, request) => {
    if (!ownerPermissions(ctx).statements) return portalError(403, "Statements are turned off for your account.");
    const raw = new URL(request.url).searchParams.get("month") || "";
    const month = /^\d{4}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 7);
    return portalJson(await ownerStatements(ctx, month));
  },
  { role: "owner" },
);
