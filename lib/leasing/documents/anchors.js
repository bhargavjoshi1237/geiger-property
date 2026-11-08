// Signature anchors (LEAS-08 → LEAS-09): text a provider detects in the PDF to place each signer's fields. The renderer draws it in
// white on the signature and date lines; field ids are unique per section ("sig_<section>_<signer>"). signer.index is 1-based.
// Syntax per provider's text-tag docs (2026-11-08); BoldSign's date token isn't in its public docs yet, so confirm it in LEAS-09.

const ID = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, "_");

export const ANCHOR_FORMATS = {
  manual: () => "",
  // developers.boldsign.com/text-tags: {{type|signer|required|label|id}}, UseTextTags=true.
  boldsign: (s, f) => `{{${f.type === "date" ? "date" : "sign"}|${s.index}|*|${f.type === "date" ? "Date" : "Signature"}|${ID(f.id)}}}`,
  // Dropbox Sign text tags: [type|req|signerN|label|id], use_text_tags=true; a wrapped tag is ignored.
  dropbox_sign: (s, f) => `[${f.type === "date" ? "date" : "sig"}|req|signer${s.index}||${ID(f.id)}]`,
  // Documenso PDF placeholders: {{type, rN}}, detected on upload and hidden afterwards.
  documenso: (s, f) => `{{${f.type === "date" ? "date" : "signature"}, r${s.index}}}`,
  // SignWell text tags: {{type:signer:required:label:prefill:apiId}}, "text_tags": true.
  signwell: (s, f) => `{{${f.type === "date" ? "date" : "signature"}:${s.index}:y:::${ID(f.id)}}}`,
};

export const ANCHOR_PROVIDERS = Object.keys(ANCHOR_FORMATS);

// anchorFor(signer, field) for a provider key; unknown or manual → "" (no anchors, positions are still recorded).
export const anchorsFor = (provider) => ANCHOR_FORMATS[String(provider || "manual").toLowerCase()] || ANCHOR_FORMATS.manual;

// The field ids one signature block carries for a signer in a section.
export const fieldsFor = (section, signer) => [
  { type: "signature", id: `sig_${section}_${signer.index}` },
  { type: "date", id: `date_${section}_${signer.index}` },
];
