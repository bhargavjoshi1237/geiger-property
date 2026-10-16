import {
  Bell,
  Briefcase,
  ClipboardList,
  FileText,
  Home,
  MessagesSquare,
  Receipt,
  ShieldCheck,
  UserRound,
  Wallet,
  Wrench,
} from "lucide-react";

// Sidebar groups per portal role; `key` is the ?tab= value.
export const PORTAL_NAV = {
  resident: [
    { items: [{ key: "home", label: "Home", icon: Home }] },
    {
      label: "My home",
      items: [
        { key: "payments", label: "Payments", icon: Wallet },
        { key: "requests", label: "Maintenance", icon: Wrench },
        { key: "lease", label: "Lease & documents", icon: FileText },
        { key: "insurance", label: "Renters insurance", icon: ShieldCheck },
      ],
    },
    {
      label: "Community",
      items: [
        { key: "announcements", label: "Announcements", icon: Bell },
        { key: "messages", label: "Messages", icon: MessagesSquare },
      ],
    },
    { label: "Account", items: [{ key: "profile", label: "Profile", icon: UserRound }] },
  ],
  owner: [
    { items: [{ key: "home", label: "Portfolio", icon: Briefcase }] },
    {
      label: "Financials",
      items: [{ key: "statements", label: "Statements", icon: Receipt }],
    },
    {
      label: "Operations",
      items: [
        { key: "maintenance", label: "Maintenance & approvals", icon: Wrench },
        { key: "documents", label: "Documents", icon: FileText },
      ],
    },
    {
      label: "Updates",
      items: [
        { key: "announcements", label: "Announcements", icon: Bell },
        { key: "messages", label: "Messages", icon: MessagesSquare },
      ],
    },
    { label: "Account", items: [{ key: "profile", label: "Profile", icon: UserRound }] },
  ],
  vendor: [
    { items: [{ key: "home", label: "Work orders", icon: ClipboardList }] },
    {
      label: "Billing & compliance",
      items: [
        { key: "invoices", label: "Invoices", icon: Receipt },
        { key: "compliance", label: "Insurance & licenses", icon: ShieldCheck },
      ],
    },
    {
      label: "Updates",
      items: [
        { key: "announcements", label: "Announcements", icon: Bell },
        { key: "messages", label: "Messages", icon: MessagesSquare },
      ],
    },
    { label: "Account", items: [{ key: "profile", label: "Profile", icon: UserRound }] },
  ],
};

export const tabsFor = (role) => (PORTAL_NAV[role] || []).flatMap((g) => g.items.map((i) => i.key));
