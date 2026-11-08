"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@geiger/ui/dropdown-menu";
import { usePermission } from "@/context/rbac-context";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { downloadBlob, downloadText } from "@/lib/export/download";
import { CSV_BOM, exportFileName, sheetCsv } from "@/lib/export/list_export";

const NO_EXPORT = "Your role can't export lists.";

// Export menu (CSV / Excel) over `sheets` = [{ name, columns, rows }] or a single `columns` + `rows`; gated by `permission`.
export function ExportButton({ name, sheets, columns, rows, permission = "property.data.export", noPermissionNote = NO_EXPORT, csv, className }) {
  const allowed = usePermission(permission);
  const [busy, setBusy] = useState(false);
  const list = sheets || [{ name, columns: columns || [], rows: rows || [] }];
  const count = list.reduce((n, s) => n + (s.rows?.length || 0), 0);

  const run = async (kind) => {
    if (!allowed) return toast.error(noPermissionNote);
    if (!count) return toast.error("Nothing to export yet.");
    setBusy(true);
    try {
      if (kind === "csv") {
        const text = csv ? csv() : sheetCsv(list[0]);
        downloadText(exportFileName(name, "csv"), CSV_BOM + text);
      } else {
        const { buildWorkbook } = await import("@/lib/export/xlsx");
        downloadBlob(exportFileName(name, "xlsx"), buildWorkbook(list));
      }
      toast.success(`Exported ${count} row${count === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(`Couldn't export: ${e?.message || "unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <RoleGate allowed={allowed} reason={noPermissionNote}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className={className || "border-border bg-surface-card hover:bg-surface-hover"} disabled={!allowed || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44 border-border bg-surface-card shadow-xl">
          <DropdownMenuItem className="cursor-pointer" onClick={() => run("csv")}>
            <FileText className="h-4 w-4" /> CSV
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={() => run("xlsx")}>
            <FileSpreadsheet className="h-4 w-4" /> Excel (.xlsx)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </RoleGate>
  );
}
