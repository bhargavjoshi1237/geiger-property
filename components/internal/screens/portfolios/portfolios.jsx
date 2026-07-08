"use client";

import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { portfoliosConfig } from "./config";

// Portfolios — collections of properties, list + editor via the Entity engine.
export function PortfoliosScreen() {
  return <EntityListScreen config={portfoliosConfig} />;
}

export default PortfoliosScreen;
