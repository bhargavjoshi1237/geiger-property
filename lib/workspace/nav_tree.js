// Workspace nav as plain data (no React) for the sidebar, the RBAC catalog and server code; `icon` is a lucide name.
// Titles must be unique: URL slugs and property.<slug>.view keys derive from them, so renaming one changes its key.
// `module` ties an entry to an optional vertical (lib/modules.js); old titles redirect via lib/workspace/tabs.js.
export const NAV_TREE = [
  { title: "Overview", icon: "LayoutDashboard" },
  // Daily signals for the signed-in role: what changed, why, and one-click actions (ORCH-06).
  { title: "Briefing", icon: "Sunrise" },

  {
    title: "Property",
    icon: "Building2",
    subItems: [
      { title: "Properties", icon: "Building" },
      { title: "Units", icon: "DoorOpen" },
      { title: "Buildings", icon: "Warehouse" },
      { title: "Portfolios", icon: "Boxes" },
      { title: "Floor Plans", icon: "Ruler" },
      { title: "Unit Types", icon: "BedDouble" },
      { title: "Amenities", icon: "Sparkles" },
      { title: "Media Library", icon: "ImageIcon" },
    ],
  },

  {
    title: "Marketing & Leads",
    icon: "Megaphone",
    module: "leasing",
    subItems: [
      { title: "Listings", icon: "Home" },
      { title: "Prospects", icon: "UserPlus" },
      { title: "Showings", icon: "CalendarClock" },
      { title: "Applications", icon: "FilePen" },
      { title: "Waitlist", icon: "Clock" },
      { title: "Rent Comparables", icon: "BarChart3" },
    ],
  },

  {
    title: "Leasing",
    icon: "FileSignature",
    subItems: [
      { title: "Leases", icon: "FileSignature" },
      { title: "Renewals", icon: "Repeat" },
      { title: "Move-ins & Move-outs", icon: "ArrowLeftRight" },
      { title: "Inspections", icon: "ClipboardCheck" },
      { title: "Security Deposits", icon: "PiggyBank" },
      { title: "Notices & Violations", icon: "ShieldAlert" },
    ],
  },

  {
    title: "People",
    icon: "Users",
    subItems: [
      { title: "Tenants", icon: "Users" },
      { title: "Owners", icon: "Briefcase" },
      { title: "Vendors", icon: "Truck" },
    ],
  },

  {
    title: "Maintenance",
    icon: "Wrench",
    subItems: [
      { title: "Work Orders", icon: "ClipboardPen" },
      { title: "Preventive & Recurring", icon: "CalendarCheck" },
      { title: "Unit Turns", icon: "RefreshCw" },
      { title: "Inventory & Parts", icon: "PackageOpen" },
    ],
  },

  {
    title: "Accounting",
    icon: "Wallet",
    subItems: [
      { title: "Rent Collection", icon: "CircleDollarSign" },
      { title: "Online Payments", icon: "CreditCard" },
      { title: "Transactions", icon: "ScrollText" },
      { title: "Recurring Charges", icon: "Repeat" },
      { title: "Bills & Payables", icon: "Receipt" },
      { title: "Chart of Accounts", icon: "FolderTree" },
      { title: "Budgets", icon: "Calculator" },
      { title: "Bank Accounts", icon: "Landmark" },
      { title: "Bank Deposits", icon: "Banknote" },
      { title: "General Ledger", icon: "BookOpen" },
      { title: "Bank Reconciliation", icon: "Scale" },
      { title: "Utility Billing", icon: "Droplets" },
      { title: "CAM Reconciliation", icon: "Layers", module: "commercial" },
      { title: "Job Costing", icon: "Hammer" },
    ],
  },

  // Team chat (ported from Flow's Grounding) with its own rail: messages, channels, contacts, calls, files, inbox.
  { title: "Communications", icon: "MessagesSquare" },

  {
    title: "Documents",
    icon: "Files",
    subItems: [
      { title: "Document Library", icon: "FolderOpen" },
      { title: "Templates", icon: "FileText" },
      { title: "E-signature", icon: "FileSignature" },
    ],
  },

  // Landlord-tenant law spans leasing, deposits, maintenance, notices and fair housing, so it sits top-level.
  { title: "Legal Resources", icon: "BookMarked" },

  {
    title: "Reports",
    icon: "BarChart3",
    subItems: [
      // Every report in one searchable place with favorites; new reports appear only here (CORE-41).
      { title: "Report Library", icon: "Library" },
      { title: "Rent Roll", icon: "FileSpreadsheet" },
      { title: "Delinquency", icon: "TrendingDown" },
      { title: "Occupancy & Vacancy", icon: "PieChart" },
      { title: "Owner Statements", icon: "FileText" },
      { title: "Financial Statements", icon: "FileBarChart" },
      { title: "Maintenance Report", icon: "Wrench" },
      { title: "Leasing Report", icon: "FileSignature" },
      { title: "Trial Balance", icon: "Scale" },
      { title: "General Ledger Detail", icon: "BookOpen" },
      { title: "Check & Payment Register", icon: "ScrollText" },
      { title: "A/P Aging", icon: "Receipt" },
      { title: "Deposit Detail", icon: "PiggyBank" },
      { title: "Trust Reconciliation", icon: "Vault" },
      { title: "Management Fees", icon: "Percent" },
      { title: "Insurance Compliance", icon: "ShieldCheck" },
      { title: "1099 Summary", icon: "FileSpreadsheet" },
      { title: "Scheduled Reports", icon: "CalendarClock" },
      { title: "Metric Definitions", icon: "Sigma" },
    ],
  },

  {
    title: "Automations",
    icon: "Workflow",
    subItems: [
      { title: "Review Queue", icon: "Inbox" },
      { title: "Playbooks", icon: "LibraryBig" },
      { title: "All Workflows", icon: "Workflow" },
      { title: "Run History", icon: "History" },
      { title: "Impact", icon: "TrendingUp" },
    ],
  },
  { title: "AI Assistant", icon: "Bot" },

  {
    title: "Settings",
    icon: "Settings",
    subItems: [
      { title: "Setup & Go-live", icon: "ListChecks" },
      { title: "Company Profile", icon: "Building2" },
      { title: "Modules", icon: "Blocks" },
      { title: "Team & Members", icon: "UsersRound" },
      { title: "Roles & Permissions", icon: "ShieldCheck" },
      { title: "Custom Fields", icon: "Tags" },
      { title: "Fees & Policies", icon: "Percent" },
      { title: "Payment Processing", icon: "BadgeDollarSign" },
      { title: "Branding & Portals", icon: "Palette" },
      { title: "Integrations", icon: "Plug" },
      { title: "Notifications", icon: "BellRing" },
      { title: "Automation Settings", icon: "SlidersHorizontal" },
    ],
  },
];
