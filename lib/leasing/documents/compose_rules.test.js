import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { DEFAULT_LEASE_BODY } from "@/lib/leasing/merge";
import { blocksText, bodyBlocks, bodyOf, composeDocument, customFieldValues, labelsFor, orderAddenda, signersOf } from "./compose_rules";
import { composeLeaseDocument } from "./compose";

const P = "11111111-1111-4111-8111-111111111111";
const LEASE = "22222222-2222-4222-8222-222222222222";

const ctx = (over = {}) => ({
  lease: { id: LEASE, name: "B-101 — Zoe Nguyen", tenantName: "Zoe Nguyen", rent: 1850, deposit: 1500, termStart: "2026-11-01", termEnd: "2027-10-31", termType: "fixed", metadata: {}, ...over.lease },
  tenant: { name: "Zoe Nguyen", email: "zoe@example.com" },
  unit: { label: "B-101" },
  property: { name: "The Marlowe", address: "1200 Harbor Ave", city: "Seattle", state: "WA", zip: "98101" },
  parties: over.parties ?? [{ id: "p1", role: "tenant", name: "Zoe Nguyen", email: "zoe@example.com", isPrimary: true, metadata: {} }],
  charges: [],
  rentSteps: [],
  company: { legalName: "Harbor & Pine LLC", email: "office@example.com" },
  policies: { rentDueDay: 1, graceDays: 5, lateFeeType: "flat", lateFeeAmount: 75, nsfFee: 35, moveOutNoticeDays: 20 },
});

const addendum = (id, name, effectiveDate, extra = {}) => ({ id, name, body: `${name} text`, status: "Attached", effectiveDate, requiresSignature: true, createdAt: "2026-10-01T00:00:00Z", ...extra });

test("addenda: effective-date order, then added order; undated last; Void left out", () => {
  const rows = [
    addendum("late", "Late", "2026-12-01"),
    addendum("none", "Undated", ""),
    addendum("void", "Gone", "2026-10-01", { status: "Void" }),
    addendum("b", "Second same day", "2026-11-03", { createdAt: "2026-10-05T00:00:00Z" }),
    addendum("a", "First same day", "2026-11-03", { createdAt: "2026-10-02T00:00:00Z", status: "Draft" }),
    addendum("voided", "Voided", "2026-11-01", { status: "voided" }),
  ];
  assert.deepEqual(orderAddenda(rows).map((a) => a.id), ["a", "b", "late", "none"]);
});

test("custom fields: template defaults merge, the lease's own value wins, blanks fall back", () => {
  const template = { metadata: { mergeFields: [{ id: "1", label: "{{parking_space}}", sample: "P-12" }, { id: "2", label: "{{ storage }}", sample: "S-1" }], customFields: [{ key: "pet_fee", value: "$35" }] } };
  assert.deepEqual(customFieldValues(template, null), { parking_space: "P-12", storage: "S-1", pet_fee: "$35" });
  const lease = { metadata: { templateFieldValues: { parking_space: "P-40", storage: "  " } } };
  assert.deepEqual(customFieldValues(template, lease), { parking_space: "P-40", storage: "S-1", pet_fee: "$35" });
});

test("compose: custom template fields render their values, not [key]", () => {
  const template = { id: "t1", name: "WA lease", metadata: { version: 4, mergeFields: [{ label: "{{parking_space}}", sample: "P-12" }] }, body: "LEASE\n\nParking space {{parking_space}} for {{tenant.name}} at {{lease.rent}}." };
  const doc = composeDocument({ ctx: ctx(), template });
  const text = blocksText(doc.sections[0].blocks);
  assert.match(text, /Parking space P-12 for Zoe Nguyen at \$1,850\./);
  assert.doesNotMatch(text, /\[parking_space\]/);
  assert.deepEqual(doc.unknown, []);
  assert.deepEqual(doc.template, { id: "t1", name: "WA lease", version: 4 });
});

test("compose: no template uses DEFAULT_LEASE_BODY; its SIGNATURES section becomes generated blocks", () => {
  const doc = composeDocument({ ctx: ctx() });
  assert.equal(doc.body, DEFAULT_LEASE_BODY);
  assert.equal(bodyOf(null), DEFAULT_LEASE_BODY);
  assert.equal(bodyOf({ body: "   " }), DEFAULT_LEASE_BODY);
  const [body] = doc.sections;
  assert.equal(body.blocks[0].type, "title");
  assert.equal(body.blocks[0].lines[0].runs[0].text, "LEASE AGREEMENT (Residential)");
  const text = blocksText(body.blocks);
  assert.match(text, /\$1,850 per month/);
  assert.doesNotMatch(text, /SIGNATURES|______/);
  assert.equal(body.sign, true);
  assert.equal(doc.template, null);
});

test("compose: addenda follow the body in order, numbered, each on a new page, merged with the same values", () => {
  const addenda = [addendum("x2", "Pet addendum", "2026-12-01", { body: "Deposit {{lease.deposit}}." }), addendum("x1", "Parking addendum", "2026-11-05", { requiresSignature: false }), addendum("x0", "Old", "2026-01-01", { status: "Void" })];
  const doc = composeDocument({ ctx: ctx(), template: null, addenda });
  assert.deepEqual(doc.addendaIds, ["x1", "x2"]);
  const [, first, second] = doc.sections;
  assert.equal(doc.sections.length, 3);
  assert.deepEqual([first.title, first.newPage, first.sign], ["Addendum 1: Parking addendum", true, false]);
  assert.deepEqual([second.title, second.newPage, second.sign], ["Addendum 2: Pet addendum", true, true]);
  assert.match(first.subtitle, /Effective November 5, 2026/);
  assert.equal(blocksText(second.blocks), "Deposit $1,500.");
  assert.equal(composeDocument({ ctx: ctx(), addenda, includeAddenda: false }).sections.length, 1);
});

test("signers: tenants (primary first), co-signers, guarantors, then the landlord; occupants and non-signers left out", () => {
  const parties = [
    { id: "g", role: "guarantor", name: "Pat Guarantor" },
    { id: "o", role: "occupant", name: "Kid Occupant" },
    { id: "t2", role: "tenant", name: "Sam Second", isPrimary: false },
    { id: "c", role: "cosigner", name: "Cory Cosigner" },
    { id: "t1", role: "tenant", name: "Zoe Primary", isPrimary: true },
    { id: "n", role: "tenant", name: "No Sign", metadata: { signs: false } },
  ];
  const signers = signersOf({ parties, values: { "landlord.name": "Harbor & Pine LLC" }, company: { email: "office@example.com" } });
  assert.deepEqual(signers.map((s) => [s.index, s.role, s.name]), [
    [1, "tenant", "Zoe Primary"],
    [2, "tenant", "Sam Second"],
    [3, "cosigner", "Cory Cosigner"],
    [4, "guarantor", "Pat Guarantor"],
    [5, "landlord", "Harbor & Pine LLC"],
  ]);
  assert.equal(signers[4].email, "office@example.com");
  const fallback = signersOf({ parties: [], lease: { tenantName: "Lone Tenant" }, values: {} });
  assert.deepEqual(fallback.map((s) => [s.role, s.name]), [["tenant", "Lone Tenant"], ["landlord", "Landlord"]]);
});

test("body blocks: title, headings, bold lead-ins, list markers", () => {
  const { blocks, signatureCut } = bodyBlocks("RESIDENTIAL LEASE\n\n1. PARTIES\nBetween A and B.\n\n3. RENT. Tenant pays rent.\n• Parking — $75/mo\n2. No smoking — inside.\n\nFirmas:\nX ____");
  assert.equal(signatureCut, true);
  assert.deepEqual(blocks.map((b) => b.type), ["title", "heading", "para", "para"]);
  const lines = blocks[3].lines;
  assert.deepEqual(lines[0].runs, [{ text: "3. RENT.", bold: true }, { text: " Tenant pays rent.", bold: false }]);
  assert.equal(lines[1].marker, "•");
  assert.equal(lines[2].marker, "2.");
  assert.equal(bodyBlocks("1. PARTIES", { titleFirst: false }).blocks[0].type, "heading");
});

test("labels: Spanish leases get Spanish captions, others English", () => {
  assert.equal(labelsFor("Spanish").page(1, 3), "Página 1 de 3");
  assert.equal(labelsFor("es").signature, "Firma");
  assert.equal(labelsFor("French").page(2, 2), "Page 2 of 2");
  const doc = composeDocument({ ctx: ctx({ lease: { documentLanguage: "Spanish" } }), addenda: [addendum("a", "Mascotas", "2026-11-01")] });
  assert.equal(doc.sections[1].title, "Anexo 1: Mascotas");
});

// A query-builder stand-in over in-memory rows: eq/is filter, order/limit pass through.
function fakeDb(tables) {
  return {
    from(table) {
      const filters = [];
      const q = {
        select: () => q,
        eq: (col, v) => (filters.push((r) => String(r[col]) === String(v)), q),
        is: (col, v) => (filters.push((r) => (r[col] ?? null) === v), q),
        order: () => q,
        limit: () => q,
        then: (ok, no) => Promise.resolve({ data: (tables[table] || []).filter((r) => filters.every((f) => f(r))), error: null }).then(ok, no),
      };
      return q;
    },
  };
}

test("server compose: project-scoped reads, Void addenda out, templateHash = sha256 of the body used", async () => {
  const body = "LEASE\n\nRent {{lease.rent}}, deposit {{lease.deposit}}, term {{lease.term}}. Space {{parking_space}}.";
  const tables = {
    leases: [{ id: LEASE, project_id: P, name: "Test lease", rent: 1200, deposit: 900, term_start: "2026-11-01", term_end: "2027-10-31", term_type: "fixed", template_id: "33333333-3333-4333-8333-333333333333", metadata: {}, deleted_at: null }],
    lease_templates: [{ id: "33333333-3333-4333-8333-333333333333", project_id: P, name: "T", body, metadata: { version: 2, mergeFields: [{ label: "{{parking_space}}", sample: "P-7" }] }, deleted_at: null }],
    lease_addenda: [
      { id: "a1", project_id: P, lease_id: LEASE, name: "One", body: "first", status: "Attached", metadata: { effectiveDate: "2026-11-02" }, created_at: "2026-10-01", deleted_at: null },
      { id: "a2", project_id: P, lease_id: LEASE, name: "Void one", body: "x", status: "Void", metadata: {}, created_at: "2026-10-02", deleted_at: null },
      { id: "a3", project_id: P, lease_id: LEASE, name: "Deleted", body: "x", status: "Attached", metadata: {}, created_at: "2026-10-03", deleted_at: "2026-10-04" },
      { id: "a4", project_id: "99999999-9999-4999-8999-999999999999", lease_id: LEASE, name: "Other project", body: "x", status: "Attached", metadata: {}, created_at: "2026-10-03", deleted_at: null },
    ],
    lease_parties: [{ id: "p", project_id: P, lease_id: LEASE, role: "tenant", name: "Ana", email: "ana@example.com", is_primary: true, metadata: {}, deleted_at: null }],
    settings: [{ project_id: P, key: "fees_policies", value: { rentDueDay: 1 }, deleted_at: null }],
  };
  const doc = await composeLeaseDocument(fakeDb(tables), LEASE, { projectId: P });
  assert.equal(doc.templateHash, createHash("sha256").update(body).digest("hex"));
  assert.deepEqual(doc.addendaIds, ["a1"]);
  const text = blocksText(doc.sections[0].blocks);
  assert.match(text, /Rent \$1,200, deposit \$900, term 12 months\. Space P-7\./);
  assert.deepEqual(doc.signers.map((s) => s.name), ["Ana", "Landlord"]);

  tables.leases[0].template_id = null;
  const starter = await composeLeaseDocument(fakeDb(tables), LEASE, { projectId: P });
  assert.equal(starter.body, DEFAULT_LEASE_BODY);
  assert.equal(starter.templateHash, createHash("sha256").update(DEFAULT_LEASE_BODY).digest("hex"));
  assert.equal(await composeLeaseDocument(fakeDb(tables), LEASE, { projectId: "99999999-9999-4999-8999-999999999999" }), null);
});
