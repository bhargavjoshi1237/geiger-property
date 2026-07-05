import {
  LayoutDashboard,
  Building2,
  Building,
  Home,
  DoorOpen,
  Boxes,
  Layers,
  Warehouse,
  Image as ImageIcon,
  BedDouble,
  Ruler,
  KeyRound,
  FileText,
  FileSignature,
  FilePen,
  FileCheck2,
  ClipboardList,
  ClipboardCheck,
  ClipboardPen,
  Megaphone,
  Globe,
  Share2,
  Rss,
  UserSearch,
  IdCard,
  ShieldCheck,
  Shield,
  ShieldAlert,
  CalendarClock,
  CalendarCheck,
  Calendar,
  Repeat,
  RefreshCw,
  LogIn,
  LogOut,
  Users,
  UsersRound,
  UserPlus,
  UserCog,
  UserCheck,
  UserRound,
  Contact,
  BookUser,
  MessageSquare,
  MessagesSquare,
  Mail,
  MailOpen,
  Send,
  Bell,
  BellRing,
  PhoneCall,
  Phone,
  Inbox,
  Wrench,
  Hammer,
  HardHat,
  Truck,
  PackageOpen,
  Gauge,
  ScanLine,
  Camera,
  Wallet,
  CreditCard,
  Banknote,
  Landmark,
  Receipt,
  ReceiptText,
  Coins,
  CircleDollarSign,
  DollarSign,
  PiggyBank,
  Calculator,
  BookOpen,
  BookOpenCheck,
  Scale,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  PieChart,
  BarChart3,
  LineChart,
  FileBarChart,
  FileSpreadsheet,
  Percent,
  Handshake,
  Briefcase,
  Vote,
  Gavel,
  Trees,
  Sparkles,
  Bot,
  Workflow,
  ListChecks,
  CheckSquare,
  Clock,
  Plug,
  Webhook,
  Code,
  Link2,
  Database,
  Settings,
  SlidersHorizontal,
  Palette,
  Brush,
  Lock,
  Fingerprint,
  ScrollText,
  Languages,
  Tags,
  FolderTree,
  FolderOpen,
  Files,
  UploadCloud,
  Smartphone,
  Star,
  ThumbsUp,
  LifeBuoy,
} from "lucide-react";

// Sidebar navigation for Geiger Property.
//
// Organized by build priority (P0 → P4), derived from
// docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md. Each top-level area is a priority
// group; every item and sub-item carries its priority in the title so the
// roadmap is visible in the UI.
//
// Priority legend:
//   P0 — Universal / table-stakes. Ship at MVP.
//   P1 — Common / expected. Within 90 days.
//   P2 — Uncommon differentiator. Bundled free (where incumbents upsell).
//   P3 — AI moat. Our distinctive value.
//   P4 — Deferred / out of scope (enterprise moats).
//
// Only titles wired into `screens/registry.jsx` render a real screen; the rest
// fall back to ComingSoonScreen while areas are built out one at a time.
export const workspaceNav = [
  // ──────────────────────────────────────────────────────────── P0 (MVP) ──
  {
    title: "Overview (P0)",
    icon: LayoutDashboard,
  },

  {
    title: "Properties (P0)",
    icon: Building2,
    subItems: [
      { title: "All Properties (P0)", icon: Building },
      { title: "Units (P0)", icon: DoorOpen },
      { title: "Portfolios (P0)", icon: Boxes },
      { title: "Buildings & Blocks (P0)", icon: Warehouse },
      { title: "Floor Plans (P0)", icon: Ruler },
      { title: "Unit Types (P0)", icon: BedDouble },
      { title: "Property Photos & Media (P0)", icon: ImageIcon },
      { title: "Amenities (P0)", icon: Sparkles },
    ],
  },

  {
    title: "Listings & Marketing (P0)",
    icon: Megaphone,
    subItems: [
      { title: "Vacancy Listings (P0)", icon: Home },
      { title: "Listing Syndication (P0)", icon: Share2 },
      { title: "ILS Distribution (P0)", icon: Rss },
      { title: "Showings & Tours (P0)", icon: CalendarClock },
    ],
  },

  {
    title: "Applications & Screening (P0)",
    icon: UserSearch,
    subItems: [
      { title: "Online Applications (P0)", icon: FilePen },
      { title: "Application Forms (P0)", icon: FileText },
      { title: "Tenant Screening (P0)", icon: ShieldCheck },
      { title: "Credit Checks (P0)", icon: CreditCard },
      { title: "Background Checks (P0)", icon: Shield },
      { title: "Eviction History (P0)", icon: ShieldAlert },
      { title: "Income Verification (P0)", icon: Banknote },
      { title: "Application Fees (P0)", icon: CircleDollarSign },
      { title: "Decisioning (P0)", icon: FileCheck2 },
      { title: "Applicant Communication (P0)", icon: MessageSquare },
    ],
  },

  {
    title: "Leasing (P0)",
    icon: FileText,
    subItems: [
      { title: "Leases (P0)", icon: FileSignature },
      { title: "Lease Builder (P0)", icon: FilePen },
      { title: "Lease Templates (P0)", icon: Files },
      { title: "State-specific Leases (P0)", icon: Scale },
      { title: "E-signature (P0)", icon: FileSignature },
      { title: "Addenda & Documents (P0)", icon: FileText },
      { title: "Security Deposits (P0)", icon: PiggyBank },
      { title: "Move-in (P0)", icon: LogIn },
      { title: "Move-out (P0)", icon: LogOut },
      { title: "Move-in Inspection (P0)", icon: ClipboardCheck },
    ],
  },

  {
    title: "Tenants (P0)",
    icon: Users,
    subItems: [
      { title: "Tenant Directory (P0)", icon: Users },
      { title: "Tenant Profiles (P0)", icon: UserRound },
      { title: "Household & Occupants (P0)", icon: UsersRound },
      { title: "Resident Portal (P0)", icon: Smartphone },
      { title: "Documents (P0)", icon: Files },
      { title: "Communication Log (P0)", icon: MessagesSquare },
    ],
  },

  {
    title: "Maintenance (P0)",
    icon: Wrench,
    subItems: [
      { title: "Work Orders (P0)", icon: ClipboardPen },
      { title: "Maintenance Requests (P0)", icon: Hammer },
      { title: "Vendors (P0)", icon: Truck },
      { title: "Vendor Assignments (P0)", icon: HardHat },
      { title: "Photos & Attachments (P0)", icon: Camera },
      { title: "Mobile Maintenance (P0)", icon: Smartphone },
    ],
  },

  {
    title: "Accounting (P0)",
    icon: Wallet,
    subItems: [
      { title: "Rent Collection (P0)", icon: CircleDollarSign },
      { title: "Online Payments (P0)", icon: CreditCard },
      { title: "Autopay (P0)", icon: Repeat },
      { title: "Recurring Charges (P0)", icon: CalendarClock },
      { title: "Late Fees (P0)", icon: Percent },
      { title: "Payment Plans (P0)", icon: Coins },
    ],
  },

  {
    title: "Banking — Payment Methods (P0)",
    icon: Wallet,
    subItems: [
      { title: "Payment Methods (P0)", icon: Wallet },
      { title: "Transaction History (P0)", icon: ScrollText },
    ],
  },

  {
    title: "Communications (P0)",
    icon: MessagesSquare,
    subItems: [
      { title: "Inbox (P0)", icon: Inbox },
      { title: "Email (P0)", icon: Mail },
      { title: "Notifications (P0)", icon: Bell },
      { title: "Message Templates (P0)", icon: MailOpen },
    ],
  },

  {
    title: "Documents & eSign (P0)",
    icon: Files,
    subItems: [
      { title: "Document Library (P0)", icon: FolderOpen },
      { title: "Templates (P0)", icon: FileText },
      { title: "E-signature (P0)", icon: FileSignature },
      { title: "Shared Files (P0)", icon: UploadCloud },
      { title: "Compliance Documents (P0)", icon: FileCheck2 },
      { title: "Document Requests (P0)", icon: ClipboardList },
    ],
  },

  {
    title: "Tasks & Operations (P0)",
    icon: ListChecks,
    subItems: [
      { title: "Tasks (P0)", icon: CheckSquare },
      { title: "Reminders (P0)", icon: Clock },
      { title: "Calendar (P0)", icon: Calendar },
      { title: "Team Assignments (P0)", icon: UserCheck },
    ],
  },

  {
    title: "Reports (P0)",
    icon: BarChart3,
    subItems: [
      { title: "Rent Roll (P0)", icon: FileSpreadsheet },
      { title: "Delinquency (P0)", icon: TrendingDown },
      { title: "Occupancy (P0)", icon: PieChart },
      { title: "Owner Statements (P0)", icon: FileText },
    ],
  },

  {
    title: "Portals (P0)",
    icon: Smartphone,
    subItems: [
      { title: "Resident Portal (P0)", icon: UserRound },
      { title: "Applicant Portal (P0)", icon: UserSearch },
      { title: "Mobile App (P0)", icon: Smartphone },
    ],
  },

  {
    title: "Integrations (P0)",
    icon: Plug,
    subItems: [
      { title: "Payment Gateways (P0)", icon: CreditCard },
      { title: "Screening Providers (P0)", icon: ShieldCheck },
      { title: "Listing Partners (P0)", icon: Share2 },
      { title: "Data Import (P0)", icon: Database },
    ],
  },

  {
    title: "Settings (P0)",
    icon: Settings,
    subItems: [
      { title: "Company Profile (P0)", icon: Building2 },
      { title: "Team & Members (P0)", icon: Users },
      { title: "Roles & Permissions (P0)", icon: ShieldCheck },
      { title: "Audit Logs (P0)", icon: ScrollText },
      { title: "Security (P0)", icon: Lock },
      { title: "Notifications (P0)", icon: Bell },
      { title: "Billing & Plans (P0)", icon: CreditCard },
    ],
  },

  {
    title: "Owners (P0)",
    icon: Briefcase,
    subItems: [
      { title: "Owner Directory (P0)", icon: BookUser },
      { title: "Owner Statements (P0)", icon: FileSpreadsheet },
    ],
  },

  // ──────────────────────────────────────────────────────── P1 (90 days) ──
  {
    title: "Properties — Extensions (P1)",
    icon: Building2,
    subItems: [
      { title: "Custom Fields (P1)", icon: Tags },
      { title: "Property Groups (P1)", icon: Layers },
      { title: "Ownership & Splits (P1)", icon: Handshake },
      { title: "Unit Turns & Make-ready (P1)", icon: RefreshCw },
      { title: "Keys & Access (P1)", icon: KeyRound },
    ],
  },

  {
    title: "Listings — Extensions (P1)",
    icon: Megaphone,
    subItems: [
      { title: "Marketing Website (P1)", icon: Globe },
      { title: "Virtual Tours (P1)", icon: Camera },
      { title: "Rent Comparables (P1)", icon: BarChart3 },
      { title: "Waitlist (P1)", icon: Clock },
      { title: "Promotions & Specials (P1)", icon: Percent },
      { title: "QR & Yard Signs (P1)", icon: ScanLine },
    ],
  },

  {
    title: "Leads & CRM (P1)",
    icon: Contact,
    subItems: [
      { title: "Prospects (P1)", icon: UserPlus },
      { title: "Pipeline (P1)", icon: ListChecks },
      { title: "Guest Cards (P1)", icon: IdCard },
      { title: "Follow-ups (P1)", icon: BellRing },
      { title: "Lead Sources (P1)", icon: Rss },
      { title: "Lead-to-lease (P1)", icon: TrendingUp },
    ],
  },

  {
    title: "Leasing — Extensions (P1)",
    icon: FileText,
    subItems: [
      { title: "Renewals (P1)", icon: Repeat },
      { title: "Rent Increases (P1)", icon: TrendingUp },
      { title: "Lease Expirations (P1)", icon: CalendarClock },
      { title: "Notices & Violations (P1)", icon: ShieldAlert },
    ],
  },

  {
    title: "Tenants — Extensions (P1)",
    icon: Users,
    subItems: [
      { title: "Announcements (P1)", icon: Megaphone },
      { title: "Notices (P1)", icon: Bell },
      { title: "Renters Insurance (P1)", icon: Shield },
      { title: "Reviews & Feedback (P1)", icon: ThumbsUp },
      { title: "Move-out Pipeline (P1)", icon: LogOut },
    ],
  },

  {
    title: "Owners — Extensions (P1)",
    icon: Briefcase,
    subItems: [
      { title: "Owner Portal (P1)", icon: UserCog },
      { title: "Owner Distributions (P1)", icon: ArrowLeftRight },
      { title: "Ownership Splits (P1)", icon: PieChart },
      { title: "Management Fees (P1)", icon: Percent },
      { title: "1099 & Tax (P1)", icon: ReceiptText },
      { title: "Owner Communication (P1)", icon: Mail },
      { title: "Owner Documents (P1)", icon: Files },
      { title: "Owner Contributions (P1)", icon: PiggyBank },
    ],
  },

  {
    title: "Maintenance — Extensions (P1)",
    icon: Wrench,
    subItems: [
      { title: "Preventive Maintenance (P1)", icon: CalendarCheck },
      { title: "Recurring Work Orders (P1)", icon: Repeat },
      { title: "Inspections (P1)", icon: ClipboardCheck },
      { title: "Make-ready Boards (P1)", icon: RefreshCw },
      { title: "Vendor Portal (P1)", icon: Handshake },
      { title: "Estimates & Bids (P1)", icon: Calculator },
      { title: "Inventory & Parts (P1)", icon: PackageOpen },
      { title: "Meter Readings (P1)", icon: Gauge },
    ],
  },

  {
    title: "Accounting — Full Books (P1)",
    icon: Wallet,
    subItems: [
      { title: "General Ledger (P1)", icon: BookOpen },
      { title: "Chart of Accounts (P1)", icon: FolderTree },
      { title: "Bills & Payables (P1)", icon: Receipt },
      { title: "Invoices & Receivables (P1)", icon: ReceiptText },
      { title: "Bank Reconciliation (P1)", icon: BookOpenCheck },
      { title: "Journal Entries (P1)", icon: FileText },
      { title: "Deposits (P1)", icon: PiggyBank },
      { title: "Budgeting (P1)", icon: Calculator },
      { title: "Trust Accounting (P1)", icon: Scale },
      { title: "Schedule E / Tax Pack (P1)", icon: ReceiptText },
      { title: "QuickBooks Sync (P1)", icon: BookOpenCheck },
      { title: "1099 Generation (P1)", icon: FileCheck2 },
      { title: "Utility Billing (PUBS) (P1)", icon: Gauge },
      { title: "Payouts & Distributions (P1)", icon: ArrowLeftRight },
    ],
  },

  {
    title: "Banking — Operations (P1)",
    icon: Landmark,
    subItems: [
      { title: "Merchant Accounts (P1)", icon: Landmark },
      { title: "Refunds (P1)", icon: ArrowLeftRight },
    ],
  },

  {
    title: "Communications — Extensions (P1)",
    icon: MessagesSquare,
    subItems: [
      { title: "Text / SMS (P1)", icon: MessageSquare },
      { title: "Bulk Messaging (P1)", icon: Send },
      { title: "Announcements (P1)", icon: Megaphone },
      { title: "Call Logging (P1)", icon: PhoneCall },
      { title: "VoIP & Voicemail (P1)", icon: Phone },
    ],
  },

  {
    title: "Tasks — Extensions (P1)",
    icon: ListChecks,
    subItems: [
      { title: "Recurring Tasks (P1)", icon: Repeat },
    ],
  },

  {
    title: "Associations & HOA (P1)",
    icon: Building,
    subItems: [
      { title: "Associations (P1)", icon: Building2 },
      { title: "Board Members (P1)", icon: UsersRound },
      { title: "Dues & Assessments (P1)", icon: CircleDollarSign },
      { title: "Violations (P1)", icon: ShieldAlert },
      { title: "Common Areas (P1)", icon: Trees },
      { title: "Amenity Booking (P1)", icon: CalendarCheck },
    ],
  },

  {
    title: "Reports — Full Suite (P1)",
    icon: BarChart3,
    subItems: [
      { title: "Financial Reports (P1)", icon: FileBarChart },
      { title: "Income Statement (P1)", icon: LineChart },
      { title: "Balance Sheet (P1)", icon: Scale },
      { title: "Cash Flow (P1)", icon: TrendingUp },
      { title: "General Ledger (P1)", icon: BookOpen },
      { title: "Schedule E / Tax Pack (P1)", icon: ReceiptText },
      { title: "Maintenance Reports (P1)", icon: Wrench },
      { title: "Leasing Reports (P1)", icon: FileSignature },
      { title: "Custom Report Builder (P1)", icon: SlidersHorizontal },
      { title: "Scheduled Reports (P1)", icon: CalendarClock },
      { title: "Export Center (P1)", icon: FileSpreadsheet },
    ],
  },

  {
    title: "Insights (P1)",
    icon: TrendingUp,
    subItems: [
      { title: "Portfolio KPIs (P1)", icon: Gauge },
      { title: "Occupancy Trends (P1)", icon: LineChart },
      { title: "Revenue & NOI (P1)", icon: DollarSign },
      { title: "Delinquency Trends (P1)", icon: TrendingDown },
      { title: "Lease Expiration Forecast (P1)", icon: CalendarClock },
      { title: "Benchmarks (P1)", icon: BarChart3 },
    ],
  },

  {
    title: "Portals — Extensions (P1)",
    icon: Smartphone,
    subItems: [
      { title: "Owner Portal (P1)", icon: Briefcase },
      { title: "Vendor Portal (P1)", icon: Truck },
    ],
  },

  {
    title: "Integrations — Extensions (P1)",
    icon: Plug,
    subItems: [
      { title: "Accounting Sync (P1)", icon: BookOpenCheck },
      { title: "Insurance Partners (P1)", icon: Shield },
      { title: "Connected Apps (P1)", icon: Link2 },
      { title: "Zapier (P1)", icon: Workflow },
    ],
  },

  {
    title: "Settings — Extensions (P1)",
    icon: Settings,
    subItems: [
      { title: "Custom Fields (P1)", icon: Tags },
      { title: "Tax & Legal (P1)", icon: Scale },
      { title: "Localization (P1)", icon: Languages },
      { title: "Data & Backup (P1)", icon: Database },
      { title: "2FA / MFA (P1)", icon: Fingerprint },
      { title: "SSO (P1)", icon: KeyRound },
      { title: "Support & SLA (P1)", icon: LifeBuoy },
    ],
  },

  // ──────────────────────────────────────────── P2 (Differentiators — free) ──
  {
    title: "Banking & Fintech (P2)",
    icon: Landmark,
    subItems: [
      { title: "Landlord Banking (P2)", icon: Landmark },
      { title: "Property Sub-accounts (P2)", icon: Boxes },
      { title: "High-yield Savings (P2)", icon: PiggyBank },
      { title: "Debit & Cards (P2)", icon: CreditCard },
      { title: "Payout Accounts (P2)", icon: Banknote },
      { title: "Instant / Same-day Payouts (P2)", icon: ArrowLeftRight },
      { title: "Flexible Rent (P2)", icon: Coins },
      { title: "Cash / Retail Payments (P2)", icon: Banknote },
      { title: "1099 E-filing (P2)", icon: FileCheck2 },
    ],
  },

  {
    title: "Listings — Differentiators (P2)",
    icon: Megaphone,
    subItems: [
      { title: "Self-guided Showings (P2)", icon: KeyRound },
    ],
  },

  {
    title: "Leasing — Differentiators (P2)",
    icon: FileText,
    subItems: [
      { title: "Deposit Alternatives (P2)", icon: Coins },
    ],
  },

  {
    title: "Tenants — Differentiators (P2)",
    icon: Users,
    subItems: [
      { title: "Rent Reporting (P2)", icon: TrendingUp },
      { title: "Renter Rewards (P2)", icon: Star },
    ],
  },

  {
    title: "Tasks — Automation Builder (P2)",
    icon: Workflow,
    subItems: [
      { title: "Automations (P2)", icon: Workflow },
    ],
  },

  {
    title: "Portals — Branding (P2)",
    icon: Palette,
    subItems: [
      { title: "Portal Branding (P2)", icon: Palette },
    ],
  },

  {
    title: "Integrations — Open Platform (P2)",
    icon: Code,
    subItems: [
      { title: "Open API (P2)", icon: Code },
      { title: "Webhooks (P2)", icon: Webhook },
    ],
  },

  {
    title: "Settings — White-label (P2)",
    icon: Brush,
    subItems: [
      { title: "Branding (P2)", icon: Palette },
      { title: "White-label (P2)", icon: Brush },
      { title: "API & Webhooks (P2)", icon: Webhook },
    ],
  },

  // ────────────────────────────────────────────────────────── P3 (AI moat) ──
  {
    title: "AI Copilot (P3)",
    icon: Bot,
    subItems: [
      { title: "Ask-your-data (P3)", icon: Bot },
      { title: "AI Insights (P3)", icon: Sparkles },
      { title: "Rent Optimization (P3)", icon: TrendingUp },
      { title: "Predictive Delinquency (P3)", icon: TrendingDown },
    ],
  },

  {
    title: "AI Leasing Agent (P3)",
    icon: Bot,
    subItems: [
      { title: "24/7 Prospect Chat (P3)", icon: Bot },
      { title: "Auto-responders (P3)", icon: Bot },
      { title: "AI Listing Writer (P3)", icon: Bot },
    ],
  },

  {
    title: "AI Bookkeeping (P3)",
    icon: Bot,
    subItems: [
      { title: "Auto-categorization (P3)", icon: Bot },
      { title: "AI Document Parsing (P3)", icon: Bot },
      { title: "AI Bookkeeping (P3)", icon: Bot },
    ],
  },

  {
    title: "AI Owner Statements (P3)",
    icon: Bot,
    subItems: [
      { title: "AI Owner Narratives (P3)", icon: Bot },
    ],
  },

  {
    title: "AI Maintenance (P3)",
    icon: Bot,
    subItems: [
      { title: "AI Maintenance Triage (P3)", icon: Bot },
    ],
  },

  {
    title: "AI Assistant (P3)",
    icon: Sparkles,
    subItems: [
      { title: "AI Assistant (P3)", icon: Sparkles },
    ],
  },

  // ────────────────────────────────────────────────── P4 (Deferred / skip) ──
  {
    title: "Maintenance — Deferred (P4)",
    icon: PhoneCall,
    subItems: [
      { title: "24/7 Coordination / Contact Center (P4)", icon: PhoneCall },
    ],
  },

  {
    title: "Accounting — Deferred (P4)",
    icon: Receipt,
    subItems: [
      { title: "CAM / Commercial Recoverables (P4)", icon: Receipt },
    ],
  },

  {
    title: "Banking — Deferred (P4)",
    icon: DollarSign,
    subItems: [
      { title: "Loan Marketplace (P4)", icon: DollarSign },
    ],
  },

  {
    title: "Communications — Deferred (P4)",
    icon: Contact,
    subItems: [
      { title: "Contact Center (P4)", icon: Contact },
    ],
  },

  {
    title: "HOA — Full Suite (P4)",
    icon: Vote,
    subItems: [
      { title: "Architectural Requests (P4)", icon: FilePen },
      { title: "Committees (P4)", icon: UsersRound },
      { title: "Voting & Elections (P4)", icon: Vote },
      { title: "Meetings & Minutes (P4)", icon: Gavel },
    ],
  },

  {
    title: "Portals — Deferred (P4)",
    icon: UsersRound,
    subItems: [
      { title: "Board Portal (P4)", icon: UsersRound },
    ],
  },
];
