"use client";

import React, { useMemo, useState } from "react";
import { FileText } from "lucide-react";

import { ScreenHeader, SearchInput } from "@/components/internal/shared/screen_kit";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { DataGate, DocumentRows, Notice, Panel, PortalEmpty, usePortalData } from "../portal_kit";

// Documents on the owner's file and their properties (internal files excluded).
export function OwnerDocuments() {
  const state = usePortalData("/api/portal/owner/documents");
  const [search, setSearch] = useState("");
  const docs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (state.data?.documents || []).filter((d) => !q || `${d.name} ${d.kind} ${d.source}`.toLowerCase().includes(q));
  }, [state.data, search]);

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Documents"
        description="Management agreements, property records and other files your manager has shared."
        actions={<SearchInput value={search} onChange={setSearch} placeholder="Search documents…" className="w-full sm:w-64" />}
      />
      <DataGate state={state}>
        {(data) =>
          data.documentsDisabled ? (
            <Notice>Documents aren&apos;t shared in the portal for your account. Ask the office for copies.</Notice>
          ) : !data.documents.length ? (
            <PortalEmpty icon={FileText} title="No documents yet" description="Files your property manager shares will appear here." />
          ) : !docs.length ? (
            <PortalEmpty icon={FileText} title="No documents match" description="Try a different search." />
          ) : (
            <Panel flush>
              <DocumentRows documents={docs} />
            </Panel>
          )
        }
      </DataGate>
    </MainScreenWrapper>
  );
}

export default OwnerDocuments;
