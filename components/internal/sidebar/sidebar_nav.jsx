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
// group (see the section dividers below); titles themselves stay clean.
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
  // Top-level order follows the manager's daily workflow rather than the
  // build order: overview → people & places → leasing lifecycle → operations
  // → money → documents → reporting → external → settings.
  {
    title: "Overview",
    icon: LayoutDashboard,
  },

  {
    title: "Property",
    icon: Building2,
    subItems: [
      { title: "Properties", icon: Building },
      { title: "Units", icon: DoorOpen },
      { title: "Portfolios", icon: Boxes },
      { title: "Buildings & Blocks", icon: Warehouse },
      { title: "Floor Plans", icon: Ruler },
      { title: "Unit Types", icon: BedDouble },
      { title: "Property Photos & Media", icon: ImageIcon },
      { title: "Amenities", icon: Sparkles },
    ],
  },

  {
    title: "Tenants",
    icon: Users,
    subItems: [
      { title: "All Tenants", icon: Users },
      { title: "Tenant Directory", icon: BookUser },
      { title: "Tenant Profiles", icon: UserRound },
      { title: "Household & Occupants", icon: UsersRound },
      { title: "Resident Portal", icon: Smartphone },
      { title: "Documents", icon: Files },
      { title: "Communication Log", icon: MessagesSquare },
    ],
  },

  {
    title: "Leasing",
    icon: FileSignature,
    subItems: [
      { title: "Leases", icon: FileSignature },
      { title: "Lease Builder", icon: FilePen },
      { title: "Lease Templates", icon: Files },
      { title: "State-specific Leases", icon: Scale },
      { title: "E-signature", icon: FileSignature },
      { title: "Addenda & Documents", icon: FileText },
      { title: "Security Deposits", icon: PiggyBank },
      { title: "Move-in", icon: LogIn },
      { title: "Move-out", icon: LogOut },
      { title: "Move-in Inspection", icon: ClipboardCheck },
    ],
  },

  {
    title: "Applications & Screening",
    icon: UserSearch,
    subItems: [
      { title: "Online Applications", icon: FilePen },
      { title: "Application Forms", icon: FileText },
      { title: "Tenant Screening", icon: ShieldCheck },
      { title: "Credit Checks", icon: CreditCard },
      { title: "Background Checks", icon: Shield },
      { title: "Eviction History", icon: ShieldAlert },
      { title: "Income Verification", icon: Banknote },
      { title: "Application Fees", icon: CircleDollarSign },
      { title: "Decisioning", icon: FileCheck2 },
      { title: "Applicant Communication", icon: MessageSquare },
    ],
  },

  {
    title: "Listings & Marketing",
    icon: Megaphone,
    subItems: [
      { title: "Vacancy Listings", icon: Home },
      { title: "Listing Syndication", icon: Share2 },
      { title: "ILS Distribution", icon: Rss },
      { title: "Showings & Tours", icon: CalendarClock },
    ],
  },

  {
    title: "Maintenance",
    icon: Wrench,
    subItems: [
      { title: "All Maintenance", icon: Wrench },
      { title: "Work Orders", icon: ClipboardPen },
      { title: "Maintenance Requests", icon: Hammer },
      { title: "Vendors", icon: Truck },
      { title: "Vendor Assignments", icon: HardHat },
      { title: "Photos & Attachments", icon: Camera },
      { title: "Mobile Maintenance", icon: Smartphone },
    ],
  },

  {
    title: "Communications",
    icon: MessagesSquare,
    subItems: [
      { title: "Inbox", icon: Inbox },
      { title: "Email", icon: Mail },
      { title: "Notifications", icon: Bell },
      { title: "Message Templates", icon: MailOpen },
    ],
  },

  {
    title: "Accounting",
    icon: Wallet,
    subItems: [
      { title: "Rent Collection", icon: CircleDollarSign },
      { title: "Online Payments", icon: CreditCard },
      { title: "Autopay", icon: Repeat },
      { title: "Recurring Charges", icon: CalendarClock },
      { title: "Late Fees", icon: Percent },
      { title: "Payment Plans", icon: Coins },
      { title: "Payment Methods", icon: Wallet },
      { title: "Transaction History", icon: ScrollText },
    ],
  },

  {
    title: "Owners",
    icon: Briefcase,
    subItems: [
      { title: "Owner Directory", icon: BookUser },
      { title: "Owner Statements", icon: FileSpreadsheet },
    ],
  },

  {
    title: "Documents & eSign",
    icon: Files,
    subItems: [
      { title: "Document Library", icon: FolderOpen },
      { title: "Templates", icon: FileText },
      { title: "E-signature", icon: FileSignature },
      { title: "Shared Files", icon: UploadCloud },
      { title: "Compliance Documents", icon: FileCheck2 },
      { title: "Document Requests", icon: ClipboardList },
    ],
  },

  {
    title: "Reports",
    icon: BarChart3,
    subItems: [
      { title: "Rent Roll", icon: FileSpreadsheet },
      { title: "Delinquency", icon: TrendingDown },
      { title: "Occupancy", icon: PieChart },
      { title: "Owner Statements", icon: FileText },
    ],
  },

  {
    title: "Integrations",
    icon: Plug,
    subItems: [
      { title: "Payment Gateways", icon: CreditCard },
      { title: "Screening Providers", icon: ShieldCheck },
      { title: "Listing Partners", icon: Share2 },
      { title: "Data Import", icon: Database },
    ],
  },

  {
    title: "Settings",
    icon: Settings,
    subItems: [
      { title: "Company Profile", icon: Building2 },
      { title: "Team & Members", icon: Users },
      { title: "Roles & Permissions", icon: ShieldCheck },
    ],
  },

  // ──────────────────────────────────────────────────────── P1 (90 days) ──
  {
    title: "Properties — Extensions",
    icon: Building2,
    subItems: [
      { title: "Custom Fields", icon: Tags },
      { title: "Property Groups", icon: Layers },
      { title: "Ownership & Splits", icon: Handshake },
      { title: "Unit Turns & Make-ready", icon: RefreshCw },
      { title: "Keys & Access", icon: KeyRound },
    ],
  },

  {
    title: "Listings — Extensions",
    icon: Megaphone,
    subItems: [
      { title: "Marketing Website", icon: Globe },
      { title: "Virtual Tours", icon: Camera },
      { title: "Rent Comparables", icon: BarChart3 },
      { title: "Waitlist", icon: Clock },
      { title: "Promotions & Specials", icon: Percent },
      { title: "QR & Yard Signs", icon: ScanLine },
    ],
  },

  {
    title: "Leads & CRM",
    icon: Contact,
    subItems: [
      { title: "Prospects", icon: UserPlus },
      { title: "Pipeline", icon: ListChecks },
      { title: "Guest Cards", icon: IdCard },
      { title: "Follow-ups", icon: BellRing },
      { title: "Lead Sources", icon: Rss },
      { title: "Lead-to-lease", icon: TrendingUp },
    ],
  },

  {
    title: "Leasing — Extensions",
    icon: FileText,
    subItems: [
      { title: "Renewals", icon: Repeat },
      { title: "Rent Increases", icon: TrendingUp },
      { title: "Lease Expirations", icon: CalendarClock },
      { title: "Notices & Violations", icon: ShieldAlert },
    ],
  },

  {
    title: "Tenants — Extensions",
    icon: Users,
    subItems: [
      { title: "Announcements", icon: Megaphone },
      { title: "Notices", icon: Bell },
      { title: "Renters Insurance", icon: Shield },
      { title: "Reviews & Feedback", icon: ThumbsUp },
      { title: "Move-out Pipeline", icon: LogOut },
    ],
  },

  {
    title: "Owners — Extensions",
    icon: Briefcase,
    subItems: [
      { title: "Owner Portal", icon: UserCog },
      { title: "Owner Distributions", icon: ArrowLeftRight },
      { title: "Ownership Splits", icon: PieChart },
      { title: "Management Fees", icon: Percent },
      { title: "1099 & Tax", icon: ReceiptText },
      { title: "Owner Communication", icon: Mail },
      { title: "Owner Documents", icon: Files },
      { title: "Owner Contributions", icon: PiggyBank },
    ],
  },

  {
    title: "Maintenance — Extensions",
    icon: Wrench,
    subItems: [
      { title: "Preventive Maintenance", icon: CalendarCheck },
      { title: "Recurring Work Orders", icon: Repeat },
      { title: "Inspections", icon: ClipboardCheck },
      { title: "Make-ready Boards", icon: RefreshCw },
      { title: "Vendor Portal", icon: Handshake },
      { title: "Estimates & Bids", icon: Calculator },
      { title: "Inventory & Parts", icon: PackageOpen },
      { title: "Meter Readings", icon: Gauge },
    ],
  },

  {
    title: "Accounting — Full Books",
    icon: Wallet,
    subItems: [
      { title: "General Ledger", icon: BookOpen },
      { title: "Chart of Accounts", icon: FolderTree },
      { title: "Bills & Payables", icon: Receipt },
      { title: "Invoices & Receivables", icon: ReceiptText },
      { title: "Bank Reconciliation", icon: BookOpenCheck },
      { title: "Journal Entries", icon: FileText },
      { title: "Deposits", icon: PiggyBank },
      { title: "Budgeting", icon: Calculator },
      { title: "Trust Accounting", icon: Scale },
      { title: "Schedule E / Tax Pack", icon: ReceiptText },
      { title: "QuickBooks Sync", icon: BookOpenCheck },
      { title: "1099 Generation", icon: FileCheck2 },
      { title: "Utility Billing (PUBS)", icon: Gauge },
      { title: "Payouts & Distributions", icon: ArrowLeftRight },
    ],
  },

  {
    title: "Banking — Operations",
    icon: Landmark,
    subItems: [
      { title: "Merchant Accounts", icon: Landmark },
      { title: "Refunds", icon: ArrowLeftRight },
    ],
  },

  {
    title: "Communications — Extensions",
    icon: MessagesSquare,
    subItems: [
      { title: "Text / SMS", icon: MessageSquare },
      { title: "Bulk Messaging", icon: Send },
      { title: "Announcements", icon: Megaphone },
      { title: "Call Logging", icon: PhoneCall },
      { title: "VoIP & Voicemail", icon: Phone },
    ],
  },

  {
    title: "Tasks — Extensions",
    icon: ListChecks,
    subItems: [
      { title: "Recurring Tasks", icon: Repeat },
    ],
  },

  {
    title: "Associations & HOA",
    icon: Building,
    subItems: [
      { title: "Associations", icon: Building2 },
      { title: "Board Members", icon: UsersRound },
      { title: "Dues & Assessments", icon: CircleDollarSign },
      { title: "Violations", icon: ShieldAlert },
      { title: "Common Areas", icon: Trees },
      { title: "Amenity Booking", icon: CalendarCheck },
    ],
  },

  {
    title: "Reports — Full Suite",
    icon: BarChart3,
    subItems: [
      { title: "Financial Reports", icon: FileBarChart },
      { title: "Income Statement", icon: LineChart },
      { title: "Balance Sheet", icon: Scale },
      { title: "Cash Flow", icon: TrendingUp },
      { title: "General Ledger", icon: BookOpen },
      { title: "Schedule E / Tax Pack", icon: ReceiptText },
      { title: "Maintenance Reports", icon: Wrench },
      { title: "Leasing Reports", icon: FileSignature },
      { title: "Custom Report Builder", icon: SlidersHorizontal },
      { title: "Scheduled Reports", icon: CalendarClock },
      { title: "Export Center", icon: FileSpreadsheet },
    ],
  },

  {
    title: "Insights",
    icon: TrendingUp,
    subItems: [
      { title: "Portfolio KPIs", icon: Gauge },
      { title: "Occupancy Trends", icon: LineChart },
      { title: "Revenue & NOI", icon: DollarSign },
      { title: "Delinquency Trends", icon: TrendingDown },
      { title: "Lease Expiration Forecast", icon: CalendarClock },
      { title: "Benchmarks", icon: BarChart3 },
    ],
  },

  {
    title: "Portals — Extensions",
    icon: Smartphone,
    subItems: [
      { title: "Owner Portal", icon: Briefcase },
      { title: "Vendor Portal", icon: Truck },
    ],
  },

  {
    title: "Integrations — Extensions",
    icon: Plug,
    subItems: [
      { title: "Accounting Sync", icon: BookOpenCheck },
      { title: "Insurance Partners", icon: Shield },
      { title: "Connected Apps", icon: Link2 },
      { title: "Zapier", icon: Workflow },
    ],
  },

  {
    title: "Settings — Extensions",
    icon: Settings,
    subItems: [
      { title: "Custom Fields", icon: Tags },
      { title: "Tax & Legal", icon: Scale },
      { title: "Localization", icon: Languages },
      { title: "Data & Backup", icon: Database },
      { title: "2FA / MFA", icon: Fingerprint },
      { title: "SSO", icon: KeyRound },
      { title: "Support & SLA", icon: LifeBuoy },
    ],
  },

  // ──────────────────────────────────────────── P2 (Differentiators — free) ──
  {
    title: "Banking & Fintech",
    icon: Landmark,
    subItems: [
      { title: "Landlord Banking", icon: Landmark },
      { title: "Property Sub-accounts", icon: Boxes },
      { title: "High-yield Savings", icon: PiggyBank },
      { title: "Debit & Cards", icon: CreditCard },
      { title: "Payout Accounts", icon: Banknote },
      { title: "Instant / Same-day Payouts", icon: ArrowLeftRight },
      { title: "Flexible Rent", icon: Coins },
      { title: "Cash / Retail Payments", icon: Banknote },
      { title: "1099 E-filing", icon: FileCheck2 },
    ],
  },

  {
    title: "Listings — Differentiators",
    icon: Megaphone,
    subItems: [
      { title: "Self-guided Showings", icon: KeyRound },
    ],
  },

  {
    title: "Leasing — Differentiators",
    icon: FileText,
    subItems: [
      { title: "Deposit Alternatives", icon: Coins },
    ],
  },

  {
    title: "Tenants — Differentiators",
    icon: Users,
    subItems: [
      { title: "Rent Reporting", icon: TrendingUp },
      { title: "Renter Rewards", icon: Star },
    ],
  },

  {
    title: "Tasks — Automation Builder",
    icon: Workflow,
    subItems: [
      { title: "Automations", icon: Workflow },
    ],
  },

  {
    title: "Portals — Branding",
    icon: Palette,
    subItems: [
      { title: "Portal Branding", icon: Palette },
    ],
  },

  {
    title: "Integrations — Open Platform",
    icon: Code,
    subItems: [
      { title: "Open API", icon: Code },
      { title: "Webhooks", icon: Webhook },
    ],
  },

  {
    title: "Settings — White-label",
    icon: Brush,
    subItems: [
      { title: "Branding", icon: Palette },
      { title: "White-label", icon: Brush },
      { title: "API & Webhooks", icon: Webhook },
    ],
  },

  // ────────────────────────────────────────────────────────── P3 (AI moat) ──
  {
    title: "AI Copilot",
    icon: Bot,
    subItems: [
      { title: "Ask-your-data", icon: Bot },
      { title: "AI Insights", icon: Sparkles },
      { title: "Rent Optimization", icon: TrendingUp },
      { title: "Predictive Delinquency", icon: TrendingDown },
    ],
  },

  {
    title: "AI Leasing Agent",
    icon: Bot,
    subItems: [
      { title: "24/7 Prospect Chat", icon: Bot },
      { title: "Auto-responders", icon: Bot },
      { title: "AI Listing Writer", icon: Bot },
    ],
  },

  {
    title: "AI Bookkeeping",
    icon: Bot,
    subItems: [
      { title: "Auto-categorization", icon: Bot },
      { title: "AI Document Parsing", icon: Bot },
      { title: "AI Bookkeeping", icon: Bot },
    ],
  },

  {
    title: "AI Owner Statements",
    icon: Bot,
    subItems: [
      { title: "AI Owner Narratives", icon: Bot },
    ],
  },

  {
    title: "AI Maintenance",
    icon: Bot,
    subItems: [
      { title: "AI Maintenance Triage", icon: Bot },
    ],
  },

  {
    title: "AI Assistant",
    icon: Sparkles,
    subItems: [
      { title: "AI Assistant", icon: Sparkles },
    ],
  },

  // ────────────────────────────────────────────────── P4 (Deferred / skip) ──
  {
    title: "Maintenance — Deferred",
    icon: PhoneCall,
    subItems: [
      { title: "24/7 Coordination / Contact Center", icon: PhoneCall },
    ],
  },

  {
    title: "Accounting — Deferred",
    icon: Receipt,
    subItems: [
      { title: "CAM / Commercial Recoverables", icon: Receipt },
    ],
  },

  {
    title: "Banking — Deferred",
    icon: DollarSign,
    subItems: [
      { title: "Loan Marketplace", icon: DollarSign },
    ],
  },

  {
    title: "Communications — Deferred",
    icon: Contact,
    subItems: [
      { title: "Contact Center", icon: Contact },
    ],
  },

  {
    title: "HOA — Full Suite",
    icon: Vote,
    subItems: [
      { title: "Architectural Requests", icon: FilePen },
      { title: "Committees", icon: UsersRound },
      { title: "Voting & Elections", icon: Vote },
      { title: "Meetings & Minutes", icon: Gavel },
    ],
  },

  {
    title: "Portals — Deferred",
    icon: UsersRound,
    subItems: [
      { title: "Board Portal", icon: UsersRound },
    ],
  },
];
