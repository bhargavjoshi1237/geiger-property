"use client";

import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { workOrdersConfig } from "./config";

// Work Orders — merges the old All Maintenance, Requests, Field, Vendor
// Assignments, and Attachments pages into one screen with views.
export function WorkOrdersScreen() {
  return <EntityListScreen config={workOrdersConfig} />;
}

export default WorkOrdersScreen;
