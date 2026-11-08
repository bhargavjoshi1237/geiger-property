import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";

import { ANCHOR_FORMATS, anchorsFor, fieldsFor } from "./anchors";
import { composeDocument } from "./compose_rules";
import { extractPdfText, renderPdf } from "./pdf";

const ctx = (lease = {}) => ({
  lease: { id: "l1", name: "B-101 — Zoe Nguyen", rent: 1850, deposit: 1500, termStart: "2026-11-01", termEnd: "2027-10-31", termType: "fixed", metadata: {}, ...lease },
  tenant: { name: "Zoe Nguyen" },
  unit: { label: "B-101" },
  property: { name: "The Marlowe", address: "1200 Harbor Ave", city: "Seattle", state: "WA", zip: "98101" },
  parties: [
    { id: "p1", role: "tenant", name: "Zoe Nguyen", email: "zoe@example.com", isPrimary: true },
    { id: "p2", role: "guarantor", name: "Pat Nguyen", email: "pat@example.com" },
  ],
  charges: [],
  rentSteps: [],
  company: { legalName: "Harbor & Pine LLC" },
  policies: { rentDueDay: 1, graceDays: 5, lateFeeType: "flat", lateFeeAmount: 75, nsfFee: 35, moveOutNoticeDays: 20 },
});

const ADDENDA = [
  { id: "a2", name: "Pet addendum", body: "One cat. Pet deposit is part of {{lease.deposit}}.", status: "Attached", effectiveDate: "2026-12-01", createdAt: "2026-10-01" },
  { id: "a1", name: "Renters insurance addendum", body: "Keep renters insurance.", status: "Draft", effectiveDate: "2026-11-03", createdAt: "2026-10-02", requiresSignature: false },
];

async function render(doc, provider = "manual") {
  return renderPdf({ title: doc.title, sections: doc.sections, signers: doc.signers, footer: doc.footer, labels: doc.labels, anchorFor: anchorsFor(provider) });
}

test("pdf: body then each addendum on a new page in effective-date order, N of M footers, lease facts in the text", async () => {
  const doc = composeDocument({ ctx: ctx(), addenda: ADDENDA });
  const out = await render(doc);
  const loaded = await PDFDocument.load(out.buffer);
  assert.equal(loaded.getPageCount(), out.pages);
  assert.ok(out.pages >= 3);
  const { pages, text } = await extractPdfText(out.buffer);
  assert.equal(pages, out.pages);
  text.forEach((t, i) => assert.match(t, new RegExp(`Page ${i + 1} of ${pages}`)));
  const all = text.join("\n");
  assert.match(all, /\$1,850 per month/);
  assert.match(all, /security deposit of \$1,500/);
  assert.match(all, /November 1, 2026 and ends on October 31, 2027 \(12 months\)/);
  const first = text.findIndex((t) => t.startsWith("Addendum 1: Renters insurance addendum"));
  const second = text.findIndex((t) => t.startsWith("Addendum 2: Pet addendum"));
  assert.ok(first > 0, "addendum 1 opens a page after the body");
  assert.ok(second > first, "addendum 2 opens a later page");
  assert.match(text[second], /Pet deposit is part of \$1,500\./);
});

test("pdf: a signature block per signing party plus the landlord, anchors recorded with positions", async () => {
  const doc = composeDocument({ ctx: ctx(), addenda: ADDENDA });
  const out = await render(doc, "dropbox_sign");
  // Body and the pet addendum ask for signatures (the insurance one doesn't): 3 signers × 2 fields × 2 sections.
  assert.equal(out.anchors.length, 12);
  assert.deepEqual([...new Set(out.anchors.map((a) => a.name))], ["Zoe Nguyen", "Pat Nguyen", "Harbor & Pine LLC"]);
  assert.equal(new Set(out.anchors.map((a) => a.id)).size, 12);
  const sig = out.anchors.find((a) => a.id === "sig_lease_1");
  assert.equal(sig.text, "[sig|req|signer1||sig_lease_1]");
  assert.ok(sig.page >= 1 && sig.x > 0 && sig.y > 0 && sig.width > 0 && sig.size > 0 && sig.size <= 10);
  const { text } = await extractPdfText(out.buffer);
  const all = text.join("\n");
  for (const name of ["Zoe Nguyen", "Pat Nguyen", "Harbor & Pine LLC"]) assert.match(all, new RegExp(`Signature — ${name}`));
  assert.match(all, /Tenant[\s\S]*Guarantor[\s\S]*Landlord/);
  assert.match(all, /\[sig\|req\|signer3\|\|sig_lease_3\]/);
  assert.match(all, /\[date\|req\|signer2\|\|date_add2_2\]/);
  const manual = await render(doc);
  assert.ok(manual.anchors.every((a) => a.text === "" && a.size === 0));
  assert.doesNotMatch((await extractPdfText(manual.buffer)).text.join("\n"), /\[sig\|/);
});

test("pdf: Spanish captions and characters render; characters outside the font are replaced and counted", async () => {
  const doc = composeDocument({ ctx: ctx({ documentLanguage: "Spanish" }), template: { id: "t", body: "CONTRATO DE ARRENDAMIENTO\n\nEl depósito es {{lease.deposit}}. ¿Mascotas? Sí, señor. Đường Việt.\n\nFIRMAS" } });
  const out = await render(doc);
  const all = (await extractPdfText(out.buffer)).text.join("\n");
  assert.match(all, /El depósito es \$1,500\. ¿Mascotas\? Sí, señor\./);
  assert.match(all, /Duong Viet\./);
  assert.ok(out.replaced >= 3);
  assert.match(all, /Página 1 de 1/);
  assert.match(all, /Firma — Zoe Nguyen/);
  assert.match(all, /Inquilino/);
});

test("pdf: long bodies paginate and keep every footer", async () => {
  const long = Array.from({ length: 60 }, (_, i) => `${i + 1}. CLAUSE ${i + 1}. ${"Placeholder wording for an editable clause. ".repeat(6)}`).join("\n\n");
  const doc = composeDocument({ ctx: ctx(), template: { id: "t", body: `LEASE\n\n${long}\n\nWide: ${"x".repeat(400)}` } });
  const out = await render(doc);
  assert.ok(out.pages >= 4);
  const { text } = await extractPdfText(out.buffer);
  assert.ok(text.every((t, i) => t.includes(`Page ${i + 1} of ${out.pages}`)));
  assert.match(text.join("\n"), /60\. CLAUSE 60\./);
});

test("anchors: text-tag syntax per provider; manual draws nothing", () => {
  const signer = { index: 2 };
  const [sig, date] = fieldsFor("lease", signer);
  assert.deepEqual([sig.id, date.id], ["sig_lease_2", "date_lease_2"]);
  assert.equal(ANCHOR_FORMATS.boldsign(signer, sig), "{{sign|2|*|Signature|sig_lease_2}}");
  assert.equal(ANCHOR_FORMATS.dropbox_sign(signer, date), "[date|req|signer2||date_lease_2]");
  assert.equal(ANCHOR_FORMATS.documenso(signer, sig), "{{signature, r2}}");
  assert.equal(ANCHOR_FORMATS.signwell(signer, date), "{{date:2:y:::date_lease_2}}");
  assert.equal(anchorsFor("manual")(signer, sig), "");
  assert.equal(anchorsFor("unknown")(signer, sig), "");
});
