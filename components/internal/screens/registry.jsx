import { EventsOverviewScreen } from "./overview/events_overview";
import { AllPropertiesScreen } from "./properties/all_properties";
import { UnitsScreen } from "./units/units";
import { PortfoliosScreen } from "./portfolios/portfolios";
import { BuildingsScreen } from "./buildings/buildings";
import { FloorPlansScreen } from "./floor_plans/floor_plans";
import { UnitTypesScreen } from "./unit_types/unit_types";
import { AmenitiesScreen } from "./amenities/amenities";
import { MediaScreen } from "./media/media";
import { AllTenantsScreen } from "./tenants/all_tenants";
import { TenantDirectoryScreen } from "./tenants/tenant_directory";
import { TenantProfilesScreen } from "./tenants/tenant_profiles";
import { HouseholdsScreen } from "./tenants/households";
import { ResidentPortalScreen } from "./tenants/resident_portal";
import { TenantDocumentsScreen } from "./tenants/documents";
import { CommunicationLogScreen } from "./tenants/communication_log";
import { AllMaintenanceScreen } from "./maintenance/all_maintenance";
import { WorkOrdersScreen } from "./maintenance/work_orders";
import { MaintenanceRequestsScreen } from "./maintenance/maintenance_requests";
import { VendorsScreen } from "./maintenance/vendors";
import { VendorAssignmentsScreen } from "./maintenance/vendor_assignments";
import { AttachmentsScreen } from "./maintenance/attachments";
import { MobileMaintenanceScreen } from "./maintenance/mobile_maintenance";
import { AllLeasesScreen } from "./leasing/all_leases";
import { LeaseBuilderScreen } from "./leasing/lease_builder";
import { LeaseTemplatesScreen } from "./leasing/lease_templates";
import { StateLeasesScreen } from "./leasing/state_leases";
import { EsignatureScreen } from "./leasing/esignature";
import { AddendaScreen } from "./leasing/addenda";
import { SecurityDepositsScreen } from "./leasing/security_deposits";
import { MoveInScreen } from "./leasing/move_in";
import { MoveOutScreen } from "./leasing/move_out";
import { InspectionsScreen } from "./leasing/inspections";

/**
 * Maps a sidebar nav title to its screen component. Titles must exactly match
 * the `title` fields in `components/internal/sidebar/sidebar_nav.jsx`.
 *
 * Geiger Property is scaffolded feature-first: the full feature taxonomy lives
 * in the sidebar (see docs/competitive-feature-matrix.md), but only screens
 * listed here are built out. Everything else falls back to the ComingSoonScreen
 * so the workspace looks complete while areas are implemented one at a time.
 */
export const SCREEN_REGISTRY = {
  "Overview": EventsOverviewScreen,
  // Property group — every sub-item is its own DB-backed Entity screen.
  "Properties": AllPropertiesScreen,
  "Units": UnitsScreen,
  "Portfolios": PortfoliosScreen,
  "Buildings & Blocks": BuildingsScreen,
  "Floor Plans": FloorPlansScreen,
  "Unit Types": UnitTypesScreen,
  "Property Photos & Media": MediaScreen,
  "Amenities": AmenitiesScreen,
  "All Tenants": AllTenantsScreen,
  // Directory / Profiles / Resident Portal are lenses on the shared tenants
  // table; Households, Documents, and Communication Log are their own entities.
  "Tenant Directory": TenantDirectoryScreen,
  "Tenant Profiles": TenantProfilesScreen,
  "Household & Occupants": HouseholdsScreen,
  "Resident Portal": ResidentPortalScreen,
  "Documents": TenantDocumentsScreen,
  "Communication Log": CommunicationLogScreen,
  // Maintenance group. All Maintenance is every work_orders row; Work Orders and
  // Maintenance Requests are kind lenses; Mobile Maintenance is a field lens
  // (is_field=true). Vendors, Vendor Assignments, and Photos & Attachments are
  // their own entities.
  "All Maintenance": AllMaintenanceScreen,
  "Work Orders": WorkOrdersScreen,
  "Maintenance Requests": MaintenanceRequestsScreen,
  "Vendors": VendorsScreen,
  "Vendor Assignments": VendorAssignmentsScreen,
  "Photos & Attachments": AttachmentsScreen,
  "Mobile Maintenance": MobileMaintenanceScreen,
  // Leasing group. Lease Builder is a drafts lens on leases; State-specific
  // Leases is a scope lens on templates; Move-in/Move-out are kind lenses on
  // moves. The rest are their own entities. "E-signature" is shared with the
  // Documents & eSign group (same signing workflow screen).
  "Leases": AllLeasesScreen,
  "Lease Builder": LeaseBuilderScreen,
  "Lease Templates": LeaseTemplatesScreen,
  "State-specific Leases": StateLeasesScreen,
  "E-signature": EsignatureScreen,
  "Addenda & Documents": AddendaScreen,
  "Security Deposits": SecurityDepositsScreen,
  "Move-in": MoveInScreen,
  "Move-out": MoveOutScreen,
  "Move-in Inspection": InspectionsScreen,
};

export function getScreen(title) {
  return SCREEN_REGISTRY[title] || null;
}
