"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ExternalLink,
  FileText,
  FolderOpen,
  Loader2,
  MoreHorizontal,
  Trash2,
  UploadCloud,
} from "lucide-react";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  DataTable,
  EmptyState,
  Field,
  ListLoading,
  ScreenHeader,
  SearchInput,
  StatsBar,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAllDocuments, createDocument, softDeleteDocument } from "@/lib/supabase/documents";
import { listTenantDocuments } from "@/lib/supabase/tenant_documents";
import { maintenanceAttachmentsLayer } from "@/lib/supabase/maintenance_attachments";
import { uploadPropertyImage } from "@/lib/supabase/property_storage";
import { getActiveProjectId } from "@/lib/supabase/project_scope";
import { listProperties } from "@/lib/supabase/properties";
import { listUnits } from "@/lib/supabase/units";
import { listBuildings } from "@/lib/supabase/buildings";
import { listPortfolios } from "@/lib/supabase/portfolios";
import { listFloorPlans } from "@/lib/supabase/floor_plans";
import { listUnitTypes } from "@/lib/supabase/unit_types";
import { listAmenities } from "@/lib/supabase/amenities";
import { listTenants } from "@/lib/supabase/tenants";
import {
  DOCUMENT_KIND_OPTIONS,
  DOCUMENT_SOURCES,
  SOURCE_FILTER_OPTIONS,
  formatBytes,
  formatDate,
  kindLabel,
} from "./shared";

// Document Library — one searchable view over every file in the workspace:
// library uploads + per-record documents (`documents`), tenant files
// (`tenant_documents`), and maintenance attachments.

// Library uploads are `documents` rows owned by the active project (nil uuid when unscoped).
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const libraryOwnerId = () => getActiveProjectId() || NIL_UUID;

// Record types whose editors attach documents (owner_type = the editor's config key).
const OWNER_SOURCES = [
  { type: "property", label: "Property", list: listProperties, name: (r) => r.name },
  { type: "unit", label: "Unit", list: listUnits, name: (r) => r.label },
  { type: "building", label: "Building", list: listBuildings, name: (r) => r.name },
  { type: "portfolio", label: "Portfolio", list: listPortfolios, name: (r) => r.name },
  { type: "floorplan", label: "Floor plan", list: listFloorPlans, name: (r) => r.name },
  { type: "unittype", label: "Unit type", list: listUnitTypes, name: (r) => r.name },
  { type: "amenity", label: "Amenity", list: listAmenities, name: (r) => r.name },
];

const toRow = (doc, source, context, kind = doc.kind) => ({
  key: `${source}:${doc.id}`,
  id: doc.id,
  source,
  name: doc.name || "Untitled file",
  url: doc.url || "",
  kind: kind || "other",
  context: context || "—",
  sizeBytes: doc.sizeBytes || 0,
  createdAt: doc.createdAt || null,
});

// One query for every document, then label each by its owner record.
async function loadLibrary() {
  const [docs, ownerLists, tenantDocs, tenants, attachments] = await Promise.all([
    listAllDocuments(),
    Promise.all(OWNER_SOURCES.map((src) => src.list())),
    listTenantDocuments(),
    listTenants(),
    maintenanceAttachmentsLayer.list(),
  ]);
  const owners = new Map();
  OWNER_SOURCES.forEach((src, i) => {
    for (const o of ownerLists[i] ?? []) owners.set(`${src.type}:${o.id}`, `${src.label} · ${src.name(o) || "Untitled"}`);
  });
  const tenantNames = new Map((tenants ?? []).map((t) => [t.id, t.name]));
  const rows = [
    ...(docs ?? []).map((d) =>
      d.ownerType === "library"
        ? toRow(d, "library", "Library")
        : toRow(d, "property", owners.get(`${d.ownerType}:${d.ownerId}`) || "Record"),
    ),
    ...(tenantDocs ?? []).map((d) =>
      toRow(d, "tenant", tenantNames.get(d.tenantId) ? `Tenant · ${tenantNames.get(d.tenantId)}` : "Tenant"),
    ),
    ...(attachments ?? []).map((a) =>
      toRow(a, "maintenance", a.workOrderLabel ? `Work order · ${a.workOrderLabel}` : "Maintenance", a.category),
    ),
  ];
  return rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

// Rows added within the last `days` days.
function countRecent(rows, days) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return rows.filter((r) => r.createdAt && new Date(r.createdAt).getTime() >= since).length;
}

const openFile = (row) => {
  if (row.url) window.open(row.url, "_blank", "noopener,noreferrer");
  else toast.error("This file has no link.");
};

function UploadDialog({ open, onOpenChange, onUploaded }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("other");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  // Reset whenever the dialog reopens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFile(null);
      setName("");
      setKind("other");
    }
  }

  const pick = (f) => {
    setFile(f || null);
    if (f && !name.trim()) setName(f.name);
  };

  const submit = async () => {
    if (!file) {
      toast.error("Choose a file to upload.");
      return;
    }
    setBusy(true);
    const id = crypto.randomUUID();
    const uploaded = await uploadPropertyImage("library", id, file);
    if (!uploaded?.url) {
      setBusy(false);
      toast.error(`Couldn't upload ${file.name}.`);
      return;
    }
    const created = await createDocument({
      id,
      ownerType: "library",
      ownerId: libraryOwnerId(),
      kind,
      name: name.trim() || file.name,
      url: uploaded.url,
      sizeBytes: uploaded.sizeBytes || file.size || 0,
    });
    setBusy(false);
    if (!created) {
      toast.error("The file uploaded, but its record couldn't be saved.");
      return;
    }
    onUploaded(toRow(created, "library", "Library"));
    toast.success(`Uploaded "${created.name}".`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>
            Add a file to the workspace library. Images are compressed; PDFs and other files are
            stored as-is.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="File" htmlFor="library-file">
            <input
              ref={fileRef}
              id="library-file"
              type="file"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <Button
              variant="outline"
              className="w-full justify-start border-border bg-surface-card text-foreground hover:bg-surface-hover"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <UploadCloud className="h-4 w-4" />
              <span className="truncate">{file ? file.name : "Choose a File…"}</span>
            </Button>
          </Field>
          <Field label="Name" htmlFor="library-name">
            <Input
              id="library-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 2026 insurance certificate"
              className="bg-surface-card"
            />
          </Field>
          <Field label="Kind" htmlFor="library-kind">
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger id="library-kind" className="bg-surface-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_KIND_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={submit}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentLibraryScreen() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [kind, setKind] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let alive = true;
    loadLibrary()
      .then((result) => {
        if (!alive) return;
        setRows(result ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setRows([]);
        setLoading(false);
        toast.error("Couldn't load documents.");
      });
    return () => {
      alive = false;
    };
  }, []);

  // Kind filter options come from whatever kinds are present.
  const kindOptions = useMemo(() => {
    const kinds = [...new Set(rows.map((r) => String(r.kind).toLowerCase()))].sort();
    return [{ value: "all", label: "All kinds" }, ...kinds.map((k) => ({ value: k, label: kindLabel(k) }))];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (source !== "all" && r.source !== source) return false;
      if (kind !== "all" && String(r.kind).toLowerCase() !== kind) return false;
      if (q && !`${r.name} ${r.context} ${r.kind}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, source, kind]);

  const stats = useMemo(() => {
    const count = (s) => rows.filter((r) => r.source === s).length;
    const recent = countRecent(rows, 30);
    return [
      { label: "Documents", value: String(rows.length), footer: `${recent} added in 30 days` },
      { label: "Library", value: String(count("library")), footer: "Uploaded here" },
      { label: "Records & tenants", value: String(count("property") + count("tenant")), footer: "Attached to records" },
      { label: "Maintenance", value: String(count("maintenance")), footer: "Work order files" },
    ];
  }, [rows]);

  const handleDelete = async (row) => {
    setDeleteTarget(null);
    const prev = rows;
    setRows((r) => r.filter((x) => x.key !== row.key));
    const ok = await softDeleteDocument(row.id);
    if (!ok) {
      setRows(prev);
      toast.error(`Couldn't delete "${row.name}".`);
      return;
    }
    toast.success(`Deleted "${row.name}".`);
  };

  const clearFilters = () => {
    setSearch("");
    setSource("all");
    setKind("all");
  };

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (r) => (
        <div className="flex min-w-0 items-center gap-3">
          <FileText className="h-4 w-4 shrink-0 text-text-secondary" />
          <div className="min-w-0">
            <a
              href={r.url || undefined}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="block max-w-xs truncate font-medium text-foreground hover:underline"
            >
              {r.name}
            </a>
            {formatBytes(r.sizeBytes) ? (
              <span className="text-xs text-text-tertiary">{formatBytes(r.sizeBytes)}</span>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: "source",
      header: "Source",
      render: (r) => (
        <Badge variant={DOCUMENT_SOURCES[r.source]?.variant || "neutral"}>
          {DOCUMENT_SOURCES[r.source]?.label || r.source}
        </Badge>
      ),
    },
    {
      key: "kind",
      header: "Kind",
      render: (r) => <Badge variant="neutral">{kindLabel(r.kind)}</Badge>,
    },
    {
      key: "context",
      header: "Owner / context",
      className: "max-w-[240px] truncate text-sm text-text-secondary",
      render: (r) => r.context,
    },
    {
      key: "createdAt",
      header: "Added",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => formatDate(r.createdAt),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "text-right",
      render: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:bg-surface-active hover:text-foreground"
                aria-label="File actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 border-border bg-surface-card shadow-xl">
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-muted-foreground focus:bg-surface-hover focus:text-foreground"
                onClick={() => openFile(r)}
              >
                <ExternalLink className="h-4 w-4" /> Open
              </DropdownMenuItem>
              {r.source === "library" ? (
                <>
                  <DropdownMenuSeparator className="bg-surface-strong" />
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 text-red-600 dark:text-red-300 focus:bg-red-500/10 focus:text-red-600 dark:focus:text-red-300"
                    onClick={() => setDeleteTarget(r)}
                  >
                    <Trash2 className="h-4 w-4 text-red-600 dark:text-red-300" /> Delete
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const header = (
    <ScreenHeader
      title="Document Library"
      description="Every file in your workspace in one place — library uploads, property and tenant documents, and maintenance attachments."
      actions={
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => setUploadOpen(true)}
        >
          <UploadCloud className="h-4 w-4" /> Upload
        </Button>
      }
    />
  );

  return (
    <MainScreenWrapper>
      {header}

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={source} onValueChange={setSource} options={SOURCE_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={kind} onValueChange={setKind} options={kindOptions} height="h-9" />
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search documents…"
          className="w-full sm:max-w-xs"
        />
      </Toolbar>

      {loading ? (
        <ListLoading label="Loading documents" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowKey={(r) => r.key}
          onRowClick={openFile}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={FolderOpen}
                title={rows.length ? "No documents match your filters" : "No documents yet"}
                description={
                  rows.length
                    ? "Try clearing the search or filters."
                    : "Upload a file, or attach documents from a property, tenant, or work order."
                }
                action={
                  rows.length ? (
                    <Button variant="ghost" onClick={clearFilters}>
                      Clear Filters
                    </Button>
                  ) : (
                    <Button
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => setUploadOpen(true)}
                    >
                      <UploadCloud className="h-4 w-4" /> Upload
                    </Button>
                  )
                }
              />
            </div>
          }
        />
      )}

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={(row) => setRows((prev) => [row, ...prev])}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">{deleteTarget?.name}</span>? This
              action can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              className="bg-red-500/90 text-white hover:bg-red-500"
              onClick={() => handleDelete(deleteTarget)}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainScreenWrapper>
  );
}

export default DocumentLibraryScreen;
