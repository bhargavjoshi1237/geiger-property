"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, Camera, DoorClosed, Loader2, Plus, Scissors, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ListLoading, SectionCard, StatGrid } from "@/components/internal/shared/screen_kit";
import { inspectionsLayer } from "@/lib/supabase/inspections";
import { movesLayer } from "@/lib/supabase/moves";
import { securityDepositsLayer } from "@/lib/supabase/security_deposits";
import { uploadPropertyImage } from "@/lib/supabase/property_storage";
import { addDepositDeductions, todayISO } from "@/lib/leasing/workflows";
import { Callout } from "./gated";
import { CONDITION_SCALE, conditionOf, formatDate, inspectionKindOf, money2 } from "../shared";
import { titleCase } from "@/lib/utils";

// Structured inspection report: rooms → items rated on a condition scale with
// notes and photos, typed-name signatures, and a move-in vs move-out comparison
// that can push chargeable damage onto the linked deposit as deductions.

const ROOM_PRESETS = {
  Entry: ["Door & lock", "Floor", "Walls", "Lighting", "Closet"],
  "Living room": ["Floor", "Walls", "Ceiling", "Windows & blinds", "Lighting", "Outlets & switches"],
  Kitchen: ["Refrigerator", "Range / oven", "Dishwasher", "Sink & faucet", "Cabinets", "Countertops", "Floor", "Walls"],
  Bedroom: ["Floor", "Walls", "Ceiling", "Windows & blinds", "Closet", "Door", "Outlets & switches"],
  Bathroom: ["Toilet", "Sink & vanity", "Tub / shower", "Mirror", "Exhaust fan", "Floor", "Walls"],
  Laundry: ["Washer", "Dryer", "Floor"],
  "Patio / balcony": ["Surface", "Railings", "Door"],
  Garage: ["Door & opener", "Floor", "Walls"],
  Exterior: ["Yard", "Siding", "Gutters", "Walkways"],
};

const uid = () => crypto.randomUUID();

// Tolerant reader: legacy rooms were { label, condition } rows.
export function roomsOf(item) {
  const raw = Array.isArray(item?.metadata?.rooms) ? item.metadata.rooms : [];
  return raw.map((r) => ({
    id: r.id || uid(),
    name: r.name || r.label || "Room",
    items: Array.isArray(r.items)
      ? r.items
      : r.condition
        ? [{ id: `${r.id}-overall`, name: "Overall", condition: String(r.condition).toLowerCase(), notes: "" }]
        : [],
  }));
}

export function inspectionStats(item) {
  const items = roomsOf(item).flatMap((r) => r.items);
  const counts = Object.fromEntries(CONDITION_SCALE.map((c) => [c.value, 0]));
  for (const i of items) if (counts[i.condition] !== undefined) counts[i.condition] += 1;
  const photos = items.reduce((s, i) => s + (i.photos?.length || 0), 0);
  return { rooms: roomsOf(item).length, items: items.length, rated: items.filter((i) => i.condition).length, counts, photos };
}

function ConditionSelect({ value, onChange, label }) {
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-32 bg-surface-card" aria-label={label}>
        <SelectValue placeholder="Rate…" />
      </SelectTrigger>
      <SelectContent>
        {CONDITION_SCALE.map((c) => (
          <SelectItem key={c.value} value={c.value}>
            {c.score} · {c.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// --- Rooms & items -------------------------------------------------------------------

export function InspectionRoomsSection({ item, onCommitMeta }) {
  const rooms = useMemo(() => roomsOf(item), [item]);
  const [preset, setPreset] = useState("Bedroom");
  const [roomName, setRoomName] = useState("");
  const [newItem, setNewItem] = useState({});
  const [notes, setNotes] = useState({});
  const [uploading, setUploading] = useState("");
  const fileRef = useRef(null);
  const target = useRef(null);

  const save = (next) => onCommitMeta({ rooms: next });
  const patchItem = (roomId, itemId, patch) =>
    save(rooms.map((r) => (r.id === roomId ? { ...r, items: r.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) } : r)));

  const addRoom = (name, kind) => {
    const n = name.trim() || kind;
    const items = (ROOM_PRESETS[kind] || []).map((x) => ({ id: uid(), name: x, condition: "", notes: "", photos: [] }));
    save([...rooms, { id: uid(), name: n, items }]);
    setRoomName("");
  };

  const addStandard = () =>
    save(
      ["Entry", "Living room", "Kitchen", "Bedroom", "Bathroom"].map((k) => ({
        id: uid(),
        name: k,
        items: ROOM_PRESETS[k].map((x) => ({ id: uid(), name: x, condition: "", notes: "", photos: [] })),
      })),
    );

  const addItem = (room) => {
    const name = String(newItem[room.id] || "").trim();
    if (!name) return;
    save(rooms.map((r) => (r.id === room.id ? { ...r, items: [...r.items, { id: uid(), name, condition: "", notes: "", photos: [] }] } : r)));
    setNewItem((s) => ({ ...s, [room.id]: "" }));
  };

  const rateAll = (room, condition) =>
    save(rooms.map((r) => (r.id === room.id ? { ...r, items: r.items.map((i) => ({ ...i, condition: i.condition || condition })) } : r)));

  const onFiles = async (files) => {
    const t = target.current;
    if (!t || !files?.length) return;
    setUploading(t.itemId);
    const added = [];
    for (const file of Array.from(files)) {
      const res = await uploadPropertyImage("inspection", item.id, file);
      if (res?.url) added.push({ id: uid(), url: res.url, label: file.name });
      else toast.error(`Couldn't upload ${file.name}.`);
    }
    setUploading("");
    if (fileRef.current) fileRef.current.value = "";
    if (!added.length) return;
    const it = rooms.find((r) => r.id === t.roomId)?.items.find((i) => i.id === t.itemId);
    patchItem(t.roomId, t.itemId, { photos: [...(it?.photos || []), ...added] });
  };

  const stats = inspectionStats(item);

  return (
    <div className="space-y-5">
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-subtle p-4 sm:flex-row sm:items-center">
        <Select value={preset} onValueChange={setPreset}>
          <SelectTrigger className="bg-surface-card sm:w-44" aria-label="Room type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(ROOM_PRESETS).map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addRoom(roomName, preset)}
          placeholder={`Room name (e.g. ${preset === "Bedroom" ? "Bedroom 2" : preset})`}
          className="bg-surface-card"
        />
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => addRoom(roomName, preset)}>
          <Plus className="h-4 w-4" /> Add Room
        </Button>
      </div>

      {rooms.length ? (
        <p className="text-sm text-text-secondary">
          {stats.rated} of {stats.items} items rated across {stats.rooms} rooms · {stats.photos} photos
        </p>
      ) : (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={DoorClosed}
            title="No rooms yet"
            description="Add rooms one at a time, or start from a standard layout with common items to rate."
            action={
              <Button variant="outline" className="border-border bg-surface-card" onClick={addStandard}>
                Add Standard Rooms
              </Button>
            }
          />
        </div>
      )}

      {rooms.map((room) => (
        <SectionCard
          key={room.id}
          title={room.name}
          description={`${room.items.filter((i) => i.condition).length}/${room.items.length} rated`}
          action={
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => rateAll(room, "good")}>
                Rate Rest Good
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-red-600 dark:text-red-300 hover:bg-red-500/10"
                onClick={() => save(rooms.filter((r) => r.id !== room.id))}
                aria-label={`Remove ${room.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          }
          bodyPadding={false}
        >
          <ul className="divide-y divide-border">
            {room.items.map((it) => {
              const c = conditionOf(it.condition);
              const noteKey = `${room.id}:${it.id}`;
              return (
                <li key={it.id} className="space-y-2 px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{it.name}</span>
                    {c ? <Badge variant={c.variant}>{c.label}</Badge> : null}
                    <ConditionSelect value={it.condition} label={`${it.name} condition`} onChange={(v) => patchItem(room.id, it.id, { condition: v })} />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-text-secondary hover:bg-surface-hover hover:text-foreground"
                      disabled={uploading === it.id}
                      onClick={() => {
                        target.current = { roomId: room.id, itemId: it.id };
                        fileRef.current?.click();
                      }}
                      aria-label={`Add photos of ${it.name}`}
                    >
                      {uploading === it.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-red-600 dark:text-red-300 hover:bg-red-500/10"
                      onClick={() => save(rooms.map((r) => (r.id === room.id ? { ...r, items: r.items.filter((i) => i.id !== it.id) } : r)))}
                      aria-label={`Remove ${it.name}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <Input
                    value={notes[noteKey] ?? it.notes ?? ""}
                    onChange={(e) => setNotes((s) => ({ ...s, [noteKey]: e.target.value }))}
                    onBlur={(e) => {
                      if (e.target.value !== (it.notes || "")) patchItem(room.id, it.id, { notes: e.target.value });
                    }}
                    placeholder="Notes — scuffs, stains, missing parts…"
                    className="h-8 bg-surface-card text-sm"
                  />
                  {it.photos?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {it.photos.map((p) => (
                        <div key={p.id} className="group relative">
                          <a href={p.url} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.url} alt={p.label} className="h-16 w-20 rounded-md border border-border object-cover" />
                          </a>
                          <button
                            type="button"
                            className="absolute -right-1.5 -top-1.5 hidden rounded-full border border-border bg-surface-card p-0.5 text-text-secondary group-hover:block"
                            onClick={() => patchItem(room.id, it.id, { photos: it.photos.filter((x) => x.id !== p.id) })}
                            aria-label="Remove photo"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
            <li className="flex gap-2 px-5 py-3">
              <Input
                value={newItem[room.id] || ""}
                onChange={(e) => setNewItem((s) => ({ ...s, [room.id]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addItem(room)}
                placeholder="Add an item, e.g. Ceiling fan"
                className="h-8 bg-surface-card"
              />
              <Button variant="outline" size="sm" className="border-border bg-surface-card" onClick={() => addItem(room)}>
                <Plus className="h-4 w-4" /> Item
              </Button>
            </li>
          </ul>
        </SectionCard>
      ))}
    </div>
  );
}

// --- Overview -----------------------------------------------------------------------

export function InspectionOverviewSection({ item }) {
  const s = inspectionStats(item);
  const sig = item.metadata?.signatures || {};
  const signed = ["inspector", "tenant", "landlord"].filter((k) => sig[k]?.name).length;
  const worst = CONDITION_SCALE.filter((c) => c.score <= 2).reduce((n, c) => n + s.counts[c.value], 0);
  return (
    <div className="space-y-5">
      <StatGrid
        stats={[
          { label: "Rooms", value: String(s.rooms), hint: `${s.items} items` },
          { label: "Rated", value: s.items ? `${Math.round((s.rated / s.items) * 100)}%` : "—", hint: `${s.rated} of ${s.items}` },
          { label: "Poor / damaged", value: String(worst), hint: "Items needing attention" },
          { label: "Signatures", value: `${signed}/3`, hint: `${s.photos} photos` },
        ]}
      />
      <SectionCard title="Condition breakdown" bodyPadding={false}>
        <ul className="divide-y divide-border">
          {CONDITION_SCALE.map((c) => (
            <li key={c.value} className="flex items-center justify-between px-5 py-2.5 text-sm">
              <Badge variant={c.variant}>
                {c.score} · {c.label}
              </Badge>
              <span className="tabular-nums text-foreground">{s.counts[c.value]}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
      <SectionCard>
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          {[
            ["Unit", item.unit],
            ["Tenant", item.tenantName],
            ["Lease", item.leaseName],
            ["Inspector", item.inspector],
            ["Date", formatDate(item.inspectionDate)],
            ["Status", item.status],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{k}</dt>
              <dd className="mt-1 truncate text-foreground">{v || "—"}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>
    </div>
  );
}

// --- Signatures -----------------------------------------------------------------------

const SIGNERS = [
  { key: "inspector", label: "Inspector" },
  { key: "tenant", label: "Tenant" },
  { key: "landlord", label: "Landlord / manager" },
];

export function InspectionSignaturesSection({ item, onCommit, onCommitMeta }) {
  const sig = item.metadata?.signatures || {};
  const [typed, setTyped] = useState({});
  const [agree, setAgree] = useState({});

  const defaultName = (k) => (k === "inspector" ? item.inspector || "" : k === "tenant" ? item.tenantName || "" : "");
  const sign = async (k) => {
    const name = String(typed[k] ?? defaultName(k)).trim();
    if (!name) {
      toast.error("Type the signer's full name.");
      return;
    }
    if (!agree[k]) {
      toast.error("Confirm the report is accurate first.");
      return;
    }
    const ok = await onCommitMeta({ signatures: { ...sig, [k]: { name, signedOn: todayISO(), signedAt: new Date().toISOString() } } });
    if (ok) toast.success("Signed.");
  };
  const clear = (k) => {
    const next = { ...sig };
    delete next[k];
    onCommitMeta({ signatures: next });
  };
  const allSigned = sig.inspector?.name && sig.tenant?.name;

  return (
    <div className="space-y-5">
      {allSigned && item.status !== "Complete" ? (
        <Callout
          tone="success"
          action={
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => onCommit({ status: "Complete" })}>
              Mark Complete
            </Button>
          }
        >
          Inspector and tenant have signed.
        </Callout>
      ) : null}
      {SIGNERS.map((s) => (
        <SectionCard key={s.key} title={s.label}>
          {sig[s.key]?.name ? (
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="font-serif text-2xl italic text-foreground">{sig[s.key].name}</p>
                <p className="mt-1 text-xs text-text-secondary">Signed {formatDate(sig[s.key].signedOn)} · typed-name signature</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => clear(s.key)}>
                Clear
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Input
                value={typed[s.key] ?? defaultName(s.key)}
                onChange={(e) => setTyped((t) => ({ ...t, [s.key]: e.target.value }))}
                placeholder="Type full name to sign"
                className="bg-surface-card font-serif italic"
              />
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <Checkbox checked={Boolean(agree[s.key])} onCheckedChange={(v) => setAgree((a) => ({ ...a, [s.key]: Boolean(v) }))} />
                I confirm this report accurately reflects the unit&apos;s condition.
              </label>
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => sign(s.key)}
              >
                Sign as {titleCase(s.label)}
              </Button>
            </div>
          )}
        </SectionCard>
      ))}
    </div>
  );
}

// --- Move-in vs move-out comparison ----------------------------------------------------

export function InspectionComparisonSection({ item }) {
  const [baseline, setBaseline] = useState(undefined);
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const where = item.leaseId ? { leaseId: item.leaseId } : item.unitId ? { unitId: item.unitId } : null;
      const pool = where ? ((await inspectionsLayer.list(where)) ?? []) : [];
      const ins = pool
        .filter((i) => i.id !== item.id && inspectionKindOf(i) === "move_in")
        .sort((a, b) => String(b.inspectionDate).localeCompare(String(a.inspectionDate)));
      if (alive) setBaseline(ins[0] || null);
    })();
    return () => {
      alive = false;
    };
  }, [item.id, item.leaseId, item.unitId]);

  const rows = useMemo(() => {
    if (!baseline) return [];
    const before = roomsOf(baseline);
    return roomsOf(item).flatMap((room) => {
      const b = before.find((r) => r.name.toLowerCase() === room.name.toLowerCase());
      return room.items.map((it) => {
        const prev = b?.items.find((x) => x.name.toLowerCase() === it.name.toLowerCase());
        const was = conditionOf(prev?.condition);
        const now = conditionOf(it.condition);
        const drop = was && now ? was.score - now.score : 0;
        return { key: `${room.id}:${it.id}`, room: room.name, name: it.name, was, now, drop, notes: it.notes };
      });
    });
  }, [baseline, item]);

  if (baseline === undefined) return <ListLoading label="Finding the move-in inspection" className="py-10" />;
  if (!baseline) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState icon={DoorClosed} title="No move-in inspection to compare" description="Link this inspection to a lease or unit with a move-in inspection." />
      </div>
    );
  }

  const worse = rows.filter((r) => r.drop > 0);
  const chosen = worse.filter((r) => picked[r.key]?.on);

  const push = async () => {
    setBusy(true);
    const move = item.moveId ? await movesLayer.get(item.moveId) : null;
    let depositId = move?.depositId || item.metadata?.depositId || "";
    if (!depositId && item.leaseId) depositId = ((await securityDepositsLayer.list({ leaseId: item.leaseId })) ?? [])[0]?.id || "";
    if (!depositId) {
      setBusy(false);
      toast.error("No deposit is linked to this lease or move.");
      return;
    }
    const ok = await addDepositDeductions(
      depositId,
      chosen.map((r) => ({
        label: `${r.room} — ${r.name}`,
        amount: Number(picked[r.key]?.amount) || 0,
        category: "Damage repair",
        notes: `${r.was?.label} at move-in → ${r.now?.label} at move-out${r.notes ? `. ${r.notes}` : ""}`,
        inspectionId: item.id,
      })),
    );
    setBusy(false);
    if (!ok) {
      toast.error("Couldn't add the deductions.");
      return;
    }
    setPicked({});
    toast.success(`Added ${chosen.length} deduction${chosen.length === 1 ? "" : "s"} to the deposit.`);
  };

  return (
    <div className="space-y-5">
      <Callout tone="info">
        Compared with &ldquo;{baseline.name}&rdquo; ({formatDate(baseline.inspectionDate)}). {worse.length} item{worse.length === 1 ? "" : "s"} got worse.
      </Callout>
      <SectionCard
        title="Condition changes"
        action={
          chosen.length ? (
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={push}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />} Add {chosen.length} to Deposit Deductions
            </Button>
          ) : null
        }
        bodyPadding={false}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-text-tertiary">
                <th className="px-5 py-2.5 font-medium">Item</th>
                <th className="px-2 py-2.5 font-medium">Move-in</th>
                <th className="px-2 py-2.5 font-medium">Move-out</th>
                <th className="px-5 py-2.5 pl-2 text-right font-medium">Charge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.key} className={r.drop > 0 ? "bg-red-500/5" : undefined}>
                  <td className="px-5 py-2">
                    <p className="font-medium text-foreground">{r.name}</p>
                    <p className="text-xs text-text-secondary">{r.room}</p>
                  </td>
                  <td className="px-2 py-2">{r.was ? <Badge variant={r.was.variant}>{r.was.label}</Badge> : <span className="text-text-tertiary">—</span>}</td>
                  <td className="px-2 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      {r.now ? <Badge variant={r.now.variant}>{r.now.label}</Badge> : <span className="text-text-tertiary">—</span>}
                      {r.drop > 0 ? <ArrowDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" /> : null}
                    </span>
                  </td>
                  <td className="px-5 py-2 pl-2">
                    {r.drop > 0 ? (
                      <div className="flex items-center justify-end gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={picked[r.key]?.amount ?? ""}
                          onChange={(e) => setPicked((p) => ({ ...p, [r.key]: { ...(p[r.key] || {}), amount: e.target.value, on: true } }))}
                          placeholder="0.00"
                          className="h-8 w-24 bg-surface-card text-right tabular-nums"
                          aria-label={`Charge for ${r.name}`}
                        />
                        <Checkbox
                          checked={Boolean(picked[r.key]?.on)}
                          onCheckedChange={(v) => setPicked((p) => ({ ...p, [r.key]: { ...(p[r.key] || {}), on: Boolean(v) } }))}
                          aria-label={`Charge ${r.name}`}
                        />
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {chosen.length ? (
          <p className="border-t border-border px-5 py-3 text-right text-sm text-text-secondary">
            Total {money2(chosen.reduce((s, r) => s + (Number(picked[r.key]?.amount) || 0), 0))}
          </p>
        ) : null}
      </SectionCard>
    </div>
  );
}
