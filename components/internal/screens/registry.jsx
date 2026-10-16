import { PropertyOverviewScreen } from "./overview/property_overview";
// Property
import { AllPropertiesScreen } from "./properties/all_properties";
import { UnitsScreen } from "./units/units";
import { BuildingsScreen } from "./buildings/buildings";
import { PortfoliosScreen } from "./portfolios/portfolios";
import { FloorPlansScreen } from "./floor_plans/floor_plans";
import { UnitTypesScreen } from "./unit_types/unit_types";
import { AmenitiesScreen } from "./amenities/amenities";
import { MediaScreen } from "./media/media";
// Marketing & Leads
import { ListingsScreen } from "./marketing/listings";
import { ProspectsScreen } from "./marketing/prospects";
import { ShowingsScreen } from "./marketing/showings";
import { ApplicationsScreen } from "./marketing/applications";
import { WaitlistScreen } from "./marketing/waitlist";
import { RentComparablesScreen } from "./marketing/rent_comps";
// Leasing
import { AllLeasesScreen } from "./leasing/all_leases";
import { RenewalsScreen } from "./leasing/renewals";
import { MovesScreen } from "./leasing/moves";
import { InspectionsScreen } from "./leasing/inspections";
import { SecurityDepositsScreen } from "./leasing/security_deposits";
import { NoticesScreen } from "./leasing/notices";
import { TemplatesScreen } from "./leasing/lease_templates";
import { EsignatureScreen } from "./leasing/esignature";
// People
import { TenantsScreen } from "./tenants/tenants";
import { OwnersScreen } from "./owners/owners";
import { VendorsScreen } from "./vendors/vendors";
// Maintenance
import { WorkOrdersScreen } from "./maintenance/work_orders";
import { PreventiveScreen } from "./maintenance/preventive";
import { UnitTurnsScreen } from "./maintenance/unit_turns";
import { InventoryScreen } from "./maintenance/inventory";
// Accounting
import { RentCollectionScreen } from "./accounting/rent_collection";
import { TransactionsScreen } from "./accounting/transactions";
import { RecurringChargesScreen } from "./accounting/recurring_charges";
import { BillsScreen } from "./accounting/bills";
import { ChartOfAccountsScreen } from "./accounting/chart_of_accounts";
import { BudgetsScreen } from "./accounting/budgets";
import { BankAccountsScreen } from "./accounting/bank_accounts";
import { GeneralLedgerScreen } from "./accounting/general_ledger";
import { BankReconciliationScreen } from "./accounting/bank_reconciliation";
import { UtilityBillingScreen } from "./accounting/utility_billing";
import { CamReconciliationScreen } from "./accounting/cam_reconciliation";
import { JobCostingScreen } from "./accounting/job_costing";
import { OnlinePaymentsScreen } from "./payments/online_payments";
// Communications & Documents
import { InboxScreen } from "./communications/inbox";
import { AnnouncementsScreen } from "./communications/announcements";
import { MessageTemplatesScreen } from "./communications/message_templates";
import { DocumentLibraryScreen } from "./documents/document_library";
// Reports
import { RentRollScreen } from "./reports/rent_roll";
import { DelinquencyScreen } from "./reports/delinquency";
import { OccupancyScreen } from "./reports/occupancy";
import { OwnerStatementsScreen } from "./reports/owner_statements";
import { FinancialStatementsScreen } from "./reports/financial_statements";
import { MaintenanceReportScreen } from "./reports/maintenance_report";
import { LeasingReportScreen } from "./reports/leasing_report";
import { TrialBalanceScreen } from "./reports/trial_balance";
import { GeneralLedgerDetailScreen } from "./reports/general_ledger_detail";
import { CheckRegisterScreen } from "./reports/check_register";
import { ApAgingScreen } from "./reports/ap_aging";
import { DepositDetailScreen } from "./reports/deposit_detail";
import { ManagementFeesScreen } from "./reports/management_fees";
import { InsuranceComplianceScreen } from "./reports/insurance_compliance";
import { Vendor1099Screen } from "./reports/vendor_1099";
import { ScheduledReportsScreen } from "./reports/scheduled_reports";
// Automations & Settings
import { AutomationsScreen } from "./automations/automations";
import { CompanyProfileScreen } from "./settings/company_profile";
import { TeamMembersScreen } from "./settings/team_members";
import { RolesPermissionsScreen } from "./settings/roles_permissions";
import { CustomFieldsScreen } from "./settings/custom_fields";
import { FeesPoliciesScreen } from "./settings/fees_policies";
import { BrandingPortalsScreen } from "./settings/branding_portals";
import { IntegrationsScreen } from "./settings/integrations";
import { PaymentSettingsScreen } from "./payments/payment_settings";
import { NotificationSettingsScreen } from "./communications/notification_settings";

// Sidebar title → screen. Keys must match `title`s in sidebar_nav.jsx exactly;
// unlisted titles (AI Assistant) fall back to ComingSoonScreen. Old titles are
// redirected to these via LEGACY_TABS in lib/workspace/tabs.js.
export const SCREEN_REGISTRY = {
  "Overview": PropertyOverviewScreen,

  "Properties": AllPropertiesScreen,
  "Units": UnitsScreen,
  "Buildings": BuildingsScreen,
  "Portfolios": PortfoliosScreen,
  "Floor Plans": FloorPlansScreen,
  "Unit Types": UnitTypesScreen,
  "Amenities": AmenitiesScreen,
  "Media Library": MediaScreen,

  "Listings": ListingsScreen,
  "Prospects": ProspectsScreen,
  "Showings": ShowingsScreen,
  "Applications": ApplicationsScreen,
  "Waitlist": WaitlistScreen,
  "Rent Comparables": RentComparablesScreen,

  "Leases": AllLeasesScreen,
  "Renewals": RenewalsScreen,
  "Move-ins & Move-outs": MovesScreen,
  "Inspections": InspectionsScreen,
  "Security Deposits": SecurityDepositsScreen,
  "Notices & Violations": NoticesScreen,

  "Tenants": TenantsScreen,
  "Owners": OwnersScreen,
  "Vendors": VendorsScreen,

  "Work Orders": WorkOrdersScreen,
  "Preventive & Recurring": PreventiveScreen,
  "Unit Turns": UnitTurnsScreen,
  "Inventory & Parts": InventoryScreen,

  "Rent Collection": RentCollectionScreen,
  "Online Payments": OnlinePaymentsScreen,
  "Transactions": TransactionsScreen,
  "Recurring Charges": RecurringChargesScreen,
  "Bills & Payables": BillsScreen,
  "Chart of Accounts": ChartOfAccountsScreen,
  "Budgets": BudgetsScreen,
  "Bank Accounts": BankAccountsScreen,
  "General Ledger": GeneralLedgerScreen,
  "Bank Reconciliation": BankReconciliationScreen,
  "Utility Billing": UtilityBillingScreen,
  "CAM Reconciliation": CamReconciliationScreen,
  "Job Costing": JobCostingScreen,

  "Inbox": InboxScreen,
  "Announcements": AnnouncementsScreen,
  "Message Templates": MessageTemplatesScreen,

  "Document Library": DocumentLibraryScreen,
  "Templates": TemplatesScreen,
  "E-signature": EsignatureScreen,

  "Rent Roll": RentRollScreen,
  "Delinquency": DelinquencyScreen,
  "Occupancy & Vacancy": OccupancyScreen,
  "Owner Statements": OwnerStatementsScreen,
  "Financial Statements": FinancialStatementsScreen,
  "Maintenance Report": MaintenanceReportScreen,
  "Leasing Report": LeasingReportScreen,
  "Trial Balance": TrialBalanceScreen,
  "General Ledger Detail": GeneralLedgerDetailScreen,
  "Check & Payment Register": CheckRegisterScreen,
  "A/P Aging": ApAgingScreen,
  "Deposit Detail": DepositDetailScreen,
  "Management Fees": ManagementFeesScreen,
  "Insurance Compliance": InsuranceComplianceScreen,
  "1099 Summary": Vendor1099Screen,
  "Scheduled Reports": ScheduledReportsScreen,

  "Automations": AutomationsScreen,

  "Company Profile": CompanyProfileScreen,
  "Team & Members": TeamMembersScreen,
  "Roles & Permissions": RolesPermissionsScreen,
  "Custom Fields": CustomFieldsScreen,
  "Fees & Policies": FeesPoliciesScreen,
  "Payment Processing": PaymentSettingsScreen,
  "Branding & Portals": BrandingPortalsScreen,
  "Integrations": IntegrationsScreen,
  "Notifications": NotificationSettingsScreen,
};

export function getScreen(title) {
  return SCREEN_REGISTRY[title] || null;
}
