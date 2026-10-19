"use client";

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { SidebarInset, SidebarProvider } from "@geiger/ui/sidebar";
import { portalApi, setPortalMember } from "@/lib/portal/portal_fetch";
import PortalTopbar from "./portal_topbar";
import PortalSidebar from "./portal_sidebar";
import { tabsFor } from "./portal_nav";
import { ResidentHome } from "./resident/resident_home";
import { ResidentPayments } from "./resident/resident_payments";
import { ResidentRequests } from "./resident/resident_requests";
import { ResidentLease } from "./resident/resident_lease";
import { ResidentInsurance } from "./resident/resident_insurance";
import { OwnerHome } from "./owner/owner_home";
import { OwnerStatements } from "./owner/owner_statements";
import { OwnerMaintenance } from "./owner/owner_maintenance";
import { OwnerDocuments } from "./owner/owner_documents";
import { VendorJobs } from "./vendor/vendor_jobs";
import { VendorInvoices } from "./vendor/vendor_invoices";
import { VendorCompliance } from "./vendor/vendor_compliance";
import { PortalAnnouncements } from "./shared/portal_announcements";
import { PortalMessages } from "./shared/portal_messages";
import { PortalProfile } from "./shared/portal_profile";

const MEMBER_COOKIE = "gp_portal_member";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const SCREENS = {
  resident: {
    home: ResidentHome,
    payments: ResidentPayments,
    requests: ResidentRequests,
    lease: ResidentLease,
    insurance: ResidentInsurance,
  },
  owner: {
    home: OwnerHome,
    statements: OwnerStatements,
    maintenance: OwnerMaintenance,
    documents: OwnerDocuments,
  },
  vendor: {
    home: VendorJobs,
    invoices: VendorInvoices,
    compliance: VendorCompliance,
  },
};

const SHARED = { announcements: PortalAnnouncements, messages: PortalMessages, profile: PortalProfile };


// The portal frame: topbar + role-aware sidebar + the active tab (kept in ?tab=).
export function PortalShell({ user, members, initialMemberId, initialTab }) {
  const [memberId, setMemberId] = useState(() => {
    const id = members.some((m) => m.id === initialMemberId) ? initialMemberId : members[0]?.id;
    setPortalMember(id);
    return id;
  });
  const member = members.find((m) => m.id === memberId) || members[0];
  const [tab, setTabState] = useState(() => (tabsFor(member.role).includes(initialTab) ? initialTab : "home"));

  const setTab = useCallback((next) => {
    setTabState(next);
    const url = new URL(window.location.href);
    if (next === "home") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState({}, "", url);
  }, []);

  // Hosted-checkout return: toast once and clean the URL.
  useEffect(() => {
    const url = new URL(window.location.href);
    const payment = url.searchParams.get("payment");
    const autopay = url.searchParams.get("autopay");
    if (!payment && !autopay) return;
    if (payment === "success") toast.success("Payment submitted — it will show on your ledger once it clears.");
    else if (payment === "canceled") toast.info("Payment canceled.");
    else if (autopay === "canceled") toast.info("Autopay setup canceled.");
    else if (autopay) toast.success("Autopay is being set up — it shows as active once your bank or card is confirmed.");
    url.searchParams.delete("payment");
    url.searchParams.delete("autopay");
    url.searchParams.delete("session_id");
    window.history.replaceState({}, "", url);
  }, []);

  const switchMember = (id) => {
    if (id === member.id) return;
    document.cookie = `${MEMBER_COOKIE}=${id}; path=${basePath || "/"}; max-age=31536000; samesite=lax`;
    setPortalMember(id);
    setMemberId(id);
    setTab("home");
  };

  const signOut = async () => {
    await portalApi("/api/portal/auth/logout", { method: "POST" });
    toast.success("Signed out.");
    window.location.href = `${basePath}/portal/login`;
  };

  const Screen = SCREENS[member.role]?.[tab] || SHARED[tab] || SCREENS[member.role]?.home;

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background font-sans text-foreground selection:bg-surface-strong">
      <SidebarProvider className="!flex h-full min-w-0 flex-col" style={{ flexDirection: "column" }}>
        <PortalTopbar user={user} member={member} members={members} onSwitch={switchMember} onNavigate={setTab} onSignOut={signOut} />
        <div className="relative flex flex-1 overflow-hidden">
          <PortalSidebar member={member} tab={tab} onTab={setTab} />
          <SidebarInset className="relative flex h-full flex-1 flex-col overflow-hidden border-none bg-transparent">
            <div className="pointer-events-none absolute right-0 top-0 h-[300px] w-[500px] rounded-full bg-white/[0.02] blur-[120px]" />
            <main className="relative z-10 w-full min-w-0 flex-1 overflow-y-auto p-4 md:p-8">
              <Screen key={`${member.id}:${tab}`} member={member} user={user} onNavigate={setTab} />
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}

export default PortalShell;
